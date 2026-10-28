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
  deriveLeadState,
  drawProfileSeeds,
  buildPrimerContactoProfilePrompt,
  isEcho,
  normalizePrimerContactoProfile,
  sanitizeCoaching,
} from './primerContacto.js';

// Mismas operaciones y modelo que hoy (lista cerrada del servidor): el
// prospecto y el coaching van por simulator_turn (Haiku, tope 800) con topes
// menores, y el perfil por simulator_prospect (Haiku, 500).
export const PROFILE_OPTIONS = Object.freeze({ model: 'haiku', maxTokens: 500, operation: 'simulator_prospect' });
export const PROSPECT_TURN_OPTIONS = Object.freeze({ model: 'haiku', maxTokens: 300, operation: 'simulator_turn' });
export const COACH_TURN_OPTIONS = Object.freeze({ model: 'haiku', maxTokens: 450, operation: 'simulator_turn' });

const ECHO_RETRY_INSTRUCTION = 'IMPORTANTE: tu respuesta anterior repetía el mensaje del setter. No lo repitas: responde con tus propias palabras a lo que te dijo.';
const SCORE_RETRY_INSTRUCTION = 'IMPORTANTE: "puntuacion_mensaje" debe ser un número entero de 1 a 10 coherente con tu feedback. Nunca 0.';

// ─── Perfil ────────────────────────────────────────────────────────────────
// Si al perfil le faltan campos esenciales (por ejemplo, porque la respuesta se
// cortó en los 500 tokens), se pide una vez más; si sigue incompleto, la
// simulación no arranca con un prospecto vacío. isFatal decide qué errores se
// propagan sin reintentar (en la app, los rechazos del servidor).
export const generatePrimerContactoProfile = async ({ call, project, config, random = Math.random, overrides, isFatal = () => false }) => {
  const seeds = drawProfileSeeds(config, random, overrides);
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

// Prospecto: conoce su perfil. Si repite el mensaje del alumno, se le pide
// una vez más (C5). El estado sale de la aceptación explícita (C4).
export const runProspectTurn = async ({ call, project, profile, history, setterText }) => {
  const system = buildPrimerContactoSystemPrompt(project, profile);
  const messages = [...toProspectHistory(history), { role: 'user', content: setterText }];
  let raw = await call(system, messages, PROSPECT_TURN_OPTIONS);
  let echoRetried = false;
  if (isEcho(raw?.respuesta_prospecto, setterText)) {
    echoRetried = true;
    raw = await call(`${system}\n${ECHO_RETRY_INSTRUCTION}`, messages, PROSPECT_TURN_OPTIONS);
  }
  const text = typeof raw?.respuesta_prospecto === 'string' ? raw.respuesta_prospecto.trim() : '';
  if (!text) throw new Error('Respuesta inválida de la IA');
  return {
    respuesta_prospecto: text,
    acepta_cita: raw.acepta_cita,
    estado_modelo: raw.estado_lead,
    estado_lead: deriveLeadState(raw.estado_lead, raw.acepta_cita),
    echo: isEcho(text, setterText),
    echoRetried,
  };
};

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

// Un turno completo: prospecto y coaching en paralelo. Si falla el coaching,
// el alumno igual ve la respuesta del prospecto (sin puntuación de ese turno).
export const runPrimerContactoTurn = async ({ call, project, profile, history, setterText }) => {
  const [prospect, coach] = await Promise.allSettled([
    runProspectTurn({ call, project, profile, history, setterText }),
    runCoachTurn({ call, project, history, setterText }),
  ]);
  if (prospect.status === 'rejected') throw prospect.reason;
  const coachValue = coach.status === 'fulfilled'
    ? coach.value
    : { coaching: null, issues: [`coaching_error:${coach.reason?.message || coach.reason}`], retried: false };
  return {
    ...prospect.value,
    coaching: coachValue.coaching,
    coachingIssues: coachValue.issues,
    coachingRetried: coachValue.retried,
  };
};
