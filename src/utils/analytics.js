// ─── Analytics utility — read-only, no localStorage writes ───────────────────

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

const sessionScore = (s) =>
  s.scores?.length > 0 ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length * 10) : 0;

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

const setStagesFromSession = (session) => {
  // Infer from: messages coaching.etapa_set + finalFomo + finalState
  const msgs = session.messages || [];
  const etapasVistas = new Set(
    msgs.flatMap(m => (m.coaching?.etapa_set ? [m.coaching.etapa_set] : []))
  );
  const fomo = session.finalFomo || 0;
  return {
    S: etapasVistas.has('S') || etapasVistas.has('E') || etapasVistas.has('T') || (session.scores?.length >= 2),
    E: etapasVistas.has('E') || etapasVistas.has('T') || fomo >= 40,
    T: etapasVistas.has('T') || isSuccess(session),
  };
};

// ─── Setter analytics ─────────────────────────────────────────────────────────

function calcularMetricasSimulador(sesiones) {
  if (!sesiones.length) return null;

  const scores = sesiones.map(sessionScore);
  const now = Date.now();
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

  const modos = ['outbound', 'inbound', 'reactivacion'].filter(m => porModo[m].sesiones > 0);
  const modoMasFuerte = modos.reduce((best, m) =>
    !best || porModo[m].promedio > porModo[best].promedio ? m : best, null);
  const modoMasDebil = modos.reduce((worst, m) =>
    !worst || porModo[m].promedio < porModo[worst].promedio ? m : worst, null);

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

function calcularMetricasSET(sesiones) {
  if (!sesiones.length) return null;
  const total = sesiones.length;
  const counts = sesiones.reduce((acc, s) => {
    const st = setStagesFromSession(s);
    if (st.S) acc.S++;
    if (st.E) acc.E++;
    if (st.T) acc.T++;
    return acc;
  }, { S: 0, E: 0, T: 0 });

  const porcentajes = { S: pct(counts.S, total), E: pct(counts.E, total), T: pct(counts.T, total) };
  const puntDebil = Object.entries(porcentajes).reduce(
    (min, [k, v]) => v < porcentajes[min] ? k : min, 'S'
  );
  return { ...porcentajes, punto_debil: puntDebil };
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
    .filter(l => l.createdAt && l.briefing?.generado_en)
    .map(l => (new Date(l.briefing.generado_en) - new Date(l.createdAt)) / 86400000);

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

export function calcularMetricasSetter(userId) {
  const sesiones = get(KEYS.SESSIONS).filter(s => s.userId === userId);
  const leads = get(KEYS.LEADS).filter(l => l.setter_id === userId);

  return {
    simulador: calcularMetricasSimulador(sesiones),
    leadsReales: calcularMetricasLeads(leads),
    set: calcularMetricasSET(sesiones),
    curva: calcularCurvaProgreso(sesiones),
    certificacion: evaluarCertificacion(sesiones, leads),
  };
}

// ─── Admin analytics ──────────────────────────────────────────────────────────

function actividadBarras() {
  const sesiones = get(KEYS.SESSIONS);
  const dias = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dias[key] = 0;
  }
  sesiones.forEach(s => {
    const key = s.createdAt?.slice(0, 10);
    if (key && dias[key] !== undefined) dias[key]++;
  });
  return Object.entries(dias).map(([fecha, sesiones]) => ({
    fecha: fecha.slice(5), // MM-DD
    sesiones,
  }));
}

export function calcularMetricasAdmin() {
  const todosUsuarios = get(KEYS.USERS);
  const setters = todosUsuarios.filter(u => u.rol === 'setter' || !u.rol || u.rol !== 'admin');

  const conMetricas = setters.map(s => {
    const m = calcularMetricasSetter(s.id);
    return { ...s, metricas: m };
  });

  const ranking = [...conMetricas]
    .sort((a, b) =>
      (b.metricas.simulador?.promedio_total || 0) -
      (a.metricas.simulador?.promedio_total || 0)
    );

  const sinActividad7Dias = setters.filter(s => {
    const sesiones = get(KEYS.SESSIONS).filter(x => x.userId === s.id);
    return !sesiones.some(x => daysAgo(x.createdAt) <= 7);
  });

  const bajRendimiento = setters.filter(s => {
    const ultimas5 = get(KEYS.SESSIONS)
      .filter(x => x.userId === s.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);
    return ultimas5.length >= 3 && avg(ultimas5.map(sessionScore)) < 50;
  });

  const NIVEL_MAP = { 1: 'Novato', 2: 'Aprendiz', 3: 'Practicante', 4: 'Pro', 5: 'Élite' };
  const distribucion = [1, 2, 3, 4, 5].reduce((acc, n) => {
    acc[NIVEL_MAP[n]] = setters.filter(s => (s.level || 1) === n).length;
    return acc;
  }, {});

  const todasSesiones = get(KEYS.SESSIONS);
  const todosLeads = get(KEYS.LEADS);
  const semanaActual = isoWeek(new Date().toISOString());

  return {
    total_setters: setters.length,
    setters_activos: setters.filter(s =>
      get(KEYS.SESSIONS).some(x => x.userId === s.id && daysAgo(x.createdAt) <= 7)
    ).length,
    simulaciones_total: todasSesiones.length,
    simulaciones_esta_semana: todasSesiones.filter(s => isoWeek(s.createdAt) === semanaActual).length,
    leads_agendados_total: todosLeads.filter(l => ['agendado','cerrado_ganado'].includes(l.estado)).length,
    leads_total: todosLeads.length,
    promedio_global: avg(setters.map(s =>
      calcularMetricasSetter(s.id).simulador?.promedio_total || 0
    ).filter(v => v > 0)),
    ranking,
    listos_para_proyecto: conMetricas.filter(s => s.metricas.certificacion?.listo),
    sin_actividad_7_dias: sinActividad7Dias,
    bajo_rendimiento: bajRendimiento,
    distribucion_niveles: distribucion,
    actividad_barras: actividadBarras(),
  };
}
