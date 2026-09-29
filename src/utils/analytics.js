// ─── Analytics utility — read-only, no localStorage writes ───────────────────

import { supabase } from '../lib/supabase';
import { getRealLeads } from './realLeads';
import { isValidSimulation, getPracticeLevel, getPracticeMinimumStatus, PRACTICE_LEVELS } from './practiceLevel';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

// Las sesiones reales (Supabase) ya traen average_score precalculado con esta
// misma fórmula (ver utils/simulatorSessions.js) — se usa directo en vez de
// recalcularlo. Las sesiones locales (localStorage, usadas hoy solo por el
// panel de admin) no tienen ese campo, así que caen al cálculo original.
const sessionScore = (s) =>
  typeof s.averageScore === 'number'
    ? Math.round(s.averageScore)
    : s.scores?.length > 0 ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length * 10) : 0;

// DEUDA FUNCIONAL: "Leads convertidos" del Dashboard usa otra definición de
// éxito (3 estados en cualquier modo). Unificar posteriormente la definición
// de resultado exitoso por modo (outbound, inbound, reactivación).
const SUCCESS_STATES = {
  outbound:    ['pidio_llamada'],
  inbound:     ['confirmado_con_entusiasmo'],
  reactivacion: ['quiere_reagendar'],
};

const isSuccess = (session) =>
  (SUCCESS_STATES[session.mode] || []).includes(session.finalState);

