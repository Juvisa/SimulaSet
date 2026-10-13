import { describe, it, expect } from 'vitest';
import {
  buildPassportState,
  buildPassportEvidence,
  buildPassportPrefill,
  getPassportCompleteness,
  emptyPassport,
  normalizeTags,
  parseTagInput,
  passportFromRow,
  toPassportPayload,
  validatePassport,
  PASSPORT_LIMITS,
} from './passportModel';

// Sesiones con el shape de getSimulatorSessions (camelCase, scores = array).
const session = (mode = 'outbound', scores = [8]) => ({ mode, scores, averageScore: 80, createdAt: '2026-09-01T10:00:00Z' });
const sessions = (n, mode, scores) => Array.from({ length: n }, () => session(mode, scores));

describe('retrocompatibilidad — alumnos existentes', () => {
  it('alumno existente con varias simulaciones válidas (historial previo a SET Passport)', () => {
    const history = [...sessions(15, 'outbound'), ...sessions(7, 'inbound'), ...sessions(3, 'reactivacion')];
    const state = buildPassportState({ passportRow: null, sessions: history, setScore: 80 });
    expect(state.evidence.validSimulations).toBe(25);
    expect(state.evidence.setScore).toBe(80);
    expect(state.evidence.practiceLevel.name).toBe('Avanzado');
    expect(state.evidence.practiceMinimum.label).toBe('✓ Mínimo de práctica cumplido');
    expect(state.evidence.byMode).toEqual([
      { mode: 'outbound', simulations: 15 },
      { mode: 'inbound', simulations: 7 },
      { mode: 'reactivacion', simulations: 3 },
    ]);
  });

  it('alumno con sesiones iniciadas pero sin puntuar: no cuentan como práctica', () => {
    const state = buildPassportState({ passportRow: null, sessions: sessions(5, 'outbound', []), setScore: 0 });
    expect(state.evidence.validSimulations).toBe(0);
    expect(state.evidence.practiceLevel.name).toBe('En inicio');
    expect(state.evidence.practiceMinimum.label).toBe('En entrenamiento');
    expect(state.evidence.byMode.every(m => m.simulations === 0)).toBe(true);
  });

  it('mezcla de puntuadas y sin puntuar: solo cuentan las válidas (caso Anab: 5 → 4)', () => {
    const state = buildPassportState({ passportRow: null, sessions: [...sessions(4, 'inbound'), session('inbound', [])], setScore: 82 });
    expect(state.evidence.validSimulations).toBe(4);
    expect(state.evidence.practiceLevel.name).toBe('En inicio');
    expect(state.evidence.setScore).toBe(82);
  });

  it('alumno nuevo sin simulaciones', () => {
    const state = buildPassportState({ passportRow: null, sessions: [], setScore: 0 });
    expect(state.evidence.validSimulations).toBe(0);
    expect(state.evidence.setScore).toBe(0);
    expect(state.evidence.practiceLevel.name).toBe('En inicio');
    expect(state.form).toEqual(emptyPassport());
    expect(getPassportCompleteness(state.form).percent).toBe(0);
  });

  it('alumno sin registro previo en setter_passports: formulario usable + sugerencias, sin perder historial', () => {
    const state = buildPassportState({
      passportRow: null,
      commercialProfile: { primary_niche: 'Infoproductos', bio_pitch: 'Setter con 2 años en lanzamientos.' },
      onboarding: { crm: 'kommo', worked_setter: true, sold_by_chat: true },
      sessions: sessions(12),
      setScore: 90,
    });
    expect(state.exists).toBe(false);
    expect(state.form.summary).toBe('Setter con 2 años en lanzamientos.');
    expect(state.form.niches).toEqual(['Infoproductos']);
    expect(state.form.tools).toEqual(['Kommo']);
    expect(state.prefillSources).toEqual(['tu perfil de la Bolsa de Empleo', 'tu diagnóstico inicial']);
    expect(state.onboardingExperience).toEqual(['Ha trabajado como setter', 'Ha vendido por chat']);
    // El historial sigue intacto aunque no haya Passport guardado.
    expect(state.evidence.validSimulations).toBe(12);
    expect(state.evidence.practiceLevel.name).toBe('Entrenado');
  });

  it('con registro guardado: usa lo guardado y no vuelve a sugerir', () => {
    const state = buildPassportState({
      passportRow: { headline: 'Closer B2B', summary: null, niches: ['Software'], skills: [], tools: [], languages: [] },
      commercialProfile: { primary_niche: 'Infoproductos', bio_pitch: 'Otro texto' },
      sessions: [],
      setScore: 70,
    });
    expect(state.exists).toBe(true);
    expect(state.form.headline).toBe('Closer B2B');
    expect(state.form.summary).toBe('');
    expect(state.form.niches).toEqual(['Software']);
    expect(state.prefillSources).toEqual([]);
  });

  it('actualización tras una nueva simulación: re-consultar refleja el cambio sin sincronizar', () => {
    const before = buildPassportEvidence({ sessions: sessions(19), setScore: 78 });
    const after = buildPassportEvidence({ sessions: [...sessions(19), session('inbound')], setScore: 79 });
    expect(before.validSimulations).toBe(19);
    expect(before.practiceLevel.name).toBe('Entrenado');
    expect(before.practiceMinimum.met).toBe(false);
    expect(after.validSimulations).toBe(20);
    expect(after.practiceLevel.name).toBe('Avanzado');
    expect(after.practiceMinimum.met).toBe(true);
    expect(after.setScore).toBe(79);
  });

  it('una nueva sesión SIN puntuar no altera la evidencia', () => {
    const base = buildPassportEvidence({ sessions: sessions(10), setScore: 75 });
    const withUnscored = buildPassportEvidence({ sessions: [...sessions(10), session('outbound', [])], setScore: 75 });
    expect(withUnscored).toEqual(base);
  });

  it('no modifica el historial recibido', () => {
    const history = [...sessions(3), session('inbound', [])];
    const snapshot = JSON.parse(JSON.stringify(history));
    buildPassportState({ passportRow: null, sessions: history, setScore: 60 });
    expect(history).toEqual(snapshot);
  });
});

