import { getCohortWeekNumber } from '../utils/dailyMissions';

export const DAILY_MISSIONS = [
  // ── Semana 1 (7-11 sept) ──────────────────────────────────────────────────
  {
    day: 1,
    week: 1,
    dayKey: 'lunes',
    dayLabel: 'Lunes',
    id: 'daily_lunes_apertura_outbound',
    mode: 'outbound',
    title: 'Apertura en frío',
    objective: 'Practica el primer contacto outbound: capta atención sin sonar a spam y consigue una respuesta real del lead.',
    minSetScore: 60,
    xpReward: 50,
    tip: 'Enfócate en la Situación: ¿qué sabes de este lead antes de escribir tu primer mensaje?',
  },
  {
    day: 2,
    week: 1,
    dayKey: 'martes',
    dayLabel: 'Martes',
    id: 'daily_martes_objecion_precio',
    mode: 'inbound',
    title: 'Objeción de precio',
    objective: 'Un lead inbound pregunta por precio antes de tiempo. Practica redirigir hacia valor sin ignorar la pregunta.',
    minSetScore: 65,
    xpReward: 50,
    tip: 'La Transición correcta no es dar el precio ni evadirlo: es entender qué necesita validar antes de escucharlo.',
  },
  {
    day: 3,
    week: 1,
    dayKey: 'miercoles',
    dayLabel: 'Miércoles',
    id: 'daily_miercoles_reactivacion',
    mode: 'reactivacion',
    title: 'Reactivación de lead frío',
    objective: 'Retoma una conversación que quedó en silencio hace días sin sonar desesperado ni reiniciar el diagnóstico desde cero.',
    minSetScore: 65,
    xpReward: 55,
    tip: 'Usa la memoria de la conversación previa: retoma desde el último punto útil, no desde cero.',
  },
  {
    day: 4,
    week: 1,
    dayKey: 'jueves',
    dayLabel: 'Jueves',
    id: 'daily_jueves_cierre_agenda',
    mode: 'outbound',
    title: 'Cierre y agenda',
    objective: 'El lead ya mostró interés real. Practica el movimiento hacia agendar la llamada sin presionar ni perder el ritmo.',
    minSetScore: 70,
    xpReward: 55,
    tip: 'El microcompromiso lógico aquí es la agenda, no la venta. No saltes pasos.',
  },
  {
    day: 5,
    week: 1,
    dayKey: 'viernes',
    dayLabel: 'Viernes',
    id: 'daily_viernes_simulacro_libre',
    mode: 'inbound',
    title: 'Simulacro libre',
    objective: 'Cierra la semana con una conversación completa de punta a punta, aplicando todo el criterio S.E.T. sin guía.',
    minSetScore: 70,
    xpReward: 60,
    tip: 'Revisa tus 4 misiones de la semana antes de empezar: ¿qué patrón se repite en tus puntos débiles?',
  },

  // ── Semana 2 (14-18 sept) — Calificación y dolor ─────────────────────────
  {
    day: 1,
    week: 2,
    dayKey: 'lunes',
    dayLabel: 'Lunes',
    id: 'daily_w2_lunes_monosilabos',
    mode: 'outbound',
    title: 'Quiebre de monosílabos',
    objective: 'El lead responde con "ok", "sí" o "no sé" sin dar nada más. Practica reabrir la conversación sin sonar insistente ni hacer preguntas cerradas.',
    minSetScore: 65,
    xpReward: 55,
    tip: 'Un monosílabo no es un cierre, es una puerta a medio abrir — la Situación real está detrás de esa respuesta corta.',
  },
  {
    day: 2,
    week: 2,
    dayKey: 'martes',
    dayLabel: 'Martes',
    id: 'daily_w2_martes_objecion_info',
    mode: 'inbound',
    title: "Desarme: \"Mándame info\"",
    objective: 'El lead pide que le envíes información o un PDF antes de seguir hablando contigo. Practica redirigir hacia la conversación sin sonar evasivo ni negarte de forma seca.',
    minSetScore: 70,
    xpReward: 55,
    tip: 'Entregar info sin contexto mata la conversación — la Transición correcta es entender qué necesita saber ANTES de decidir qué compartir.',
  },
  {
    day: 3,
    week: 2,
    dayKey: 'miercoles',
    dayLabel: 'Miércoles',
    id: 'daily_w2_miercoles_urgencia_real',
    mode: 'reactivacion',
    title: 'Urgencia real vs. curiosidad',
    objective: 'Distingue si el lead realmente necesita resolver su situación ahora o solo tiene curiosidad pasiva. Profundiza el diagnóstico S.E.T. antes de avanzar.',
    minSetScore: 70,
    xpReward: 60,
    tip: 'La Emoción de fondo casi nunca se dice directamente — hay que leerla en el nivel de detalle que da el lead sobre su propio problema.',
  },
  {
    day: 4,
    week: 2,
    dayKey: 'jueves',
    dayLabel: 'Jueves',
    id: 'daily_w2_jueves_autoridad',
    mode: 'outbound',
    title: 'Cualificación de autoridad',
    objective: 'Confirma si estás hablando con quien realmente toma la decisión, sin sonar a interrogatorio ni hacer sentir al lead menospreciado.',
    minSetScore: 75,
    xpReward: 60,
    tip: 'Preguntar por la autoridad de forma directa suena a desconfianza — la Transición correcta pasa por el proceso de decisión, no por la persona.',
  },
  {
    day: 5,
    week: 2,
    dayKey: 'viernes',
    dayLabel: 'Viernes',
    id: 'daily_w2_viernes_puente_valor',
    mode: 'inbound',
    title: 'Puente de valor a la llamada',
    objective: 'Cierra la semana llevando una conversación ya calificada hacia una llamada concreta, sin sonar desesperado ni perder el control del siguiente paso.',
    minSetScore: 75,
    xpReward: 65,
    tip: 'Revisa tus 4 misiones de esta semana: monosílabos, objeción de info, urgencia real y autoridad — hoy los integras todos en un solo movimiento.',
  },
];

export const getDailyMissionByIsoWeekday = (isoWeekday, weekNumber = getCohortWeekNumber()) => {
  const exact = DAILY_MISSIONS.find((mission) => mission.day === isoWeekday && (mission.week || 1) === weekNumber);
  if (exact) return exact;
  // Semanas sin banco propio todavía (3 y 4) caen de vuelta al contenido de
  // la Semana 1 en vez de dejar al alumno sin misión — nunca debe verse un
  // hueco vacío en el selector solo porque el contenido de esa semana no se
  // ha escrito aún.
  return DAILY_MISSIONS.find((mission) => mission.day === isoWeekday && (mission.week || 1) === 1) || null;
};

export const getDailyMissionById = (missionId) =>
  DAILY_MISSIONS.find((mission) => mission.id === missionId) || null;
