// Validación de Inbound — Primer contacto con la IA real (Haiku), en local.
// TERCERA RONDA: control de estados conversacionales (evasivas, paciencia,
// descubrimiento, encaje y desenlaces) con alumno simulado dinámico.
//
// El prospecto y el coaching se ejecutan con el MISMO código de la aplicación
// (utils/primerContactoTurn.js y primerContactoControl.js: perfil, plan del
// turno, reintentos, respaldos y validaciones) y
// con los mismos parámetros que el servidor (/api/anthropic: modelo, tope de
// tokens por operación, prompt de sistema con caché, reintento de JSON). El
// alumno simulado es una llamada aparte a Haiku que solo ve lo documentado del
// proyecto y la conversación visible.
//
// Garantías:
//   - No importa ni usa Supabase: no lee ni escribe ningún dato de alumnos.
//   - La clave se lee SOLO de la variable de entorno SIMULASET_EVAL_ANTHROPIC_KEY
//     (clave de desarrollo). Nunca se imprime ni se guarda.
//   - Sin --run no hace ninguna llamada: construye los prompts y calcula el
//     presupuesto.
//   - Con --run se detiene antes de cualquier llamada que pudiera superar
//     --max-usd, calculado con el uso real devuelto por la API.
//   - Solo puede conectarse a api.anthropic.com y los resultados se escriben
//     fuera del repositorio.
//
// Uso (desde la raíz del repo):
//   node scripts/primer-contacto-eval/run.mjs                 # simulación, gratis
//   node scripts/primer-contacto-eval/run.mjs --run           # llamadas reales
//   Opciones: --max-usd 1.5  --only E01,E05  --no-profiles  --out <carpeta>
//   (--output-dir es sinónimo de --out; también se acepta --opcion=valor)
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { AI_OPERATIONS, MODELS } from '../../api/_anthropic/operations.js';
import {
  buildPrimerContactoCoachMessage, buildPrimerContactoCoachPrompt, buildPrimerContactoSystemPrompt,
} from '../../src/utils/prompts.js';
import {
  RESISTANCE_RULES, buildPrimerContactoProfilePrompt, buildProjectContext, drawProfileSeeds, isPriceDocumented, pickOpeningMessage,
} from '../../src/utils/primerContacto.js';
import {
  COACH_TURN_OPTIONS, PROFILE_OPTIONS, PROSPECT_TURN_OPTIONS, generatePrimerContactoProfile, runPrimerContactoTurn,
} from '../../src/utils/primerContactoTurn.js';
import { createControlState } from '../../src/utils/primerContactoControl.js';
import { isTerminalState } from '../../src/utils/simulatorModes.js';
import { CONVERSATIONS, MAX_TURNS, POLICIES, PROFILE_ONLY, PROJECTS } from './matrix.mjs';

// ─── Configuración ─────────────────────────────────────────────────────────
const fail = (message) => { console.error(message); process.exit(2); };
const FLAGS = new Set(['--run', '--no-profiles']);
const OPTIONS = { '--max-usd': 'maxUsd', '--only': 'only', '--out': 'out', '--output-dir': 'out' };
// Opciones desconocidas o sin valor detienen el script antes de cualquier
// llamada (antes, una opción mal escrita se ignoraba en silencio).
const parseArgs = (argv) => {
  const parsed = { flags: new Set(), values: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const [name, inline] = argv[i].split(/=(.*)/s);
    if (FLAGS.has(name) && inline === undefined) { parsed.flags.add(name); continue; }
    if (!(name in OPTIONS)) fail(`Opción no reconocida: ${argv[i]}\nOpciones válidas: --run, --no-profiles, --max-usd <USD>, --only <E01,E02>, --out <carpeta> (o --output-dir <carpeta>).`);
    const value = inline !== undefined ? inline : argv[i + 1];
    if (!value || (inline === undefined && value.startsWith('--'))) fail(`Falta el valor de ${name}.`);
    if (inline === undefined) i += 1;
    parsed.values[OPTIONS[name]] = value;
  }
  return parsed;
};
const parsedArgs = parseArgs(process.argv.slice(2));
const flag = (name) => parsedArgs.flags.has(name);
const RUN = flag('--run');
const MAX_USD = Number(parsedArgs.values.maxUsd ?? '1.5');
if (!Number.isFinite(MAX_USD) || MAX_USD <= 0) fail(`--max-usd debe ser un número mayor que 0 (recibido: ${parsedArgs.values.maxUsd}).`);
const ONLY = parsedArgs.values.only ? parsedArgs.values.only.split(',').map((s) => s.trim()).filter(Boolean) : null;
const WITH_PROFILES = !flag('--no-profiles');
const REPO = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const OUT = resolve(parsedArgs.values.out ?? join(dirname(REPO), 'primer-contacto-eval-output'));

