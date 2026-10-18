import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Award, CheckCircle2, FlaskConical, Loader2, Search, ShieldX, XCircle } from 'lucide-react';
import { verifyCredential } from '../features/credentials/credentialsApi';
import { describeVerification } from '../features/credentials/trainingCertificateModel';
import { credentialVerifyPath, isCredentialCode, normalizeCredentialCode } from '../features/credentials/credentialUrls';

const Row = ({ label, children }) => (
  <div className="py-2.5 border-b border-border-subtle last:border-b-0">
    <div className="font-mono text-[10px] uppercase tracking-wider text-text-secondary">{label}</div>
    <div className="mt-0.5 text-sm font-semibold text-text-primary break-words">{children}</div>
  </div>
);

const STATUS = {
  valid: { icon: CheckCircle2, color: '#1D9E75', title: 'Constancia válida', text: 'Esta constancia fue emitida por DIGITAL SET y está vigente.' },
  revoked: { icon: ShieldX, color: '#DC2626', title: 'Constancia revocada', text: 'Esta constancia fue emitida por DIGITAL SET, pero ya no es válida.' },
};

// Verificación pública de credenciales (/verificar y /verificar/:codigo).
// Sin inicio de sesión. Solo muestra nombre, título, emisor, fecha y estado.
const VerifyCredential = () => {
  const { code: rawCode } = useParams();
  const navigate = useNavigate();
  const code = normalizeCredentialCode(rawCode);
  const [input, setInput] = useState(code);
  const [lookup, setLookup] = useState({ code: null });

  useEffect(() => {
    const previous = document.title;
    document.title = 'Verificar constancia · DIGITAL SET';
    return () => { document.title = previous; };
  }, []);

  // Un código con formato inválido no se consulta: se muestra "no encontrada".
  const valid = Boolean(rawCode) && isCredentialCode(code);

  useEffect(() => {
    if (!valid) return undefined;
    let active = true;
    verifyCredential(code).then(({ result, error }) => {
      if (active) setLookup(error ? { code, error } : { code, view: describeVerification(result) });
    });
    return () => { active = false; };
  }, [valid, code]);

  const answered = valid && lookup.code === code;
  const state = {
    loading: valid && !answered,
    error: answered ? lookup.error : null,
    view: !rawCode ? null : (!valid ? { kind: 'not_found' } : (answered ? lookup.view : null)),
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (normalizeCredentialCode(input)) navigate(credentialVerifyPath(input));
  };

  const view = state.view;
  const status = view && STATUS[view.kind];

  return (
    <div className="min-h-screen bg-bg-primary px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <div className="font-mono text-xs font-black uppercase tracking-[0.3em] text-accent-coral">DIGITAL SET</div>
          <h1 className="mt-2 text-2xl font-black text-text-primary">Verificación de constancias</h1>
        </div>

        <form onSubmit={handleSubmit} className="mb-6 flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="DSF-XXXX-XXXX-XXXX-XXXX" aria-label="Código de verificación"
            className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-bg-input px-3 py-2.5 font-mono text-sm text-text-primary uppercase" />
          <button type="submit" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent-coral px-4 text-sm font-bold text-white">
            <Search size={15} /> Verificar
          </button>
        </form>

        {state.loading && (
          <div className="flex items-center justify-center gap-2 text-sm text-text-secondary"><Loader2 size={16} className="animate-spin" /> Verificando…</div>
        )}

        {state.error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            No pudimos completar la verificación en este momento. Inténtalo de nuevo más tarde.
          </div>
        )}

        {view?.kind === 'not_found' && (
          <div className="card-tactical rounded-2xl p-5 text-center">
            <XCircle size={28} className="mx-auto text-text-secondary" />
            <p className="mt-2 font-bold text-text-primary">No encontramos esta constancia</p>
            <p className="mt-1 text-sm text-text-secondary">Revisa que el código esté completo y escrito correctamente.</p>
          </div>
        )}

        {status && (
          <div className="card-tactical rounded-2xl p-5 md:p-6">
            <div className="flex items-start gap-3 rounded-xl p-3" style={{ backgroundColor: `${status.color}14`, border: `1px solid ${status.color}55` }}>
              <status.icon size={22} style={{ color: status.color }} className="shrink-0" />
              <div>
                <div className="font-black" style={{ color: status.color }}>{status.title}</div>
                <div className="text-sm text-text-secondary">{status.text}</div>
              </div>
            </div>

            {view.isTest && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-accent-gold/40 bg-accent-gold/10 px-3 py-2 text-sm font-semibold text-accent-gold">
                <FlaskConical size={15} /> Constancia de prueba: no corresponde a un alumno real.
              </div>
            )}

            <div className="mt-4">
              <Row label="Titular">{view.holderName}</Row>
              <Row label="Constancia"><span className="inline-flex items-center gap-1.5"><Award size={15} className="text-accent-coral" />{view.title}</span></Row>
              <Row label="Emisor">{view.issuer}</Row>
              <Row label="Fecha de emisión">{view.issuedAt}</Row>
              {view.kind === 'revoked' && view.revokedAt && <Row label="Revocada el">{view.revokedAt}</Row>}
              <Row label="Código"><span className="font-mono">{view.code}</span></Row>
            </div>

            {view.description && <p className="mt-4 text-xs text-text-secondary">{view.description}</p>}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-text-secondary">
          Verificación en línea de credenciales emitidas por DIGITAL SET a través de SimulaSET.
        </p>
      </div>
    </div>
  );
};

export default VerifyCredential;
