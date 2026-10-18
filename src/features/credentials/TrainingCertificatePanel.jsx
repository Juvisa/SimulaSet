import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, CheckCircle2, Circle, Copy, ExternalLink, Loader2, Lock, AlertTriangle, RefreshCw, FlaskConical } from 'lucide-react';
import { LayerTag } from '../passport/PassportSections';
import { getTrainingCertificateStatus, issueTrainingCertificate } from './credentialsApi';
import { describeIssueOutcome, formatCredentialDate, getCertificatePanelState } from './trainingCertificateModel';
import { credentialVerifyPath, credentialVerifyUrl } from './credentialUrls';

const LESSON_ICON = {
  verified: <CheckCircle2 size={16} className="text-[#1D9E75] shrink-0 mt-0.5" />,
  legacy: <AlertTriangle size={16} className="text-accent-gold shrink-0 mt-0.5" />,
  unverified: <AlertTriangle size={16} className="text-accent-gold shrink-0 mt-0.5" />,
  pending: <Circle size={16} className="text-text-secondary shrink-0 mt-0.5" />,
};

const copyText = async (value) => {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
};

const RequiredLessons = ({ lessons, verifiedCount, total }) => (
  <div className="rounded-xl border border-border-subtle bg-bg-input/40 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
      <div className="text-sm font-bold text-text-primary">Clases obligatorias · {verifiedCount}/{total}</div>
      <LayerTag layer="registered" />
    </div>
    <ul className="space-y-2.5">
      {lessons.map(lesson => (
        <li key={lesson.key} className="flex items-start gap-2.5">
          {LESSON_ICON[lesson.state]}
          <div className="min-w-0">
            <div className="text-sm text-text-primary">{lesson.title}</div>
            <div className="text-xs text-text-secondary">{lesson.label}</div>
          </div>
        </li>
      ))}
    </ul>
  </div>
);

const IssuedCredential = ({ credential }) => {
  const [copied, setCopied] = useState('');
  const url = credentialVerifyUrl(credential.public_code);
  const handleCopy = async () => {
    setCopied((await copyText(url)) ? '¡Enlace copiado!' : 'No pudimos copiarlo: selecciónalo y cópialo a mano.');
    setTimeout(() => setCopied(''), 4000);
  };

  return (
    <div className="rounded-xl border border-[#1D9E75]/40 bg-[#1D9E75]/5 p-4 md:p-5">
      <div className="flex items-start gap-3">
        <Award size={22} className="text-[#1D9E75] shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-text-primary">{credential.title}</div>
          <div className="text-sm text-text-secondary">
            {credential.issuer} · {credential.holder_name} · {formatCredentialDate(credential.issued_at)}
          </div>
          {credential.is_test && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-accent-gold/40 bg-accent-gold/10 px-2.5 py-0.5 text-[11px] font-bold text-accent-gold">
              <FlaskConical size={11} /> Constancia de prueba
            </span>
          )}
          <div className="mt-3 font-mono text-xs text-text-secondary">Código de verificación</div>
          <div className="font-mono text-sm font-bold text-text-primary break-all">{credential.public_code}</div>
          <div className="mt-1 text-xs text-text-secondary break-all">{url}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={handleCopy}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border-subtle px-3 py-2 text-sm font-semibold text-text-primary hover:border-accent-coral/60">
              <Copy size={14} /> Copiar enlace
            </button>
            <a href={credentialVerifyPath(credential.public_code)} target="_blank" rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border-subtle px-3 py-2 text-sm font-semibold text-text-primary hover:border-accent-coral/60">
              <ExternalLink size={14} /> Ver verificación pública
            </a>
          </div>
          {copied && <p role="status" className="mt-2 text-xs text-text-secondary">{copied}</p>}
          <p className="mt-3 text-xs text-text-secondary">También aparece en tu vista profesional y en el PDF de tu SET Passport.</p>
        </div>
      </div>
    </div>
  );
};

