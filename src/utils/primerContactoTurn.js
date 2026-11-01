// Flujo de Inbound — Primer contacto con la IA, independiente de la pantalla:
// generación del perfil privado y cada turno (prospecto + coaching). Recibe la
// función de llamada como parámetro — en la aplicación es callClaude (que pasa
// por /api/anthropic con la sesión del alumno); en las pruebas, un simulador o
// el script de validación local. Así la app y las pruebas ejecutan el mismo código.
//
// Contrato de `call(systemPrompt, messages, options)`: devuelve el JSON ya
// interpretado o lanza un error (igual que callClaude).
import {
  buildPrimerContactoCoachMessage,
  buildPrimerContactoCoachPrompt,
  buildPrimerContactoSystemPrompt,
  buildPrimerContactoUrgencyMessage,
  PRIMER_CONTACTO_URGENCY_SYSTEM,
} from './prompts.js';
import {
  applyUrgencyEvents, createUrgencyState, markProcessed, sanitizeUrgencyEvents, verifyUrgencyEvents,
} from './prospectUrgency.js';
import {
  drawProfileSeeds,
  buildPrimerContactoProfilePrompt,
  findContactData,
  isEcho,
  isPriceDocumented,
  normalizePrimerContactoProfile,
  RESISTANCE_RULES,
  redactContactData,
  sanitizeCoaching,
} from './primerContacto.js';
import {
  amountsIn, applyCoachInvention, applyDiscovery, checkProspectReply, classifyPriceAnswer, createControlState, fallbackFor, mentionsCommercialTerms,
  normalizeAcceptance, planTurn, priceAmountsIn, resolveTurn, setterClaimsOf, verifyCoachInvention, verifyDiscovery,
} from './primerContactoControl.js';

// Mismas operaciones y modelo que hoy (lista cerrada del servidor): el
// prospecto y el coaching van por simulator_turn (Haiku, tope 800) con topes
// menores, y el perfil por simulator_prospect (Haiku, 500). El coaching subió
// de 450 a 550 por las citas del descubrimiento (en la ronda 3, 2 de 71
// respuestas llegaron a 450).
export const PROFILE_OPTIONS = Object.freeze({ model: 'haiku', maxTokens: 500, operation: 'simulator_prospect' });
export const PROSPECT_TURN_OPTIONS = Object.freeze({ model: 'haiku', maxTokens: 300, operation: 'simulator_turn' });
// 650: el coaching ahora también devuelve las frases de urgencia (antes 550).
export const COACH_TURN_OPTIONS = Object.freeze({ model: 'haiku', maxTokens: 650, operation: 'simulator_turn' });
// Urgencia al cerrar: como mucho una llamada por sesión, solo con la última
// respuesta del prospecto (en la ronda 7, la conversación entera usó ~276 tokens).
export const URGENCY_EXTRACTION_OPTIONS = Object.freeze({ model: 'haiku', maxTokens: 300, operation: 'simulator_turn' });

const ECHO_RETRY_INSTRUCTION = 'IMPORTANTE: tu respuesta anterior repetía el mensaje del setter. No lo repitas: responde con tus propias palabras a lo que te dijo.';
const ACCEPT_RETRY_INSTRUCTION = 'IMPORTANTE: tu respuesta anterior aceptaba la cita, pero en este turno NO puedes aceptarla (mira la SITUACIÓN DE ESTE TURNO). Responde de nuevo, con naturalidad, sin aceptarla.';
const FAREWELL_RETRY_INSTRUCTION = 'IMPORTANTE: en este turno te despides y cierras la conversación; tu respuesta anterior no lo hacía. Responde de nuevo con una despedida cortés.';
const CONTACT_RETRY_INSTRUCTION = 'IMPORTANTE: no escribas teléfonos, correos, direcciones ni enlaces (es una práctica con personajes ficticios). Si te piden un dato de contacto, di que prefieres seguir por este chat.';
const MONEY_RETRY_INSTRUCTION = 'IMPORTANTE: usaste una cifra de dinero que nadie dijo y que no está en tu perfil. No conviertas monedas ni inventes montos: usa solo tus propias cifras o las que dijo el setter.';
const lengthRetryInstruction = (max) => `IMPORTANTE: tu respuesta anterior era demasiado larga. Escribe como en un chat: máximo ${max} palabras.`;
const SCORE_RETRY_INSTRUCTION = 'IMPORTANTE: "puntuacion_mensaje" debe ser un número entero de 1 a 10 coherente con tu feedback. Nunca 0.';

