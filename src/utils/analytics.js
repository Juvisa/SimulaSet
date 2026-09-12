// ─── Analytics utility — read-only, no localStorage writes ───────────────────

import { supabase } from '../lib/supabase';

const KEYS = {
  SESSIONS: 'simulator_sessions',
  LEADS: 'real_leads_sessions',
  USERS: 'setter_users',
  PROJECTS: 'projects',
};

const get = (key) => JSON.parse(localStorage.getItem(key) || '[]');

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

  return {
    promedio_total: avg(scores),
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

function calcularCurvaProgreso(sesiones) {
  if (sesiones.length < 3) return [];
  const porSemana = {};
  sesiones.forEach(s => {
    const sem = isoWeek(s.createdAt);
    if (!porSemana[sem]) porSemana[sem] = [];
    porSemana[sem].push(sessionScore(s));
  });
  return Object.entries(porSemana)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8) // last 8 weeks
    .map(([semana, sc]) => ({ semana, promedio: avg(sc) }));
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
  const inboundLeads = leads.filter(l => l.origen === 'inbound');
  const outboundLeads = leads.filter(l => l.origen === 'outbound');

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

function evaluarCertificacion(sesiones, leads) {
  const scores = sesiones.map(sessionScore);
  const promedioSim = avg(scores);
  const modos = ['outbound', 'inbound', 'reactivacion'];
  const modosCon5 = modos.filter(m => sesiones.filter(s => s.mode === m).length >= 5);
  const listo = promedioSim >= 80 && leads.length >= 5 && modosCon5.length === 3;

  return {
    listo,
    promedio_simulador: promedioSim,
    leads_reales: leads.length,
    modos_con_5_sesiones: modosCon5,
    modos_faltantes: modos.filter(m => !modosCon5.includes(m)),
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
export async function calcularMetricasSetterReal(userId) {
  const { data, error } = await supabase
    .from('simulator_sessions')
    .select('mode, final_state, scores, average_score, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  const sesiones = (error ? [] : data || []).map(row => ({
    mode: row.mode,
    finalState: row.final_state,
    createdAt: row.created_at,
    scores: Array.isArray(row.scores) ? row.scores : [],
    averageScore: row.average_score,
  }));
  const leads = get(KEYS.LEADS).filter(l => l.setter_id === userId);

  return {
    simulador: calcularMetricasSimulador(sesiones),
    leadsReales: calcularMetricasLeads(leads),
    curva: calcularCurvaProgreso(sesiones),
    certificacion: evaluarCertificacion(sesiones, leads),
    error: error?.message,
  };
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
// leads de OTRO setter sin importar cómo se implemente esto. Por eso ya no hay
// KPI de "leads agendados" a nivel cohorte, y el criterio de certificación de
// abajo (evaluarCertificacionCohorte) NO exige leads_reales >= 5 como sí lo
// hace evaluarCertificacion() para el propio setter — solo evalúa lo que es
// verificable desde el servidor (promedio >= 80 y 3 modos con 5+ sesiones).
const evaluarCertificacionCohorte = (sesiones) => {
  const promedioSim = avg(sesiones.map(sessionScore));
  const modos = ['outbound', 'inbound', 'reactivacion'];
  const modosCon5 = modos.filter(m => sesiones.filter(s => s.mode === m).length >= 5);
  return {
    listo: promedioSim >= 80 && modosCon5.length === 3,
    promedio_simulador: promedioSim,
    modos_con_5_sesiones: modosCon5,
    modos_faltantes: modos.filter(m => !modosCon5.includes(m)),
  };
};

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

export async function calcularMetricasAdminReal() {
  const [{ data: profileRows, error: profilesError }, { data: sessionRows, error: sessionsError }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, name, level, active, created_at')
      .eq('role', 'setter')
      .order('created_at', { ascending: true }),
    supabase
      .from('simulator_sessions')
      .select('user_id, mode, final_state, average_score, created_at'),
  ]);

  const error = profilesError?.message || sessionsError?.message;
  const setters = profileRows || [];

  const sessionsByUser = new Map();
  (sessionRows || []).forEach((row) => {
    const normalized = { mode: row.mode, finalState: row.final_state, createdAt: row.created_at, averageScore: row.average_score };
    const list = sessionsByUser.get(row.user_id) || [];
    list.push(normalized);
    sessionsByUser.set(row.user_id, list);
  });

  const conMetricas = setters.map((setter) => {
    const sesiones = (sessionsByUser.get(setter.id) || [])
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return {
      ...setter,
      lastActivity: sesiones[0]?.createdAt || null,
      sesiones,
      metricas: {
        simulador: calcularMetricasSimulador(sesiones),
        certificacion: evaluarCertificacionCohorte(sesiones),
      },
    };
  });

  const ranking = [...conMetricas].sort((a, b) =>
    (b.metricas.simulador?.promedio_total || 0) - (a.metricas.simulador?.promedio_total || 0)
  );

  const todasSesiones = (sessionRows || []).map(row => ({
    mode: row.mode, finalState: row.final_state, createdAt: row.created_at, averageScore: row.average_score,
  }));
  const semanaActual = isoWeek(new Date().toISOString());

  const NIVEL_MAP = { 1: 'Novato', 2: 'Aprendiz', 3: 'Practicante', 4: 'Pro', 5: 'Élite' };
  const distribucion = [1, 2, 3, 4, 5].reduce((acc, n) => {
    acc[NIVEL_MAP[n]] = setters.filter(s => (s.level || 1) === n).length;
    return acc;
  }, {});

  const porModoGlobal = ['outbound', 'inbound', 'reactivacion'].map((mode) => {
    const count = todasSesiones.filter(s => s.mode === mode).length;
    return { mode, sesiones: count, pct: pct(count, todasSesiones.length) };
  });

  return {
    error,
    total_setters: setters.length,
    setters_activos: conMetricas.filter(s => s.sesiones.some(x => daysAgo(x.createdAt) <= 7)).length,
    simulaciones_total: todasSesiones.length,
    simulaciones_esta_semana: todasSesiones.filter(s => isoWeek(s.createdAt) === semanaActual).length,
    promedio_global: avg(conMetricas.map(s => s.metricas.simulador?.promedio_total || 0).filter(v => v > 0)),
    por_modo_global: porModoGlobal,
    ranking,
    listos_para_proyecto: conMetricas.filter(s => s.metricas.certificacion?.listo),
    sin_actividad_7_dias: conMetricas.filter(s => !s.sesiones.some(x => daysAgo(x.createdAt) <= 7)),
    bajo_rendimiento: conMetricas.filter(s => {
      const ultimas5 = s.sesiones.slice(0, 5);
      return ultimas5.length >= 3 && avg(ultimas5.map(sessionScore)) < 50;
    }),
    distribucion_niveles: distribucion,
    actividad_barras: actividadBarrasReal(todasSesiones),
  };
}