// Ruta real (sin nombres cortos tipo HP-LAP~1 ni diferencias de mayúsculas),
// aunque la carpeta aún no exista: se resuelve el primer antecesor existente.
const realPath = (p) => {
  let existing = p; const rest = [];
  while (!existsSync(existing) && dirname(existing) !== existing) { rest.unshift(basename(existing)); existing = dirname(existing); }
  return join(realpathSync.native(existing), ...rest);
};
// Dentro del repositorio = la misma carpeta o una subcarpeta (comparación por
// segmentos de ruta, no por prefijo de texto).
const isInside = (child, parent) => {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};
const OUT_REAL = realPath(OUT);
if (isInside(OUT_REAL, realPath(REPO))) fail(`La carpeta de resultados debe estar fuera del repositorio (${OUT_REAL}).`);

const MODEL = MODELS.haiku; // claude-haiku-4-5-20251001, igual que producción
const STUDENT_MAX_TOKENS = 200;
// Precio de Claude Haiku 4.5 (USD por millón de tokens).
const PRICE = { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 };
const JSON_RETRY_INSTRUCTION = 'IMPORTANTE: tu respuesta anterior no fue JSON válido (o quedó incompleta). Responde ÚNICAMENTE con el objeto JSON solicitado — nada de texto antes o después, nada de markdown.';
const ASKS_PRICE = /precio|cu[aá]nto (cuesta|vale|es|sale|cobran|ser[ií]a|cobras)|costo|inversi[oó]n|tarifa/i;
const estTokens = (chars) => Math.ceil(chars / 3);

const conversations = CONVERSATIONS.filter((c) => !ONLY || ONLY.includes(c.id));
const profilesOnly = WITH_PROFILES ? PROFILE_ONLY.filter((p) => !ONLY || ONLY.includes(p.id)) : [];

// Aleatoriedad reproducible por caso (mulberry32).
const seeded = (text) => {
  let a = [...text].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0, 1779033703);
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};

// ─── Cliente y presupuesto ─────────────────────────────────────────────────
const usage = { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, usd: 0, byRole: {} };
const costOf = (u) => ((u.input_tokens || 0) * PRICE.input + (u.output_tokens || 0) * PRICE.output
  + (u.cache_creation_input_tokens || 0) * PRICE.cacheWrite + (u.cache_read_input_tokens || 0) * PRICE.cacheRead) / 1e6;

class BudgetStop extends Error {}
// Errores que detienen TODA la batería: presupuesto y cualquier error de la API o
// de red (incluidos los de conexión, que el SDK envuelve en APIConnectionError).
const isStopError = (e) => e instanceof BudgetStop || e instanceof Anthropic.APIError || Boolean(e?.status);
const KEY = process.env.SIMULASET_EVAL_ANTHROPIC_KEY || '';
// Cualquier texto que se imprima o se guarde pasa por aquí: elimina la clave
// (y cualquier otra con forma de clave de Anthropic) por si apareciera en un error.
const redact = (value) => {
  let s = String(value ?? '');
  if (KEY.length >= 8) s = s.split(KEY).join('[clave-redactada]');
  return s.replace(/sk-ant-[A-Za-z0-9_-]{6,}/g, '[clave-redactada]').replace(/x-api-key\s*[:=]\s*\S+/gi, 'x-api-key: [redactado]');
};
// Única red permitida: api.anthropic.com. SIMULASET_EVAL_BLOCK_NETWORK=1 bloquea
// toda llamada (para probar la detención por errores sin tocar la red).
const guardedFetch = (url, init) => {
  const host = new URL(typeof url === 'string' ? url : url.url).host;
  if (host !== 'api.anthropic.com') throw new Error(`Conexión no permitida: ${host}`);
  if (process.env.SIMULASET_EVAL_BLOCK_NETWORK === '1') throw new Error('Red bloqueada para la prueba de detención');
  if (process.env.SIMULASET_EVAL_MOCK === '1') return mockResponse(init);
  return globalThis.fetch(url, init);
};

