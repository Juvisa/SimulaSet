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
// Ronda 3 (Haiku real) mostró que el prospecto declaraba haber contado cosas
// que no contó: desde entonces el descubrimiento para aceptar una cita se
// CONFIRMA con citas textuales de sus mensajes, que extrae el coaching (otra
// llamada, que solo ve la conversación visible) y que el código comprueba.
//
// No usa la IA ni la red: todo es determinista y se prueba en
// primerContactoControl.test.js. Las otras tres modalidades no lo usan.
import { RESISTANCE_RULES, documentedOfferText, findUndocumentedClaims, isPriceDocumented } from './primerContacto.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9ñ$%.,¿? ]/g, ' ').replace(/\s+/g, ' ').trim();
// Oraciones, sin cortar cifras como «1.800».
const sentencesOf = (s) => String(s || '').split(/(?<=[!?¿\n])|(?<=\.)\s+/).map((x) => x.trim()).filter(Boolean);

// ─── Pregunta de precio ────────────────────────────────────────────────────
// Pregunta real por el precio, no una referencia al precio dentro de otra
// pregunta o una afirmación (ronda 3: «¿Qué incluye por ese precio?» y «El
// precio es considerable para mí» se contaban como preguntas).
const PRICE_NOUN = '(precio|precios|costo|costos|valor|inversion|tarifa|numero|cifra|rango|idea|monto)';
const NOT_PRICE_AFTER_CUANTO = /^\s*(tiempo|horas?|dias?|semanas?|meses|dura|demora|pacientes|clientes|gente|personas|me va a quitar)\b/;
const COST_VERB = /^(\s+\S+){0,2}?\s+(cuesta|cuestan|sale|salen|vale|es|son|cobra\w*|cost\w*|pag\w*|invert\w*|seria|saldria)\b/;
const PRICE_REQUEST = new RegExp(`\\b(cual es|que|dime|dame|decime|pasame|pasas|mandame|me dices|me digas|me des|me das|me has dicho|me dijiste|dicho|necesito saber|quiero saber|saber|tienes|hay|me podrias decir)\\s+(el |la |los |las |un |una |algun |alguna |mas o menos )?${PRICE_NOUN}\\b`);
export const asksPrice = (prospectText) => {
  const t = norm(prospectText);
  if (!t) return false;
  // Pedido corto: «Precio», «¿Precio?», «Info y precio», «$?».
  if (t.split(' ').length <= 4 && (/\b(precio|precios|costo|costos|tarifa)\b/.test(t) || /^\$ ?\??$/.test(t))) return true;
  for (const m of t.matchAll(/\bcuanto\b/g)) {
    const rest = t.slice(m.index + 'cuanto'.length);
    if (NOT_PRICE_AFTER_CUANTO.test(rest)) continue;
    if (/^\s*\?/.test(rest) || COST_VERB.test(rest)) return true;
  }
  if (PRICE_REQUEST.test(t)) return true;
  if (/\b(cientos|miles) o (cientos|miles)\b/.test(t)) return true;
  return /\bes caro\b/.test(t) && t.includes('?');
};

// ─── Montos ────────────────────────────────────────────────────────────────
// Montos escritos de cualquier forma habitual: «1.800», «1,800», «1800»,
// «1.8k», «1,8 mil», «2 mil», «mil ochocientos», «seiscientos cincuenta».
const UNITS = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
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
// Solo cuentan los montos de oraciones que hablan de dinero o del precio
// («¿Facturas 1500 al mes?» no es una respuesta de precio).
const PRICE_CONTEXT = /\$|\busd\b|dolar|pesos|soles|euros|precio|cuesta|cuestan|\bsale\b|\bvale\b|valor|inversion|cuota|pago|contado|costo|monto|\bson\b|ronda|aprox/;
const MONEY_MIN = 10;
export const priceAmountsIn = (text) => sentencesOf(text)
  .filter((s) => PRICE_CONTEXT.test(norm(s)))
  .flatMap((s) => amountsIn(s).map((n) => ({ n, approx: APPROX.test(norm(s)) })))
  .filter(({ n }) => n >= MONEY_MIN);
const APPROX = /\b(ronda|rondan|aprox\w*|alrededor|cerca de|unos|unas|menos de|poco menos|casi|mas o menos|del orden)\b/;