// ─── Perfil ────────────────────────────────────────────────────────────────
// Si al perfil le faltan campos esenciales (por ejemplo, porque la respuesta se
// cortó en los 500 tokens), se pide una vez más; si sigue incompleto, la
// simulación no arranca con un prospecto vacío. isFatal decide qué errores se
// propagan sin reintentar (en la app, los rechazos del servidor).
export const generatePrimerContactoProfile = async ({ call, project, config, random = Math.random, overrides, isFatal = () => false }) => {
  const seeds = drawProfileSeeds({ ...config, priceDocumented: isPriceDocumented(project) }, random, overrides);
  const prompt = buildPrimerContactoProfilePrompt(project, config, seeds);
  const attempts = [];
  let profile = null;
  for (let i = 0; i < 2 && (!profile || profile.campos_faltantes.length); i += 1) {
    try {
      const raw = await call(undefined, [{ role: 'user', content: prompt }], PROFILE_OPTIONS);
      attempts.push(raw);
      profile = normalizePrimerContactoProfile(raw, seeds);
    } catch (err) {
      if (isFatal(err)) throw err;
      attempts.push({ error: err?.message || String(err) });
      profile = null;
    }
  }
  if (!profile || profile.campos_faltantes.length) {
    const error = new Error('Perfil inválido');
    error.attempts = attempts;
    throw error;
  }
  return { ...profile, temperatura: config.temperatura, canal: config.canal, resistencia: config.resistencia, seeds, attempts: attempts.length };
};

// ─── Turno ─────────────────────────────────────────────────────────────────
const visible = (messages) => (messages || []).filter((m) => (m.role === 'prospect' || m.role === 'setter') && m.content);
export const toProspectHistory = (messages) => visible(messages)
  .map((m) => ({ role: m.role === 'prospect' ? 'assistant' : 'user', content: m.content }));
const prospectTexts = (history) => visible(history).filter((m) => m.role === 'prospect').map((m) => m.content);
const lastProspectText = (history) => prospectTexts(history).at(-1) || '';

// Cifras de dinero que el prospecto usa sin respaldo: no las dijo nadie en la
// conversación ni están en su perfil (ronda 3, R09: «dieciocho mil pesos»,
// una conversión de moneda inventada). Se pide la respuesta de nuevo una vez;
// no se reemplaza (puede ser un dato propio mal expresado).
// Las cifras de su propia historia no cuentan (ronda 4, C10: «gasté unos
// 2.000 USD con la agencia», en respuesta a una pregunta del alumno, provocó
// dos reintentos): lo que gastó, invirtió, perdió, factura o cobra él.
const OWN_MONEY = /\b(gaste|gastamos|gastado|invert[ií]|invertimos|invertido|pague|pagamos|pagaba|perdi|perdimos|me costo|nos costo|factur\w+|gano|ganamos|ganaba|cobro|cobramos|cobraba|ingres\w+|vend[ií]\w*)\b/;
const normPlain = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const unsupportedMoney = (text, conversationText, profile) => {
  const known = amountsIn(`${conversationText}\n${JSON.stringify(profile || {})}`).filter((n) => n >= 10);
  const offerSentences = String(text || '').split(/(?<=[.!?\n])\s+/).filter((s) => !OWN_MONEY.test(normPlain(s))).join(' ');
  return priceAmountsIn(offerSentences).map(({ n }) => n).filter((n) => !known.some((k) => Math.abs(n - k) / k <= 0.02));
};