// SIMULASET_EVAL_MOCK=1: respuestas sintéticas con la forma de la API, sin
// red, para probar el script de punta a punta antes de gastar. Incluye a
// propósito un eco y un 0/10 para ejercitar los reintentos.
let mockTurn = 0;
const MOCK_DISCOVERY = 'Tengo un consultorio con la agenda floja y quiero llenarla antes de fin de año.';
const mockResponse = async (init) => {
  const body = JSON.parse(init.body);
  const system = (body.system || []).map((b) => b.text).join('\n');
  const lastUser = [...body.messages].reverse().find((m) => m.role === 'user')?.content || '';
  let out;
  if (!system && /perfil PRIVADO/.test(lastUser)) {
    out = { nombre: 'X', origen: 'Un reel', identidad: 'Profesional ficticio', situacion: 'Situación ficticia', emocion: 'Duda', motivacion: 'Mejorar', objeciones: ['Tiempo'], hechos_ocultos: ['Hecho ficticio oculto'], encaje: 'alto', apertura_inicial: 'Info' };
  } else if (system.includes('Eres un ALUMNO')) {
    out = { mensaje: `Mensaje de prueba ${body.messages.length}. ¿Me cuentas un poco más de tu situación?` };
  } else if (system.includes('Eres coach')) {
    mockTurn += 1;
    const zero = mockTurn === 2 && !system.includes('Nunca 0.\n') && !/IMPORTANTE: "puntuacion_mensaje"/.test(system);
    // Cita el descubrimiento solo si el prospecto ya lo dijo (como pide el prompt).
    const told = lastUser.includes(MOCK_DISCOVERY);
    out = { etapa_set: 'S', que_hizo_bien: 'Pregunta abierta.', que_mejorar: 'Profundiza.', mensaje_alternativo: mockTurn === 3 ? 'Tienes garantía de devolución del 100 %.' : '¿Qué te preocupa más?', recurso_sugerido: '', alerta: '', nivel_fomo: 20, probabilidad_cita: 30, descubrimiento: told ? { situacion: 'Tengo un consultorio con la agenda floja', motivo: 'quiero llenarla antes de fin de año' } : { situacion: '', motivo: '' }, puntuacion_mensaje: zero ? 0 : 8 };
  } else {
    // Turno 1: acepta una cita no permitida (reintento y respaldo). Turno 2:
    // eco (reintento) y cuenta situación y motivo. Desde el 4: acepta (el
    // coaching del turno confirma el descubrimiento con una cita).
    const n = body.messages.filter((m) => m.role === 'user').length;
    const echo = n === 2 && !system.includes('repetía el mensaje del setter');
    out = {
      respuesta_prospecto: echo ? lastUser : n === 2 ? MOCK_DISCOVERY : `Respuesta de prueba ${n}`,
      revela: n === 2 ? ['situacion', 'motivo'] : [],
      acepta_cita: n === 1 || n >= 4 ? 'si' : 'no',
      cambio_encaje: '',
      estado_lead: n >= 4 ? 'pidio_llamada' : 'interesado',
    };
  }
  const text = JSON.stringify(out);
  return new Response(JSON.stringify({
    id: 'msg_mock', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text }],
    stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: Math.ceil(JSON.stringify(body).length / 3), output_tokens: Math.ceil(text.length / 3) },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};
let client = null;
if (RUN) {
  if (!KEY) fail('Falta la variable de entorno SIMULASET_EVAL_ANTHROPIC_KEY (clave de DESARROLLO de Anthropic). No se hizo ninguna llamada.');
  // logLevel 'off': el SDK no registra peticiones ni encabezados aunque exista ANTHROPIC_LOG.
  client = new Anthropic({ apiKey: KEY, maxRetries: 2, timeout: 60_000, logLevel: 'off', fetch: guardedFetch });
}

// Misma forma que el servidor: modelo fijo, tope de la operación, sistema con caché.
const callModel = async (role, maxTokens, system, messages) => {
  const inputChars = (system || '').length + messages.reduce((a, m) => a + m.content.length, 0);
  const worst = (estTokens(inputChars) * PRICE.input + maxTokens * PRICE.output) / 1e6;
  if (usage.usd + worst > MAX_USD) throw new BudgetStop(`Presupuesto: ${usage.usd.toFixed(4)} USD gastados; la siguiente llamada podría superar ${MAX_USD} USD.`);
  const params = { model: MODEL, max_tokens: maxTokens, messages };
  if (system !== undefined) params.system = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
  const started = performance.now();
  const res = await client.messages.create(params);
  const ms = Math.round(performance.now() - started);
  const u = res.usage || {};
  const cost = costOf(u);
  usage.calls += 1; usage.input += u.input_tokens || 0; usage.output += u.output_tokens || 0;
  usage.cacheWrite += u.cache_creation_input_tokens || 0; usage.cacheRead += u.cache_read_input_tokens || 0; usage.usd += cost;
  const r = (usage.byRole[role] ||= { calls: 0, input: 0, output: 0, usd: 0, maxTokensHits: 0, ms: [] });
  r.ms.push(ms);
  r.calls += 1; r.input += u.input_tokens || 0; r.output += u.output_tokens || 0; r.usd += cost;
  if (res.stop_reason === 'max_tokens') r.maxTokensHits += 1;
  return { text: res.content?.find((b) => b.type === 'text')?.text || '', stopReason: res.stop_reason, usage: u, ms };
};

