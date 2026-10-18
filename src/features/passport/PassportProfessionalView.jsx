import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, Loader2, AlertTriangle, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { loadPassportSources } from './passportData';
import { buildPassportEvidence, passportFromRow } from './passportModel';
import { buildPassportDocument, passportDocumentTitle } from './passportDocumentModel';
import PassportDocument from './PassportDocument';
import { getTrainingCertificateStatus } from '../credentials/credentialsApi';
import { credentialVerifyUrl } from '../credentials/credentialUrls';

// Solo la constancia ACTIVA emitida por el servidor; si no hay o no se pudo
// leer, el documento omite la sección de credenciales.
const credentialsFromStatus = (status) => {
  const c = status?.credential;
  if (!c || c.status !== 'active') return [];
  return [{ id: c.public_code, title: c.title, issuedBy: c.issuer, issuedAt: c.issued_at,
    code: c.public_code, verifyUrl: credentialVerifyUrl(c.public_code), isTest: c.is_test === true }];
};

// Espera fuentes e imágenes del documento antes de imprimir, para que el PDF
// no salga sin la foto o con la tipografía de reserva.
const waitForDocumentAssets = async (root) => {
  try { await document.fonts?.ready; } catch { /* sin Font Loading API */ }
  const images = root ? [...root.querySelectorAll('img')] : [];
  await Promise.all(images.map(img => (img.complete ? Promise.resolve() : img.decode?.().catch(() => {}) || Promise.resolve())));
};

// Vista profesional de SET Passport (/passport/vista). Sin barra lateral: solo
// el documento y una barra de acciones que no se imprime. Muestra SOLO lo
// guardado (no sugerencias ni cambios sin guardar) y la evidencia oficial.
const PassportProfessionalView = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sources, setSources] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [generatedAt] = useState(() => new Date());
  const docRef = useRef(null);
  const autoPrintDone = useRef(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      loadPassportSources({ userId: user.id, refreshUser, fallbackSetScore: user.set_score }),
      getTrainingCertificateStatus(),
    ]).then(([result, certificate]) => {
      if (active) setSources({ ...result, credentials: credentialsFromStatus(certificate.status) });
    });
    return () => { active = false; };
  }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fondo blanco al imprimir solo mientras esta vista está montada; el título
  // del documento es el nombre sugerido del PDF al "Guardar como PDF".
  useEffect(() => {
    const previousTitle = document.title;
    document.body.classList.add('spp-print-host');
    document.title = passportDocumentTitle(user.name);
    return () => {
      document.body.classList.remove('spp-print-host');
      document.title = previousTitle;
    };
  }, [user.name]);

  const doc = useMemo(() => {
    if (!sources) return null;
    return buildPassportDocument({
      name: user.name,
      avatarUrl: user.avatar_url,
      passport: sources.passportRow ? passportFromRow(sources.passportRow) : null,
      evidence: buildPassportEvidence({ sessions: sources.sessions, setScore: sources.setScore }),
      credentials: sources.credentials,
      generatedAt,
    });
  }, [sources, user.name, user.avatar_url, generatedAt]);

  const handlePrint = async () => {
    setPrinting(true);
    await waitForDocumentAssets(docRef.current);
    setPrinting(false);
    window.print();
  };

  // "Descargar" desde la edición llega con ?imprimir=1: abre el diálogo de
  // impresión una sola vez y limpia el parámetro (recargar no reimprime). Si
  // el navegador lo bloquea, el botón de la barra sigue disponible.
  useEffect(() => {
    if (!doc || autoPrintDone.current || searchParams.get('imprimir') !== '1') return;
    autoPrintDone.current = true;
    setSearchParams({}, { replace: true });
    handlePrint();
  }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="spp-print-stage min-h-screen bg-bg-primary px-3 py-4 md:px-8 md:py-8">
      <div className="spp-screen-only mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => navigate('/passport')}
          className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-card px-4 py-2.5 text-sm font-semibold text-text-primary hover:border-accent-coral/50">
          <ArrowLeft size={16} /> Editar mi perfil
        </button>
        <button type="button" onClick={handlePrint} disabled={!doc || printing}
          title="Abre el diálogo de impresión del navegador: elige «Guardar como PDF»."
          className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: '#A61E2D' }}>
          {printing ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Descargar mi SET Passport
        </button>
        <p className="w-full text-xs text-text-secondary">
          <Lock size={11} className="mr-1 inline" />
          Vista privada de tu sesión. En el diálogo elige «Guardar como PDF». En el celular, si no se abre, usa Compartir → Imprimir
          desde Chrome o Safari.
        </p>
      </div>

      {!sources && (
        <div className="spp-screen-only flex min-h-64 items-center justify-center gap-2 text-sm text-text-secondary">
          <Loader2 size={18} className="animate-spin" /> Preparando tu SET Passport...
        </div>
      )}
      {sources?.error && (
        <div className="spp-screen-only mx-auto mb-4 flex max-w-[210mm] items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> No pudimos cargar todos tus datos: {sources.error}. Revisa antes de descargar.
        </div>
      )}
      {doc && (
        <div ref={docRef} className="spp-doc-frame mx-auto max-w-[210mm] overflow-hidden rounded-xl shadow-2xl">
          <PassportDocument doc={doc} />
        </div>
      )}
    </div>
  );
};

export default PassportProfessionalView;
