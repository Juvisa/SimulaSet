// ─── SET Passport — asistente: preguntas y aplicación del borrador (puro) ───
//
// Las preguntas no usan IA. Se muestran entre 3 y 5:
//   siempre:     trayectoria (confirmación), qué destacar (opcional), tono;
//   si faltan:   funciones/experiencia según la trayectoria, roles buscados.
// Nada de lo que se responde aquí se guarda en la base.

import { isBlankExperience } from '../passportModel.js';

const SETTER_KINDS = new Set(['setter', 'closer']);

// Contexto calculado una sola vez a partir de lo GUARDADO.
export const buildAssistantContext = ({ savedForm, suggestedTrack, commercialProfile }) => {
  const experiences = (savedForm?.experiences || []).filter(e => !isBlankExperience(e));
  const setterExps = experiences.filter(e => SETTER_KINDS.has(e.kind));
  const transferableExps = experiences.filter(e => !SETTER_KINDS.has(e.kind) && e.role.trim());
  const setterFunctions = [...new Set(setterExps.flatMap(e => e.functions))];
  const savedRoles = savedForm?.preferredRoles || [];
  const bolsaRole = ['setter', 'closer'].includes(commercialProfile?.role_type) ? [commercialProfile.role_type] : [];

  return {
    savedTrack: savedForm?.experienceTrack || '',
    // Ya respondido en el perfil: no se vuelve a preguntar.
    hasSetterDetail: setterExps.length > 0 && setterFunctions.length >= 2,
    hasTransferableDetail: transferableExps.some(e => e.functions.length >= 2),
    hasRoles: savedRoles.length > 0,
    defaults: {
      track: savedForm?.experienceTrack || suggestedTrack || '',
      functions: setterFunctions,
      transferableRole: transferableExps[0]
        ? { role: transferableExps[0].role, context: transferableExps[0].context }
        : { role: '', context: '' },
      strengths: [],
      preferredRoles: savedRoles.length ? savedRoles : bolsaRole,
      highlight: '',
      tone: 'cercano',
    },
  };
};

// Preguntas visibles según la trayectoria elegida AHORA en el asistente.
export const getVisibleQuestions = (answers, ctx) => {
  const ids = ['track'];
  if (answers.track === 'setter_closer' && !ctx.hasSetterDetail) ids.push('functions');
  if (answers.track === 'comercial_transferible' && !ctx.hasTransferableDetail) ids.push('transferable');
  if (answers.track === 'en_formacion') ids.push('strengths');
  if (!ctx.hasRoles) ids.push('roles');
  ids.push('highlight', 'tone');
  return ids;
};

// Solo se envían las respuestas de las preguntas visibles; lo demás lo lee el
// servidor de lo guardado.
export const toAnswersPayload = (answers, visibleIds) => {
  const payload = { track: answers.track, tone: answers.tone };
  if (visibleIds.includes('functions')) payload.functions = answers.functions;
  if (visibleIds.includes('transferable')) {
    payload.transferableRole = answers.transferableRole;
    payload.functions = answers.functions;
  }
  if (visibleIds.includes('strengths')) payload.strengths = answers.strengths;
  if (visibleIds.includes('roles')) payload.preferredRoles = answers.preferredRoles;
  if (answers.highlight.trim()) payload.highlight = answers.highlight;
  return payload;
};

// Validación previa en el navegador (el servidor repite la suya).
export const validateQuestionAnswers = (answers, visibleIds) => {
  if (!answers.track) return 'Elige qué describe mejor tu situación.';
  if (visibleIds.includes('functions') && answers.functions.length === 0) {
    return 'Indica al menos una función que realizabas como setter o closer.';
  }
  if (visibleIds.includes('transferable') && !answers.transferableRole.role.trim()) {
    return 'Indica en qué trabajo comercial o de atención tienes experiencia.';
  }
  return null;
};

// ─── Aplicación del borrador ─────────────────────────────────────────────────
// El alumno elige qué campos usar. Si un campo ya tiene otro texto, se pide
// confirmación explícita de reemplazo. Devuelve los cambios y los reemplazos.
export const planDraftApplication = ({ current, draft, selection }) => {
  const changes = {};
  const replacements = [];
  [['headline', 'titular'], ['summary', 'resumen']].forEach(([field, label]) => {
    if (!selection[field]) return;
    const next = (draft[field] || '').trim();
    if (!next) return;
    const prev = (current[field] || '').trim();
    if (prev === next) return;
    changes[field] = next;
    if (prev) replacements.push(label);
  });
  return { changes, replacements };
};