const retryInstruction = (issues, profile) => {
  const parts = [];
  if (issues.includes('eco')) parts.push(ECHO_RETRY_INSTRUCTION);
  if (issues.some((i) => i.startsWith('aceptacion_no_permitida'))) parts.push(ACCEPT_RETRY_INSTRUCTION);
  if (issues.includes('sin_despedida')) parts.push(FAREWELL_RETRY_INSTRUCTION);
  if (issues.includes('contacto')) parts.push(CONTACT_RETRY_INSTRUCTION);
  if (issues.includes('cifra_sin_respaldo')) parts.push(MONEY_RETRY_INSTRUCTION);
  if (issues.some((i) => i.startsWith('largo:'))) parts.push(lengthRetryInstruction((RESISTANCE_RULES[profile.resistencia] || RESISTANCE_RULES.media).maxPalabras));
  return parts.join('\n');
};
const awaitsDiscovery = (issues) => issues.includes('aceptacion_no_permitida:descubrimiento_no_verificado');

// Prospecto: conoce su perfil. Antes de llamarlo, el código calcula la
// situación del turno (evasivas, presión, si puede aceptar una cita) y se la
// indica. Si la respuesta repite al alumno (C5), acepta una cita que el plan
// no permite, no se despide cuando debe, escribe datos de contacto, usa una
// cifra de dinero sin respaldo o es demasiado larga, se pide UNA vez más con
// la corrección. Si tras el reintento sigue aceptando una cita no permitida,
// se usa una respuesta de respaldo: nunca se registra esa cita.
//
// Descubrimiento (F1): para registrar una cita, la situación y el motivo
// deben estar confirmados con citas de los mensajes del prospecto. Si el
// prospecto acepta y todavía no están confirmados, se espera el coaching de
// este mismo turno (`awaitDiscovery`, que trae esas citas verificadas) antes
// de decidir. Solo en ese caso el prospecto se muestra más tarde.
export const runProspectTurn = async ({ call, project, profile, history, setterText, control, awaitDiscovery }) => {
  let state = control || createControlState(profile);
  const conversationText = visible(history).map((m) => m.content).join('\n');
  const plan = planTurn(state, { project, profile, lastProspectText: lastProspectText(history), setterText, conversationText });
  const system = buildPrimerContactoSystemPrompt(project, profile, plan);
  const messages = [...toProspectHistory(history), { role: 'user', content: setterText }];
  const check = (r) => {
    const issues = checkProspectReply(r, plan, state, profile, project);
    if (isEcho(r?.respuesta_prospecto, setterText)) issues.push('eco');
    if (plan.despedida && r?.estado_lead !== 'cerrado') issues.push('sin_despedida');
    if (findContactData(r?.respuesta_prospecto).length) issues.push('contacto');
    if (unsupportedMoney(r?.respuesta_prospecto, `${conversationText}\n${setterText}`, profile).length) issues.push('cifra_sin_respaldo');
    return issues;
  };
  // Si falta confirmar el descubrimiento, se espera (una vez) al coaching de
  // este turno y se vuelve a revisar con lo que confirme.
  let awaited = false;
  const checkAndConfirm = async (r) => {
    const issues = check(r);
    if (awaited || !awaitDiscovery || !awaitsDiscovery(issues)) return issues;
    awaited = true;
    state = applyDiscovery(state, await awaitDiscovery(), plan.turno);
    return check(r);
  };

  // Aceptación con día y hora (decisión del 30/10): si el texto acepta un día
  // y una hora sin condición previa, cuenta como «si» aunque el modelo diga
  // «condicionada» (y al revés). El cambio pasa por las mismas reglas; si el
  // plan no permite la cita, queda lo que respondió el modelo, sin reintento.
  const acceptanceNotes = [];
  const withAcceptance = async (r) => {
    const value = normalizeAcceptance(r);
    if (!r || value === r.acepta_cita) return { raw: r, issues: await checkAndConfirm(r) };
    const candidate = { ...r, acepta_cita: value, estado_lead: value === 'si' ? 'pidio_llamada' : r.estado_lead === 'pidio_llamada' ? 'interesado' : r.estado_lead };
    const candidateIssues = await checkAndConfirm(candidate);
    if (value === 'si' && candidateIssues.some((i) => i.startsWith('aceptacion_no_permitida'))) {
      acceptanceNotes.push(`aceptacion_con_horario_no_permitida:${r.acepta_cita}`);
      return { raw: r, issues: check(r) };
    }
    acceptanceNotes.push(`aceptacion_normalizada:${r.acepta_cita}->${value}`);
    return { raw: candidate, issues: candidateIssues };
  };

  let first = await withAcceptance(await call(system, messages, PROSPECT_TURN_OPTIONS));
  let raw = first.raw;
  const firstIssues = first.issues;
  let retried = false;
  let issues = firstIssues;
  if (firstIssues.length) {
    retried = true;
    first = await withAcceptance(await call(`${system}\n${retryInstruction(firstIssues, profile)}`, messages, PROSPECT_TURN_OPTIONS));
    raw = first.raw;
    issues = first.issues;
  }
  let text = typeof raw?.respuesta_prospecto === 'string' ? raw.respuesta_prospecto.trim() : '';
  if (!text) throw new Error('Respuesta inválida de la IA');
  let fallback = null;
  if (issues.some((i) => i.startsWith('aceptacion_no_permitida'))) {
    const f = fallbackFor(plan, issues);
    fallback = f.key;
    raw = f.reply;
    text = f.reply.respuesta_prospecto;
  }
  // F3: si después del reintento sigue habiendo datos de contacto, se reemplazan.
  const redacted = findContactData(text).length > 0;
  if (redacted) text = redactContactData(text);
  const resolved = resolveTurn(state, plan, raw, profile, project);
  return {
    respuesta_prospecto: text,
    acepta_cita: resolved.acepta_cita,
    acepta_cita_modelo: raw.acepta_cita,
    estado_modelo: raw.estado_lead,
    estado_lead: resolved.estado_lead,
    desenlace: resolved.desenlace,
    control: resolved.control,
    plan: summarizePlan(plan),
    revela: raw.revela,
    cambio_encaje: raw.cambio_encaje || '',
    prospectIssues: [
      ...firstIssues.map((i) => `intento1:${i}`), ...(retried ? issues.map((i) => `intento2:${i}`) : []),
      ...resolved.issues, ...(redacted ? ['contacto_reemplazado'] : []), ...(awaited ? ['espero_coaching'] : []),
      ...acceptanceNotes,
    ],
    fallback,
    echo: isEcho(text, setterText),
    echoRetried: retried && firstIssues.includes('eco'),
    retried,
    awaitedCoach: awaited,
  };
};