// ─── Respuesta de precio y exactitud (por separado) ────────────────────────
// respondio: el alumno se hizo cargo de la pregunta (no es una evasiva).
// exactitud: si lo que afirmó coincide con lo documentado. Una cifra
// incorrecta NO es una evasiva, pero tampoco una respuesta correcta: se
// marca para el coaching.
//   exacta      ±2 % de un monto documentado («1.800», «mil ochocientos», «1.8k»)
//   aproximada  ±15 % y con una marca de aproximación («ronda los 2 mil»,
//               «menos de 2.000»). Antes se aceptaba ±25 % sin marca: «1.500»
//               pasaba por correcto.
//   incorrecta  cualquier otro monto de precio (incluye «desde 1.500»)
//   inventada   el proyecto no documenta precio y el alumno dio una cifra
//   sin_cifra   precio documentado y el alumno no dio ningún monto (evasiva)
//   honesta     precio no documentado y respuesta honesta sin cifra
//   evasiva     precio no documentado y no se hizo cargo
// Sin precio documentado, la primera vez basta con remitir con honestidad a
// la llamada; si el prospecto insiste (segunda pregunta seguida), hace falta
// decir explícitamente que no hay un número (ronda 3, R12: «es una inversión
// accesible… depende del plan» no responde a «dame una idea»).
const PRICE_TOPIC = /precio|costo|cuesta|inversion|valor|numero|cifra|rango|cuanto|monto|pago|llamada|equipo|depende|documentad/;
const HONEST_NO_NUMBER = /\bno (tengo|hay|tenemos|manejo|puedo|te puedo|se|sabria)\b|\bno (esta|viene) (definido|documentado|fijo|publicado)|\bsin un (numero|precio)\b|\btodavia no (hay|tengo)\b|\bno lo tengo\b/;
const DEFERS = /llamada|equipo|depende|defin|detall|personaliz/;
// Las cifras que el alumno repite de la conversación («gastaste 2.500 USD con
// la agencia») no son afirmaciones sobre el precio, salvo que coincidan con
// el precio documentado.
const near = (a, b, tol) => Math.abs(a - b) / b <= tol;
export const classifyPriceAnswer = (setterText, project, { insistencia = 1, conversationText = '' } = {}) => {
  const t = norm(setterText);
  const documented = isPriceDocumented(project) ? amountsIn(project.price).filter((n) => n >= MONEY_MIN) : [];
  const echoed = amountsIn(conversationText).filter((n) => n >= MONEY_MIN);
  // Un monto que coincide con el precio documentado cuenta aunque la oración
  // no hable de dinero («650 al mes durante 3 meses»); los demás, solo en
  // oraciones de dinero («¿Facturas 1500 al mes?» no es una respuesta).
  const inContext = priceAmountsIn(setterText);
  const anywhere = sentencesOf(setterText).flatMap((s) => amountsIn(s)
    .filter((n) => n >= MONEY_MIN && documented.some((d) => near(n, d, 0.15)))
    .map((n) => ({ n, approx: APPROX.test(norm(s)) })));
  const amounts = [...inContext, ...anywhere.filter((a) => !inContext.some((b) => b.n === a.n))]
    .filter(({ n }) => documented.some((d) => near(n, d, 0.15)) || !echoed.some((e) => near(n, e, 0.02)));
  if (isPriceDocumented(project)) {
    if (!amounts.length) return { respondio: false, exactitud: 'sin_cifra', cifras: [] };
    const rate = ({ n, approx }) => {
      if (documented.some((d) => Math.abs(n - d) / d <= 0.02)) return 'exacta';
      if (approx && documented.some((d) => Math.abs(n - d) / d <= 0.15)) return 'aproximada';
      return 'incorrecta';
    };
    const rates = amounts.map(rate);
    const exactitud = rates.includes('incorrecta') ? 'incorrecta' : rates.includes('aproximada') ? 'aproximada' : 'exacta';
    return { respondio: true, exactitud, cifras: amounts.map(({ n }) => n) };
  }
  if (amounts.length) return { respondio: true, exactitud: 'inventada', cifras: amounts.map(({ n }) => n) };
  const honest = PRICE_TOPIC.test(t) && (HONEST_NO_NUMBER.test(t) || (insistencia < 2 && DEFERS.test(t)));
  return { respondio: honest, exactitud: honest ? 'honesta' : 'evasiva', cifras: [] };
};
export const answersPrice = (setterText, project, options) => classifyPriceAnswer(setterText, project, options).respondio;

// ─── Otras señales ─────────────────────────────────────────────────────────
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

// ─── Evidencia textual ─────────────────────────────────────────────────────
const STOP = new Set(('para pero esto esta este como mucho muy todo toda todos tiene tienen puede pueden hace hacer porque cuando donde sobre entre desde hasta tambien solo '
  + 'llamada programa equipo dijo dijiste cambio opinion ahora hicieron hizo bien mejor cosa cosas creo verdad bueno entonces asi algo nada').split(' '));
const stem = (w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w);
const contentWords = (s) => norm(s).replace(/(\d)[.,](\d{3})\b/g, '$1$2').replace(/[¿?.,$%]/g, ' ').split(' ')
  .filter((w) => (w.length >= 4 || /^\d{2,}$/.test(w)) && !STOP.has(w)).map(stem);

