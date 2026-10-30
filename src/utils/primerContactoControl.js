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
// Hasta tres palabras entre «cuánto» y el verbo: «¿Cuánto más o menos cuesta?» (ronda 4, C09).
const COST_VERB = /^(\s+\S+){0,3}?\s+(cuesta|cuestan|sale|salen|vale|es|son|cobra\w*|cost\w*|pag\w*|invert\w*|seria|saldria)\b/;
const PRICE_REQUEST = new RegExp(`\\b(cual es|que|dime|dame|decime|pasame|pasas|mandame|me dices|me digas|me des|me das|me has dicho|me dijiste|dicho|necesito saber|quiero saber|saber|tienes|hay|me podrias decir)\\s+(el |la |los |las |un |una |algun |alguna |mas o menos )?${PRICE_NOUN}\\b`);
// Preguntas de precio que piden algo concreto: un rango, una cota o la forma
// de pago (ronda 4, C09: «¿Estamos hablando de 500, 1000, 5000?», «¿Es más de
// 2000 o menos?», «¿Es algo que pueda pagar mensual o es todo de una?»). Sin
// precio documentado, no se responden solo remitiendo a la llamada.
const SPECIFIC_PRICE_QUESTION = /\b(mas|menos) de \d[\d.,]*( o (mas|menos))?\b|\b\d[\d.,]*\s*,\s*\d[\d.,]*\s*(,|o)\s*\d[\d.,]*\b|\brango\b|\baproximad\w*\b|\bmas o menos cuanto\b|\bcuanto mas o menos\b|\b(pagar|pagarlo|pago) (mensual|en cuotas|todo de una|de una vez)\b|\btodo de una\b|\bformas? de pago\b|\bfinancia\w*\b|\ben cuotas\b/;
// El prospecto reclama el precio sin hacer una pregunta con «cuánto».
const PRICE_DEMAND = /\bno me (esquives|evadas|cambies el tema)\b|\bdame un numero\b|\bun numero (aproximado|aunque sea)\b|\bsin (un|el) (precio|numero)\b/;
// Pedir el precio PARA la llamada («quiero que en la llamada me digas el
// rango de precio») no es preguntarlo ahora: remitir a la llamada lo responde.
const FOR_THE_CALL = /\ben la (llamada|reunion|videollamada|cita)\b/;
export const asksPrice = (prospectText) => {
  const t = sentencesOf(prospectText).map(norm).filter((s) => !FOR_THE_CALL.test(s)).join(' ');
  if (!t) return false;
  // Pedido corto: «Precio», «¿Precio?», «Info y precio», «$?».
  if (t.split(' ').length <= 4 && (/\b(precio|precios|costo|costos|tarifa)\b/.test(t) || /^\$ ?\??$/.test(t))) return true;
  for (const m of t.matchAll(/\bcuanto\b/g)) {
    const rest = t.slice(m.index + 'cuanto'.length);
    if (NOT_PRICE_AFTER_CUANTO.test(rest)) continue;
    if (/^\s*\?/.test(rest) || COST_VERB.test(rest)) return true;
  }
  if (PRICE_REQUEST.test(t)) return true;
  if (PRICE_DEMAND.test(t)) return true;
  if (/\b(cientos|miles) o (cientos|miles)\b/.test(t)) return true;
  if (t.includes('?') && SPECIFIC_PRICE_QUESTION.test(t) && /\d|precio|pag|cuota|cuanto|costo|inversion/.test(t)) return true;
  return /\bes caro\b/.test(t) && t.includes('?');
};
export const asksSpecificPrice = (prospectText) => asksPrice(prospectText) && SPECIFIC_PRICE_QUESTION.test(norm(prospectText));

// El prospecto pone el precio como condición para agendar («si no me das un
// número aproximado ahora, no agendo nada»). Sin precio documentado, el
// alumno no puede cumplirla en el chat: el prospecto decide y su decisión se
// respeta (no se registra una cita aceptada mientras siga en pie).
export const conditionsOnPrice = (prospectText) => {
  const t = norm(prospectText);
  const priceWord = /\b(precio|numero|cuanto|rango)\b/.test(t);
  return (/\bsi no me (das|dices|pasas)\b/.test(t) && priceWord && /\bno (agend|acept)\w*/.test(t))
    || (priceWord && /\bantes de (agendar|aceptar|la llamada|una llamada|la cita|hablar con)\b/.test(t))
    || (/\bsin (saber )?(el|un) (precio|numero)\b/.test(t) && /\bno (agend|acept)\w*/.test(t));
};

