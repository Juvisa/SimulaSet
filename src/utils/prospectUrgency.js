// Urgencia del prospecto (Inbound — Primer contacto). Decisión de Digital SET
// (01/11/2026, opción A): mide la urgencia AUTÉNTICA que el prospecto siente
// y expresa —su problema, las consecuencias, el costo de seguir postergando,
// su prioridad temporal y su motivación—, no la presión del setter.
//
// La IA (el coaching de cada turno y una extracción al cerrar) señala eventos
// con la frase del prospecto y su postura; este módulo decide:
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
// Devuelve los aceptados (con la postura ya ajustada) y los descartados con su motivo.
export const verifyUrgencyEvents = (events, { message, index, afterPressure = false, origen = 'turno' }) => {
  const accepted = [];
  const rejected = [];
  for (const e of events) {
    const posicion = literalPosition(e.cita, message);
    if (posicion < 0) { rejected.push({ ...e, motivo: 'no_esta_en_el_mensaje' }); continue; }
    let { postura } = e;
    let ajuste = null;
    const context = withContext(e.cita, message, posicion);
    if (postura !== 'niega' && deniesUrgency(context)) {
      const mixed = affirmsBeyondDenial(context);
      const next = postura === 'afirma' && mixed ? 'matiza' : 'niega';
      if (next !== postura) { ajuste = `${postura}→${next}:negacion`; postura = next; }
    }
    if (postura !== 'niega' && afterPressure) { rejected.push({ ...e, motivo: 'tras_afirmacion_no_documentada' }); continue; }
    accepted.push({ senal: e.senal, postura, cita: e.cita, mensaje: index, posicion, origen, ...(ajuste ? { ajuste } : {}) });
  }
  return { accepted, rejected };
};

export const createUrgencyState = () => ({ eventos: [], vigente: {}, valor: 0, maximo: 0 });

export const urgencyValue = (vigente) => Math.round(Object.entries(vigente || {})
  .reduce((sum, [senal, e]) => sum + (URGENCY_SIGNALS[senal] || 0) * (URGENCY_POSTURES[e?.postura] ?? 0), 0));

const order = (a, b) => (a.mensaje - b.mensaje) || (a.posicion - b.posicion);
const sameEvent = (a, b) => a.senal === b.senal && a.mensaje === b.mensaje && normLit(a.cita) === normLit(b.cita);

// Agrega eventos verificados y recalcula la postura vigente de cada señal
// recorriendo la conversación en orden: la última postura gana. El historial
// nunca se borra; el máximo es el mayor valor que alcanzó en ese recorrido.
export const applyUrgencyEvents = (state, events) => {
  const base = state && Array.isArray(state.eventos) ? state : createUrgencyState();
  const eventos = [...base.eventos];
  for (const e of events || []) {
    const i = eventos.findIndex((x) => sameEvent(x, e));
    if (i >= 0) eventos[i] = e; else eventos.push(e);
  }
  eventos.sort(order);
  const vigente = {};
  let maximo = 0;
  for (const e of eventos) {
    vigente[e.senal] = { postura: e.postura, cita: e.cita, mensaje: e.mensaje };
    maximo = Math.max(maximo, urgencyValue(vigente));
  }
  return { eventos, vigente, valor: urgencyValue(vigente), maximo };
};

// Estado completo a partir de una lista de eventos (la extracción del cierre).
export const rebuildUrgency = (events) => applyUrgencyEvents(createUrgencyState(), events);