const tryExtractJson = (text) => {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
};

// Adaptador con el contrato de callClaude (lo que la app inyecta en
// primerContactoTurn): valida operación, modelo y tope igual que el servidor,
// y reintenta una vez si el JSON no es válido.
const roleOf = (options, system) => (options.operation === 'simulator_prospect' ? 'perfil' : String(system).includes('Eres coach') ? 'coaching' : 'prospecto');
const appCall = (log, turnLog = []) => async (system, messages, options) => {
  const op = AI_OPERATIONS[options.operation];
  if (!op || !op.models.includes(options.model) || options.maxTokens > op.maxTokens) throw new Error(`Llamada fuera de la lista del servidor: ${JSON.stringify(options)}`);
  const role = roleOf(options, system);
  const first = await callModel(role, options.maxTokens, system, messages);
  log.push({ role, stopReason: first.stopReason, outputTokens: first.usage.output_tokens, ms: first.ms, retry: false });
  turnLog.push({ role, ms: first.ms });
  const parsed = tryExtractJson(first.text);
  if (parsed) return parsed;
  const retrySystem = system !== undefined ? `${system}\n${JSON_RETRY_INSTRUCTION}` : JSON_RETRY_INSTRUCTION;
  const second = await callModel(role, options.maxTokens, retrySystem, messages);
  log.push({ role, stopReason: second.stopReason, outputTokens: second.usage.output_tokens, ms: second.ms, retry: true });
  turnLog.push({ role, ms: second.ms });
  const retried = tryExtractJson(second.text);
  if (!retried) throw new Error('Respuesta inválida de la IA');
  return retried;
};