// Lo que se guarda del plan para revisar el turno (sin el texto del alumno).
const summarizePlan = (p) => ({
  evasion: p.evasion, evasivas: p.evasivas, preguntasPrecio: p.preguntasPrecio, precioExactitud: p.precioExactitud,
  presion: p.presion, presiones: p.presiones, propone: p.propone, pitch: p.pitch,
  despedida: p.despedida, puedeAceptar: p.puedeAceptar, bloqueos: p.bloqueos, requiereEvidencia: p.requiereEvidencia,
});

// F5: lo que el alumno afirma sin respaldo se penaliza siempre, con un tope
// determinista de 3: garantías, devoluciones, escasez, cifras comerciales no
// documentadas y precios incorrectos o inventados. En todo lo demás la nota
// la decide el coaching (no se fuerza ninguna distribución).
export const UNDOCUMENTED_CLAIM_MAX_SCORE = 3;
// Metodología SET (02/11/2026): revelar el precio documentado por chat tiene
// como máximo 5 en ese turno (la nota global no se limita).
export const PRICE_REVEAL_MAX_SCORE = 5;
const PRICE_REVEAL_ALERT = 'El precio y la propuesta comercial los presenta el especialista: no los reveles por chat.';
const revealsPrice = (setterText, project, priorText) => isPriceDocumented(project)
  && ['exacta', 'aproximada'].includes(classifyPriceAnswer(setterText, project, { conversationText: priorText }).exactitud);
export const setterClaims = (setterText, project, priorText) => setterClaimsOf(setterText, project, priorText).map((c) => c.texto);

