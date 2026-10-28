// Control de estados conversacionales de Inbound — Primer contacto.
//
// En la segunda ronda con Haiku real el prospecto aceptó la cita en 12 de 12
// conversaciones: ignoró el límite de evasivas, aceptó sin encaje y aceptó
// una cita forzada sin descubrimiento. Haiku no lleva bien la cuenta ni
// sostiene las reglas en chats largos, así que las decisiones que deben ser
// coherentes las toma el CÓDIGO y la IA solo pone las palabras:
//
//   1. planTurn (antes de llamar al prospecto): con señales verificables en el
//      texto (¿el prospecto preguntó el precio?, ¿el alumno lo respondió?,
//      ¿propuso una cita?, ¿mandó un enlace?) cuenta evasivas e insistencias,
//      decide si este turno termina en despedida y si el prospecto PUEDE
//      aceptar la cita. El prospecto recibe esa situación en su prompt.
//   2. resolveTurn (después): valida la respuesta contra el plan y calcula el
//      estado y el desenlace. Si la IA aceptó una cita que el plan no permitía,
//      el turno se repite una vez; si vuelve a pasar, se usa una respuesta de
//      respaldo (nunca se registra una cita que el plan no permite).
//
// No usa la IA ni la red: todo es determinista y se prueba en
// primerContactoControl.test.js. Las otras tres modalidades no lo usan.
import { RESISTANCE_RULES, isPriceDocumented } from './primerContacto.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9ñ$%.,¿? ]/g, ' ').replace(/\s+/g, ' ').trim();

// ─── Señales verificables en el texto ──────────────────────────────────────
// El prospecto pregunta el precio. «Me cuesta comprometerme» no cuenta.
const PRICE_QUESTION = /\bprecio|\bcosto|\bcuanto (cuesta|sale|vale|es|cobran|cobras|seria|saldria|hay que invertir|hay que pagar|tengo que pagar|pago|me costaria|costaria)|\bcuanto ?\?|\bmas o menos cuanto|\bque valor tiene|\bes caro|^\$ ?\?$|(?<!(me|te|le|nos|les) )\bcuesta\b|\binversion\b|\btarifa|\bvalor del|\brango\b/;
export const asksPrice = (prospectText) => {
  const t = norm(prospectText);
  return t === 'precio' || PRICE_QUESTION.test(t);
};

// Montos escritos de cualquier forma habitual: «1.800», «1,800», «1800»,
// «1.8k», «1,8 mil», «2 mil», «mil ochocientos», «seiscientos cincuenta».
const UNITS = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const HUNDREDS = { cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900 };
const wordAmounts = (t) => {
  const out = [];
  let current = 0; let total = 0; let any = false;
  const flush = () => { if (any) out.push(total + current); current = 0; total = 0; any = false; };
  for (const w of t.split(/[\s,.;:!?¿¡()]+/)) {
    if (w in UNITS) { current += UNITS[w]; any = true; } else if (w in HUNDREDS) { current += HUNDREDS[w]; any = true; } else if (w === 'mil') { total += (current || 1) * 1000; current = 0; any = true; } else if (w === 'y' && any) { /* «cincuenta y cinco» */ } else flush();
  }
  flush();
  return out;
};
const toNumber = (raw) => {
  const s = raw.replace(/\s/g, '');
  // Separador de miles (1.800 / 1,800) frente a decimal (1,8 / 1.8).
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
  return Number(s.replace(',', '.'));
};
export const amountsIn = (text) => {
  const t = norm(text);
  const out = [];
  const NUMERIC = /(\d+(?:[.,]\d+)*)\s*(k\b|mil\b)?/g;
  for (const m of t.matchAll(NUMERIC)) {
    const n = toNumber(m[1]);
    if (Number.isFinite(n)) out.push(m[2] ? n * 1000 : n);
  }
  // Las palabras se leen sin los montos en cifras («1,8 mil» ya se contó).
  return [...out, ...wordAmounts(t.replace(NUMERIC, ' '))];
};

// El alumno responde la pregunta de precio.
// - Precio documentado: cuenta como respuesta si da la cifra o una
//   referencia honesta cercana (±25 % de un monto documentado: «ronda los 2
//   mil», «menos de 2.000»), escrita en números o en palabras. «Lo vemos más
//   adelante», «es accesible» o «los rangos que mencionas están en la zona»
//   son evasivas (ronda 2: E02).
// - Precio NO documentado: decir con honestidad que no hay un número y que se
//   verá en la llamada es lo correcto (no es una evasiva). Solo es evasiva no
//   referirse al precio en absoluto.
const PRICE_TOPIC = /precio|costo|cuesta|inversion|valor|numero|cifra|rango|cuanto|monto|pago|llamada|equipo|depende|documentad/;
export const answersPrice = (setterText, project) => {
  const t = norm(setterText);
  if (isPriceDocumented(project)) {
    const documented = amountsIn(project.price).filter((n) => n >= 10);
    return amountsIn(setterText).some((n) => documented.some((d) => n >= d * 0.75 && n <= d * 1.25));
  }
  return PRICE_TOPIC.test(t);
};

