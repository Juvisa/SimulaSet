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
  isEcho,
  isPriceDocumented,
  normalizePrimerContactoProfile,
  RESISTANCE_RULES,
  sanitizeCoaching,
} from './primerContacto.js';
import {
  checkProspectReply, createControlState, fallbackFor, planTurn, resolveTurn,
} from './primerContactoControl.js';

// Mismas operaciones y modelo que hoy (lista cerrada del servidor): el
// prospecto y el coaching van por simulator_turn (Haiku, tope 800) con topes
// menores, y el perfil por simulator_prospect (Haiku, 500).
export const PROFILE_OPTIONS = Object.freeze({ model: 'haiku', maxTokens: 500, operation: 'simulator_prospect' });
export const PROSPECT_TURN_OPTIONS = Object.freeze({ model: 'haiku', maxTokens: 300, operation: 'simulator_turn' });
export const COACH_TURN_OPTIONS = Object.freeze({ model: 'haiku', maxTokens: 450, operation: 'simulator_turn' });

const ECHO_RETRY_INSTRUCTION = 'IMPORTANTE: tu respuesta anterior repetía el mensaje del setter. No lo repitas: responde con tus propias palabras a lo que te dijo.';
const ACCEPT_RETRY_INSTRUCTION = 'IMPORTANTE: tu respuesta anterior aceptaba la cita, pero en este turno NO puedes aceptarla (mira la SITUACIÓN DE ESTE TURNO). Responde de nuevo, con naturalidad, sin aceptarla.';
const FAREWELL_RETRY_INSTRUCTION = 'IMPORTANTE: en este turno te despides y cierras la conversación; tu respuesta anterior no lo hacía. Responde de nuevo con una despedida cortés.';
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

const lastProspectText = (history) => [...visible(history)].reverse().find((m) => m.role === 'prospect')?.content || '';
const retryReasons = (raw, plan, control, profile, setterText) => {
  const issues = checkProspectReply(raw, plan, control, profile);
  if (isEcho(raw?.respuesta_prospecto, setterText)) issues.push('eco');
  if (plan.despedida && raw?.estado_lead !== 'cerrado') issues.push('sin_despedida');
  return issues;
};
const retryInstruction = (issues, profile) => {
  const parts = [];
  if (issues.includes('eco')) parts.push(ECHO_RETRY_INSTRUCTION);
  if (issues.some((i) => i.startsWith('aceptacion_no_permitida'))) parts.push(ACCEPT_RETRY_INSTRUCTION);
  if (issues.includes('sin_despedida')) parts.push(FAREWELL_RETRY_INSTRUCTION);
  if (issues.some((i) => i.startsWith('largo:'))) parts.push(lengthRetryInstruction((RESISTANCE_RULES[profile.resistencia] || RESISTANCE_RULES.media).maxPalabras));
  return parts.join('\n');
};

// Prospecto: conoce su perfil. Antes de llamarlo, el código calcula la
// situación del turno (evasivas, presión, si puede aceptar una cita) y se la
// indica. Si la respuesta repite al alumno (C5), acepta una cita que el plan
// no permite, no se despide cuando debe o es demasiado larga, se pide UNA vez
// más con la corrección. Si tras el reintento sigue aceptando una cita no
// permitida, se usa una respuesta de respaldo: nunca se registra esa cita.
// El estado y el desenlace salen de resolveTurn (C4 y control de estados).
export const runProspectTurn = async ({ call, project, profile, history, setterText, control }) => {
  const state = control || createControlState(profile);
  const plan = planTurn(state, { project, profile, lastProspectText: lastProspectText(history), setterText });
  const system = buildPrimerContactoSystemPrompt(project, profile, plan);
  const messages = [...toProspectHistory(history), { role: 'user', content: setterText }];
  let raw = await call(system, messages, PROSPECT_TURN_OPTIONS);
  const firstIssues = retryReasons(raw, plan, state, profile, setterText);
  let retried = false;
  let issues = firstIssues;
  if (firstIssues.length) {
    retried = true;
    raw = await call(`${system}\n${retryInstruction(firstIssues, profile)}`, messages, PROSPECT_TURN_OPTIONS);
    issues = retryReasons(raw, plan, state, profile, setterText);
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
  const resolved = resolveTurn(state, plan, raw, profile);
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
    prospectIssues: [...firstIssues.map((i) => `intento1:${i}`), ...(retried ? issues.map((i) => `intento2:${i}`) : []), ...resolved.issues],
    fallback,
    echo: isEcho(text, setterText),
    echoRetried: retried && firstIssues.includes('eco'),
    retried,
  };
};

// Lo que se guarda del plan para revisar el turno (sin el texto del alumno).
const summarizePlan = (p) => ({
  evasion: p.evasion, evasivas: p.evasivas, presion: p.presion, presiones: p.presiones, propone: p.propone, pitch: p.pitch,
  despedida: p.despedida, puedeAceptar: p.puedeAceptar, bloqueos: p.bloqueos, requiereEvidencia: p.requiereEvidencia,
});

// Coaching: NO recibe el perfil privado ni la respuesta nueva del prospecto
// (C2 y evaluación con lo que el alumno sabía). Si la puntuación no es un
// entero de 1 a 10, se pide una vez más; si sigue inválida, el turno queda sin
// puntuación (no se inventa un número) (C3). Lo copiable no puede afirmar
// condiciones no documentadas (C1).
export const runCoachTurn = async ({ call, project, history, setterText }) => {
  const system = buildPrimerContactoCoachPrompt(project);
  const messages = [{ role: 'user', content: buildPrimerContactoCoachMessage(visible(history), setterText) }];
  const conversationText = [...visible(history).map((m) => m.content), setterText].join('\n');
  const first = sanitizeCoaching(await call(system, messages, COACH_TURN_OPTIONS), project, conversationText);
  if (first.coaching && first.coaching.puntuacion_mensaje !== null) return { ...first, retried: false };
  const second = sanitizeCoaching(await call(`${system}\n${SCORE_RETRY_INSTRUCTION}`, messages, COACH_TURN_OPTIONS), project, conversationText);
  const issues = [...first.issues, ...second.issues.map((i) => `reintento:${i}`)];
  return { coaching: second.coaching || first.coaching, issues, retried: true };
};

// Un turno: prospecto y coaching arrancan a la vez y se entregan por
// separado, para que la pantalla muestre al prospecto apenas llega (≈1,3 s
// en la ronda 2) y agregue el coaching cuando termine (≈3,2 s). `coach` nunca
// rechaza: si falla, el turno queda sin coaching ni puntuación.
export const startPrimerContactoTurn = ({ call, project, profile, history, setterText, control }) => {
  const prospect = runProspectTurn({ call, project, profile, history, setterText, control });
  const coach = runCoachTurn({ call, project, history, setterText })
    .then((value) => ({ coaching: value.coaching, coachingIssues: value.issues, coachingRetried: value.retried }))
    .catch((err) => ({ coaching: null, coachingIssues: [`coaching_error:${err?.message || err}`], coachingRetried: false }));
  return { prospect, coach };
};

// El turno completo de una vez (lo usan las pruebas y el script de
// validación). Si falla el prospecto, el turno falla; si falla el coaching,
// el alumno igual ve al prospecto.
export const runPrimerContactoTurn = async (args) => {
  const { prospect, coach } = startPrimerContactoTurn(args);
  const [p, c] = await Promise.allSettled([prospect, coach]);
  if (p.status === 'rejected') throw p.reason;
  return { ...p.value, ...c.value };
};