// Lo que el código ya decidió sobre el precio de este mensaje, para que el
// coaching no lo contradiga (ronda 5, C07: «ronda los 2 mil» es una
// aproximación válida para el código y el coaching pidió «rectifica ya»).
export const priceNoteFor = (setterText, project, priorText) => {
  if (!isPriceDocumented(project)) return '';
  const { exactitud } = classifyPriceAnswer(setterText, project, { conversationText: priorText });
  if (exactitud === 'exacta' || exactitud === 'aproximada') return 'El alumno revela el precio (o un rango) por chat: en Primer contacto la propuesta comercial la presenta el especialista. Señálalo y puntúa como máximo 5.';
  if (exactitud === 'incorrecta') return 'El precio que da el alumno en este mensaje NO coincide con el documentado: es un error grave.';
  return '';
};

// El coaching del mismo turno dice que el motivo todavía no se descubrió: su
// cita de «motivo» no puede valer (ronda 5, C02). Solo frases inequívocas.
const SAYS_NO_MOTIVE = /sin (haber )?(descubierto|conocer|saber|entender) (el |su |por que |por qu[eé] )?(motivo|escrib)|no (descubri[oó]|descubriste|conoce|conoces|sabe|sabes) (el |su )?motivo|falta (descubrir )?(el |su )?motivo/i;

// ─── Urgencia del prospecto ────────────────────────────────────────────────
// ¿El mensaje del alumno justo anterior al mensaje del prospecto `index`
// afirmó algo no documentado (cifras, garantías, promesas, escasez…)? Lo que
// el prospecto responda a eso no cuenta como urgencia auténtica.
const pressureBefore = (shown, index, project, control) => {
  const prevIdx = shown.slice(0, index).map((m) => m.role).lastIndexOf('setter');
  if (prevIdx < 0) return false;
  const prior = shown.slice(0, prevIdx).map((m) => m.content).join('\n');
  if (setterClaimsOf(shown[prevIdx].content, project, prior).length) return true;
  // Características inventadas sin cifras que el coaching de ese turno señaló.
  const turno = shown.slice(0, prevIdx + 1).filter((m) => m.role === 'setter').length;
  return (control?.invenciones || []).some((c) => c.turno === turno && /característica no documentada/.test(c.texto));
};

// Eventos de urgencia del ÚLTIMO mensaje del prospecto que ve el coaching
// (la respuesta al mensaje anterior del alumno: no rompe la regla C2).
// `index` es el mensaje analizado: queda marcado como procesado aunque no
// tenga señales (applyCoachResult), para que el cierre no lo vuelva a mirar.
const urgencyFromCoach = (raw, history, project, control) => {
  const shown = visible(history);
  const index = shown.map((m) => m.role).lastIndexOf('prospect');
  if (index < 0) return { accepted: [], rejected: [], index: null };
  return {
    ...verifyUrgencyEvents(sanitizeUrgencyEvents(raw?.urgencia), {
      message: shown[index].content, index, afterPressure: pressureBefore(shown, index, project, control),
    }),
    index,
  };
};

// Urgencia al cerrar (decisión del 01/11/2026 tras la ronda 7): el informe
// conserva el estado verificado durante la sesión y analiza ÚNICAMENTE la
// última respuesta del prospecto, si ningún coaching la analizó. No
// reinterpreta la conversación. Si no hay nada pendiente, no llama a la IA.
// Devuelve el estado de la sesión con lo nuevo agregado y `cierre` (qué
// mensaje se analizó y qué frases se aceptaron o descartaron, como evidencia).
// Lanza si la IA no responde algo utilizable; quien la llama conserva el estado.
export const runPendingUrgency = async ({ call, project, history, urgency, invenciones = [] }) => {
  const shown = visible(history);
  const state = urgency && Array.isArray(urgency.eventos) ? urgency : createUrgencyState();
  const index = shown.map((m) => m.role).lastIndexOf('prospect');
  if (index < 0 || (state.procesados || []).includes(index)) return { ...state, cierre: null };
  const raw = await call(PRIMER_CONTACTO_URGENCY_SYSTEM, [{ role: 'user', content: buildPrimerContactoUrgencyMessage(shown, index, state.vigente) }], URGENCY_EXTRACTION_OPTIONS);
  if (!raw || !Array.isArray(raw.urgencia)) throw new Error('Análisis de urgencia inválido');
  const { accepted, rejected } = verifyUrgencyEvents(sanitizeUrgencyEvents(raw.urgencia), {
    message: shown[index].content, index, afterPressure: pressureBefore(shown, index, project, { invenciones }), origen: 'cierre',
  });
  const next = markProcessed(applyUrgencyEvents(state, accepted), index);
  return { ...next, cierre: { mensaje: index, aceptadas: accepted, descartadas: rejected } };
};