describe('evidencia — sin fórmulas alternativas', () => {
  it('el SET Score se toma tal cual (solo redondeo de presentación); el nivel no depende de él', () => {
    const a = buildPassportEvidence({ sessions: sessions(25), setScore: 58 });
    const b = buildPassportEvidence({ sessions: sessions(25), setScore: 95 });
    expect(a.setScore).toBe(58);
    expect(b.setScore).toBe(95);
    expect(a.practiceLevel).toEqual(b.practiceLevel);
  });

  it('entradas ausentes no rompen la pantalla', () => {
    const ev = buildPassportEvidence({ sessions: undefined, setScore: undefined });
    expect(ev.validSimulations).toBe(0);
    expect(ev.setScore).toBe(0);
  });
});

describe('completitud — solo datos declarados', () => {
  const full = {
    ...emptyPassport(),
    headline: 'Setter', summary: 'Resumen', country: 'Colombia', city: 'Medellín', timezone: 'GMT-5',
    availability: 'part_time', hoursPerWeek: '20', languages: [{ language: 'Español', level: 'nativo' }],
    skills: ['Calificación'], tools: ['Kommo'], niches: ['Infoproductos'],
  };

  it('100% con todos los campos declarados', () => {
    expect(getPassportCompleteness(full)).toMatchObject({ percent: 100, completed: 9, total: 9, missing: [] });
  });

  it('país sin ciudad o disponibilidad sin horas no cuentan como completos', () => {
    const c = getPassportCompleteness({ ...full, city: '', hoursPerWeek: '' });
    expect(c.missing).toEqual(['País y ciudad', 'Disponibilidad y horas semanales']);
  });

  it('openToOpportunities no suma completitud (es una preferencia, no un dato)', () => {
    expect(getPassportCompleteness({ ...emptyPassport(), openToOpportunities: true }).percent).toBe(0);
  });
});