// ─── Montos ────────────────────────────────────────────────────────────────
// Montos escritos de cualquier forma habitual: «1.800», «1,800», «1800»,
// «1.8k», «1,8 mil», «2 mil», «mil ochocientos», «seiscientos cincuenta».
const UNITS = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const HUNDREDS = { cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900 };
// skipBeforeUnit: no cuenta los montos seguidos de una unidad que no es
// dinero («doce semanas», «tres cuotas»).
const wordAmounts = (t, { skipBeforeUnit = false } = {}) => {
  const out = [];
  let current = 0; let total = 0; let any = false;
  const flush = (next = '') => {
    if (any && !(skipBeforeUnit && NON_MONEY_UNIT.test(` ${next}`))) out.push(total + current);
    current = 0; total = 0; any = false;
  };
  for (const w of t.split(/[\s,.;:!?¿¡()]+/)) {
    if (w in UNITS) { current += UNITS[w]; any = true; } else if (w in HUNDREDS) { current += HUNDREDS[w]; any = true; } else if (w === 'mil') { total += (current || 1) * 1000; current = 0; any = true; } else if (w === 'y' && any) { /* «cincuenta y cinco» */ } else flush(w);
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
// «son» solo cuenta pegado a la cifra («son 1.800»): en la ronda 4 (C04) «son
// hábitos sostenibles en 12 semanas» se leyó como un precio inventado de 12.
const PRICE_CONTEXT = /\$|\busd\b|dolar|pesos|soles|euros|precio|cuesta|cuestan|\bsale\b|\bvale\b|valor|inversion|cuota|pago|contado|costo|monto|\bson \$? ?\d|ronda|aprox/;
// Cantidades que no son dinero aunque la oración hable de precio («12
// semanas», «20 minutos», «3 cuotas», «+40 pacientes»).
const NON_MONEY_UNIT = /^\s*(%|por ?ciento|semanas?|dias?|meses|mes|anos?|horas?|hs|minutos?|min|sesiones|clases|modulos|cuotas|pagos|veces|pacientes|clientes|personas|sillones|consultorios)\b/;
const moneyAmountsIn = (sentence) => {
  const t = norm(sentence);
  const out = [];
  const NUMERIC = /(\d+(?:[.,]\d+)*)\s*(k\b|mil\b)?/g;
  for (const m of t.matchAll(NUMERIC)) {
    if (NON_MONEY_UNIT.test(t.slice(m.index + m[0].length))) continue;
    const n = toNumber(m[1]);
    if (Number.isFinite(n)) out.push(m[2] ? n * 1000 : n);
  }
  return [...out, ...wordAmounts(t.replace(NUMERIC, ' '), { skipBeforeUnit: true })];
};
const MONEY_MIN = 10;
export const priceAmountsIn = (text) => sentencesOf(text)
  .filter((s) => PRICE_CONTEXT.test(norm(s)))
  .flatMap((s) => moneyAmountsIn(s).map((n) => ({ n, approx: APPROX.test(norm(s)) })))
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
// Sin precio documentado (decisiones de Digital SET, 29 y 30/10/2026):
//   - Decir con honestidad que no tiene el precio es válido siempre. No hace
//     falta la frase literal: valen las formulaciones equivalentes («ese
//     dato no lo tengo», «no te quiero dar un número equivocado»).
//   - Remitir a la llamada sin decirlo también vale si es honesto y se
//     refiere al precio: ante la primera pregunta, o si ya dijo antes que no
//     lo tiene (no hace falta repetirlo literalmente cada vez)…
//   - …pero usarlo para esquivar REPETIDAMENTE una pregunta concreta (un
//     rango, una cota, la forma de pago) es evasiva: la segunda remisión
//     seguida ante una pregunta concreta ya no cuenta como respuesta.
//   - Las vaguedades («es accesible», «vale la pena») no son una respuesta,
//     aunque remitan a la llamada (ronda 3, R12 y ronda 4, C09).
//   - Inventar razones que el proyecto no documenta (planes, paquetes,
//     financiación, cuotas, opciones de pago) nunca es honesto, aunque el
//     mismo mensaje diga que no tiene el precio.
const HONEST_NO_NUMBER = /\bno (tengo|hay|tenemos|manejo|puedo|te puedo|se|sabria|lo se|conozco|cuento con|lo manejo|quiero inventar\w*|te quiero (dar|inventar))\b|\bno (esta|viene) (definido|documentado|fijo|publicado|confirmado|disponible)|\bsin un (numero|precio)\b|\btodavia no (hay|tengo|esta|se (definio|confirmo))\b|\bno lo tengo\b|\bno (lo )?tengo (ese|el) dato\b|\b(ese|el) dato no lo tengo\b|\bno (te )?(lo )?(puedo|podria) (confirmar|asegurar|decir)\b|\bprefiero no (darte|inventarte|decirte) un (numero|precio|monto)\b|\bno (te )?quiero (darte|dar|decirte) un (numero|precio|monto) (equivocado|inventado|que no)\b|\bno me corresponde (darte|decirte)\b|\bno lo tengo (confirmado|a mano)\b/;
const DEFERS = /llamada|equipo|experta?|\bcoach\b|te lo (explica|detalla|cuenta|confirma)|lo (ve|veran|vemos|detalla|explica|confirma) (en|con)|se (detalla|define|explica|ve|confirma) (en|con)/;
// Vaguedades sobre el precio que no informan nada.
const VAGUE_PRICE = /\baccesible\b|\beconomic\w*\b|\bno es (tan |muy )?caro\b|\bvale la pena\b|\bdepende de (lo que|que|tu|cada)\b|\bvaria (segun|de acuerdo)\b|\bse ajusta a (tu|cada)\b/;
// Razones comerciales que el alumno inventaría si el proyecto no las documenta.
// Solo en afirmaciones («¿cuál es tu plan para este año?» no inventa nada).
const INVENTED_REASON = /\b(depende del plan|segun el plan|el plan que eli\w+|(hay|tenemos|tiene|con) (varios |distintos |diferentes |algunos )?(planes|paquetes)|(los )?planes (varian|cambian|van|son)|paquetes?|modalidad(es)? de pago|opciones de pago|formas? de pago|financ\w+|en cuotas|cuotas (mensuales|sin)|becas?|descuentos?|promocion\w*)\b/g;
// La negación tiene que estar pegada a la razón («ni sé si hay cuotas»), no al
// principio de la frase («No tengo el número exacto: depende del plan»).
const NEGATION_BEFORE = /\b(no|sin|ni)\b(\s+[^\s.,]+){0,3}\s*$/;
const REASON_KEY = /plan|paquete|pago|financ|cuota|beca|descuento|promocion/;
const inventsReason = (setterText, project) => {
  const doc = norm(documentedOfferText(project));
  return sentencesOf(setterText).map(norm).filter((s) => !s.includes('?')).some((s) => [...s.matchAll(INVENTED_REASON)]
    .some((m) => !doc.includes((m[0].match(REASON_KEY) || [''])[0]) && !NEGATION_BEFORE.test(s.slice(0, m.index))));
};
// Las cifras que el alumno repite de la conversación («gastaste 2.500 USD con
// la agencia») no son afirmaciones sobre el precio, salvo que coincidan con
// el precio documentado.
const near = (a, b, tol) => Math.abs(a - b) / b <= tol;
// Opciones: insistencia (preguntas de precio sin responder, contando esta),
// especifica (la pregunta pide un rango, una cota o la forma de pago),
// honestaAntes (ya dijo antes que no tiene el precio) y remisionesConcretas
// (preguntas concretas seguidas que ya respondió solo remitiendo a la llamada).
export const classifyPriceAnswer = (setterText, project, {
  insistencia = 1, conversationText = '', especifica = false, honestaAntes = false, remisionesConcretas = 0,
} = {}) => {
  const t = norm(setterText);
  const documented = isPriceDocumented(project) ? amountsIn(project.price).filter((n) => n >= MONEY_MIN) : [];
  // Cifras de la oferta documentada que no son el precio («90 días», «+40 pacientes»).
  const offerNumbers = amountsIn(documentedOfferText(project)).filter((n) => n >= MONEY_MIN);
  const echoed = [...amountsIn(conversationText), ...(documented.length ? [] : offerNumbers)].filter((n) => n >= MONEY_MIN);
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
  // «No tengo el precio confirmado», «no sé si es más o menos de 2.000»: la
  // negación tiene que hablar del precio o del dato («No hay problema» no cuenta).
  const invented = inventsReason(setterText, project);
  const explicit = !invented && sentencesOf(setterText).map(norm)
    .some((s) => HONEST_NO_NUMBER.test(s) && /precio|numero|cifra|monto|costo|dato|valor|rango|\beso\b|\bese\b|\d/.test(s) && !VAGUE_PRICE.test(s));
  // Remitir a la llamada responde solo si se refiere al precio (por su nombre
  // o con «eso»): «Marta trabaja eso… ¿te gustaría una llamada?» no lo es.
  const refersToPrice = /precio|costo|cuesta|inversion|valor|numero|cifra|rango|cuanto|monto|pago/.test(t) || /^(y )?eso\b|\beso (te|lo|se)\b|\bese (tema|dato)\b/.test(t);
  const deferral = !explicit && !invented && DEFERS.test(t) && refersToPrice && !VAGUE_PRICE.test(t)
    && (insistencia < 2 || honestaAntes) && !(especifica && remisionesConcretas > 0);
  const honest = explicit || deferral;
  return {
    respondio: honest, exactitud: honest ? 'honesta' : 'evasiva', cifras: [], explicita: explicit,
    // Remitió a la llamada una pregunta concreta: la próxima vez ya no basta.
    remisionConcreta: deferral && especifica, razonInventada: invented,
  };
};
export const answersPrice = (setterText, project, options) => classifyPriceAnswer(setterText, project, options).respondio;

// ─── Afirmaciones no documentadas del alumno ───────────────────────────────
// Lo que el alumno afirma sin respaldo: garantías, devoluciones, escasez,
// cifras y promesas de resultado no documentadas, y precios incorrectos o
// inventados. Cada una lleva su tipo para saber qué la corrige.
export const setterClaimsOf = (setterText, project, priorText = '') => {
  const claims = findUndocumentedClaims(setterText, project, priorText).map((texto) => ({ tipo: 'oferta', texto }));
  const precio = classifyPriceAnswer(setterText, project, { conversationText: priorText });
  if (precio.exactitud === 'incorrecta') claims.push({ tipo: 'precio', texto: `precio incorrecto (${precio.cifras.join(', ')}; documentado: ${project.price})` });
  if (precio.exactitud === 'inventada') claims.push({ tipo: 'precio', texto: `precio inventado (${precio.cifras.join(', ')}; el proyecto no documenta precio)` });
  return claims;
};

// Rectificación explícita (decisión de Digital SET, 30/10/2026): si el alumno
// corrige la información falsa antes de que el prospecto acepte, la cita
// puede ser válida. Corrige una afirmación sobre la oferta quien dice que se
// equivocó o que eso no existe o no está confirmado; corrige un precio quien
// da el precio documentado (o, sin precio documentado, dice que no lo tiene).
const RECTIFY = /\b(me equivoqu\w*|me expres[eé] mal|me confundi|corrijo|te corrijo|correg\w*|rectific\w*|aclaro|perdon|disculp\w*|en realidad|lo que (te )?dije|no es asi|no fue asi|eso no es correcto|no esta (documentad|confirmad)\w*|no (puedo|podemos|te puedo) (prometer|garantizar|asegurar)\w*|no (hay|tenemos|ofrecemos|existe) (una |ninguna )?(garant|devoluci|bono|descuento|cupo)\w*|me apresur\w*)\b/;
const correctsOffer = (setterText) => RECTIFY.test(norm(setterText));
const correctsPrice = (setterText, project) => {
  const c = classifyPriceAnswer(setterText, project);
  return ['exacta', 'aproximada'].includes(c.exactitud) || Boolean(c.explicita);
};
// Pendientes después de este mensaje: las anteriores que no corrigió, más las nuevas.
export const pendingClaimsAfter = (pending, setterText, project, newClaims) => {
  const offerFixed = !newClaims.some((c) => c.tipo === 'oferta') && correctsOffer(setterText);
  const priceFixed = !newClaims.some((c) => c.tipo === 'precio') && correctsPrice(setterText, project);
  return [
    ...(pending || []).filter((c) => !((c.tipo === 'oferta' && offerFixed) || (c.tipo === 'precio' && priceFixed))),
    ...newClaims,
  ];
};

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
    preguntasPrecio: 0,     // preguntas de precio sin responder desde la última respuesta
    precioHonesto: false,   // sin precio documentado: ya dijo que no tiene el precio
    precioCondicion: false, // sin precio documentado: el prospecto condiciona la cita al precio
    remisionesConcretas: 0, // preguntas concretas seguidas respondidas solo remitiendo a la llamada
    presiones: 0,           // citas propuestas sin descubrimiento + pitch con enlace
    revelado: [],           // lo que el prospecto DICE haber contado (pista)
    confirmado: [],         // lo confirmado con citas de sus mensajes
    evidencias: {},         // categoría → cita textual del prospecto
    setterTextos: [],       // últimos mensajes del alumno, con su turno
    noEncajeDesde: null,    // turno desde el que se conoce el motivo del no encaje
    citaPendiente: false,   // hubo un «sí, pero antes…» que no se resolvió
    invenciones: [],        // afirmaciones no documentadas del alumno que todavía no corrigió
    cambioEncaje: null,     // explicación verificada del cambio de encaje
    desenlace: 'abierta',
  };
};

