// Urgencia del prospecto (Inbound — Primer contacto). Decisión de Digital SET
// (01/11/2026, opción A): mide la urgencia AUTÉNTICA que el prospecto siente
// y expresa —su problema, las consecuencias, el costo de seguir postergando,
// su prioridad temporal y su motivación—, no la presión del setter.
//
// La IA (el coaching de cada turno y, al cerrar, el análisis de la última
// respuesta pendiente) señala eventos con la frase del prospecto y su postura;
// este módulo decide:
//   - la frase tiene que estar LITERALMENTE en ese mensaje del prospecto (puede
//     ser corta: «me urge», «esta semana»);
//   - una frase que niega urgencia nunca suma (guardas de negación);
//   - lo que el prospecto dice justo después de una afirmación no documentada
//     del setter (escasez, promesas…) no suma;
//   - cada señal tiene un historial y una postura VIGENTE (la última por su
//     posición en la conversación): puede subir, bajar o mantenerse.
// Internamente sigue llamándose nivel_fomo (compatibilidad con la pantalla,
// el informe y el briefing). No toca la nota ni la probabilidad de cita.

export const URGENCY_SIGNALS = Object.freeze({
  reconoce_problema: 15,
  consecuencias: 20,
  costo_de_no_actuar: 25,
  prioridad_temporal: 25,
  motivacion: 15,
});
export const URGENCY_POSTURES = Object.freeze({ afirma: 1, matiza: 0.5, niega: 0 });
export const URGENCY_SIGNAL_LABELS = Object.freeze({
  reconoce_problema: 'Reconoce el problema', consecuencias: 'Consecuencias', costo_de_no_actuar: 'Costo de no actuar',
  prioridad_temporal: 'Prioridad temporal', motivacion: 'Motivación',
});

const normLit = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9ñ]+/g, ' ').trim();

// Posición de la frase dentro del mensaje (normalizado), o -1 si no está.
export const literalPosition = (quote, message) => {
  const q = normLit(quote);
  if (!q) return -1;
  const m = ` ${normLit(message)} `;
  const i = m.indexOf(` ${q} `);
  return i < 0 ? -1 : i;
};

// Negaciones o esperas explícitas de urgencia. «No puedo esperar» (y «no sé si
// puedo esperar») es lo contrario (urgencia), por eso se excluye antes.
const NOT_WAITING = /\bno (\w+ ){0,2}(puedo|puede|pueda|podemos|podamos|podria|podriamos|quiero) (seguir )?esperar\b/;
const DENIES = [
  /\bno (es|esta|lo veo|me parece|lo siento) (tan |muy |nada |algo )?(urgente|grave|prioridad|prioritario|importante|un problema)\b/,
  /\bno (me )?(urge|apura|corre prisa)\b/,
  /\b(no tengo|no hay|sin) (apuro|prisa|urgencia)\b/,
  /\b(puedo|puede|podemos|podria|podriamos) esperar\b/,
  /\bmas adelante\b/,
  /\bno es para (ya|ahora|este mes|esta semana)\b/,
  /\bya no (me )?(importa|preocupa|urge|es (urgente|prioridad|un problema|tan grave))\b/,
  /\bno me (preocupa|quita el sueno|afecta)\b/,
  /\bno pasa nada\b/,
  /\btampoco (es|pasa)\b/,
  /\bno es (mi )?prioridad\b/,
  /\b(despues|luego) (lo )?veo\b/,
];
const AFFIRMS = /\b(urge|urgente|necesito|necesitamos|ya mismo|cuanto antes|lo antes posible|esta semana|este mes|antes de|no puedo seguir|no aguanto|me preocupa|me angustia|me estresa|me cuesta|pierdo|perdiendo|perdi|tengo que|no puedo esperar)\b/;
export const deniesUrgency = (quote) => {
  const t = normLit(quote);
  if (NOT_WAITING.test(t)) return false;
  return DENIES.some((re) => re.test(t));
};
// Lo que queda afirmando urgencia una vez quitada la negación
// («no es urgente, pero me preocupa» → «pero me preocupa»).
const affirmsBeyondDenial = (text) => AFFIRMS.test(DENIES
  .reduce((t, re) => t.replace(new RegExp(re.source, 'g'), ' '), normLit(text)));