// Una cita textual de un mensaje: al menos 3 palabras con contenido, y el
// 80 % de ellas en UN mismo mensaje (no se aceptan resúmenes inventados).
export const quoteInMessages = (quote, messages) => {
  const q = contentWords(quote);
  if (q.length < 3) return false;
  return (messages || []).some((m) => {
    const w = new Set(contentWords(m));
    return q.filter((x) => w.has(x)).length / q.length >= 0.8;
  });
};

// ─── Estado ────────────────────────────────────────────────────────────────
// Categorías del perfil privado que el prospecto puede revelar. Él mismo las
// informa en "revela" (sirven solo como PISTA para su instrucción); para
// aceptar una cita cuenta lo CONFIRMADO con citas de sus mensajes.
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
    evasivas: 0,            // evasivas de precio desde la última respuesta
    preguntasPrecio: 0,     // preguntas de precio seguidas del prospecto
    presiones: 0,           // citas propuestas sin descubrimiento + pitch con enlace
    revelado: [],           // lo que el prospecto DICE haber contado (pista)
    confirmado: [],         // lo confirmado con citas de sus mensajes
    evidencias: {},         // categoría → cita textual del prospecto
    setterTrasNoEncaje: [], // lo que dijo el alumno después de conocer el motivo del no encaje
    citaPendiente: false,   // hubo un «sí, pero antes…» que no se resolvió
    cambioEncaje: null,     // explicación verificada del cambio de encaje
    desenlace: 'abierta',
  };
};

const known = (state) => [...new Set([...state.revelado, ...(state.confirmado || [])])];
const missing = (list) => DISCOVERY_REQUIRED.filter((k) => !list.includes(k));

// Descubrimiento que propone el coaching: { situacion: "cita", motivo: "cita" }.
// Solo se confirma lo que aparece en los mensajes del prospecto.
export const verifyDiscovery = (proposed, prospectMessages) => {
  const out = {};
  for (const k of DISCOVERY_REQUIRED) {
    const quote = typeof proposed?.[k] === 'string' ? proposed[k].trim() : '';
    if (quote && quoteInMessages(quote, prospectMessages)) out[k] = quote;
  }
  return out;
};
export const applyDiscovery = (state, verified) => {
  if (!state || !verified) return state;
  const add = Object.keys(verified).filter((k) => DISCOVERY_REQUIRED.includes(k));
  if (!add.length) return state;
  return {
    ...state,
    confirmado: [...new Set([...(state.confirmado || []), ...add])],
    evidencias: { ...add.reduce((a, k) => ({ ...a, [k]: verified[k] }), {}), ...(state.evidencias || {}) },
  };
};

