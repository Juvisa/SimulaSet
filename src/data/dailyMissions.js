export const DAILY_MISSIONS = [
  {
    day: 1,
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
];

export const getDailyMissionByIsoWeekday = (isoWeekday) =>
  DAILY_MISSIONS.find((mission) => mission.day === isoWeekday) || null;

export const getDailyMissionById = (missionId) =>
  DAILY_MISSIONS.find((mission) => mission.id === missionId) || null;
