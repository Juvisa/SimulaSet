// ─── Constancia de Formación Digital SET — modelo puro (sin I/O) ─────────────
//
// Traduce lo que devuelve el servidor (get_training_certificate_status,
// issue_training_certificate, verify_credential) a estados de pantalla. No
// decide la elegibilidad: esa la calcula y la vuelve a comprobar el servidor.

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Espacio de no separación: en móvil, el "%" nunca queda solo en otra línea.
const NBSP = String.fromCharCode(160);
const PERCENT_85 = `85${NBSP}%`;

export const formatCredentialDate = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
};

const formatPercent = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.floor(n)}${NBSP}%` : '';
};

// Estado de cada clase obligatoria, con un texto que explica qué falta.
export const describeRequiredLesson = (lesson) => {
  const base = { key: `${lesson.module_id}/${lesson.lesson_id}`, title: lesson.title || lesson.lesson_id };
  if (lesson.ok) return { ...base, state: 'verified', label: `Visualización verificada · ${formatPercent(lesson.verified_percent)}` };
  if (lesson.status === 'completed' && lesson.completion_source === 'legacy_self_reported') {
    return { ...base, state: 'legacy', label: `Completada antes del registro de visualización: vuelve a verla hasta el ${PERCENT_85} para verificarla` };
  }
  if (lesson.status === 'completed') return { ...base, state: 'unverified', label: 'Completada sin visualización verificada' };
  return { ...base, state: 'pending', label: `Pendiente: mírala al menos hasta el ${PERCENT_85}` };
};

export const getCertificatePanelState = ({ loading, status, error, unavailable }) => {
  if (loading) return { kind: 'loading' };
  if (unavailable) return { kind: 'unavailable' };
  if (error || !status) return { kind: 'error', message: error || 'No pudimos cargar el estado de tu constancia.' };

  const lessons = (Array.isArray(status.lessons) ? status.lessons : []).map(describeRequiredLesson);
  const verifiedCount = lessons.filter(l => l.state === 'verified').length;
  const definition = status.definition || {};
  const common = { lessons, verifiedCount, total: lessons.length, definition };

  if (status.credential) return { ...common, kind: 'issued', credential: status.credential };
  if (status.blocked) return { ...common, kind: 'blocked' };
  if (status.eligible) return { ...common, kind: 'eligible' };
  return { ...common, kind: 'in_progress' };
};

export const describeIssueOutcome = (result, error) => {
  if (error) return { ok: false, text: `No pudimos emitir tu constancia: ${error}` };
  switch (result?.outcome) {
    case 'issued': return { ok: true, text: '¡Tu Constancia de Formación Digital SET fue emitida!', credential: result.credential };
    case 'already_issued': return { ok: true, text: 'Tu constancia ya estaba emitida.', credential: result.credential };
    case 'consent_required': return { ok: false, text: 'Debes aceptar la visibilidad pública de la constancia para emitirla.' };
    case 'not_eligible': return { ok: false, text: `Aún no tienes las cuatro clases obligatorias verificadas al ${PERCENT_85}.` };
    case 'name_required': return { ok: false, text: 'Completa tu nombre en tu perfil antes de emitir la constancia.' };
    case 'blocked': return { ok: false, text: 'Tu constancia fue revocada. Escribe a Digital SET si necesitas revisarlo.' };
    default: return { ok: false, text: 'No pudimos emitir tu constancia. Inténtalo de nuevo.' };
  }
};

// Resultado de la verificación pública.
export const describeVerification = (result) => {
  if (!result || result.found !== true) return { kind: 'not_found' };
  const view = {
    code: result.public_code,
    holderName: result.holder_name,
    title: result.title,
    issuer: result.issuer,
    issuedAt: formatCredentialDate(result.issued_at),
    revokedAt: result.revoked_at ? formatCredentialDate(result.revoked_at) : '',
    description: result.description || '',
    isTest: result.is_test === true,
  };
  return { ...view, kind: result.status === 'active' ? 'valid' : 'revoked' };
};
