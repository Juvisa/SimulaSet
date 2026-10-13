// ─── SET Passport — modelo puro (sin I/O) ─────────────────────────────────────
//
// Tres capas que NUNCA se mezclan:
//   DECLARADO   = lo que el setter escribe (tabla setter_passports).
//   REGISTRADO  = entrenamiento en SimulaSET, solo lectura y siempre derivado
//                 de sus fuentes oficiales: profiles.set_score y simulaciones
//                 válidas → practiceLevel.js. Aquí no hay fórmulas propias.
//   VERIFICADO  = credenciales emitidas por Digital SET (todavía no existen).
//
// La completitud del perfil se calcula SOLO con campos declarados: no depende
// del SET Score ni del volumen de práctica.

import {
  isValidSimulation,
  getPracticeLevel,
  getPracticeMinimumStatus,
  getPracticeProgress,
} from '../../utils/practiceLevel';

// Límites — reflejan exactamente las restricciones CHECK de la migración
// 202610130001_create_setter_passports.sql.
export const PASSPORT_LIMITS = {
  headline: 120,
  summary: 1200,
  country: 80,
  city: 80,
  timezone: 64,
  hoursMin: 1,
  hoursMax: 80,
  languages: 10,
  languageName: 40,
  skills: 20,
  tools: 20,
  niches: 10,
  tag: 60,
};

export const AVAILABILITY_OPTIONS = [
  { value: 'full_time', label: 'Tiempo completo' },
  { value: 'part_time', label: 'Medio tiempo' },
  { value: 'freelance', label: 'Freelance / por proyecto' },
  { value: 'not_available', label: 'No disponible por ahora' },
];

export const LANGUAGE_LEVELS = [
  { value: 'basico', label: 'Básico' },
  { value: 'intermedio', label: 'Intermedio' },
  { value: 'avanzado', label: 'Avanzado' },
  { value: 'nativo', label: 'Nativo' },
];

const AVAILABILITY_VALUES = new Set(AVAILABILITY_OPTIONS.map(o => o.value));
const LANGUAGE_LEVEL_VALUES = new Set(LANGUAGE_LEVELS.map(o => o.value));

export const emptyPassport = () => ({
  headline: '',
  summary: '',
  country: '',
  city: '',
  timezone: '',
  availability: '',
  hoursPerWeek: '',
  openToOpportunities: false,
  languages: [],
  skills: [],
  tools: [],
  niches: [],
});

// ─── Conversión fila ⇄ formulario ────────────────────────────────────────────

export const passportFromRow = (row) => {
  if (!row) return emptyPassport();
  return {
    headline: row.headline || '',
    summary: row.summary || '',
    country: row.country || '',
    city: row.city || '',
    timezone: row.timezone || '',
    availability: row.availability || '',
    hoursPerWeek: Number.isFinite(row.hours_per_week) ? String(row.hours_per_week) : '',
    openToOpportunities: Boolean(row.open_to_opportunities),
    languages: Array.isArray(row.languages) ? row.languages.map(l => ({ language: l.language || '', level: l.level || '' })) : [],
    skills: Array.isArray(row.skills) ? row.skills : [],
    tools: Array.isArray(row.tools) ? row.tools : [],
    niches: Array.isArray(row.niches) ? row.niches : [],
  };
};

const cleanText = (value) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '');
const cleanMultiline = (value) => (typeof value === 'string' ? value.trim() : '');

// Normaliza etiquetas: recorta, quita vacías y duplicadas (sin distinguir
// mayúsculas) y respeta el máximo de elementos.
export const normalizeTags = (tags, maxItems) => {
  const seen = new Set();
  const out = [];
  (Array.isArray(tags) ? tags : []).forEach((tag) => {
    const clean = cleanText(tag);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) return;
    seen.add(key);
    out.push(clean);
  });
  return out.slice(0, maxItems);
};

// "Kommo, GoHighLevel ,  WhatsApp" → ['Kommo', 'GoHighLevel', 'WhatsApp']
export const parseTagInput = (text) =>
  (typeof text === 'string' ? text.split(',') : []).map(cleanText).filter(Boolean);

