// Regresión del simulador de práctica libre: fija el comportamiento de
// Outbound, Inbound — Call Confirmer y Reactivación (prompts del prospecto,
// prompt del perfil, prompt del reporte final, analítica y SET Passport).
// Los snapshots se generaron con el código ANTERIOR a la modalidad
// Inbound — Primer contacto; si cambian, cambió algo que debía quedar intacto.
// La modalidad nueva se excluye antes de comparar (stripNewMode), así que la
// misma prueba sirve antes y después de añadirla.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildOutboundSystemPrompt,
  buildInboundSystemPrompt,
  buildReactivacionSystemPrompt,
  buildFinalReportPrompt,
} from './prompts';
import { construirMetricasSetter, construirMetricasAdmin } from './analytics';
import { buildPassportEvidence } from '../features/passport/passportModel';
import { buildAssistantFacts } from '../features/passport/assistant/assistantContract';

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } }, error: null }), refreshSession: async () => ({ data: { session: null } }) } },
  supabaseConfigured: true,
}));

const NEW_MODE = 'primer_contacto';
const stripNewMode = (value) => {
  if (Array.isArray(value)) return value.filter((v) => !(v && v.mode === NEW_MODE)).map(stripNewMode);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([k]) => k !== NEW_MODE).map(([k, v]) => [k, stripNewMode(v)]));
  }
  return value;
};

const PROJECT = {
  id: 'p1',
  name: 'Agenda Llena',
  expertName: 'Dra. Ana Torres',
  niche: 'Odontólogos con consultorio propio',
  promise: 'Llenar la agenda sin depender de referidos en 90 días',
  price: '1.800 USD o 3 cuotas de 650 USD',
  avatarBusiness: 'Consultorio dental de 1 a 3 sillones',
  avatarCurrentSituation: 'Depende de referidos y la agenda va al 60 %',
  avatarPain: 'Meses flojos sin pacientes nuevos y miedo a no cubrir gastos',
  avatarDesire: 'Abrir un segundo consultorio',
  avatarDescription: 'Odontólogo independiente de 30 a 50 años',
  commonObjections: 'Ya probé con una agencia; no tengo tiempo; es caro',
  testimonials: [{ nombre: 'Dr. Luis', resultado: '+40 pacientes nuevos en 3 meses' }],
  resources: [],
  recursos: {
    guias_pdfs: [{ nombre: 'Guía de retención', descripcion: '5 pasos', momento_uso: 'antes de la llamada', activo: true, link: 'https://x' }],
    videos_testimonios: [{ nombre: 'Caso Luis', nicho_cliente: 'dental', resultado_logrado: '+40 pacientes', tiempo_resultado: '3 meses', activo: true, link: 'https://y' }],
    vsl_presentacion: { nombre: 'Clase Agenda Llena', link: 'https://z', activo: true },
    scripts_apertura: { outbound: 'Hola, vi tu consultorio…', inbound: 'Hola, vi que agendaste…', reactivacion: 'Hola, ¿cómo vas?' },
  },
};
const PROFILE = { nombre: 'Valeria Ríos', tipNegocio: 'Consultorio dental', dolor: 'Agenda al 60 %', temperatura: 'tibio', canal: 'WhatsApp', resistencia: 'media', situacionReactivacion: 'no_show' };
const HISTORY = [
  { id: '1', role: 'prospect', content: 'Hola' },
  { id: '2', role: 'setter', content: '¡Hola! ¿Cómo estás?' },
  { id: '3', role: 'prospect', content: 'Bien, ¿qué es esto?' },
];

describe('prompts de las modalidades existentes (sin cambios)', () => {
  it('Outbound', () => expect(buildOutboundSystemPrompt(PROJECT, PROFILE)).toMatchSnapshot());
  it('Inbound — Call Confirmer', () => expect(buildInboundSystemPrompt(PROJECT, PROFILE)).toMatchSnapshot());
  it('Reactivación', () => expect(buildReactivacionSystemPrompt(PROJECT, PROFILE)).toMatchSnapshot());
  for (const mode of ['outbound', 'inbound', 'reactivacion']) {
    it(`reporte final · ${mode}`, () => expect(buildFinalReportPrompt(mode, PROJECT, HISTORY, [7, 6], 40, 'abierto')).toMatchSnapshot());
  }
});

describe('prompt del perfil del prospecto en las modalidades existentes (sin cambios)', () => {
  let fetchMock;
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_ANTHROPIC_API_KEY', '');
    fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ text: JSON.stringify({ nombre: 'X', tipNegocio: 'Y', dolor: 'Z' }) }) }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  for (const mode of ['outbound', 'inbound', 'reactivacion']) {
    it(`perfil · ${mode}`, async () => {
      const { generateProspectProfile } = await import('./anthropic.js');
      const profile = await generateProspectProfile(PROJECT, mode, { temperatura: 'frio', canal: 'WhatsApp', resistencia: 'alta' });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect({ operation: body.operation, model: body.model, maxTokens: body.maxTokens, systemPrompt: body.systemPrompt, messages: body.messages }).toMatchSnapshot();
      expect(profile).toMatchSnapshot();
    });
  }
});

describe('analítica y SET Passport con historial de las modalidades existentes (sin cambios)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const day = (d) => new Date(Date.parse('2026-10-20T12:00:00Z') - d * 86400000).toISOString();
  const raw = [
    ['outbound', [7, 8], 'pidio_llamada', 1], ['outbound', [5], 'cerrado', 3], ['outbound', [], null, 4],
    ['inbound', [8, 9, 7], 'confirmado_con_entusiasmo', 2], ['inbound', [6], 'sin_compromiso', 9],
    ['reactivacion', [4, 5], 'resistente', 5], ['reactivacion', [7], 'quiere_reagendar', 12], [null, [6], null, 20],
  ];
  const sessions = raw.map(([mode, scores, finalState, d], i) => ({
    id: `s${i}`, mode, scores, finalState, createdAt: day(d),
    averageScore: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) : 0,
  }));
  const rows = raw.map(([mode, scores, finalState, d], i) => ({
    user_id: i % 2 ? 'u1' : 'u2', mode, scores, final_state: finalState, created_at: day(d),
    average_score: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) : 0,
  }));

  it('métricas del setter', () => expect(stripNewMode(construirMetricasSetter({ allSessions: sessions, leads: [], setScore: 68 }))).toMatchSnapshot());
  it('métricas de administración', () => expect(stripNewMode(construirMetricasAdmin({
    setters: [{ id: 'u1', name: 'Uno', set_score: 70 }, { id: 'u2', name: 'Dos', set_score: 60 }], sessionRows: rows,
  }))).toMatchSnapshot());
  it('evidencia del SET Passport', () => expect(stripNewMode(buildPassportEvidence({ sessions, setScore: 68 }))).toMatchSnapshot());
  it('hechos del asistente del Passport', () => expect(buildAssistantFacts({
    passportRow: null, onboarding: null, commercialProfile: null, sessions, answers: {},
  }).registrado_en_simulaset).toMatchSnapshot());
});
