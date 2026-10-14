// ─── SET Passport — documento profesional (modelo puro, sin I/O) ─────────────
//
// Arma lo que se muestra en la vista profesional y en el PDF:
//   - SOLO datos GUARDADOS del Passport (nunca sugerencias sin guardar ni el
//     estado de un formulario a medio editar);
//   - evidencia registrada en SimulaSET tal cual la compone
//     buildPassportEvidence (profiles.set_score + practiceLevel.js);
//   - credenciales verificadas únicamente si se reciben registros oficiales
//     de emisión (hoy no existe ninguno: el bloque se omite).
// Los campos vacíos se omiten; nunca se rellena con contenido inventado. No
// incluye correo ni otros datos de contacto.

import { AVAILABILITY_OPTIONS, LANGUAGE_LEVELS, normalizeTags, PASSPORT_LIMITS } from './passportModel';

const MODE_LABELS = { outbound: 'Outbound', inbound: 'Inbound', reactivacion: 'Reactivación' };

export const PASSPORT_DISCLAIMER =
  'Las métricas de entrenamiento provienen de SimulaSET, el simulador de conversaciones de venta de Digital SET, ' +
  'y no constituyen por sí mismas una certificación profesional. La información profesional fue declarada por su titular.';

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const labelOf = (options, value) => options.find(o => o.value === value)?.label || '';

export const formatGeneratedAt = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
};

export const buildPassportDocument = ({ name, avatarUrl, passport, evidence, credentials = [], generatedAt = new Date() }) => {
  const p = passport || {};

  const location = [text(p.city), text(p.country)].filter(Boolean).join(', ');
  const availability = labelOf(AVAILABILITY_OPTIONS, p.availability);
  const hours = Number(String(p.hoursPerWeek ?? '').trim());
  const hoursLabel = Number.isInteger(hours) && hours > 0 ? `${hours} h/semana` : '';
  const meta = [
    location,
    [availability, hoursLabel].filter(Boolean).join(' · '),
    text(p.timezone) ? `Zona horaria: ${text(p.timezone)}` : '',
  ].filter(Boolean);

  const languages = (Array.isArray(p.languages) ? p.languages : [])
    .map(l => ({ language: text(l?.language), level: labelOf(LANGUAGE_LEVELS, l?.level) }))
    .filter(l => l.language);

  const tagGroups = [
    { key: 'skills', title: 'Habilidades', items: normalizeTags(p.skills, PASSPORT_LIMITS.skills) },
    { key: 'tools', title: 'Herramientas comerciales', items: normalizeTags(p.tools, PASSPORT_LIMITS.tools) },
    { key: 'niches', title: 'Nichos de interés', items: normalizeTags(p.niches, PASSPORT_LIMITS.niches) },
  ].filter(group => group.items.length > 0);

  const headline = text(p.headline);
  const summary = text(p.summary);
  const declaredEmpty = !headline && !summary && meta.length === 0 && languages.length === 0
    && tagGroups.length === 0 && !p.openToOpportunities;

  const ev = evidence || null;
  const training = ev ? {
    setScore: ev.setScore,
    validSimulations: ev.validSimulations,
    practiceLevel: { name: ev.practiceLevel.name, icon: ev.practiceLevel.icon },
    practiceMinimum: ev.practiceMinimum.label,
    byMode: (ev.byMode || []).filter(m => m.simulations > 0).map(m => ({ label: MODE_LABELS[m.mode] || m.mode, simulations: m.simulations })),
  } : null;

  // Solo registros oficiales de emisión (id + título + emisor + fecha). Hoy no
  // existen: el caller pasa [] y la sección no se renderiza.
  const verified = (Array.isArray(credentials) ? credentials : [])
    .filter(c => c && c.id && text(c.title) && text(c.issuedBy) && c.issuedAt)
    .map(c => ({ id: c.id, title: text(c.title), issuedBy: text(c.issuedBy), issuedAt: formatGeneratedAt(c.issuedAt) }));

  return {
    name: text(name) || 'Alumno de SimulaSET',
    avatarUrl: text(avatarUrl) || null,
    headline,
    summary,
    meta,
    openToOpportunities: Boolean(p.openToOpportunities),
    languages,
    tagGroups,
    declaredEmpty,
    training,
    verified,
    generatedAtLabel: formatGeneratedAt(generatedAt),
    disclaimer: PASSPORT_DISCLAIMER,
  };
};

// Nombre sugerido del archivo PDF (los navegadores usan document.title).
export const passportDocumentTitle = (name) => {
  const clean = text(name).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return clean ? `SET Passport - ${clean}` : 'SET Passport';
};