// ─── Alumno simulado (solo para la prueba; no es código de la app) ─────────
const studentSystem = (c) => `
Eres un ALUMNO que practica appointment setting en un simulador. Atiendes por ${c.canal} a un prospecto que escribió primero tras ver un anuncio o contenido del experto.
Lo que sabes del proyecto (solo esto; lo "no documentado" no lo sabes):
${buildProjectContext(PROJECTS[c.project])}

TU FORMA DE ACTUAR:
${POLICIES[c.policy]}

Escribe como en un chat real: uno o dos mensajes cortos, máximo 45 palabras, en español neutro. No digas que eres una IA.
RESPONDE SOLO EN JSON: {"mensaje": "tu mensaje al prospecto"}`;
const studentTurn = async (c, transcript, log) => {
  const messages = transcript.map((m) => ({ role: m.role === 'prospect' ? 'user' : 'assistant', content: m.content }));
  const first = await callModel('alumno', STUDENT_MAX_TOKENS, studentSystem(c), messages);
  log.push({ role: 'alumno', stopReason: first.stopReason, outputTokens: first.usage.output_tokens, retry: false });
  const parsed = tryExtractJson(first.text);
  const text = typeof parsed?.mensaje === 'string' && parsed.mensaje.trim() ? parsed.mensaje.trim() : first.text.replace(/[{}"]/g, '').replace(/^mensaje:\s*/i, '').trim();
  if (!text) throw new Error('El alumno simulado no respondió');
  return text;
};

// ─── Ejecución de un caso ──────────────────────────────────────────────────
const words = (t) => String(t || '').split(/\s+/).filter(Boolean).length;
const runConversation = async (c) => {
  const project = PROJECTS[c.project];
  const config = { projectId: project.id, temperatura: c.temperatura, canal: c.canal, resistencia: c.resistencia };
  const log = [];
  const result = { ...c, transcript: [], turns: [], log };
  let profile;
  try {
    profile = await generatePrimerContactoProfile({ call: appCall(log), project, config, random: seeded(c.id), overrides: c.overrides, isFatal: (e) => isStopError(e) });
  } catch (err) {
    if (isStopError(err)) throw err;
    result.error = `Perfil: ${err.message}`;
    return result;
  }
  result.profile = profile;
  const opening = pickOpeningMessage(profile.apertura_inicial, c.temperatura, seeded(`${c.id}-apertura`));
  result.opening = opening;
  result.transcript.push({ role: 'prospect', content: opening.text });
  let state = 'abierto';
  const fullProfile = { ...profile, ...config };
  let control = createControlState(fullProfile);
  let outcome = 'abierta';
  for (let i = 1; i <= MAX_TURNS; i += 1) {
    const setterText = await studentTurn(c, result.transcript, log);
    const history = [...result.transcript];
    let turn;
    const turnStarted = performance.now();
    // Tiempo hasta ver al prospecto (lo que espera el alumno con la respuesta
    // progresiva) y hasta tener el coaching.
    const turnLog = [];
    try {
      turn = await runPrimerContactoTurn({ call: appCall(log, turnLog), project, profile: fullProfile, history, setterText, control });
    } catch (err) {
      if (isStopError(err)) throw err;
      result.turns.push({ index: i, setter: setterText, error: err.message });
      break;
    }
    const prospectMs = turnLog.filter((l) => l.role === 'prospecto').reduce((a, l) => a + l.ms, 0);
    control = turn.control;
    const { control: _c, ...shown } = turn;
    result.transcript.push({ role: 'setter', content: setterText }, { role: 'prospect', content: turn.respuesta_prospecto });
    result.turns.push({ index: i, setter: setterText, ...shown, turnMs: Math.round(performance.now() - turnStarted), prospectMs, prospectWords: words(turn.respuesta_prospecto), askedPrice: ASKS_PRICE.test(history.at(-1)?.content || '') });
    state = turn.estado_lead;
    outcome = turn.desenlace;
    if (isTerminalState('primer_contacto', state)) break;
  }
  result.finalState = state;
  result.finalOutcome = outcome;
  result.finalControl = control;
  result.observations = observe(result);
  return result;
};

// Observaciones automáticas (ayudan a la revisión; no la sustituyen).
const STOP = new Set('para pero porque tiene tienen hace meses años sobre entre desde cuando donde como esto este esta esos estas solo sola muy más menos real realmente quiere cree pacientes agenda consultorio programa dinero gastos tiempo trabajo'.split(' '));
const keyWords = (s) => (String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-zñ0-9]{5,}|\d{3,}/g) || []).filter((w) => !STOP.has(w));
const observe = (r) => {
  const ts = r.turns.filter((t) => !t.error);
  const scores = ts.map((t) => t.coaching?.puntuacion_mensaje ?? null);
  const accepted = ts.find((t) => t.estado_lead === 'pidio_llamada');
  // Posible fuga: el coaching usa 2+ palabras distintivas de un hecho oculto no dichas antes del turno.
  const leaks = [];
  let seen = r.opening?.text || '';
  for (const t of ts) {
    const seenW = new Set(keyWords(`${seen} ${t.setter}`));
    const coach = keyWords(JSON.stringify(t.coaching || {}));
    for (const h of r.profile?.hechos_ocultos || []) {
      const hits = keyWords(h).filter((w) => !seenW.has(w) && coach.includes(w));
      if (hits.length >= 2) leaks.push(`#${t.index}: ${hits.join(',')}`);
    }
    seen += ` ${t.setter} ${t.respuesta_prospecto}`;
  }
  const maxWords = (RESISTANCE_RULES[r.resistencia] || RESISTANCE_RULES.media).maxPalabras;
  const invariantes = [];
  for (const t of ts) {
    if (t.estado_lead === 'pidio_llamada' && !t.plan?.puedeAceptar) invariantes.push(`#${t.index}: cita registrada con bloqueos ${t.plan?.bloqueos}`);
    if (t.estado_lead === 'pidio_llamada' && r.profile?.encaje === 'bajo' && r.profile?.incompatibilidad === 'definitiva') invariantes.push(`#${t.index}: cita con incompatibilidad definitiva`);
    if (t.plan?.despedida && t.estado_lead !== 'cerrado') invariantes.push(`#${t.index}: despedida no aplicada`);
  }
  const closing = ts.at(-1);
  return {
    desenlace_final: r.finalOutcome,
    desenlace_aceptable: (r.aceptables || []).includes(r.finalOutcome),
    desenlace_prohibido: (r.nunca || []).includes(r.finalOutcome),
    invariantes_rotas: invariantes,
    estado_final: r.finalState,
    turnos: ts.length,
    evasivas_por_turno: ts.map((t) => t.plan?.evasivas ?? null),
    presiones_por_turno: ts.map((t) => t.plan?.presiones ?? null),
    puede_aceptar_por_turno: ts.map((t) => (t.plan?.puedeAceptar ? 1 : 0)),
    revelado_final: r.finalControl?.revelado || [],
    cambio_encaje: r.finalControl?.cambioEncaje || null,
    confirmado_final: r.finalControl?.confirmado || [],
    evidencias: r.finalControl?.evidencias || {},
    turnos_que_esperaron_al_coaching: ts.filter((t) => t.awaitedCoach).map((t) => t.index),
    exactitud_precio_por_turno: ts.map((t) => t.plan?.precioExactitud ?? null),
    topes_por_afirmacion: ts.filter((t) => (t.coachingIssues || []).some((i) => i.startsWith('tope_'))).map((t) => t.index),
    reintentos_prospecto: ts.filter((t) => t.retried).length,
    motivos_de_reintento: ts.flatMap((t) => (t.prospectIssues || []).filter((i) => i.startsWith('intento1:')).map((i) => i.slice(9).split(':')[0])),
    respaldos_usados: ts.filter((t) => t.fallback).map((t) => `#${t.index}:${t.fallback}`),
    otros_avisos: ts.flatMap((t) => (t.prospectIssues || []).filter((i) => !i.startsWith('intento')).map((i) => `#${t.index}:${i}`)),
    mensajes_sobre_el_limite: ts.filter((t) => t.prospectWords > maxWords).length,
    limite_palabras: maxWords,
    puntuacion_primer_mensaje: ts[0]?.coaching?.puntuacion_mensaje ?? null,
    puntuacion_ultimo_mensaje: closing?.coaching?.puntuacion_mensaje ?? null,
    acepto_cita_en_turno: accepted?.index ?? null,
    aceptaciones: ts.map((t) => `${t.index}:${t.acepta_cita}`).join(' '),
    palabras_prospecto_media: ts.length ? Math.round(ts.reduce((a, t) => a + t.prospectWords, 0) / ts.length) : 0,
    palabras_prospecto_turnos_1_2: ts.slice(0, 2).map((t) => t.prospectWords),
    ecos_finales: ts.filter((t) => t.echo).length,
    reintentos_por_eco: ts.filter((t) => t.echoRetried).length,
    puntuaciones: scores,
    turnos_sin_puntuacion: scores.filter((s) => s === null).length,
    reintentos_por_puntuacion: ts.filter((t) => t.coachingRetried).length,
    mensajes_sugeridos_descartados: ts.filter((t) => (t.coachingIssues || []).some((i) => i.includes('mensaje_alternativo_descartado'))).length,
    alertas: ts.filter((t) => t.coaching?.alerta).length,
    posibles_fugas_de_perfil: leaks,
    turnos_con_error: r.turns.filter((t) => t.error).length,
    precio_preguntado_por_prospecto: ts.filter((t) => t.askedPrice).length,
    // Tiempo que espera el alumno por turno (prospecto y coaching en paralelo, con reintentos).
    latencia_turno_ms_media: ts.length ? Math.round(ts.reduce((a, t) => a + t.turnMs, 0) / ts.length) : null,
    latencia_turno_ms_max: ts.length ? Math.max(...ts.map((t) => t.turnMs)) : null,
    hasta_ver_prospecto_ms_media: ts.length ? Math.round(ts.reduce((a, t) => a + t.prospectMs, 0) / ts.length) : null,
  };
};

