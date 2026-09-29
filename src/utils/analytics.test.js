import { describe, it, expect, vi } from 'vitest';
import { construirMetricasSetter, construirMetricasAdmin, getSimulatorActivityState } from './analytics';

// Solo se prueban las funciones puras; el cliente real de Supabase (que
// necesita window/sessionStorage) no debe instanciarse en Node.
vi.mock('../lib/supabase', () => ({ supabase: null, supabaseConfigured: false }));

// Reloj fijo: las ventanas de 7/14 días dependen de Date.now(), y sin esto
// dos llamadas separadas por milisegundos pueden caer a lados distintos del
// límite de 7 días exactos.
vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));

const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString();

// Filas crudas de simulator_sessions (shape de Supabase).
const fila = ({ userId = 'u1', mode = 'outbound', scores = [8, 7], dias = 1, finalState = null } = {}) => ({
  user_id: userId,
  mode,
  final_state: finalState,
  scores,
  average_score: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) : 0,
  created_at: hace(dias),
});

// Mismo dato normalizado, como lo recibe construirMetricasSetter.
const sesion = (opts) => {
  const row = fila(opts);
  return { mode: row.mode, finalState: row.final_state, createdAt: row.created_at, scores: row.scores, averageScore: row.average_score };
};

const repetir = (n, opts) => Array.from({ length: n }, (_, i) => opts(i));
const sinPuntuar = (n, extra = {}) => repetir(n, () => ({ scores: [], ...extra }));
const puntuadas = (n, extra = {}) => repetir(n, (i) => ({ scores: [5 + (i % 5)], dias: 1 + (i % 20), ...extra }));

const admin = (rowsOpts, setScore = 70) => construirMetricasAdmin({
  setters: [{ id: 'u1', name: 'Setter', set_score: setScore }],
  sessionRows: rowsOpts.map(fila),
});

const sumaBarras = (m) => m.actividad_barras.reduce((acc, d) => acc + d.sesiones, 0);

describe('A — 10 iniciadas, 6 válidas', () => {
  const opts = [...puntuadas(6, { dias: 2 }), ...sinPuntuar(4, { dias: 3 })];

  it('admin: actividad = 10, práctica = 6', () => {
    const m = admin(opts);
    const setter = m.ranking[0];
    expect(setter.startedSessionCount).toBe(10);
    expect(sumaBarras(m)).toBe(10);
    expect(m.por_modo_global.reduce((acc, x) => acc + x.sesiones, 0)).toBe(10);
    expect(setter.validSimulations).toBe(6);
    expect(m.simulaciones_total).toBe(6);
    expect(setter.metricas.simulador.sesiones_totales).toBe(6);
  });

  it('Mi Performance: actividad = 10, práctica = 6', () => {
    const m = construirMetricasSetter({ allSessions: opts.map(sesion), setScore: 70 });
    expect(m.actividad.sesionesIniciadas).toBe(10);
    expect(m.practica.validSimulations).toBe(6);
    expect(m.simulador.sesiones_totales).toBe(6);
  });
});

describe('B — 25 iniciadas, 20 válidas', () => {
  const opts = [...puntuadas(20), ...sinPuntuar(5)];

  it('nivel y mínimo de práctica con 20; actividad sigue en 25', () => {
    const setter = admin(opts).ranking[0];
    expect(setter.practiceLevel.name).toBe('Avanzado');
    expect(setter.practiceMinimum.met).toBe(true);
    expect(setter.practiceMinimum.label).toBe('✓ Mínimo de práctica cumplido');
    expect(setter.validSimulations).toBe(20);
    expect(setter.startedSessionCount).toBe(25);

    const m = construirMetricasSetter({ allSessions: opts.map(sesion), setScore: 70 });
    expect(m.practica.met).toBe(true);
    expect(m.practica.validSimulations).toBe(20);
    expect(m.actividad.sesionesIniciadas).toBe(25);
  });
});

describe('C — 5 iniciadas, 0 válidas', () => {
  const opts = sinPuntuar(5, { dias: 1 });

  it('tiene actividad, 0 prácticas, estado "sin_puntuadas"', () => {
    const m = construirMetricasSetter({ allSessions: opts.map(sesion), setScore: 0 });
    expect(m.actividad.sesionesIniciadas).toBe(5);
    expect(m.actividad.estado).toBe('sin_puntuadas');
    expect(m.practica.validSimulations).toBe(0);
    expect(m.simulador).toBeNull();

    const a = admin(opts, 0);
    expect(a.setters_activos).toBe(1);
    expect(a.sin_actividad_7_dias).toHaveLength(0);
    expect(a.ranking[0].validSimulations).toBe(0);
  });
});

describe('D — 0 iniciadas', () => {
  it('estado "sin_sesiones"', () => {
    const m = construirMetricasSetter({ allSessions: [], setScore: 0 });
    expect(m.actividad.estado).toBe('sin_sesiones');
    expect(getSimulatorActivityState(0, 0)).toBe('sin_sesiones');
    expect(getSimulatorActivityState(3, 0)).toBe('sin_puntuadas');
    expect(getSimulatorActivityState(3, 1)).toBe('con_practica');
  });
});