const known = (state) => [...new Set([...state.revelado, ...(state.confirmado || [])])];
const missing = (list) => DISCOVERY_REQUIRED.filter((k) => !list.includes(k));

// F1 (ronda 4, C02): la cita «quiero que me explique bien cómo funciona antes
// de decidir» existía en los mensajes, pero es una CONDICIÓN para decidir, no
// el motivo. Un motivo es una necesidad, una motivación o un objetivo propio
// (qué le pasa, qué quiere resolver o lograr). El coaching propone la cita y
// el código descarta lo que no puede ser un motivo: preguntas, condiciones
// para decidir o agendar y pedidos de información sobre la oferta. El código
// solo puede quitar evidencia, nunca agregarla.
const CONDITION = /\bantes de (decidir|agendar|aceptar|comprometer\w*|seguir|avanzar|pagar|inscrib\w*|la llamada|hablar)\b|\bque me (expli\w*|cuent\w*|dig\w*|muestr\w*|aclar\w*)\b|\bme (expliques|explique|expliquen|cuentes|digas|muestres)\b|\bprimero (quiero|necesito)\b|\b(necesito|quiero) (saber|entender|ver) (bien )?(como|que|cuanto|el precio|de que)\b|\bsiempre (que|y cuando)\b|\bsolo si\b|\bcon tal de que\b|\bsi no me\b|\bsi me (explic|dec|da|mand)\w*\b|\bpara decidir\b/;
const OFFER_INQUIRY = /\b(como funciona|que incluye|cuanto cuesta|de que se trata|el precio|cuanto sale|que ofrecen|es para mi|es diferente)\b/;
const MOTIVE_MIN_WORDS = 3;
// Ronda 5, C02: la cita se registró con el «motivo» «No quiero otro curso
// más», una OBJECCIÓN (decisión de Digital SET, 30/10: una objeción no es por
// sí sola una necesidad, motivación u objetivo). Se descartan las oraciones
// que solo rechazan o desconfían de la oferta…
const OBJECTION = /\bno quiero (otro|otra|algo|que sea|perder|gastar|que me)\b|\b(otro|otra) (curso|programa|promesa|agencia|estafa) (mas|igual)\b|\bdesconf\w*\b|\bno (me )?(creo|convence|interesa|sirve|funciona)\b|\bes (otro|otra|caro|mucho)\b|\bno (tengo|me queda) tiempo\b|\bya (probe|intente|gaste|pague)\b/;
// …y lo que queda tiene que expresar una necesidad, una motivación o un
// objetivo propio: algo que le falta, le preocupa o quiere lograr.
const NEED = /\b(necesit\w*|quier[oe]\b|queremos|quisiera|busc[oa]\w*|me gustar[ií]a|mi (meta|objetivo|idea|sueno)|objetivo|meta|sueno con|me preocup\w*|preocup\w*|me cuesta|no logro|no llego|me falta|me asust\w*|asust\w*|estres\w*|agotad\w*|cansad\w*|ansiedad|frustr\w*|me afecta|presion\w*|urgen\w*|cuanto antes|cubr\w*|respir\w*|estabiliz\w*|crecer|recuperar|dejar de|para (poder|cubrir|llenar|crecer|abrir|tener|recuperar|dejar|justificar)|por eso (te )?(escrib|consult|pregunt)\w*|escrib\w* (porque|para)|(me|lo que me) (motiv|impuls|anim|decid)\w*|me decid\w*)\b/;
const NEGATED_NEED = /\bno (necesit|quier|busc)\w*/;
// Lo que queda de la cita como motivo: sus oraciones sin preguntas,
// condiciones, pedidos de información ni objeciones.
export const motiveCore = (quote) => sentencesOf(quote)
  .flatMap((s) => s.split(/,\s*(?=pero\b)|\bpero\b|;/i))
  .map((s) => s.trim())
  .filter((s) => s && !s.includes('?') && !CONDITION.test(norm(s)) && !OFFER_INQUIRY.test(norm(s)) && !OBJECTION.test(norm(s)))
  .join('. ');