// La frase con las palabras que la preceden en el mensaje: una cita corta
// («es urgente») no puede esconder la negación que la antecede («no es urgente»).
const CONTEXT_WORDS = 3;
const withContext = (quote, message, posicion) => {
  const before = ` ${normLit(message)} `.slice(0, posicion).trim().split(' ').filter(Boolean).slice(-CONTEXT_WORDS);
  return [...before, normLit(quote)].join(' ');
};

// Señales que Haiku confunde de forma sistemática (ronda 8 y batería focal):
// - costo_de_no_actuar exige una pérdida futura o continua («voy a tener que
//   cerrar», «cada mes pierdo pacientes»). Sin ella, una frase de plazo
//   («Antes de cerrar es crítico», U2) pasa a prioridad_temporal y el resto
//   se descarta.
// - consecuencias no puede ser solo un gasto o fracaso de una solución
//   anterior («gasté en dos programas que no completé», F1), salvo que la
//   frase diga también un efecto presente («…y ahora no llego a fin de mes»).
const FUTURE_LOSS = /\b(voy a|vamos a|va a|tendre que|tendria que|si sigo|si seguimos|si no (hago|hacemos|cambio|resuelvo)|cada (dia|semana|mes|ano)|perder|pierdo|perdiendo|se me va|me quedo sin|nos quedamos sin|no voy a poder|no podre|cerrar el|quebrar)\b/;
const TIMEFRAME = /\b(antes de|este mes|esta semana|este ano|ya mismo|cuanto antes|lo antes posible|pronto|rapido|urge|urgente|critico|prioritario|prioridad|no puedo (seguir|esperar))\b/;
const PAST_FAILURE = /\b(gaste|gastaba|gastamos|pague|pagaba|probe|intente|contrate|me cobro|no complete|no termine)\b/;
const PRESENT_EFFECT = /\b(ahora|hoy|todavia|sigo|sigue|este mes|no llego|no alcanzo|no cubro|me tiene|estoy)\b/;
function checkSignal(senal, context) {
  const t = normLit(context);
  if (senal === 'costo_de_no_actuar' && !FUTURE_LOSS.test(t)) {
    return TIMEFRAME.test(t) ? { senal: 'prioridad_temporal' } : { motivo: 'sin_perdida_futura' };
  }
  if (senal === 'consecuencias' && PAST_FAILURE.test(t) && !PRESENT_EFFECT.test(t)) return { motivo: 'fracaso_pasado' };
  return { senal };
}

// Lo que la IA devolvió, limpio: solo señales y posturas conocidas y una frase.
export const sanitizeUrgencyEvents = (raw) => (Array.isArray(raw) ? raw : [])
  .filter((e) => e && typeof e === 'object')
  .map((e) => ({
    senal: String(e.senal || '').trim(),
    postura: String(e.postura || '').trim(),
    cita: typeof e.cita === 'string' ? e.cita.trim() : '',
    mensaje: Number.isInteger(e.mensaje) ? e.mensaje : undefined,
  }))
  .filter((e) => e.senal in URGENCY_SIGNALS && e.postura in URGENCY_POSTURES && e.cita)
  .slice(0, 10);