// ─── Antes de la llamada al prospecto ──────────────────────────────────────
export const planTurn = (state, { project, profile = {}, lastProspectText, setterText, conversationText = '' }) => {
  const priceAsked = asksPrice(lastProspectText);
  const preguntasPrecio = priceAsked ? (state.preguntasPrecio || 0) + 1 : 0;
  const precio = classifyPriceAnswer(setterText, project, { insistencia: preguntasPrecio, conversationText });
  const priceAnswered = precio.respondio;
  const evasion = priceAsked && !priceAnswered;
  const evasivas = priceAnswered ? 0 : state.evasivas + (evasion ? 1 : 0);
  // Para la instrucción y la presión basta la pista (lo dicho o lo confirmado);
  // para registrar una cita, lo confirmado (ver checkProspectReply).
  const faltaDescubrimiento = missing(known(state));
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
  // Encaje bajo superable: puede aceptar solo si el alumno aportó información
  // concreta que responde al motivo (se verifica después con la explicación).
  const requiereEvidencia = encaje === 'bajo' && !definitiva;

  return {
    turno: state.turno + 1,
    priceAsked, priceAnswered, evasion, evasivas, preguntasPrecio,
    precioExactitud: precio.exactitud,
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

// Cambio de encaje (encaje bajo superable). Se acepta una explicación con
// las palabras del prospecto (ronda 3, R09: «Las 3 cuotas de 650 USD
// hicieron la inversión accesible» frente a «3 cuotas de 650 USD cada una»),
// pero tiene que apoyarse en evidencia concreta: comparte al menos dos
// palabras con contenido con algo que el alumno dijo DESPUÉS de conocer el
// motivo, y al menos una de ellas es un dato documentado del proyecto. No
// puede afirmar nada comercial no documentado («garantizados»).
const fitDocumentWords = (project) => new Set(contentWords([
  documentedOfferText(project), project?.avatarBusiness, project?.avatarDescription,
  project?.avatarCurrentSituation, project?.avatarDesire, project?.niche,
].filter(Boolean).join(' ')));
export const verifyFitEvidence = (explanation, setterTexts, project) => {
  const exp = new Set(contentWords(explanation));
  if (exp.size < 2) return false;
  const texts = setterTexts || [];
  if (findUndocumentedClaims(explanation, project, texts.join('\n')).length) return false;
  const doc = fitDocumentWords(project);
  return texts.some((text) => {
    const shared = [...new Set(contentWords(text))].filter((w) => exp.has(w));
    return shared.length >= 2 && shared.some((w) => doc.has(w));
  });
};

const cleanReveals = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : [])
  .map((x) => norm(x).replace(/ /g, '_')).filter((x) => REVEAL_CATEGORIES.includes(x));

// Revisa la respuesta del prospecto contra el plan. Devuelve los problemas
// que justifican repetir el turno (aceptación no permitida) y los demás.
// «descubrimiento_no_verificado» significa que lo confirmado todavía no
// alcanza: quien llama puede esperar al coaching de este turno (que trae las
// citas) y volver a revisar antes de reintentar.
export const checkProspectReply = (raw, plan, state, profile = {}, project = null) => {
  const accept = ACCEPTANCE.includes(raw?.acepta_cita) ? raw.acepta_cita : 'no';
  const issues = [];
  if (accept === 'si' && !plan.despedida) {
    if (!plan.puedeAceptar) issues.push(`aceptacion_no_permitida:${plan.bloqueos.join('+')}`);
    else {
      if (missing(state.confirmado || []).length) issues.push('aceptacion_no_permitida:descubrimiento_no_verificado');
      if (plan.requiereEvidencia) {
        const pool = [...state.setterTrasNoEncaje, ...(state.revelado.includes('no_encaje') ? [plan.setterText] : [])];
        if (!state.revelado.includes('no_encaje') || !verifyFitEvidence(raw?.cambio_encaje, pool, project)) issues.push('aceptacion_no_permitida:encaje_sin_informacion_nueva');
      }
    }
  }
  if (plan.despedida && accept === 'si') issues.push(`aceptacion_no_permitida:despedida_${plan.despedida}`);
  const maxWords = (RESISTANCE_RULES[profile.resistencia] || RESISTANCE_RULES.media).maxPalabras;
  const count = String(raw?.respuesta_prospecto || '').split(/\s+/).filter(Boolean).length;
  if (count > Math.ceil(maxWords * 1.5)) issues.push(`largo:${count}`);
  return issues;
};

// Respuestas de respaldo cuando, tras el reintento, la IA sigue aceptando una
// cita que el plan no permite. Son neutras, cortas y no contradicen lo dicho
// (ronda 3, R09: «sigo sin ver que sea para mí» después de «las cuotas me
// hacen más viable»); quedan registradas.
const reply = (respuesta_prospecto, acepta_cita, estado_lead) => Object.freeze({ respuesta_prospecto, acepta_cita, estado_lead, revela: [] });
export const FALLBACK_REPLIES = Object.freeze({
  despedida_evasivas: reply('Mira, sin un precio claro prefiero no seguir. Gracias igual.', 'no', 'cerrado'),
  despedida_presion: reply('Prefiero dejarlo acá por ahora, gracias.', 'no', 'cerrado'),
  encaje_definitivo: reply('Te agradezco, pero siendo honesto, ahora no es para mí.', 'no', 'resistente'),
  encaje_sin_informacion_nueva: reply('Puede ser, pero antes quiero pensarlo con calma.', 'condicionada', 'interesado'),
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
export const resolveTurn = (state, plan, raw, profile = {}, project = null) => {
  const issues = [];
  let accept = ACCEPTANCE.includes(raw?.acepta_cita) ? raw.acepta_cita : 'no';
  const modelState = STATES.includes(raw?.estado_lead) ? raw.estado_lead : 'abierto';
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
  // Un cambio de encaje con evidencia queda registrado aunque la cita quede
  // condicionada (sirve para la revisión del turno).
  if (plan.requiereEvidencia && accept !== 'si' && raw?.cambio_encaje && project) {
    const pool = [...state.setterTrasNoEncaje, ...(state.revelado.includes('no_encaje') ? [plan.setterText] : [])];
    if (verifyFitEvidence(raw.cambio_encaje, pool, project)) cambioEncaje = String(raw.cambio_encaje).trim();
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
    preguntasPrecio: plan.preguntasPrecio,
    presiones: plan.presiones,
    revelado,
    setterTrasNoEncaje: knewNoFit ? [...state.setterTrasNoEncaje, plan.setterText].slice(-6) : state.setterTrasNoEncaje,
    citaPendiente,
    cambioEncaje,
    desenlace,
  };
  return { estado_lead: estado, acepta_cita: accept, desenlace, issues, control: next };
};