// ─── Simulación (sin llamadas) ─────────────────────────────────────────────
const SAMPLE_PROFILE = {
  nombre: 'Nombre de ejemplo', origen: 'Un reel del experto', identidad: 'Profesional del nicho', situacion: 'Situación de ejemplo con dos hechos',
  emocion: 'Frustración', motivacion: 'Quiere resolverlo este trimestre', objeciones: ['No tengo tiempo', 'Ya lo intenté'],
  hechos_ocultos: ['Hecho uno', 'Hecho dos'], encaje: 'medio', estilo: 'escribe informal', apertura_inicial: 'Info',
};
const dryRun = () => {
  let expected = 0; let worst = 0; let calls = 0; let worstCalls = 0;
  // Peor caso por llamada: reintento de JSON (×2) y, en prospecto/coaching, el reintento por eco o por puntuación (×2 más).
  const add = (inChars, maxOut, typicalOut, worstFactor) => {
    calls += 1; worstCalls += worstFactor;
    expected += (estTokens(inChars) * PRICE.input + typicalOut * PRICE.output) / 1e6;
    worst += worstFactor * (estTokens(inChars) * PRICE.input + maxOut * PRICE.output) / 1e6;
  };
  const rows = [];
  for (const c of conversations) {
    const project = PROJECTS[c.project];
    const seeds = drawProfileSeeds({ ...c, priceDocumented: isPriceDocumented(project) }, seeded(c.id), c.overrides);
    const pp = buildPrimerContactoProfilePrompt(project, c, seeds);
    add(pp.length, PROFILE_OPTIONS.maxTokens, 380, 4); // hasta 2 intentos de perfil, cada uno con reintento de JSON
    const prospectSystem = buildPrimerContactoSystemPrompt(project, { ...SAMPLE_PROFILE, ...c });
    const coachSystem = buildPrimerContactoCoachPrompt(project);
    let transcript = 60;
    for (let i = 0; i < MAX_TURNS; i += 1) {
      add(studentSystem(c).length + transcript, STUDENT_MAX_TOKENS, 70, 1);
      transcript += 180;
      add(prospectSystem.length + transcript, PROSPECT_TURN_OPTIONS.maxTokens, 70, 4);
      add(coachSystem.length + buildPrimerContactoCoachMessage([], '').length + transcript, COACH_TURN_OPTIONS.maxTokens, 220, 4);
      transcript += 120;
    }
    rows.push({ id: c.id, tipo: c.tipo, combinacion: `${c.temperatura}/${c.resistencia}`, proyecto: c.project, alumno: c.policy, encaje: seeds.encaje + (seeds.incompatibilidad ? ` (${seeds.incompatibilidad})` : ''), apertura: seeds.apertura.texto || '(propia)', aceptables: c.aceptables.join('|') });
  }
  for (const p of profilesOnly) {
    const pp = buildPrimerContactoProfilePrompt(PROJECTS[p.project], p, drawProfileSeeds({ ...p, priceDocumented: isPriceDocumented(PROJECTS[p.project]) }, seeded(p.id), p.overrides));
    add(pp.length, PROFILE_OPTIONS.maxTokens, 380, 4);
  }
  console.table(rows);
  console.log(JSON.stringify({
    modelo: MODEL,
    topes: { perfil: PROFILE_OPTIONS.maxTokens, prospecto: PROSPECT_TURN_OPTIONS.maxTokens, coaching: COACH_TURN_OPTIONS.maxTokens, alumno_simulado: STUDENT_MAX_TOKENS },
    conversaciones: conversations.length, turnos_maximos_por_conversacion: MAX_TURNS, perfiles_solo: profilesOnly.length,
    llamadas_maximas_sin_reintentos: calls, llamadas_maximas_con_reintentos: worstCalls,
    costo_esperado_usd: Number(expected.toFixed(3)), costo_peor_caso_usd: Number(worst.toFixed(3)), tope_de_gasto_usd: MAX_USD,
  }, null, 2));
};