describe('validación y payload', () => {
  it('rechaza horas fuera de rango, disponibilidad inválida e idiomas incompletos', () => {
    const errors = validatePassport({
      ...emptyPassport(),
      hoursPerWeek: '120',
      availability: 'siempre',
      languages: [{ language: 'Inglés', level: '' }],
    });
    expect(errors.hoursPerWeek).toMatch(/entre 1 y 80/);
    expect(errors.availability).toBeDefined();
    expect(errors.languages).toMatch(/Inglés/);
  });

  it('rechaza textos más largos que los límites de la base', () => {
    const errors = validatePassport({ ...emptyPassport(), headline: 'x'.repeat(PASSPORT_LIMITS.headline + 1) });
    expect(errors.headline).toBeDefined();
  });

  it('formulario vacío es válido (todo opcional) y produce nulls / arrays vacíos', () => {
    expect(validatePassport(emptyPassport())).toEqual({});
    expect(toPassportPayload(emptyPassport())).toEqual({
      headline: null, summary: null, country: null, city: null, timezone: null,
      availability: null, hours_per_week: null, open_to_opportunities: false,
      languages: [], skills: [], tools: [], niches: [],
    });
  });

  it('el payload nunca incluye user_id, set_score ni métricas', () => {
    const keys = Object.keys(toPassportPayload(emptyPassport()));
    expect(keys).not.toContain('user_id');
    expect(keys.some(k => /score|simul|level/i.test(k))).toBe(false);
  });

  it('normaliza etiquetas e idiomas duplicados', () => {
    const payload = toPassportPayload({
      ...emptyPassport(),
      headline: '  Setter   de   ventas ',
      hoursPerWeek: '25',
      skills: ['Rapport', ' rapport ', '', 'Objeciones'],
      languages: [{ language: 'Español', level: 'nativo' }, { language: 'español', level: 'avanzado' }],
    });
    expect(payload.headline).toBe('Setter de ventas');
    expect(payload.hours_per_week).toBe(25);
    expect(payload.skills).toEqual(['Rapport', 'Objeciones']);
    expect(payload.languages).toEqual([{ language: 'Español', level: 'nativo' }]);
  });

  it('round-trip fila → formulario → payload conserva los datos', () => {
    const row = {
      headline: 'Setter', summary: 'Texto', country: 'México', city: 'CDMX', timezone: 'GMT-6',
      availability: 'freelance', hours_per_week: 30, open_to_opportunities: true,
      languages: [{ language: 'Español', level: 'nativo' }], skills: ['A'], tools: ['B'], niches: ['C'],
    };
    expect(toPassportPayload(passportFromRow(row))).toEqual(row);
  });
});

describe('helpers de etiquetas y precarga', () => {
  it('parseTagInput separa por comas', () => {
    expect(parseTagInput('Kommo, GoHighLevel ,  WhatsApp,')).toEqual(['Kommo', 'GoHighLevel', 'WhatsApp']);
  });

  it('normalizeTags respeta el máximo', () => {
    expect(normalizeTags(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
  });

  it('las sugerencias largas se recortan para que el formulario siga siendo válido', () => {
    const { prefill } = buildPassportPrefill({
      commercialProfile: { primary_niche: 'n'.repeat(90), bio_pitch: 'b'.repeat(1500) },
      onboarding: { crm: 'other', crm_other: 'c'.repeat(75) },
    });
    expect(prefill.niches[0]).toHaveLength(PASSPORT_LIMITS.tag);
    expect(prefill.tools[0]).toHaveLength(PASSPORT_LIMITS.tag);
    expect(prefill.summary).toHaveLength(PASSPORT_LIMITS.summary);
    expect(validatePassport({ ...emptyPassport(), ...prefill })).toEqual({});
  });

  it('la precarga no modifica los objetos de origen', () => {
    const commercialProfile = { primary_niche: 'Infoproductos', bio_pitch: 'Hola' };
    const onboarding = { crm: 'kommo' };
    const before = JSON.stringify({ commercialProfile, onboarding });
    buildPassportPrefill({ commercialProfile, onboarding });
    expect(JSON.stringify({ commercialProfile, onboarding })).toBe(before);
  });

  it('CRM "other" usa el texto libre; "none" no sugiere herramienta', () => {
    expect(buildPassportPrefill({ onboarding: { crm: 'other', crm_other: 'HubSpot' } }).prefill.tools).toEqual(['HubSpot']);
    expect(buildPassportPrefill({ onboarding: { crm: 'none' } }).prefill).toEqual({});
  });
});