export const isMotiveQuote = (quote) => {
  const core = motiveCore(quote);
  const n = norm(core);
  return contentWords(core).length >= MOTIVE_MIN_WORDS && NEED.test(n.replace(NEGATED_NEED, ''));
};

// Descubrimiento que propone el coaching: { situacion, motivo, no_encaje }
// (citas textuales). Solo se confirma lo que aparece en los mensajes del
// prospecto; el motivo, además, tiene que poder ser un motivo (isMotiveQuote).
// no_encaje (F2): la frase donde el prospecto dice por qué cree que la oferta
// no es para él; desde ese turno cuentan las aclaraciones del alumno.
export const DISCOVERY_QUOTES = Object.freeze(['situacion', 'motivo', 'no_encaje']);
export const verifyDiscovery = (proposed, prospectMessages) => {
  const out = {};
  for (const k of DISCOVERY_QUOTES) {
    const quote = typeof proposed?.[k] === 'string' ? proposed[k].trim() : '';
    if (!quote || !quoteInMessages(quote, prospectMessages)) continue;
    if (k === 'motivo' && !isMotiveQuote(quote)) continue;
    out[k] = quote;
  }
  return out;
};
// `turno`: el turno cuyo coaching trajo las citas (por defecto, el último
// resuelto). Ese coaching evaluó el mensaje del alumno de ese turno, que ya
// respondía a lo citado: si confirma el no encaje, ese mensaje cuenta como
// aclaración.
export const applyDiscovery = (state, verified, turno = state?.turno) => {
  if (!state || !verified) return state;
  const add = Object.keys(verified).filter((k) => DISCOVERY_QUOTES.includes(k));
  if (!add.length) return state;
  const noEncajeDesde = add.includes('no_encaje') && Number.isFinite(turno)
    ? Math.min(turno, state.noEncajeDesde ?? Infinity) : state.noEncajeDesde ?? null;
  return {
    ...state,
    confirmado: [...new Set([...(state.confirmado || []), ...add])],
    evidencias: { ...add.reduce((a, k) => ({ ...a, [k]: verified[k] }), {}), ...(state.evidencias || {}) },
    noEncajeDesde,
  };
};
// El no encaje salió en la conversación: lo confirmó el coaching con una cita
// o lo declaró el prospecto (pista). Sirve para que una aclaración del alumno
// pueda contar; si la cita se acepta lo decide verifyFitEvidence.
const knowsNoFit = (state) => (state.confirmado || []).includes('no_encaje') || state.revelado.includes('no_encaje');
// Mensajes del alumno que cuentan como aclaración del no encaje: los de los
// turnos desde que salió, incluido el de este turno si ya se sabía.
const fitPool = (state, plan) => {
  const since = state.noEncajeDesde;
  if (since == null) return [];
  const prior = (state.setterTextos || []).filter((x) => x.turno >= since).map((x) => x.text);
  return plan.turno >= since ? [...prior, plan.setterText] : prior;
};