// Valida el formulario. Devuelve { campo: mensaje } (vacío = válido).
export const validatePassport = (form) => {
  const errors = {};
  const L = PASSPORT_LIMITS;
  const tooLong = (field, max, label) => {
    if (cleanMultiline(form[field]).length > max) errors[field] = `${label}: máximo ${max} caracteres.`;
  };
  tooLong('headline', L.headline, 'Titular');
  tooLong('summary', L.summary, 'Resumen');
  tooLong('country', L.country, 'País');
  tooLong('city', L.city, 'Ciudad');
  tooLong('timezone', L.timezone, 'Zona horaria');

  if (form.availability && !AVAILABILITY_VALUES.has(form.availability)) {
    errors.availability = 'Selecciona una disponibilidad válida.';
  }

  const hoursRaw = String(form.hoursPerWeek ?? '').trim();
  if (hoursRaw) {
    const hours = Number(hoursRaw);
    if (!Number.isInteger(hours) || hours < L.hoursMin || hours > L.hoursMax) {
      errors.hoursPerWeek = `Horas semanales: un número entero entre ${L.hoursMin} y ${L.hoursMax}.`;
    }
  }

  const languages = Array.isArray(form.languages) ? form.languages : [];
  if (languages.length > L.languages) errors.languages = `Máximo ${L.languages} idiomas.`;
  languages.forEach((lang) => {
    const name = cleanText(lang?.language);
    if (!name) errors.languages = 'Cada idioma necesita un nombre.';
    else if (name.length > L.languageName) errors.languages = `Nombre de idioma: máximo ${L.languageName} caracteres.`;
    else if (!LANGUAGE_LEVEL_VALUES.has(lang?.level)) errors.languages = `Indica el nivel de ${name}.`;
  });

  [['skills', 'Habilidades'], ['tools', 'Herramientas'], ['niches', 'Nichos']].forEach(([field, label]) => {
    const tags = Array.isArray(form[field]) ? form[field] : [];
    if (tags.length > L[field]) errors[field] = `${label}: máximo ${L[field]}.`;
    if (tags.some(tag => cleanText(tag).length > L.tag)) errors[field] = `${label}: cada elemento admite máximo ${L.tag} caracteres.`;
  });

  return errors;
};

// Formulario válido → payload para setter_passports (snake_case, vacíos = null).
// No incluye user_id ni marcas de tiempo: los fija la capa de API / la base.
export const toPassportPayload = (form) => {
  const textOrNull = (value) => cleanText(value) || null;
  const hoursRaw = String(form.hoursPerWeek ?? '').trim();
  const seenLanguages = new Set();
  const languages = (Array.isArray(form.languages) ? form.languages : [])
    .map(l => ({ language: cleanText(l?.language), level: l?.level }))
    .filter((l) => {
      const key = l.language.toLowerCase();
      if (!l.language || seenLanguages.has(key)) return false;
      seenLanguages.add(key);
      return true;
    })
    .slice(0, PASSPORT_LIMITS.languages);

  return {
    headline: textOrNull(form.headline),
    summary: cleanMultiline(form.summary) || null,
    country: textOrNull(form.country),
    city: textOrNull(form.city),
    timezone: textOrNull(form.timezone),
    availability: AVAILABILITY_VALUES.has(form.availability) ? form.availability : null,
    hours_per_week: hoursRaw ? Number(hoursRaw) : null,
    open_to_opportunities: Boolean(form.openToOpportunities),
    languages,
    skills: normalizeTags(form.skills, PASSPORT_LIMITS.skills),
    tools: normalizeTags(form.tools, PASSPORT_LIMITS.tools),
    niches: normalizeTags(form.niches, PASSPORT_LIMITS.niches),
  };
};

// ─── Completitud (SOLO datos declarados) ─────────────────────────────────────

const COMPLETENESS_FIELDS = [
  { key: 'headline', label: 'Titular profesional', filled: f => Boolean(cleanText(f.headline)) },
  { key: 'summary', label: 'Resumen profesional', filled: f => Boolean(cleanMultiline(f.summary)) },
  { key: 'location', label: 'País y ciudad', filled: f => Boolean(cleanText(f.country) && cleanText(f.city)) },
  { key: 'timezone', label: 'Zona horaria', filled: f => Boolean(cleanText(f.timezone)) },
  { key: 'availability', label: 'Disponibilidad y horas semanales', filled: f => Boolean(f.availability) && Boolean(String(f.hoursPerWeek ?? '').trim()) },
  { key: 'languages', label: 'Idiomas', filled: f => Array.isArray(f.languages) && f.languages.some(l => cleanText(l?.language)) },
  { key: 'skills', label: 'Habilidades', filled: f => normalizeTags(f.skills, PASSPORT_LIMITS.skills).length > 0 },
  { key: 'tools', label: 'Herramientas comerciales', filled: f => normalizeTags(f.tools, PASSPORT_LIMITS.tools).length > 0 },
  { key: 'niches', label: 'Nichos de interés', filled: f => normalizeTags(f.niches, PASSPORT_LIMITS.niches).length > 0 },
];

export const getPassportCompleteness = (form) => {
  const safe = form || emptyPassport();
  const missing = COMPLETENESS_FIELDS.filter(field => !field.filled(safe)).map(field => field.label);
  const completed = COMPLETENESS_FIELDS.length - missing.length;
  return {
    completed,
    total: COMPLETENESS_FIELDS.length,
    percent: Math.round((completed / COMPLETENESS_FIELDS.length) * 100),
    missing,
  };
};