// Lo que muestra la pantalla: el valor lo calcula el código (no la IA).
export const urgencyOf = (control) => (control?.urgencia || createUrgencyState());
export const coachingWithUrgency = (coaching, control) => (coaching ? { ...coaching, nivel_fomo: urgencyOf(control).valor } : coaching);

// Coaching: NO recibe el perfil privado ni la respuesta nueva del prospecto
// (C2 y evaluación con lo que el alumno sabía). Si la puntuación no es un
// entero de 1 a 10, se pide una vez más; si sigue inválida, el turno queda sin
// puntuación (no se inventa un número) (C3). Lo copiable no puede afirmar
// condiciones no documentadas (C1). También devuelve las citas del
// descubrimiento, verificadas contra los mensajes del prospecto (F1).
export const runCoachTurn = async ({ call, project, history, setterText, control = null }) => {
  const system = buildPrimerContactoCoachPrompt(project);
  const priorText = visible(history).map((m) => m.content).join('\n');
  const messages = [{ role: 'user', content: buildPrimerContactoCoachMessage(visible(history), setterText, priceNoteFor(setterText, project, priorText)) }];
  const conversationText = `${priorText}\n${setterText}`;
  let raw = await call(system, messages, COACH_TURN_OPTIONS);
  let result = sanitizeCoaching(raw, project, conversationText);
  let retried = false;
  let issues = result.issues;
  if (!result.coaching || result.coaching.puntuacion_mensaje === null) {
    retried = true;
    const rawSecond = await call(`${system}\n${SCORE_RETRY_INSTRUCTION}`, messages, COACH_TURN_OPTIONS);
    const second = sanitizeCoaching(rawSecond, project, conversationText);
    issues = [...result.issues, ...second.issues.map((i) => `reintento:${i}`)];
    if (second.coaching) { result = second; raw = rawSecond; }
  }
  const coaching = result.coaching;
  // Invenciones sin cifra (decisión del 30/10): las señala el coaching con la
  // frase del alumno; el código solo las acepta si están en el mensaje y no
  // son lo documentado.
  const invencion = verifyCoachInvention(raw?.afirmacion_no_documentada, setterText, project);
  const claims = [...setterClaims(setterText, project, priorText), ...(invencion ? [`característica no documentada «${invencion}»`] : [])];
  if (coaching && claims.length) {
    if (coaching.puntuacion_mensaje !== null && coaching.puntuacion_mensaje > UNDOCUMENTED_CLAIM_MAX_SCORE) {
      issues = [...issues, `tope_${UNDOCUMENTED_CLAIM_MAX_SCORE}:${coaching.puntuacion_mensaje}`];
      coaching.puntuacion_mensaje = UNDOCUMENTED_CLAIM_MAX_SCORE;
    }
    if (!coaching.alerta) coaching.alerta = `Afirmaste algo que no está documentado: ${claims.join('; ')}.`;
  }
  if (coaching && !claims.length && revealsPrice(setterText, project, priorText)) {
    if (coaching.puntuacion_mensaje !== null && coaching.puntuacion_mensaje > PRICE_REVEAL_MAX_SCORE) {
      issues = [...issues, `tope_${PRICE_REVEAL_MAX_SCORE}:${coaching.puntuacion_mensaje}`];
      coaching.puntuacion_mensaje = PRICE_REVEAL_MAX_SCORE;
    }
    if (!coaching.alerta) coaching.alerta = PRICE_REVEAL_ALERT;
  }
  // Lo copiable nunca trae cifras ni condiciones comerciales, aunque estén documentadas.
  if (coaching?.mensaje_alternativo && mentionsCommercialTerms(coaching.mensaje_alternativo, project)) {
    issues = [...issues, 'mensaje_alternativo_descartado:precio'];
    coaching.mensaje_alternativo = '';
  }
  const discovery = verifyDiscovery(raw?.descubrimiento, prospectTexts(history));
  if (discovery.motivo && SAYS_NO_MOTIVE.test(`${raw?.que_mejorar || ''} ${raw?.alerta || ''}`)) {
    delete discovery.motivo;
    issues = [...issues, 'motivo_descartado:el_coaching_dice_que_falta'];
  }
  const urgencia = urgencyFromCoach(raw, history, project, control);
  if (urgencia.rejected.length) issues = [...issues, ...urgencia.rejected.map((e) => `urgencia_descartada:${e.motivo}:${e.senal}`)];
  return { coaching, issues, retried, claims, discovery, invencion, urgencyEvents: urgencia.accepted, urgencyIndex: urgencia.index };
};