// El alumno propone una cita: una invitación explícita, o un día u horario
// en una pregunta. Mencionar la llamada («eso lo detalla el equipo en la
// llamada») no es proponerla.
const CALL_WORD = /llamada|videollamada|reunion|zoom|meet|charla|sesion|hablar por telefono|\b1[05] ?min|\b20 ?min|\b30 ?min/;
const INVITE = /te parece|te gustaria|te interesaria|podemos|podriamos|quieres|te animas|te va bien|te viene|te queda|te sirve|coordinamos|hacemos|tenemos|te late/;
const DAY_OR_TIME = /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo|manana a las|hoy a las|que dia|que horario|a que hora)\b|\b\d{1,2} ?(am|pm|hs)\b|\b\d{1,2}:\d{2}\b/;
// «agendar», «agendamos», «te agendo»… pero no «tu agenda».
const SCHEDULE_VERB = /\bagend(ar\w*|amos|emos|o|ado|ada)\b/;
export const proposesCall = (setterText) => {
  const t = norm(setterText);
  if (SCHEDULE_VERB.test(t)) return true;
  if (CALL_WORD.test(t) && INVITE.test(t)) return true;
  return DAY_OR_TIME.test(t) && t.includes('?');
};

// Pitch con enlace o invitación a comprar por chat.
export const pitchesLink = (setterText) => /https?:\/\/|www\.|\[(enlace|link)\]/i.test(String(setterText || ''))
  || /\binscribete|\binscribirte|\bcompra aqui|\bpaga aqui|\blink de pago|\benlace de pago/.test(norm(setterText));

// El prospecto pide avanzar él mismo («¿cómo hago para empezar?»): proponerle
// la llamada responde a su pedido y no cuenta como presión.
export const asksToAdvance = (prospectText) => /como (hago|empiezo|sigo|me inscribo|avanzo)|para empezar|quiero (empezar|agendar|avanzar|inscribirme)|agendamos|agendemos|cuando podemos hablar|siguiente paso/.test(norm(prospectText));

// ─── Estado ────────────────────────────────────────────────────────────────
// Categorías del perfil privado que el prospecto puede revelar (las informa
// él mismo en "revela", en el mismo mensaje donde las cuenta).
export const REVEAL_CATEGORIES = Object.freeze(['situacion', 'motivo', 'no_encaje']);
// Condición pedagógica para aceptar una cita: el alumno conoce la situación
// actual del prospecto y el motivo por el que escribió hoy (sin un número
// fijo de preguntas: puede saberlo en un mensaje si el prospecto lo contó).
export const DISCOVERY_REQUIRED = Object.freeze(['situacion', 'motivo']);

// Desenlaces y su representación con los estados que ya existen (no se crea
// ningún valor nuevo de final_state):
//   cita_aceptada     → pidio_llamada  (cierra; éxito, como siempre)
//   cita_condicionada → interesado     (sigue abierta: «sí, pero antes…»)
//   abierta           → abierto | interesado | resistente
//   despedida         → cerrado        (cierra)
//   no_califica       → no_califica    (cierra; resultado legítimo)
export const OUTCOMES = Object.freeze(['cita_aceptada', 'cita_condicionada', 'abierta', 'despedida', 'no_califica']);
export const OUTCOME_LABELS = Object.freeze({
  cita_aceptada: 'Cita aceptada',
  cita_condicionada: 'Cita condicionada',
  abierta: 'Conversación abierta',
  despedida: 'El prospecto se despidió',
  no_califica: 'No califica',
});

export const createControlState = (profile = {}) => {
  const rules = RESISTANCE_RULES[profile.resistencia] || RESISTANCE_RULES.media;
  return {
    turno: 0,
    limiteEvasivas: rules.evasivas,
    limitePaciencia: rules.paciencia,
    evasivas: 0,            // evasivas de precio desde la última respuesta honesta
    presiones: 0,           // citas propuestas sin descubrimiento + pitch con enlace
    revelado: [],           // categorías ya contadas por el prospecto
    setterTrasNoEncaje: [], // lo que dijo el alumno después de conocer el motivo del no encaje
    citaPendiente: false,   // hubo un «sí, pero antes…» que no se resolvió
    cambioEncaje: null,     // frase del alumno que justificó reconsiderar el encaje
    desenlace: 'abierta',
  };
};

