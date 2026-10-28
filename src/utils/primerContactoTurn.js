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
} from './prompts.js';
import {
  drawProfileSeeds,
  buildPrimerContactoProfilePrompt,
  findContactData,
  findUndocumentedClaims,
  isEcho,
  isPriceDocumented,
  normalizePrimerContactoProfile,
  RESISTANCE_RULES,
  redactContactData,
  sanitizeCoaching,
} from './primerContacto.js';
import {
  amountsIn, applyDiscovery, checkProspectReply, classifyPriceAnswer, createControlState, fallbackFor,
  planTurn, priceAmountsIn, resolveTurn, verifyDiscovery,
} from './primerContactoControl.js';

// Mismas operaciones y modelo que hoy (lista cerrada del servidor): el
// prospecto y el coaching van por simulator_turn (Haiku, tope 800) con topes
// menores, y el perfil por simulator_prospect (Haiku, 500). El coaching subió
// de 450 a 550 por las citas del descubrimiento (en la ronda 3, 2 de 71
// respuestas llegaron a 450).
export const PROFILE_OPTIONS = Object.freeze({ model: 'haiku', maxTokens: 500, operation: 'simulator_prospect' });
export const PROSPECT_TURN_OPTIONS = Object.freeze({ model: 'haiku', maxTokens: 300, operation: 'simulator_turn' });
export const COACH_TURN_OPTIONS = Object.freeze({ model: 'haiku', maxTokens: 550, operation: 'simulator_turn' });

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
export const unsupportedMoney = (text, conversationText, profile) => {
  const known = amountsIn(`${conversationText}\n${JSON.stringify(profile || {})}`).filter((n) => n >= 10);
  return priceAmountsIn(text).map(({ n }) => n).filter((n) => !known.some((k) => Math.abs(n - k) / k <= 0.02));
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
    state = applyDiscovery(state, await awaitDiscovery());
    return check(r);
  };

  let raw = await call(system, messages, PROSPECT_TURN_OPTIONS);
  const firstIssues = await checkAndConfirm(raw);
  let retried = false;
  let issues = firstIssues;
  if (firstIssues.length) {
    retried = true;
    raw = await call(`${system}\n${retryInstruction(firstIssues, profile)}`, messages, PROSPECT_TURN_OPTIONS);
    issues = await checkAndConfirm(raw);
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
export const setterClaims = (setterText, project, priorText) => {
  const claims = findUndocumentedClaims(setterText, project, priorText);
  const precio = classifyPriceAnswer(setterText, project, { conversationText: priorText });
  if (precio.exactitud === 'incorrecta') claims.push(`precio incorrecto (${precio.cifras.join(', ')}; documentado: ${project.price})`);
  if (precio.exactitud === 'inventada') claims.push(`precio inventado (${precio.cifras.join(', ')}; el proyecto no documenta precio)`);
  return claims;
};

// Coaching: NO recibe el perfil privado ni la respuesta nueva del prospecto
// (C2 y evaluación con lo que el alumno sabía). Si la puntuación no es un
// entero de 1 a 10, se pide una vez más; si sigue inválida, el turno queda sin
// puntuación (no se inventa un número) (C3). Lo copiable no puede afirmar
// condiciones no documentadas (C1). También devuelve las citas del
// descubrimiento, verificadas contra los mensajes del prospecto (F1).
export const runCoachTurn = async ({ call, project, history, setterText }) => {
  const system = buildPrimerContactoCoachPrompt(project);
  const messages = [{ role: 'user', content: buildPrimerContactoCoachMessage(visible(history), setterText) }];
  const priorText = visible(history).map((m) => m.content).join('\n');
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
  const claims = setterClaims(setterText, project, priorText);
  if (coaching && claims.length) {
    if (coaching.puntuacion_mensaje !== null && coaching.puntuacion_mensaje > UNDOCUMENTED_CLAIM_MAX_SCORE) {
      issues = [...issues, `tope_${UNDOCUMENTED_CLAIM_MAX_SCORE}:${coaching.puntuacion_mensaje}`];
      coaching.puntuacion_mensaje = UNDOCUMENTED_CLAIM_MAX_SCORE;
    }
    if (!coaching.alerta) coaching.alerta = `Afirmaste algo que no está documentado: ${claims.join('; ')}.`;
  }
  const discovery = verifyDiscovery(raw?.descubrimiento, prospectTexts(history));
  return { coaching, issues, retried, claims, discovery };
};

// Un turno: el coaching arranca primero y el prospecto a la vez; se entregan
// por separado, para que la pantalla muestre al prospecto apenas llega
// (≈1,5 s en la ronda 3) y agregue el coaching cuando termine (≈3,4 s). Si el
// prospecto acepta una cita sin descubrimiento confirmado, espera las citas
// que trae el coaching de este turno. `coach` nunca rechaza: si falla, el
// turno queda sin coaching ni puntuación (y sin descubrimiento confirmado).
export const startPrimerContactoTurn = ({ call, project, profile, history, setterText, control }) => {
  const coach = runCoachTurn({ call, project, history, setterText })
    .then((value) => ({ coaching: value.coaching, coachingIssues: value.issues, coachingRetried: value.retried, setterClaims: value.claims, discovery: value.discovery }))
    .catch((err) => ({ coaching: null, coachingIssues: [`coaching_error:${err?.message || err}`], coachingRetried: false, setterClaims: [], discovery: {} }));
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
  return { ...p.value, ...c.value, control: applyDiscovery(p.value.control, c.value.discovery) };
};