// ─── Antes de la llamada al prospecto ──────────────────────────────────────
export const planTurn = (state, { project, profile = {}, lastProspectText, setterText, conversationText = '' }) => {
  // Invenciones (decisión del 30/10): las de este mensaje se suman a las que
  // siguen sin corregir; no cambian lo que el prospecto puede hacer, pero una
  // cita conseguida con ellas no cuenta como éxito (ver citaValidity).
  const afirmaciones = setterClaimsOf(setterText, project, conversationText);
  const invenciones = pendingClaimsAfter(state.invenciones, setterText, project, afirmaciones);
  const priceAsked = asksPrice(lastProspectText);
  // F4 (ronda 4, C09): la insistencia cuenta las preguntas de precio que
  // siguen sin respuesta; ya no vuelve a cero cuando el prospecto pregunta
  // otra cosa entre medio.
  const preguntasPrecio = priceAsked ? (state.preguntasPrecio || 0) + 1 : (state.preguntasPrecio || 0);
  const precio = classifyPriceAnswer(setterText, project, {
    insistencia: preguntasPrecio, conversationText,
    especifica: priceAsked && asksSpecificPrice(lastProspectText), honestaAntes: Boolean(state.precioHonesto),
    remisionesConcretas: state.remisionesConcretas || 0,
  });
  // Se cuentan las remisiones seguidas ante preguntas concretas; decir que no
  // tiene el precio, o dar una cifra, vuelve a empezar la cuenta.
  const remisionesConcretas = precio.explicita || (precio.cifras || []).length ? 0
    : (state.remisionesConcretas || 0) + (precio.remisionConcreta ? 1 : 0);
  // Sin una pregunta de precio en el último mensaje, solo cuenta como
  // respuesta dar una cifra o decir que no tiene el precio (ronda 4, C04:
  // «¿te gustaría una llamada con ella?» ponía a cero una evasiva anterior).
  const priceAnswered = precio.respondio && (priceAsked || Boolean(precio.explicita) || (precio.cifras || []).length > 0);
  const evasion = priceAsked && !priceAnswered;
  const evasivas = priceAnswered ? 0 : state.evasivas + (evasion ? 1 : 0);
  const sinPrecio = !isPriceDocumented(project);
  const precioHonesto = Boolean(state.precioHonesto) || (sinPrecio && Boolean(precio.explicita));
  // El prospecto puso el precio como condición para agendar y el precio no
  // está documentado: su decisión se respeta hasta que él mismo pida avanzar.
  const precioCondicion = sinPrecio
    && (conditionsOnPrice(lastProspectText) || (Boolean(state.precioCondicion) && !asksToAdvance(lastProspectText)));
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
  if (precioCondicion) bloqueos.push('precio_condicion');
  if (definitiva) bloqueos.push('encaje_definitivo');
  // Encaje bajo superable: puede aceptar solo si el alumno aportó información
  // concreta que responde al motivo (se verifica después con la explicación).
  const requiereEvidencia = encaje === 'bajo' && !definitiva;

  return {
    turno: state.turno + 1,
    priceAsked, priceAnswered, evasion, evasivas,
    // Respondida la pregunta, la insistencia vuelve a empezar.
    preguntasPrecio: priceAnswered ? 0 : preguntasPrecio,
    precioExactitud: precio.exactitud,
    precioHonesto, precioCondicion, remisionesConcretas,
    afirmaciones, invenciones,
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
      // F2 (ronda 4, C04): el motivo del no encaje ya no depende solo de que el
      // prospecto lo declare en "revela"; también lo confirma el coaching con
      // una cita. Sin que haya salido, no hay nada que aclarar.
      if (plan.requiereEvidencia) {
        if (!knowsNoFit(state) || !verifyFitEvidence(raw?.cambio_encaje, fitPool(state, plan), project)) issues.push('aceptacion_no_permitida:encaje_sin_informacion_nueva');
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
  // Sigue siendo una pregunta de precio, pero no una condición para agendar:
  // sin precio documentado, una condición escrita por el código ataría al
  // prospecto aunque después le respondan con honestidad.
  precio_pendiente: reply('Me parece bien, pero todavía no me dijiste el precio.', 'condicionada', 'interesado'),
  precio_condicion: reply('Te entiendo, pero sin saber el precio prefiero no agendar todavía.', 'condicionada', 'interesado'),
  sin_descubrimiento: reply('Antes de agendar, quiero entender bien de qué se trata.', 'no', 'abierto'),
});
export const fallbackFor = (plan, issues = []) => {
  const key = plan.despedida ? `despedida_${plan.despedida}`
    : issues.some((i) => i.includes('encaje_sin_informacion_nueva')) ? 'encaje_sin_informacion_nueva'
    : ['encaje_definitivo', 'precio_pendiente', 'precio_condicion', 'sin_descubrimiento'].find((b) => plan.bloqueos.includes(b)) || 'sin_descubrimiento';
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
    const allowed = encaje !== 'alto' && knowsNoFit({ ...state, revelado });
    if (!allowed) issues.push('no_califica_no_permitido');
    estado = allowed ? 'no_califica' : 'resistente';
  } else {
    if (modelState === 'cerrado' && !plan.evasion && !plan.presion && state.evasivas === 0 && state.presiones === 0) issues.push('cierre_espontaneo');
    estado = modelState === 'pidio_llamada' ? 'interesado' : modelState;
  }
  // Un cambio de encaje con evidencia queda registrado aunque la cita quede
  // condicionada (sirve para la revisión del turno).
  if (plan.requiereEvidencia && accept !== 'si' && raw?.cambio_encaje && project && knowsNoFit(state)) {
    if (verifyFitEvidence(raw.cambio_encaje, fitPool(state, plan), project)) cambioEncaje = String(raw.cambio_encaje).trim();
  }

  let citaPendiente = state.citaPendiente;
  if (accept === 'condicionada') citaPendiente = true;
  else if (accept === 'si' || (accept === 'no' && plan.propone) || estado === 'cerrado' || estado === 'no_califica') citaPendiente = false;

  const desenlace = estado === 'pidio_llamada' ? 'cita_aceptada'
    : estado === 'cerrado' ? 'despedida'
    : estado === 'no_califica' ? 'no_califica'
    : citaPendiente ? 'cita_condicionada'
    : 'abierta';

  // Si el prospecto declara el no encaje en esta respuesta, las aclaraciones
  // cuentan desde el turno siguiente (el alumno todavía no lo sabía).
  const noEncajeDesde = state.noEncajeDesde ?? (reveals.includes('no_encaje') ? plan.turno + 1 : null);
  const next = {
    ...state,
    turno: plan.turno,
    evasivas: plan.evasivas,
    preguntasPrecio: plan.preguntasPrecio,
    precioHonesto: plan.precioHonesto,
    precioCondicion: plan.precioCondicion,
    remisionesConcretas: plan.remisionesConcretas,
    invenciones: plan.invenciones || state.invenciones || [],
    presiones: plan.presiones,
    revelado,
    setterTextos: [...(state.setterTextos || []), { turno: plan.turno, text: plan.setterText }].slice(-8),
    noEncajeDesde,
    citaPendiente,
    cambioEncaje,
    desenlace,
  };
  return { estado_lead: estado, acepta_cita: accept, desenlace, issues, control: next };
};