// ─── Ejecución real ────────────────────────────────────────────────────────
const md = (r) => {
  const lines = [`## ${r.id} · ${r.title}`, '', `${r.tipo} · ${r.temperatura} / ${r.resistencia} · ${r.canal} · proyecto ${r.project} · alumno ${r.policy}`, '', `Desenlaces aceptables: ${r.aceptables.join(', ')}${r.nunca.length ? ` · nunca: ${r.nunca.join(', ')}` : ''}`, ''];
  if (r.profile) {
    const { attempts: _a, seeds: _s, ...shown } = r.profile;
    lines.push(`Perfil (encaje ${r.profile.encaje}, ${r.profile.attempts} intento(s)):`, '```json', JSON.stringify(shown, null, 2), '```', '');
  }
  if (r.error) { lines.push(`**${r.error}**`, ''); return lines.join('\n'); }
  lines.push(`**Prospecto:** ${r.opening.text}  _(apertura: ${r.opening.source})_`, '');
  for (const t of r.turns) {
    lines.push(`**Alumno ${t.index}:** ${t.setter}`, '');
    if (t.error) { lines.push(`> ERROR: ${t.error}`, ''); continue; }
    const k = t.coaching || {};
    lines.push(`> Coaching ${k.puntuacion_mensaje ?? 'sin puntuación'}/10 · ${k.etapa_set ?? '—'} · bien: ${k.que_hizo_bien || '—'} · mejorar: ${k.que_mejorar || '—'}${k.mensaje_alternativo ? ` · sugerido: ${k.mensaje_alternativo}` : ''}${k.alerta ? ` · ALERTA: ${k.alerta}` : ''}${(t.coachingIssues || []).length ? ` · [${t.coachingIssues.join('; ')}]` : ''}`, '');
    const p = t.plan || {};
    lines.push(`**Prospecto:** ${t.respuesta_prospecto}  _(desenlace: ${t.desenlace} · estado: ${t.estado_lead} · acepta_cita: ${t.acepta_cita} (modelo: ${t.acepta_cita_modelo}) · revela: ${JSON.stringify(t.revela || [])}${t.cambio_encaje ? ` · cambio_encaje: «${t.cambio_encaje}»` : ''})_`, '');
    lines.push(`> Plan: evasivas ${p.evasivas} · presiones ${p.presiones} · puede aceptar: ${p.puedeAceptar ? 'sí' : `no (${(p.bloqueos || []).join(', ')})`}${p.despedida ? ` · DESPEDIDA por ${p.despedida}` : ''}${t.retried ? ` · reintento [${(t.prospectIssues || []).join('; ')}]` : ''}${t.fallback ? ` · RESPALDO ${t.fallback}` : ''}`, '');
  }
  lines.push('Observaciones automáticas:', '```json', JSON.stringify(r.observations, null, 2), '```', '');
  return lines.join('\n');
};