// ─── Precarga desde datos que el setter ya declaró en otras pantallas ────────
//
// Solo se usa cuando el setter todavía no tiene Passport guardado. Son
// SUGERENCIAS: no se guarda nada hasta que el setter pulsa "Guardar", y no se
// escribe nunca en commercial_profiles ni en onboarding.

const CRM_LABELS = { leadsales: 'Leadsales', kommo: 'Kommo', ghl: 'GoHighLevel' };

// Una sugerencia nunca debe producir un dato que luego falle la validación.
const asSuggestedTag = (value) => cleanText(value).slice(0, PASSPORT_LIMITS.tag).trim();

export const buildPassportPrefill = ({ commercialProfile, onboarding } = {}) => {
  const prefill = {};
  const sources = [];

  if (commercialProfile) {
    if (cleanMultiline(commercialProfile.bio_pitch)) {
      prefill.summary = cleanMultiline(commercialProfile.bio_pitch).slice(0, PASSPORT_LIMITS.summary).trim();
    }
    if (cleanText(commercialProfile.primary_niche)) {
      prefill.niches = normalizeTags([asSuggestedTag(commercialProfile.primary_niche)], PASSPORT_LIMITS.niches);
    }
    if (Object.keys(prefill).length) sources.push('tu perfil de la Bolsa de Empleo');
  }

  if (onboarding) {
    const crm = onboarding.crm === 'other' ? asSuggestedTag(onboarding.crm_other) : CRM_LABELS[onboarding.crm];
    if (crm) {
      prefill.tools = normalizeTags([crm], PASSPORT_LIMITS.tools);
      sources.push('tu diagnóstico inicial');
    }
  }

  return { prefill, sources };
};

// Experiencia previa declarada en el diagnóstico inicial — se muestra como
// contexto DECLARADO, nunca como experiencia laboral verificada.
export const describeOnboardingExperience = (onboarding) => {
  if (!onboarding) return [];
  const items = [];
  if (onboarding.worked_setter) items.push('Ha trabajado como setter');
  if (onboarding.worked_closer) items.push('Ha trabajado como closer');
  if (onboarding.sold_by_chat) items.push('Ha vendido por chat');
  if (onboarding.participated_launch) items.push('Ha participado en lanzamientos');
  if (onboarding.worked_digital_business) items.push('Ha trabajado en negocios digitales');
  return items;
};

// ─── Estado completo de la pantalla (retrocompatible) ────────────────────────
//
// Funciona para CUALQUIER alumno existente, tenga o no fila en
// setter_passports:
//   - sin fila → formulario vacío + sugerencias de commercial_profiles /
//     onboarding (sin guardar nada), exists = false;
//   - con fila → lo que el alumno guardó, sin sugerencias.
// La evidencia se deriva SIEMPRE del historial completo de simulator_sessions
// (incluidas las sesiones anteriores a SET Passport) y de profiles.set_score,
// así que cada nueva simulación válida aparece al volver a consultar, sin
// sincronización ni copias. Nada de esto escribe ni modifica el historial.
export const buildPassportState = ({ passportRow, commercialProfile, onboarding, sessions, setScore }) => {
  const exists = Boolean(passportRow);
  const { prefill, sources } = exists ? { prefill: {}, sources: [] } : buildPassportPrefill({ commercialProfile, onboarding });
  return {
    exists,
    form: { ...passportFromRow(passportRow), ...prefill },
    prefillSources: sources,
    onboardingExperience: describeOnboardingExperience(onboarding),
    evidence: buildPassportEvidence({ sessions, setScore }),
  };
};

// ─── Evidencia registrada en SimulaSET (solo lectura) ────────────────────────
//
// Composición, no cálculo: SET Score = profiles.set_score tal cual; nivel,
// mínimo y progreso = practiceLevel.js con el conteo de simulaciones válidas.
// Las sesiones sin puntuar no cuentan (misma regla que el resto de la app).

const MODES = ['outbound', 'inbound', 'reactivacion'];

export const buildPassportEvidence = ({ sessions, setScore }) => {
  const validSessions = (Array.isArray(sessions) ? sessions : []).filter(isValidSimulation);
  const validSimulations = validSessions.length;
  return {
    setScore: Math.round(Number(setScore) || 0),
    validSimulations,
    practiceLevel: getPracticeLevel(validSimulations),
    practiceMinimum: getPracticeMinimumStatus(validSimulations),
    progress: getPracticeProgress(validSimulations),
    byMode: MODES.map(mode => ({ mode, simulations: validSessions.filter(s => s.mode === mode).length })),
  };
};