// Constancia de Formación Digital SET en SET Passport. Todo lo decide el
// servidor: este panel solo muestra el estado y pide la emisión.
const TrainingCertificatePanel = () => {
  const [remote, setRemote] = useState({ loading: true });
  const [reloadKey, setReloadKey] = useState(0);
  const [consent, setConsent] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let active = true;
    getTrainingCertificateStatus().then((result) => { if (active) setRemote({ loading: false, ...result }); });
    return () => { active = false; };
  }, [reloadKey]);

  const load = useCallback(() => {
    setRemote(current => ({ ...current, loading: true }));
    setReloadKey(key => key + 1);
  }, []);

  const view = getCertificatePanelState(remote);

  const handleIssue = async () => {
    if (!consent || issuing || view.kind !== 'eligible') return;
    setIssuing(true);
    setMessage(null);
    const { result, error } = await issueTrainingCertificate({ consentVersion: view.definition.consent_version });
    const outcome = describeIssueOutcome(result, error);
    setIssuing(false);
    setMessage(outcome);
    load();
  };

  return (
    <section className="card-tactical rounded-2xl p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h2 className="font-display text-lg font-bold text-text-primary">Constancia de Formación Digital SET</h2>
        <LayerTag layer="verified" />
      </div>
      <p className="text-xs text-text-secondary mb-5">
        Acredita la visualización registrada del recorrido formativo: las cuatro clases obligatorias, cada una vista al menos
        en un 85&nbsp;%. No evalúa competencias ni es una certificación profesional.
      </p>

      {view.kind === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-text-secondary"><Loader2 size={16} className="animate-spin" /> Cargando tu constancia…</div>
      )}

      {view.kind === 'unavailable' && (
        <div className="flex items-start gap-3 rounded-xl border border-dashed border-border-subtle p-4">
          <Lock size={18} className="text-text-secondary shrink-0 mt-0.5" />
          <p className="text-sm text-text-secondary">La emisión de constancias estará disponible muy pronto.</p>
        </div>
      )}

      {view.kind === 'error' && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {view.message}
          <button type="button" onClick={load} className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-text-primary">
            <RefreshCw size={12} /> Reintentar
          </button>
        </div>
      )}

      {['in_progress', 'eligible', 'issued', 'blocked'].includes(view.kind) && (
        <div className="space-y-4">
          {view.kind === 'issued' && <IssuedCredential credential={view.credential} />}

          <RequiredLessons lessons={view.lessons} verifiedCount={view.verifiedCount} total={view.total} />

          {view.kind === 'in_progress' && (
            <p className="text-sm text-text-secondary">
              Te {view.total - view.verifiedCount === 1 ? 'falta 1 clase' : `faltan ${view.total - view.verifiedCount} clases`} por verificar.{' '}
              <Link to="/academy" className="font-semibold text-accent-coral hover:underline">Ir a SET Academy</Link>
            </p>
          )}

          {view.kind === 'blocked' && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              Tu constancia fue revocada. Escribe a Digital SET si necesitas revisarlo.
            </p>
          )}

          {view.kind === 'eligible' && (
            <div className="rounded-xl border border-accent-coral/30 bg-accent-coral/5 p-4">
              <p className="text-sm font-semibold text-text-primary">¡Completaste las cuatro clases obligatorias!</p>
              <label className="mt-3 flex items-start gap-3 text-sm text-text-secondary cursor-pointer">
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#E0605E]" />
                <span>{view.definition.consent_text}</span>
              </label>
              <button type="button" onClick={handleIssue} disabled={!consent || issuing}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent-coral px-4 py-2.5 text-sm font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">
                {issuing ? <Loader2 size={16} className="animate-spin" /> : <Award size={16} />}
                {issuing ? 'Emitiendo…' : 'Emitir mi constancia'}
              </button>
            </div>
          )}

          {message && (
            <p role="status" className={`text-sm ${message.ok ? 'text-[#1D9E75]' : 'text-red-400'}`}>{message.text}</p>
          )}
        </div>
      )}

      <p className="mt-5 text-xs text-text-secondary">
        La Acreditación de Práctica y Setter Verified requerirán una evaluación formal de Digital SET; no se generan por tu SET Score.
      </p>
    </section>
  );
};

export default TrainingCertificatePanel;
