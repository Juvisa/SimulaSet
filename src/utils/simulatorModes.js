// Fuente única de las modalidades del simulador de práctica libre. Antes cada
// pantalla (selector, insignia, analítica, panel de admin, SET Passport) tenía
// su propia lista; al añadir una modalidad había que acordarse de todas, y una
// olvidada hacía que las sesiones nuevas contaran en los totales pero no en
// los desgloses, o que la insignia dijera "Outbound".
//
// MODE_IDS conserva el orden histórico (outbound, inbound, reactivación) y
// agrega las modalidades nuevas al FINAL: analítica y Passport recorren este
// orden, así que los resultados de historiales sin la modalidad nueva no
// cambian (empates incluidos). El selector usa su propio orden.
//
// El id 'inbound' sigue siendo Inbound — Call Confirmer: las sesiones
// históricas guardadas con ese valor conservan su significado.

// Estados que cierran la simulación en las modalidades históricas (lista
// global de Simulator.jsx, sin cambios).
const LEGACY_TERMINAL_STATES = Object.freeze(['pidio_llamada', 'cerrado', 'confirmado_con_entusiasmo', 'quiere_reagendar', 'cancelo']);

export const SIMULATOR_MODES = Object.freeze([
  Object.freeze({
    id: 'outbound',
    label: 'Outbound',
    name: 'Outbound',
    emoji: '🔵',
    color: '#2563EB',
    desc: 'El lead no tiene intención declarada. Contacto en frío o tibio.',
    objective: 'Generar la conversación desde cero y conseguir que el prospecto pida la cita.',
    channels: Object.freeze(['Instagram DM', 'WhatsApp', 'Comentarios']),
    successStates: Object.freeze(['pidio_llamada']),
    successLabel: 'Lead pidió la llamada',
    terminalStates: LEGACY_TERMINAL_STATES,
    probability: Object.freeze({ key: 'probabilidad_asistencia', label: 'Probabilidad asistencia' }),
  }),
  Object.freeze({
    id: 'inbound',
    label: 'Inbound',
    name: 'Inbound — Call Confirmer',
    emoji: '🟢',
    color: '#1D9E75',
    desc: 'El lead ya agendó una llamada. Llega con curiosidad, no con convicción.',
    objective: 'Garantizar que el lead llegue comprometido a la llamada. Eliminar no-shows.',
    channels: Object.freeze(['WhatsApp', 'DM', 'Email']),
    successStates: Object.freeze(['confirmado_con_entusiasmo']),
    successLabel: 'Confirmó con entusiasmo',
    terminalStates: LEGACY_TERMINAL_STATES,
    probability: Object.freeze({ key: 'probabilidad_asistencia', label: 'Probabilidad asistencia' }),
  }),
  Object.freeze({
    id: 'reactivacion',
    label: 'Reactivación',
    name: 'Reactivación',
    emoji: '🔴',
    color: '#DC2626',
    desc: 'El lead canceló, no asistió o se enfrió después de una conversación previa.',
    objective: 'Reabrir la conversación y conseguir que el lead quiera reagendar.',
    channels: Object.freeze(['WhatsApp', 'DM']),
    successStates: Object.freeze(['quiere_reagendar']),
    successLabel: 'Quiso reagendar',
    terminalStates: LEGACY_TERMINAL_STATES,
    probability: Object.freeze({ key: 'probabilidad_reagendamiento', label: 'Probabilidad reagendamiento' }),
  }),
  Object.freeze({
    id: 'primer_contacto',
    label: 'Primer contacto',
    name: 'Inbound — Primer contacto',
    emoji: '💬',
    color: '#0E7490',
    desc: 'El prospecto vio un anuncio, una publicación o un contenido y escribe primero: «Info», «Precio»…',
    objective: 'Descubrir si hay una oportunidad real y, cuando corresponda, llevarla a una cita. No vender por chat.',
    channels: Object.freeze(['WhatsApp', 'Instagram DM', 'Facebook Messenger']),
    // no_califica es un cierre legítimo (falta de encaje bien identificada),
    // no un éxito comercial ni un abandono: cierra la sesión, pero no cuenta
    // como "lead convertido".
    successStates: Object.freeze(['pidio_llamada']),
    successLabel: 'Lead aceptó la cita',
    terminalStates: Object.freeze(['pidio_llamada', 'no_califica', 'cerrado']),
    probability: Object.freeze({ key: 'probabilidad_cita', label: 'Probabilidad de cita' }),
    temperatureLabels: Object.freeze({
      frio: '❄️ Frío — vio un anuncio, no conoce al experto',
      tibio: '🌤️ Tibio — sigue al experto, vio su contenido',
      caliente: '🔥 Caliente — interés declarado',
    }),
  }),
]);

export const MODE_IDS = Object.freeze(SIMULATOR_MODES.map((m) => m.id));
// Las tres modalidades que existían antes de Primer contacto.
export const HISTORICAL_MODE_IDS = Object.freeze(['outbound', 'inbound', 'reactivacion']);
export const SELECTOR_MODE_IDS = Object.freeze(['primer_contacto', 'outbound', 'inbound', 'reactivacion']);
export const DEFAULT_SELECTOR_MODE = SELECTOR_MODE_IDS[0];

export const DEFAULT_TEMPERATURE_LABELS = Object.freeze({
  frio: '❄️ Frío — no conoce al experto',
  tibio: '🌤️ Tibio — siguió al experto',
  caliente: '🔥 Caliente — interés declarado',
});

export const getMode = (id) => SIMULATOR_MODES.find((m) => m.id === id) || null;
export const modeLabel = (id) => getMode(id)?.label || id;
export const modeColor = (id, fallback = '#E0605E') => getMode(id)?.color || fallback;
export const selectorModes = () => SELECTOR_MODE_IDS.map(getMode);
export const temperatureLabels = (id) => getMode(id)?.temperatureLabels || DEFAULT_TEMPERATURE_LABELS;

export const SUCCESS_STATES = Object.freeze(Object.fromEntries(SIMULATOR_MODES.map((m) => [m.id, m.successStates])));

// Un modo desconocido (o una sesión antigua sin modo) conserva la lista
// global histórica.
export const isTerminalState = (mode, state) => (getMode(mode)?.terminalStates || LEGACY_TERMINAL_STATES).includes(state);