const missingDiscovery = (state) => DISCOVERY_REQUIRED.filter((k) => !state.revelado.includes(k));

// ─── Antes de la llamada al prospecto ──────────────────────────────────────
export const planTurn = (state, { project, profile = {}, lastProspectText, setterText }) => {
  const priceAsked = asksPrice(lastProspectText);
  const priceAnswered = answersPrice(setterText, project);
  const evasion = priceAsked && !priceAnswered;
  const evasivas = priceAnswered ? 0 : state.evasivas + (evasion ? 1 : 0);
  const faltaDescubrimiento = missingDiscovery(state);
  const propone = proposesCall(setterText);
  const pitch = pitchesLink(setterText);
  const presion = pitch || (propone && faltaDescubrimiento.length > 0 && !asksToAdvance(lastProspectText));
  const presiones = state.presiones + (presion ? 1 : 0);

  let despedida = null;
  if (evasivas >= state.limiteEvasivas) despedida = 'evasivas';
  else if (presiones >= state.limitePaciencia) despedida = 'presion';

  const encaje = profile.encaje || 'medio';
  const definitiva = encaje === 'bajo' && profile.incompatibilidad !== 'superable';
  const bloqueos = [];
  if (despedida) bloqueos.push(`despedida_${despedida}`);
  if (faltaDescubrimiento.length) bloqueos.push('sin_descubrimiento');
  if (evasivas > 0) bloqueos.push('precio_pendiente');
  if (definitiva) bloqueos.push('encaje_definitivo');
  // Encaje bajo superable: puede aceptar solo si el alumno dijo algo nuevo que
  // responde al motivo (se verifica después con la frase que cite el prospecto).
  const requiereEvidencia = encaje === 'bajo' && !definitiva;

  return {
    turno: state.turno + 1,
    priceAsked, priceAnswered, evasion, evasivas,
    propone, pitch, presion, presiones,
    despedida,
    faltaDescubrimiento,
    bloqueos,
    puedeAceptar: bloqueos.length === 0,
    requiereEvidencia,
    limiteEvasivas: state.limiteEvasivas,
    limitePaciencia: state.limitePaciencia,
    setterText,
  };
};

// ─── Después de la llamada al prospecto ────────────────────────────────────
const ACCEPTANCE = ['si', 'condicionada', 'no'];
const STATES = ['abierto', 'interesado', 'resistente', 'pidio_llamada', 'no_califica', 'cerrado'];
const words = (s) => norm(s).replace(/[¿?.,$%]/g, ' ').split(' ').filter((w) => w.length >= 3 || /\d/.test(w));

// La frase que el prospecto dice que lo hizo cambiar de opinión (al menos dos
// palabras con contenido) debe estar, en un 70 % de sus palabras, en lo que
// el alumno dijo DESPUÉS de conocer el motivo del no encaje.
export const verifyFitEvidence = (quote, setterTexts) => {
  const q = words(quote);
  if (q.length < 2) return false;
  return (setterTexts || []).some((text) => {
    const w = new Set(words(text));
    return q.filter((x) => w.has(x)).length / q.length >= 0.7;
  });
};

const cleanReveals = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : [])
  .map((x) => norm(x).replace(/ /g, '_')).filter((x) => REVEAL_CATEGORIES.includes(x));

// Revisa la respuesta del prospecto contra el plan. Devuelve los problemas
// que justifican repetir el turno (aceptación no permitida) y los demás.
export const checkProspectReply = (raw, plan, state, profile = {}) => {
  const accept = ACCEPTANCE.includes(raw?.acepta_cita) ? raw.acepta_cita : 'no';
  const issues = [];
  if (accept === 'si' && !plan.despedida) {
    if (!plan.puedeAceptar) issues.push(`aceptacion_no_permitida:${plan.bloqueos.join('+')}`);
    else if (plan.requiereEvidencia) {
      const pool = [...state.setterTrasNoEncaje, ...(state.revelado.includes('no_encaje') ? [plan.setterText] : [])];
      if (!state.revelado.includes('no_encaje') || !verifyFitEvidence(raw?.cambio_encaje, pool)) issues.push('aceptacion_no_permitida:encaje_sin_informacion_nueva');
    }
  }
  if (plan.despedida && accept === 'si') issues.push(`aceptacion_no_permitida:despedida_${plan.despedida}`);
  const maxWords = (RESISTANCE_RULES[profile.resistencia] || RESISTANCE_RULES.media).maxPalabras;
  const count = String(raw?.respuesta_prospecto || '').split(/\s+/).filter(Boolean).length;
  if (count > Math.ceil(maxWords * 1.5)) issues.push(`largo:${count}`);
  return issues;
};