// Verifica eventos de UN mensaje del prospecto.
//   message: el texto del mensaje; index: su posición en la conversación.
//   afterPressure: el mensaje del setter justo anterior afirmó algo no
//   documentado (escasez, garantías, promesas…).
// Una frase cuenta para UNA sola señal: si se superpone con otra ya aceptada
// del mismo mensaje (aunque sea de otra señal), se descarta (ronda 7, U02:
// «algunos meses es complicado» sumaba como problema y como consecuencias).
// Devuelve los aceptados (con la postura ya ajustada) y los descartados con su motivo.
export const verifyUrgencyEvents = (events, { message, index, afterPressure = false, origen = 'turno' }) => {
  const accepted = [];
  const rejected = [];
  for (const e of events) {
    const posicion = literalPosition(e.cita, message);
    if (posicion < 0) { rejected.push({ ...e, motivo: 'no_esta_en_el_mensaje' }); continue; }
    const candidate = { mensaje: index, posicion, cita: e.cita };
    if (accepted.some((a) => overlaps(a, candidate))) { rejected.push({ ...e, motivo: 'cita_superpuesta' }); continue; }
    let { postura } = e;
    let ajuste = null;
    const context = withContext(e.cita, message, posicion);
    if (postura !== 'niega' && deniesUrgency(context)) {
      const mixed = affirmsBeyondDenial(context);
      const next = postura === 'afirma' && mixed ? 'matiza' : 'niega';
      if (next !== postura) { ajuste = `${postura}→${next}:negacion`; postura = next; }
    }
    let { senal } = e;
    if (postura !== 'niega') {
      const checked = checkSignal(senal, context);
      if (checked.motivo) { rejected.push({ ...e, motivo: checked.motivo }); continue; }
      if (checked.senal !== senal) { ajuste = `${senal}→${checked.senal}:sin_perdida_futura`; senal = checked.senal; }
    }
    if (postura !== 'niega' && afterPressure) { rejected.push({ ...e, motivo: 'tras_afirmacion_no_documentada' }); continue; }
    accepted.push({ senal, postura, cita: e.cita, mensaje: index, posicion, origen, ...(ajuste ? { ajuste } : {}) });
  }
  return { accepted, rejected };
};

// procesados: índices de los mensajes del prospecto que ya se analizaron (los
// vio un coaching que respondió, o el cierre). El informe solo analiza el
// último mensaje del prospecto si todavía no está aquí.
export const createUrgencyState = () => ({ eventos: [], vigente: {}, valor: 0, maximo: 0, procesados: [] });

export const urgencyValue = (vigente) => Math.round(Object.entries(vigente || {})
  .reduce((sum, [senal, e]) => sum + (URGENCY_SIGNALS[senal] || 0) * (URGENCY_POSTURES[e?.postura] ?? 0), 0));

const order = (a, b) => (a.mensaje - b.mensaje) || (a.posicion - b.posicion);
const sameEvent = (a, b) => a.senal === b.senal && a.mensaje === b.mensaje && normLit(a.cita) === normLit(b.cita);
// Tramo de la frase en el mensaje normalizado (posicion apunta al espacio previo).
function overlaps(a, b) {
  if (a.mensaje !== b.mensaje) return false;
  const end = (e) => e.posicion + normLit(e.cita).length + 1;
  return a.posicion < end(b) && b.posicion < end(a);
}

// Agrega eventos verificados y recalcula la postura vigente de cada señal
// recorriendo la conversación en orden: la última postura gana. El historial
// nunca se borra. El máximo se mide al terminar cada MENSAJE (no tras cada
// frase: dentro de un mismo mensaje no hay estados intermedios; ronda 7, U02).
// Una frase que se superpone con otra ya registrada de otra señal no suma.
export const applyUrgencyEvents = (state, events) => {
  const base = state && Array.isArray(state.eventos) ? state : createUrgencyState();
  const eventos = [...base.eventos];
  for (const e of events || []) {
    const i = eventos.findIndex((x) => sameEvent(x, e));
    if (i >= 0) { eventos[i] = e; continue; }
    if (eventos.some((x) => x.senal !== e.senal && overlaps(x, e))) continue;
    eventos.push(e);
  }
  eventos.sort(order);
  const vigente = {};
  let maximo = 0;
  eventos.forEach((e, i) => {
    vigente[e.senal] = { postura: e.postura, cita: e.cita, mensaje: e.mensaje };
    if (eventos[i + 1]?.mensaje !== e.mensaje) maximo = Math.max(maximo, urgencyValue(vigente));
  });
  return { eventos, vigente, valor: urgencyValue(vigente), maximo, procesados: [...(base.procesados || [])] };
};

// Marca un mensaje del prospecto como analizado.
export const markProcessed = (state, index) => {
  const base = state && Array.isArray(state.eventos) ? state : createUrgencyState();
  if (!Number.isInteger(index) || (base.procesados || []).includes(index)) return base;
  return { ...base, procesados: [...(base.procesados || []), index].sort((a, b) => a - b) };
};

// Estado completo a partir de una lista de eventos.
export const rebuildUrgency = (events) => applyUrgencyEvents(createUrgencyState(), events);