// ISO week string  e.g. "2025-W21"
const isoWeek = (dateStr) => {
  const d = new Date(dateStr);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const week = Math.ceil(((d - jan4) / 86400000 + jan4.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
};

const daysAgo = (dateStr) => (Date.now() - new Date(dateStr)) / 86400000;

// ─── Setter analytics ─────────────────────────────────────────────────────────

// DESEMPEÑO — recibe SOLO simulaciones válidas (validSessions): tasa de
// éxito, promedios por modo, tendencia y conteos de "simulaciones".
function calcularMetricasSimulador(sesiones) {
  if (!sesiones.length) return null;

  const scores = sesiones.map(sessionScore);
  const last7 = sesiones.filter(s => daysAgo(s.createdAt) <= 7).map(sessionScore);

  const porModo = ['outbound', 'inbound', 'reactivacion'].reduce((acc, mode) => {
    const del = sesiones.filter(s => s.mode === mode);
    acc[mode] = {
      sesiones: del.length,
      promedio: avg(del.map(sessionScore)),
      tasaExito: pct(del.filter(isSuccess).length, del.length),
    };
    return acc;
  }, {});

  // "Más fuerte"/"Mejorar" solo tienen sentido para comparar, así que se
  // necesitan al menos 2 modos con sesiones — y si todos empatan en promedio,
  // el reduce por "estrictamente mayor/menor" dejaría el mismo modo como best
  // y worst a la vez, mostrando ambos badges en la misma tarjeta. Por eso se
  // descartan los dos si terminan apuntando al mismo modo.
  const modos = ['outbound', 'inbound', 'reactivacion'].filter(m => porModo[m].sesiones > 0);
  let modoMasFuerte = null;
  let modoMasDebil = null;
  if (modos.length >= 2) {
    const best = modos.reduce((b, m) =>
      !b || porModo[m].promedio > porModo[b].promedio ? m : b, null);
    const worst = modos.reduce((w, m) =>
      !w || porModo[m].promedio < porModo[w].promedio ? m : w, null);
    if (best !== worst) {
      modoMasFuerte = best;
      modoMasDebil = worst;
    }
  }

  // Week before this week average for trend
  const thisWeekKey = isoWeek(new Date().toISOString());
  const prevWeekSesiones = sesiones.filter(s => {
    const d = new Date(s.createdAt);
    d.setDate(d.getDate() + 7);
    return isoWeek(d.toISOString()) === thisWeekKey;
  });
  const prevWeekAvg = avg(prevWeekSesiones.map(sessionScore));
  const thisWeekAvg = avg(
    sesiones.filter(s => isoWeek(s.createdAt) === thisWeekKey).map(sessionScore)
  );

  // Sin "promedio_total": el desempeño general es el SET Score oficial
  // (profiles.set_score). No se mantiene un segundo algoritmo de promedio.
  return {
    promedio_ultimas_7_dias: avg(last7),
    sesiones_totales: sesiones.length,
    sesiones_esta_semana: sesiones.filter(s => isoWeek(s.createdAt) === isoWeek(new Date().toISOString())).length,
    mejor_sesion: scores.length ? Math.max(...scores) : 0,
    tendencia: last7.length && prevWeekSesiones.length
      ? thisWeekAvg - prevWeekAvg
      : null,
    por_modo: porModo,
    modo_mas_fuerte: modoMasFuerte,
    modo_mas_debil: modoMasDebil,
  };
}

// DESEMPEÑO — recibe SOLO simulaciones válidas (validSessions).
function calcularCurvaProgreso(sesiones) {
  if (sesiones.length < 3) return [];
  const porSemana = {};
  sesiones.forEach(s => {
    const sem = isoWeek(s.createdAt);
    if (!porSemana[sem]) porSemana[sem] = [];
    porSemana[sem].push(sessionScore(s));
  });
  const semanas = Object.entries(porSemana)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8) // last 8 weeks
    .map(([semana, sc]) => ({ semana, promedio: avg(sc) }));

  // Con menos de 3 semanas distintas, una curva agregada por semana no tiene
  // sentido (1-2 puntos no muestran tendencia) — antes esto hacía que
  // Analytics.jsx mostrara el empty state "practica al menos 3 sesiones"
  // incluso con 4+ sesiones reales, solo porque todas cayeron en la MISMA
  // semana calendario. Con menos de 3 semanas se usa la curva por sesión
  // individual en su lugar, que sí refleja el progreso ya hecho.
  if (semanas.length >= 3) return semanas;
  return sesiones.slice(-8).map((s, index) => ({ semana: `#${index + 1}`, promedio: sessionScore(s) }));
}

function calcularMetricasLeads(leads) {
  if (!leads.length) return null;

  const agendados = leads.filter(l => ['agendado', 'cerrado_ganado'].includes(l.estado));
  const noShows   = leads.filter(l => l.estado === 'no_show');
  const ganados   = leads.filter(l => l.estado === 'cerrado_ganado');
  const activos   = leads.filter(l => ['activo', 'fantasma'].includes(l.estado));

  // Canal stats
  const canales = {};
  leads.forEach(l => {
    const c = l.canal || 'otro';
    if (!canales[c]) canales[c] = { total: 0, agendados: 0 };
    canales[c].total++;
    if (['agendado', 'cerrado_ganado'].includes(l.estado)) canales[c].agendados++;
  });
  const canalMasEfectivo = Object.entries(canales)
    .filter(([, v]) => v.total >= 2)
    .sort(([, a], [, b]) => pct(b.agendados, b.total) - pct(a.agendados, a.total))[0]?.[0] || null;

  // Origen stats
  const inboundLeads = leads.filter(l => l.origen === 'Inbound');
  const outboundLeads = leads.filter(l => l.origen === 'Outbound');

  // Average close time (days from createdAt to agendado)
  const tiemposCierre = agendados
    .filter(l => (l.created_at || l.createdAt) && l.briefing?.generado_en)
    .map(l => (new Date(l.briefing.generado_en) - new Date(l.created_at || l.createdAt)) / 86400000);

  return {
    trabajados: leads.length,
    agendados: agendados.length,
    no_shows: noShows.length,
    ganados: ganados.length,
    activos: activos.length,
    tasa_agendamiento: pct(agendados.length, leads.length),
    tasa_asistencia: pct(agendados.length - noShows.length, agendados.length),
    tasa_conversion: pct(ganados.length, leads.length),
    tiempo_promedio_cierre: tiemposCierre.length
      ? (tiemposCierre.reduce((a, b) => a + b, 0) / tiemposCierre.length).toFixed(1)
      : null,
    canal_mas_efectivo: canalMasEfectivo,
    inbound_tasa: pct(inboundLeads.filter(l => ['agendado','cerrado_ganado'].includes(l.estado)).length, inboundLeads.length),
    outbound_tasa: pct(outboundLeads.filter(l => ['agendado','cerrado_ganado'].includes(l.estado)).length, outboundLeads.length),
  };
}

// Normaliza una fila de simulator_sessions al shape interno. Conserva `scores`
// para que isValidSimulation() pueda separar ACTIVIDAD de PRÁCTICA después.
const normalizarSesion = (row) => ({
  mode: row.mode,
  finalState: row.final_state,
  createdAt: row.created_at,
  scores: Array.isArray(row.scores) ? row.scores : [],
  averageScore: row.average_score,
});

// Estado del simulador para Mi Performance — distingue "nunca abrió el
// simulador" de "lo abrió pero no completó ninguna práctica puntuada", para no
// decirle "no tienes simulaciones" a alguien que sí lo ha usado.
export const getSimulatorActivityState = (startedSessionCount, validSimulationCount) => {
  if (!startedSessionCount) return 'sin_sesiones';
  if (!validSimulationCount) return 'sin_puntuadas';
  return 'con_practica';
};

// Modo con más sesiones INICIADAS (ACTIVIDAD: preferencia de uso, no
// desempeño ni volumen válido). Empate → el primero en el orden fijo de modos.
const modoMasUsado = (allSessions) => {
  let favorito = null;
  let max = 0;
  ['outbound', 'inbound', 'reactivacion'].forEach((mode) => {
    const count = allSessions.filter(s => s.mode === mode).length;
    if (count > max) { favorito = mode; max = count; }
  });
  return favorito;
};

// ─── Modelo semántico (Mi Performance y admin) ───────────────────────────────
//   ACTIVIDAD  = todas las sesiones iniciadas (allSessions): "¿usa el simulador?"
//   PRÁCTICA   = simulaciones válidas (validSessions, isValidSimulation — misma
//                población que el SET Score): "¿cuánto entrenó?"
//   DESEMPEÑO  = SET Score (profiles.set_score, NUNCA recalculado aquí) y
//                métricas calculadas SOLO sobre validSessions (curva, tasa de
//                éxito, promedios por modo, tendencia, alertas de rendimiento).
// En métricas de entrenamiento la palabra "simulación" = práctica válida. El
// uso bruto, si se muestra, se llama "sesiones iniciadas".

// Función pura (sin I/O) — Mi Performance de un setter.
export function construirMetricasSetter({ allSessions, leads = [], setScore }) {
  const validSessions = allSessions.filter(isValidSimulation);
  return {
    actividad: {
      sesionesIniciadas: allSessions.length,
      estado: getSimulatorActivityState(allSessions.length, validSessions.length),
    },
    // Indicador de VOLUMEN únicamente (≥ 20 simulaciones válidas). Reemplaza
    // a la antigua "certificación" automática, eliminada a propósito: no hay
    // certificación, elegibilidad SET Match ni Setter Verified automáticos.
    practica: getPracticeMinimumStatus(validSessions.length),
    // SET Score individual: se pasa tal cual desde profiles.set_score.
    setScore,
    simulador: calcularMetricasSimulador(validSessions),
    curva: calcularCurvaProgreso(validSessions),
    leadsReales: calcularMetricasLeads(leads),
  };
}

// Trae las sesiones reales desde Supabase para que "Mi Performance"
// funcione igual sin importar en qué dispositivo/navegador se completaron las
// simulaciones (antes dependía de que el navegador actual tuviera esas
// sesiones en localStorage, que es por-dispositivo y no se sincroniza).
//
// No incluye el Semáforo S.E.T. (S/E/T): ese cálculo depende de
// session.messages (etapa_set por mensaje de coaching) y session.finalFomo,
// campos que utils/simulatorSessions.js nunca persiste en la tabla
// simulator_sessions — no hay de dónde traerlos en el servidor hoy.
export async function calcularMetricasSetterReal(userId, setScore) {
  const { data, error } = await supabase
    .from('simulator_sessions')
    .select('mode, final_state, scores, average_score, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  const allSessions = (error ? [] : data || []).map(normalizarSesion);
  const { leads } = await getRealLeads(userId);

  return { ...construirMetricasSetter({ allSessions, leads, setScore }), error: error?.message };
}

// ─── Admin analytics (Supabase) ────────────────────────────────────────────────
// Reemplaza a la vieja calcularMetricasAdmin, que leía todo de localStorage
// ('setter_users', 'simulator_sessions', 'real_leads_sessions') — datos que
// viven en el navegador de CADA alumno, nunca en el del admin, así que ese
// panel mostraba prácticamente siempre cohortes vacías o desactualizadas.
// Ahora trae setters reales desde profiles y sus sesiones reales desde
// simulator_sessions; RLS ya le permite a un admin leer ambas tablas completas
// (profiles_select_own_or_admin, simulator_sessions_select_own_or_admin).
//
// Importante: NO existe tabla de "leads reales" en Supabase — ese dato solo
// vive en localStorage, por dispositivo, así que un admin nunca puede ver los
// leads de OTRO setter sin importar cómo se implemente esto. Por eso no hay
// KPI de "leads agendados" a nivel cohorte.

const actividadBarrasReal = (sesiones) => {
  const dias = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dias[d.toISOString().slice(0, 10)] = 0;
  }
  sesiones.forEach(s => {
    const key = s.createdAt?.slice(0, 10);
    if (key && dias[key] !== undefined) dias[key]++;
  });
  return Object.entries(dias).map(([fecha, count]) => ({ fecha: fecha.slice(5), sesiones: count }));
};

const tuvoActividadUltimos7Dias = (allSessions) => allSessions.some(x => daysAgo(x.createdAt) <= 7);

// Función pura (sin I/O) — métricas de cohorte para el admin. Cada métrica
// declara qué población usa (ver el modelo semántico arriba).
export function construirMetricasAdmin({ setters, sessionRows }) {
  const allRows = (sessionRows || []).map(row => ({ userId: row.user_id, ...normalizarSesion(row) }));
  const validRows = allRows.filter(isValidSimulation);

  const allByUser = new Map();
  allRows.forEach((row) => {
    const list = allByUser.get(row.userId) || [];
    list.push(row);
    allByUser.set(row.userId, list);
  });

  const conMetricas = (setters || []).map((setter) => {
    const allSessions = (allByUser.get(setter.id) || [])
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const validSessions = allSessions.filter(isValidSimulation);
    return {
      ...setter,
      // ACTIVIDAD (todas las sesiones iniciadas)
      allSessions,
      startedSessionCount: allSessions.length,
      lastActivity: allSessions[0]?.createdAt || null,
      modoFavorito: modoMasUsado(allSessions),
      // PRÁCTICA (solo simulaciones válidas) — el SET Score no participa.
      validSessions,
      validSimulations: validSessions.length,
      practiceLevel: getPracticeLevel(validSessions.length),
      practiceMinimum: getPracticeMinimumStatus(validSessions.length),
      // DESEMPEÑO: SET Score individual = setter.set_score (profiles); el
      // resto se calcula solo sobre simulaciones válidas.
      metricas: {
        simulador: calcularMetricasSimulador(validSessions),
      },
    };
  });

  const ranking = [...conMetricas].sort((a, b) => (b.set_score || 0) - (a.set_score || 0));
  const semanaActual = isoWeek(new Date().toISOString());

  const distribucion = PRACTICE_LEVELS.reduce((acc, level) => {
    acc[level.name] = conMetricas.filter(s => s.practiceLevel.id === level.id).length;
    return acc;
  }, {});

  // ACTIVIDAD: distribución de uso por modo sobre todas las sesiones iniciadas.
  const porModoGlobal = ['outbound', 'inbound', 'reactivacion'].map((mode) => {
    const count = allRows.filter(s => s.mode === mode).length;
    return { mode, sesiones: count, pct: pct(count, allRows.length) };
  });

  // SET Score promedio de COHORTE: media de los profiles.set_score de los
  // setters con al menos una simulación válida (sin ninguna, su set_score es
  // el default 0 y no representa desempeño). NO se recalcula desde
  // simulator_sessions. Es distinto del SET Score individual de cada setter.
  const conPractica = conMetricas.filter(s => s.validSimulations > 0);
  const setScorePromedioCohorte = avg(conPractica.map(s => Math.round(s.set_score || 0)));

  return {
    total_setters: conMetricas.length,
    // ACTIVIDAD
    setters_activos: conMetricas.filter(s => tuvoActividadUltimos7Dias(s.allSessions)).length,
    sin_actividad_7_dias: conMetricas.filter(s => !tuvoActividadUltimos7Dias(s.allSessions)),
    actividad_barras: actividadBarrasReal(allRows),
    por_modo_global: porModoGlobal,
    // PRÁCTICA
    simulaciones_total: validRows.length,
    simulaciones_esta_semana: validRows.filter(s => isoWeek(s.createdAt) === semanaActual).length,
    minimo_practica_cumplido: conMetricas.filter(s => s.practiceMinimum.met),
    distribucion_niveles: distribucion,
    // DESEMPEÑO
    set_score_promedio_cohorte: setScorePromedioCohorte,
    ranking,
    bajo_rendimiento: conMetricas.filter(s => {
      const ultimas5 = s.validSessions.slice(0, 5);
      return ultimas5.length >= 3 && avg(ultimas5.map(sessionScore)) < 50;
    }),
  };
}

export async function calcularMetricasAdminReal() {
  const [{ data: profileRows, error: profilesError }, { data: sessionRows, error: sessionsError }] = await Promise.all([
    supabase
      .from('profiles')
      // set_score = SET Score individual oficial. `level` (profiles.level) se
      // mantiene en el select por compatibilidad de forma, pero no se usa.
      .select('id, name, email, level, set_score, active, created_at')
      .eq('role', 'setter')
      .order('created_at', { ascending: true }),
    supabase
      .from('simulator_sessions')
      .select('user_id, mode, final_state, scores, average_score, created_at'),
  ]);

  return {
    error: profilesError?.message || sessionsError?.message,
    ...construirMetricasAdmin({ setters: profileRows || [], sessionRows: sessionRows || [] }),
  };
}