describe('E — las sesiones sin puntuar NO afectan desempeño ni práctica', () => {
  const base = [
    ...puntuadas(12, { mode: 'outbound', finalState: 'pidio_llamada' }),
    ...puntuadas(4, { mode: 'inbound', finalState: 'cancelo' }),
    ...puntuadas(3, { mode: 'reactivacion', dias: 30 }),
  ];
  const conRuido = [...base, ...sinPuntuar(9, { mode: 'inbound', dias: 1 }), ...sinPuntuar(3, { mode: 'outbound', dias: 25 })];

  it('Mi Performance: SET Score, tasa de éxito, curva, promedios, nivel y mínimo idénticos', () => {
    const limpio = construirMetricasSetter({ allSessions: base.map(sesion), setScore: 64 });
    const sucio = construirMetricasSetter({ allSessions: conRuido.map(sesion), setScore: 64 });
    expect(sucio.setScore).toBe(limpio.setScore);
    expect(sucio.simulador).toEqual(limpio.simulador); // tasaExito, promedios por modo, tendencia, conteos
    expect(sucio.curva).toEqual(limpio.curva);
    expect(sucio.practica).toEqual(limpio.practica);
    expect(sucio.simulador.por_modo.outbound.tasaExito).toBe(100);
    expect(sucio.simulador.por_modo.inbound.tasaExito).toBe(0);
  });

  it('admin: nivel, mínimo, simulaciones, alertas de rendimiento y SET Score de cohorte idénticos', () => {
    const limpio = admin(base, 64);
    const sucio = admin(conRuido, 64);
    expect(sucio.ranking[0].practiceLevel).toEqual(limpio.ranking[0].practiceLevel);
    expect(sucio.ranking[0].practiceMinimum).toEqual(limpio.ranking[0].practiceMinimum);
    expect(sucio.ranking[0].metricas).toEqual(limpio.ranking[0].metricas);
    expect(sucio.simulaciones_total).toBe(limpio.simulaciones_total);
    expect(sucio.simulaciones_esta_semana).toBe(limpio.simulaciones_esta_semana);
    expect(sucio.bajo_rendimiento).toHaveLength(limpio.bajo_rendimiento.length);
    expect(sucio.set_score_promedio_cohorte).toBe(limpio.set_score_promedio_cohorte);
    expect(sucio.distribucion_niveles).toEqual(limpio.distribucion_niveles);
  });

  it('3 sesiones vacías ya no disparan la alerta de bajo rendimiento', () => {
    const m = admin([...sinPuntuar(3), ...puntuadas(2, { scores: [9] })], 90);
    expect(m.bajo_rendimiento).toHaveLength(0);
  });
});

describe('F — las sesiones sin puntuar SÍ afectan actividad', () => {
  const base = puntuadas(2, { mode: 'outbound', dias: 10 });
  const conRecientes = [...base, ...sinPuntuar(3, { mode: 'inbound', dias: 0 })];

  it('última actividad, actividad diaria, setters activos, inactividad y modo favorito', () => {
    const antes = admin(base);
    const despues = admin(conRecientes);

    expect(new Date(despues.ranking[0].lastActivity).getTime())
      .toBeGreaterThan(new Date(antes.ranking[0].lastActivity).getTime());
    expect(sumaBarras(despues)).toBe(sumaBarras(antes) + 3);
    expect(antes.setters_activos).toBe(0);
    expect(despues.setters_activos).toBe(1);
    expect(antes.sin_actividad_7_dias).toHaveLength(1);
    expect(despues.sin_actividad_7_dias).toHaveLength(0);
    expect(antes.ranking[0].modoFavorito).toBe('outbound');
    expect(despues.ranking[0].modoFavorito).toBe('inbound');
    expect(despues.por_modo_global.find(x => x.mode === 'inbound').sesiones).toBe(3);

    // …pero la práctica no cambia.
    expect(despues.ranking[0].validSimulations).toBe(2);
    expect(despues.simulaciones_total).toBe(2);
  });
});

describe('SET Score de cohorte', () => {
  it('media de profiles.set_score de setters con ≥1 simulación válida; no se recalcula desde sesiones', () => {
    const m = construirMetricasAdmin({
      setters: [
        { id: 'a', set_score: 80 },
        { id: 'b', set_score: 60 },
        { id: 'c', set_score: 0 }, // sin práctica válida → fuera del promedio
      ],
      sessionRows: [
        fila({ userId: 'a', scores: [1] }), // average_score 10, distinto de set_score a propósito
        fila({ userId: 'b', scores: [2] }),
        fila({ userId: 'c', scores: [] }),
      ],
    });
    expect(m.set_score_promedio_cohorte).toBe(70);
  });
});