const main = async () => {
  if (!RUN) { dryRun(); console.log('\nSimulación: no se hizo ninguna llamada. Usa --run para ejecutar con la IA real.'); return; }
  mkdirSync(OUT_REAL, { recursive: true });
  console.log(`Resultados en: ${OUT_REAL}\nTope de gasto: ${MAX_USD} USD\n`);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const results = { ronda: 3, modelo: MODEL, fecha: new Date().toISOString(), tope_usd: MAX_USD, conversaciones: [], perfiles: [], detenido: null };
  try {
    for (const c of conversations) {
      process.stdout.write(`${c.id} … `);
      const r = await runConversation(c);
      results.conversaciones.push(r);
      console.log(`${r.finalOutcome || r.error}${r.observations ? (r.observations.desenlace_aceptable ? ' (aceptable)' : ' (NO aceptable)') : ''} · ${usage.usd.toFixed(4)} USD`);
    }
    for (const p of profilesOnly) {
      process.stdout.write(`${p.id} … `);
      const log = [];
      const project = PROJECTS[p.project];
      try {
        const profile = await generatePrimerContactoProfile({ call: appCall(log), project, config: { projectId: project.id, ...p }, random: seeded(p.id), overrides: p.overrides, isFatal: (e) => isStopError(e) });
        results.perfiles.push({ ...p, ok: true, profile, log });
        console.log(`completo · encaje ${profile.encaje} · ${usage.usd.toFixed(4)} USD`);
      } catch (err) {
        if (isStopError(err)) throw err;
        results.perfiles.push({ ...p, ok: false, error: err.message, log });
        console.log(`INCOMPLETO · ${usage.usd.toFixed(4)} USD`);
      }
    }
  } catch (err) {
    // Cualquier error de la API (tras los reintentos del SDK) o de red detiene
    // toda la batería; lo ya obtenido se guarda.
    results.detenido = redact(err instanceof BudgetStop ? err.message : `Error: ${err?.status || ''} ${err?.message || err}`);
    console.log(`\nDetenido: ${results.detenido}`);
  }
  const msStats = (arr) => { const v = [...arr].sort((a, b) => a - b); return v.length ? { n: v.length, media: Math.round(v.reduce((a, b) => a + b, 0) / v.length), p50: v[Math.floor(v.length / 2)], p90: v[Math.floor(v.length * 0.9)], max: v.at(-1) } : null; };
  const byRole = Object.fromEntries(Object.entries(usage.byRole).map(([k, v]) => [k, { ...v, usd: Number(v.usd.toFixed(4)), ms: msStats(v.ms) }]));
  const turnMs = results.conversaciones.flatMap((c) => c.turns.filter((t) => t.turnMs).map((t) => t.turnMs));
  results.uso = { ...usage, usd: Number(usage.usd.toFixed(4)), byRole, latencia_turno_ms: msStats(turnMs) };
  writeFileSync(resolve(OUT_REAL, `ronda3-resultados-${stamp}.json`), redact(JSON.stringify(results, null, 2)));
  writeFileSync(resolve(OUT_REAL, `ronda3-transcripciones-${stamp}.md`), redact([`# Primer contacto · ronda 3 · ${MODEL} · ${results.fecha}`, '', `Uso: ${JSON.stringify(results.uso)}`, '', ...results.conversaciones.map(md)].join('\n')));
  console.log(`\nUso real: ${JSON.stringify(results.uso)}\nResultados en: ${OUT_REAL}`);
};

main().catch((err) => { console.error(redact(err?.message || err)); process.exit(1); });
