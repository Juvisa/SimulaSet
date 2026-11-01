// Módulo común de modalidades y sus consumidores (analítica y SET Passport)
// con sesiones de Inbound — Primer contacto.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SELECTOR_MODE, HISTORICAL_MODE_IDS, MODE_IDS, SELECTOR_MODE_IDS, SUCCESS_STATES,
  getMode, isTerminalState, modeLabel, selectorModes, temperatureLabels,
} from './simulatorModes';
import { construirMetricasSetter, construirMetricasAdmin } from './analytics';
import { buildPassportEvidence } from '../features/passport/passportModel';
import { buildPassportDocument } from '../features/passport/passportDocumentModel';
import { buildAssistantFacts } from '../features/passport/assistant/assistantContract';

vi.mock('../lib/supabase', () => ({ supabase: null, supabaseConfigured: false }));

describe('modalidades', () => {
  it('Primer contacto es la primera del selector y la seleccionada por defecto', () => {
    expect(SELECTOR_MODE_IDS[0]).toBe('primer_contacto');
    expect(DEFAULT_SELECTOR_MODE).toBe('primer_contacto');
    expect(selectorModes().map((m) => m.name)).toEqual(['Inbound — Primer contacto', 'Outbound', 'Inbound — Call Confirmer', 'Reactivación']);
  });
  it('el orden de reportes conserva el histórico y añade la nueva al final', () => {
    expect(MODE_IDS).toEqual(['outbound', 'inbound', 'reactivacion', 'primer_contacto']);
    expect(HISTORICAL_MODE_IDS).toEqual(['outbound', 'inbound', 'reactivacion']);
  });
  it('inbound sigue siendo Call Confirmer, con sus datos de siempre', () => {
    expect(getMode('inbound')).toMatchObject({ label: 'Inbound', name: 'Inbound — Call Confirmer', color: '#1D9E75', channels: ['WhatsApp', 'DM', 'Email'] });
    expect(getMode('outbound')).toMatchObject({ color: '#2563EB', channels: ['Instagram DM', 'WhatsApp', 'Comentarios'] });
    expect(getMode('reactivacion')).toMatchObject({ color: '#DC2626', channels: ['WhatsApp', 'DM'] });
  });
  it('éxito por modalidad: no_califica no cuenta como lead convertido', () => {
    expect(SUCCESS_STATES).toEqual({
      outbound: ['pidio_llamada'], inbound: ['confirmado_con_entusiasmo'], reactivacion: ['quiere_reagendar'], primer_contacto: ['pidio_llamada'],
    });
  });
  it('estados que cierran la sesión: los históricos no cambian; Primer contacto suma no_califica', () => {
    const legacy = ['pidio_llamada', 'cerrado', 'confirmado_con_entusiasmo', 'quiere_reagendar', 'cancelo'];
    for (const mode of ['outbound', 'inbound', 'reactivacion', 'desconocido', undefined]) {
      for (const s of legacy) expect(isTerminalState(mode, s)).toBe(true);
      for (const s of ['abierto', 'interesado', 'resistente', 'no_califica']) expect(isTerminalState(mode, s)).toBe(false);
    }
    for (const s of ['pidio_llamada', 'no_califica', 'cerrado']) expect(isTerminalState('primer_contacto', s)).toBe(true);
    for (const s of ['abierto', 'interesado', 'resistente']) expect(isTerminalState('primer_contacto', s)).toBe(false);
  });
  it('etiquetas de temperatura propias solo en Primer contacto', () => {
    expect(temperatureLabels('primer_contacto').frio).toContain('vio un anuncio');
    expect(temperatureLabels('outbound').frio).toBe('❄️ Frío — no conoce al experto');
    expect(modeLabel('primer_contacto')).toBe('Primer contacto');
    expect(modeLabel('otro')).toBe('otro');
  });
});

describe('analítica y Passport con sesiones de Primer contacto', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-20T12:00:00Z')); });
  afterEach(() => vi.useRealTimers());
  const at = (d) => new Date(Date.parse('2026-10-20T12:00:00Z') - d * 86400000).toISOString();
  const raw = [
    ['primer_contacto', [8, 7], 'pidio_llamada'], ['primer_contacto', [9], 'no_califica'], ['primer_contacto', [], null],
    ['outbound', [6], 'cerrado'], ['inbound', [8], 'confirmado_con_entusiasmo'],
  ];
  const sessions = raw.map(([mode, scores, finalState], i) => ({
    id: `s${i}`, mode, scores, finalState, createdAt: at(i + 1),
    averageScore: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) : 0,
  }));

  it('el desglose por modo suma el total y el éxito usa la definición de la modalidad', () => {
    const m = construirMetricasSetter({ allSessions: sessions, leads: [], setScore: 75 });
    const porModo = m.simulador.por_modo;
    expect(Object.keys(porModo)).toEqual(MODE_IDS);
    expect(Object.values(porModo).reduce((a, x) => a + x.sesiones, 0)).toBe(4); // 4 válidas
    expect(porModo.primer_contacto).toMatchObject({ sesiones: 2, tasaExito: 50 }); // no_califica no es éxito
  });
  it('panel de administración: distribución de actividad incluye la modalidad', () => {
    const rows = sessions.map((s) => ({ user_id: 'u1', mode: s.mode, scores: s.scores, final_state: s.finalState, created_at: s.createdAt, average_score: s.averageScore }));
    const m = construirMetricasAdmin({ setters: [{ id: 'u1', name: 'Uno', set_score: 75 }], sessionRows: rows });
    expect(m.por_modo_global.find((x) => x.mode === 'primer_contacto')).toMatchObject({ sesiones: 3 });
    expect(m.por_modo_global.reduce((a, x) => a + x.sesiones, 0)).toBe(rows.length);
  });
  it('SET Passport: aparece solo cuando se practicó, con su etiqueta', () => {
    const ev = buildPassportEvidence({ sessions, setScore: 75 });
    expect(ev.byMode).toEqual([
      { mode: 'outbound', simulations: 1 }, { mode: 'inbound', simulations: 1 }, { mode: 'reactivacion', simulations: 0 }, { mode: 'primer_contacto', simulations: 2 },
    ]);
    const sinNueva = buildPassportEvidence({ sessions: sessions.filter((s) => s.mode !== 'primer_contacto'), setScore: 75 });
    expect(sinNueva.byMode.map((m) => m.mode)).toEqual(['outbound', 'inbound', 'reactivacion']);
    const doc = buildPassportDocument({ name: 'Ana', passport: {}, evidence: ev });
    expect(doc.training.byMode).toContainEqual({ label: 'Primer contacto', simulations: 2 });
    const facts = buildAssistantFacts({ passportRow: null, onboarding: null, commercialProfile: null, sessions, answers: {} });
    expect(facts.registrado_en_simulaset.modos_practicados).toContain('Primer contacto');
  });
});