// ─── Aceptación con día y hora (decisión de Digital SET, 30/10/2026) ───────
// Ronda 5: Haiku marcó como «condicionada» «Dale, el jueves a las 18:30 me va
// bien. Pero quiero que Ana me explique bien ese tema de la garantía» (C08).
// Una aceptación explícita con día y hora, seguida de una pregunta o un pedido
// para la llamada, es una cita aceptada; si pone una condición PREVIA para
// aceptar («pero antes dime el precio»), sigue condicionada. El código solo
// propone el cambio: quien llama vuelve a revisar la respuesta con el plan
// (sin descubrimiento confirmado, con el precio pendiente, etc., no se acepta).
const ACCEPT_WORD = /^(dale|si|sí|perfecto|listo|ok|okay|de acuerdo|genial|buenisimo|me va bien|me viene bien|me sirve|agendemos|confirmo|va|vale|bueno)\b|\b(me va bien|me viene bien|me queda bien|me sirve|agendemos|confirmo|nos vemos|quedamos)\b/;
const WHEN = /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo|manana|pasado manana|pasado|hoy)\b.*\b(a las \d|\d{1,2}(:\d{2})? ?(am|pm|hs)?\b|en la (manana|tarde|noche)|por la (manana|tarde|noche)|tarde|manana)|\ba las \d{1,2}(:\d{2})?\b|\b\d{1,2}:\d{2}\b|\b\d{1,2} ?(am|pm|hs)\b/;
const PRIOR_CONDITION = /\bantes (de (agendar|confirmar|aceptar|decidir|la llamada)|necesito|quiero|tengo que|dime|decime|me (dices|decis|explicas|confirmas|pasas))\b|\b(necesito|quiero|tengo que) saber\b[^.?!]*\bantes\b|\bprimero (necesito|quiero|dime|decime)\b|\bsiempre (que|y cuando)\b|\bsolo si\b|\bcon la condicion\b|\bsi (antes )?me (dices|decis|das|confirmas|explicas|mandas)\b|\bsi no\b|\bdepende de\b/;
export const explicitScheduledAcceptance = (prospectText) => {
  const t = norm(prospectText);
  const first = t.split(/[.!?]/)[0] || '';
  return ACCEPT_WORD.test(first) && WHEN.test(t) && !/^\s*(no|mañana no|manana no)\b/.test(t);
};
export const hasPriorCondition = (prospectText) => PRIOR_CONDITION.test(norm(prospectText));
// Devuelve el valor de "acepta_cita" que corresponde según el texto, o el del modelo.
export const normalizeAcceptance = (raw) => {
  const accept = ACCEPTANCE.includes(raw?.acepta_cita) ? raw.acepta_cita : 'no';
  const text = raw?.respuesta_prospecto || '';
  if (accept === 'condicionada' && explicitScheduledAcceptance(text) && !hasPriorCondition(text)) return 'si';
  if (accept === 'si' && hasPriorCondition(text)) return 'condicionada';
  return accept;
};