// Respuestas de respaldo cuando, tras el reintento, la IA sigue aceptando una
// cita que el plan no permite. Son neutras y cortas; quedan registradas.
const reply = (respuesta_prospecto, acepta_cita, estado_lead) => Object.freeze({ respuesta_prospecto, acepta_cita, estado_lead, revela: [] });
export const FALLBACK_REPLIES = Object.freeze({
  despedida_evasivas: reply('Mira, sin un precio claro prefiero no seguir. Gracias igual.', 'no', 'cerrado'),
  despedida_presion: reply('Prefiero dejarlo acá por ahora, gracias.', 'no', 'cerrado'),
  encaje_definitivo: reply('Te agradezco, pero siendo honesto, ahora no es para mí.', 'no', 'resistente'),
  encaje_sin_informacion_nueva: reply('Gracias, pero sigo sin ver que sea para mí.', 'no', 'resistente'),
  precio_pendiente: reply('Antes de agendar necesito saber el precio.', 'condicionada', 'interesado'),
  sin_descubrimiento: reply('Antes de agendar, quiero entender bien de qué se trata.', 'no', 'abierto'),
});
export const fallbackFor = (plan, issues = []) => {
  const key = plan.despedida ? `despedida_${plan.despedida}`
    : issues.some((i) => i.includes('encaje_sin_informacion_nueva')) ? 'encaje_sin_informacion_nueva'
    : ['encaje_definitivo', 'precio_pendiente', 'sin_descubrimiento'].find((b) => plan.bloqueos.includes(b)) || 'sin_descubrimiento';
  return { key, reply: FALLBACK_REPLIES[key] };
};

// Calcula el estado del lead, el desenlace y el estado de control siguiente.
// `raw` ya es la respuesta definitiva (tras reintento o respaldo).
export const resolveTurn = (state, plan, raw, profile = {}) => {
  const issues = [];
  let accept = ACCEPTANCE.includes(raw?.acepta_cita) ? raw.acepta_cita : 'no';
  let modelState = STATES.includes(raw?.estado_lead) ? raw.estado_lead : 'abierto';
  const reveals = cleanReveals(raw?.revela);
  const revelado = [...new Set([...state.revelado, ...reveals])];
  const encaje = profile.encaje || 'medio';

  let estado;
  let cambioEncaje = state.cambioEncaje;
  if (plan.despedida) {
    // La despedida la decide el código: el texto lo escribió la IA con esa instrucción.
    accept = 'no';
    estado = 'cerrado';
  } else if (accept === 'si') {
    estado = 'pidio_llamada';
    if (plan.requiereEvidencia) cambioEncaje = String(raw?.cambio_encaje || '').trim() || cambioEncaje;
  } else if (modelState === 'no_califica') {
    // No califica solo si la oferta realmente no le conviene (encaje bajo o
    // medio) y el motivo ya salió en la conversación.
    const allowed = encaje !== 'alto' && revelado.includes('no_encaje');
    if (!allowed) issues.push('no_califica_no_permitido');
    estado = allowed ? 'no_califica' : 'resistente';
  } else {
    if (modelState === 'cerrado' && !plan.evasion && !plan.presion && state.evasivas === 0 && state.presiones === 0) issues.push('cierre_espontaneo');
    estado = modelState === 'pidio_llamada' ? 'interesado' : modelState;
  }

  let citaPendiente = state.citaPendiente;
  if (accept === 'condicionada') citaPendiente = true;
  else if (accept === 'si' || (accept === 'no' && plan.propone) || estado === 'cerrado' || estado === 'no_califica') citaPendiente = false;

  const desenlace = estado === 'pidio_llamada' ? 'cita_aceptada'
    : estado === 'cerrado' ? 'despedida'
    : estado === 'no_califica' ? 'no_califica'
    : citaPendiente ? 'cita_condicionada'
    : 'abierta';

  const knewNoFit = state.revelado.includes('no_encaje');
  const next = {
    ...state,
    turno: plan.turno,
    evasivas: plan.evasivas,
    presiones: plan.presiones,
    revelado,
    setterTrasNoEncaje: knewNoFit ? [...state.setterTrasNoEncaje, plan.setterText].slice(-6) : state.setterTrasNoEncaje,
    citaPendiente,
    cambioEncaje,
    desenlace,
  };
  return { estado_lead: estado, acepta_cita: accept, desenlace, issues, control: next };
};