// Un turno: el coaching arranca primero y el prospecto a la vez; se entregan
// por separado, para que la pantalla muestre al prospecto apenas llega
// (≈1,5 s en la ronda 3) y agregue el coaching cuando termine (≈3,4 s). Si el
// prospecto acepta una cita sin descubrimiento confirmado, espera las citas
// que trae el coaching de este turno. `coach` nunca rechaza: si falla, el
// turno queda sin coaching ni puntuación (y sin descubrimiento confirmado).
export const startPrimerContactoTurn = ({ call, project, profile, history, setterText, control }) => {
  const coach = runCoachTurn({ call, project, history, setterText, control })
    .then((value) => ({ coaching: value.coaching, coachingIssues: value.issues, coachingRetried: value.retried, setterClaims: value.claims, discovery: value.discovery, invencion: value.invencion, urgencyEvents: value.urgencyEvents || [], urgencyIndex: value.urgencyIndex ?? null }))
    .catch((err) => ({ coaching: null, coachingIssues: [`coaching_error:${err?.message || err}`], coachingRetried: false, setterClaims: [], discovery: {}, invencion: null, urgencyEvents: [], urgencyIndex: null }));
  const prospect = runProspectTurn({ call, project, profile, history, setterText, control, awaitDiscovery: () => coach.then((c) => c.discovery) });
  return { prospect, coach };
};

// El turno completo de una vez (lo usan las pruebas y el script de
// validación). Si falla el prospecto, el turno falla; si falla el coaching,
// el alumno igual ve al prospecto. El control devuelto ya incluye el
// descubrimiento confirmado por el coaching de este turno.
export const runPrimerContactoTurn = async (args) => {
  const { prospect, coach } = startPrimerContactoTurn(args);
  const [p, c] = await Promise.allSettled([prospect, coach]);
  if (p.status === 'rejected') throw p.reason;
  return { ...p.value, ...c.value, control: applyCoachResult(p.value.control, c.value) };
};

// Lo que el coaching de un turno agrega al control: el descubrimiento
// confirmado y la característica inventada que haya verificado. La pantalla
// lo aplica cuando llega el coaching (Simulator.jsx), antes del turno siguiente.
// También agrega la urgencia verificada del último mensaje del prospecto y lo
// marca como analizado (si el coaching falló, queda pendiente).
export const applyCoachResult = (control, coachResult, turno = control?.turno) => {
  const next = applyCoachInvention(
    applyDiscovery(control, coachResult?.discovery || {}, turno), coachResult?.invencion || null, turno,
  );
  if (!next) return next;
  const urgencia = applyUrgencyEvents(urgencyOf(next), coachResult?.urgencyEvents || []);
  return { ...next, urgencia: markProcessed(urgencia, coachResult?.urgencyIndex) };
};