// ─── Invenciones que detecta el coaching ───────────────────────────────────
// Las características de la oferta inventadas sin cifras («el programa está
// diseñado para que no agregues tareas», «Tú das la estrategia, nosotros
// ejecutamos») no tienen una forma fija: las señala el coaching con la frase
// exacta del alumno, y el código solo la acepta si está en el mensaje y no es
// lo documentado. Solo sirve para restar (nota y validez de la cita), nunca
// para habilitar nada.
const offerVocabulary = (project) => new Set(contentWords([
  documentedOfferText(project), project?.avatarBusiness, project?.avatarDescription, project?.avatarCurrentSituation,
  project?.avatarDesire, project?.avatarPain, project?.niche, project?.promise,
].filter(Boolean).join(' ')));
export const verifyCoachInvention = (quote, setterText, project) => {
  const q = typeof quote === 'string' ? quote.trim() : '';
  if (!q || !quoteInMessages(q, [setterText])) return null;
  const words = [...new Set(contentWords(q))];
  const documented = words.filter((w) => offerVocabulary(project).has(w)).length;
  return documented / words.length >= 0.6 ? null : q;
};
export const applyCoachInvention = (state, invention, turno = state?.turno) => {
  if (!state || !invention) return state;
  return { ...state, invenciones: [...(state.invenciones || []), { tipo: 'oferta', texto: `característica no documentada «${invention}»`, turno }] };
};

// ─── Cita aceptada frente a cita pedagógicamente válida ────────────────────
// Decisión del 30/10/2026: una cita conseguida con una garantía, una promesa
// o una característica inventada que el alumno nunca corrigió queda
// registrada como lo que pasó (el prospecto aceptó), pero NO cuenta como
// éxito comercial. Se guarda con su propio estado final, que no está en los
// estados de éxito de la modalidad (simulatorModes.js) y por eso no suma a la
// tasa de éxito ni a los logros. El SET Score es el promedio de las notas y
// ya refleja el tope de 3 del turno de la invención.
export const INVALID_APPOINTMENT_STATE = 'cita_no_valida';
export const citaValidity = (control) => {
  const pendientes = (control?.invenciones || []).map((c) => c.texto);
  return { valida: pendientes.length === 0, pendientes };
};
export const primerContactoFinalState = (estado, control) => (
  estado === 'pidio_llamada' && !citaValidity(control).valida ? INVALID_APPOINTMENT_STATE : estado
);
