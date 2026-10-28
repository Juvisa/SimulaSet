// Validación de Inbound — Primer contacto con la IA real (Haiku), en local.
//
// Reproduce el flujo de la aplicación con las MISMAS funciones del frontend
// (prompt del perfil, limpieza, primer mensaje, prompt del prospecto, estados)
// y los MISMOS parámetros que el servidor (/api/anthropic: modelo, tope de
// tokens por operación, prompt de sistema con caché, reintento de JSON).
//
// Garantías:
//   - No importa ni usa Supabase: no lee ni escribe ningún dato de alumnos.
//   - La clave se lee SOLO de la variable de entorno SIMULASET_EVAL_ANTHROPIC_KEY
//     (clave de desarrollo). Nunca se imprime ni se guarda.
//   - Sin --run no hace ninguna llamada: construye los prompts y calcula el
//     presupuesto.
//   - Con --run se detiene antes de cualquier llamada que pudiera superar
//     --max-usd (por defecto 2 USD), calculado con el uso real devuelto por la API.
//   - Los resultados se escriben fuera del repositorio.
//
// Uso (desde la raíz del repo):
//   node scripts/primer-contacto-eval/run.mjs                 # simulación, gratis
//   node scripts/primer-contacto-eval/run.mjs --run           # llamadas reales
//   Opciones: --max-usd 1.5  --only C01,C11  --no-profiles  --out <carpeta>
//   (--output-dir es sinónimo de --out; también se acepta --opcion=valor)
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { AI_OPERATIONS, MODELS } from '../../api/_anthropic/operations.js';
import { buildPrimerContactoSystemPrompt } from '../../src/utils/prompts.js';
import {
  buildPrimerContactoProfilePrompt, normalizePrimerContactoProfile, pickOpeningMessage, OPENING_MAX_WORDS,
} from '../../src/utils/primerContacto.js';
import { isTerminalState } from '../../src/utils/simulatorModes.js';
import { CONVERSATIONS, PROFILE_ONLY, PROJECTS, PRICE_REPLIES, LOW_FIT_HINT, PRICE_OPENING } from './matrix.mjs';

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
    if (!(name in OPTIONS)) fail(`Opción no reconocida: ${argv[i]}\nOpciones válidas: --run, --no-profiles, --max-usd <USD>, --only <C01,C02>, --out <carpeta> (o --output-dir <carpeta>).`);
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
const MAX_USD = Number(parsedArgs.values.maxUsd ?? '2');
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
// segmentos de ruta, no por prefijo de texto: «primer-contacto-eval-output» no
// está dentro de «primer-contacto»).
const isInside = (child, parent) => {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};
const OUT_REAL = realPath(OUT);
if (isInside(OUT_REAL, realPath(REPO))) fail(`La carpeta de resultados debe estar fuera del repositorio (${OUT_REAL}).`);

const MODEL_KEY = 'haiku';
const MODEL = MODELS[MODEL_KEY]; // claude-haiku-4-5-20251001, igual que producción
const OPS = { profile: AI_OPERATIONS.simulator_prospect, turn: AI_OPERATIONS.simulator_turn };
// Precio de Claude Haiku 4.5 (USD por millón de tokens).
const PRICE = { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 };
const JSON_RETRY_INSTRUCTION = 'IMPORTANTE: tu respuesta anterior no fue JSON válido (o quedó incompleta). Responde ÚNICAMENTE con el objeto JSON solicitado — nada de texto antes o después, nada de markdown.';
const LEAD_STATES = ['abierto', 'interesado', 'resistente', 'pidio_llamada', 'no_califica', 'cerrado'];
const ASKS_PRICE = /precio|cu[aá]nto (cuesta|vale|es|sale|cobran|ser[ií]a|cobras)|costo|inversi[oó]n|tarifa|valor/i;
// Estimación conservadora para el presupuesto (el español suele dar más de 3 caracteres por token).
const estTokens = (chars) => Math.ceil(chars / 3);

const conversations = CONVERSATIONS.filter((c) => !ONLY || ONLY.includes(c.id));
const profilesOnly = WITH_PROFILES ? PROFILE_ONLY.filter((p) => !ONLY || ONLY.includes(p.id)) : [];

// ─── Cliente y presupuesto ─────────────────────────────────────────────────
const usage = { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, usd: 0 };
const costOf = (u) => ((u.input_tokens || 0) * PRICE.input + (u.output_tokens || 0) * PRICE.output
  + (u.cache_creation_input_tokens || 0) * PRICE.cacheWrite + (u.cache_read_input_tokens || 0) * PRICE.cacheRead) / 1e6;

class BudgetStop extends Error {}
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
  return globalThis.fetch(url, init);
};
let client = null;
if (RUN) {
  if (!KEY) {
    console.error('Falta la variable de entorno SIMULASET_EVAL_ANTHROPIC_KEY (clave de DESARROLLO de Anthropic). No se hizo ninguna llamada.');
    process.exit(2);
  }
  // logLevel 'off': el SDK no registra peticiones ni encabezados aunque exista ANTHROPIC_LOG.
  client = new Anthropic({ apiKey: KEY, maxRetries: 2, timeout: 60_000, logLevel: 'off', fetch: guardedFetch });
}

// Misma forma que el servidor: modelo fijo, tope de la operación, sistema con caché.
const callModel = async (op, system, messages) => {
  const inputChars = (system || '').length + messages.reduce((a, m) => a + m.content.length, 0);
  const worst = (estTokens(inputChars) * PRICE.input + op.maxTokens * PRICE.output) / 1e6;
  if (usage.usd + worst > MAX_USD) throw new BudgetStop(`Presupuesto: ${usage.usd.toFixed(4)} USD gastados; la siguiente llamada podría superar ${MAX_USD} USD.`);
  const params = { model: MODEL, max_tokens: op.maxTokens, messages };
  if (system !== undefined) params.system = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
  const res = await client.messages.create(params);
  const u = res.usage || {};
  usage.calls += 1; usage.input += u.input_tokens || 0; usage.output += u.output_tokens || 0;
  usage.cacheWrite += u.cache_creation_input_tokens || 0; usage.cacheRead += u.cache_read_input_tokens || 0;
  usage.usd += costOf(u);
  return { text: res.content?.find((b) => b.type === 'text')?.text || '', stopReason: res.stop_reason, usage: u };
};

const tryExtractJson = (text) => {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
};

// Mismo patrón que callClaude: un reintento si el JSON no es válido.
const callJson = async (op, system, messages) => {
  const attempts = [];
  const first = await callModel(op, system, messages);
  attempts.push({ stopReason: first.stopReason, usage: first.usage, raw: first.text });
  let parsed = tryExtractJson(first.text);
  if (!parsed) {
    const retrySystem = system !== undefined ? `${system}\n${JSON_RETRY_INSTRUCTION}` : JSON_RETRY_INSTRUCTION;
    const second = await callModel(op, retrySystem, messages);
    attempts.push({ stopReason: second.stopReason, usage: second.usage, raw: second.text });
    parsed = tryExtractJson(second.text);
  }
  return { parsed, attempts };
};

// Igual que generatePrimerContactoProfile (anthropic.js): hasta 2 intentos si faltan campos esenciales.
const generateProfile = async (project, config, lowFit) => {
  const prompt = buildPrimerContactoProfilePrompt(project, config) + (lowFit ? LOW_FIT_HINT : '');
  const tries = [];
  let profile = null;
  for (let i = 0; i < 2 && (!profile || profile.campos_faltantes.length); i += 1) {
    const { parsed, attempts } = await callJson(OPS.profile, undefined, [{ role: 'user', content: prompt }]);
    profile = parsed ? normalizePrimerContactoProfile(parsed) : null;
    tries.push({ attempts, raw: parsed, normalized: profile });
  }
  const ok = Boolean(profile && !profile.campos_faltantes.length);
  return { ok, prompt, profile: ok ? { ...profile, ...config } : profile, tries };
};

// ─── Observaciones automáticas (ayudan a la revisión; no la sustituyen) ────
const words = (t) => String(t || '').split(/\s+/).filter(Boolean).length;
const profileChecks = (gen) => {
  const allAttempts = gen.tries.flatMap((t) => t.attempts);
  return {
    completo: gen.ok,
    intentos_api: allAttempts.length,
    cortado_por_tokens: allAttempts.some((a) => a.stopReason === 'max_tokens'),
    tokens_salida_max: Math.max(0, ...allAttempts.map((a) => a.usage?.output_tokens || 0)),
    campos_faltantes: gen.profile?.campos_faltantes || ['(sin perfil)'],
    encaje: gen.profile?.encaje,
    apertura_palabras: words(gen.profile?.apertura_inicial),
    apertura_breve: words(gen.profile?.apertura_inicial) <= OPENING_MAX_WORDS,
  };
};

const runConversation = async (c) => {
  const project = PROJECTS[c.project];
  const config = { projectId: project.id, temperatura: c.temperatura, canal: c.canal, resistencia: c.resistencia };
  const gen = await generateProfile(project, config, c.forceLowFit);
  const result = { ...c, profileGeneration: { checks: profileChecks(gen), tries: gen.tries }, transcript: [], turns: [] };
  if (!gen.ok) { result.error = 'Perfil incompleto: la simulación no arrancaría (igual que en la app).'; return result; }

  const profile = gen.profile;
  const opening = c.forcePriceOpening ? { text: PRICE_OPENING, source: 'forzado (caso de precio)' } : pickOpeningMessage(profile.apertura_inicial, c.temperatura);
  result.opening = opening;
  result.transcript.push({ role: 'prospect', content: opening.text });
  const system = buildPrimerContactoSystemPrompt(project, profile);
  result.systemPromptChars = system.length;

  let leadState = 'abierto';
  for (let i = 0; i < c.turns.length; i += 1) {
    const turn = c.turns[i];
    const lastProspect = [...result.transcript].reverse().find((m) => m.role === 'prospect')?.content || '';
    const askedPrice = ASKS_PRICE.test(lastProspect);
    const text = askedPrice ? `${PRICE_REPLIES[c.pricePolicy][c.project]} ${turn.text}` : turn.text;
    const history = result.transcript.map((m) => ({ role: m.role === 'prospect' ? 'assistant' : 'user', content: m.content }));
    const { parsed, attempts } = await callJson(OPS.turn, system, [...history, { role: 'user', content: text }]);
    result.transcript.push({ role: 'setter', content: text });
    const t = {
      index: i + 1, kind: turn.kind, priceReply: askedPrice ? c.pricePolicy : null, setter: text,
      jsonRetries: attempts.length - 1, stopReasons: attempts.map((a) => a.stopReason),
      outputTokens: attempts.map((a) => a.usage?.output_tokens || 0),
      ok: Boolean(parsed?.respuesta_prospecto),
    };
    if (!t.ok) { t.error = 'Respuesta inválida de la IA (tras el reintento)'; t.raw = attempts.map((a) => a.raw); result.turns.push(t); break; }
    t.prospect = parsed.respuesta_prospecto;
    t.prospectWords = words(parsed.respuesta_prospecto);
    t.coaching = parsed.coaching || null;
    t.estado = parsed.estado_lead;
    t.estadoValido = LEAD_STATES.includes(parsed.estado_lead);
    result.transcript.push({ role: 'prospect', content: parsed.respuesta_prospecto });
    result.turns.push(t);
    leadState = parsed.estado_lead;
    if (isTerminalState('primer_contacto', leadState)) break;
  }
  result.finalState = leadState;
  result.observations = observe(result);
  return result;
};

const observe = (r) => {
  const ts = r.turns.filter((t) => t.ok);
  const at = (k) => ts.filter((t) => t.kind === k);
  const evasive = ts.filter((t) => t.priceReply === 'evasive');
  const accepted = ts.find((t) => t.estado === 'pidio_llamada');
  return {
    estado_final: r.finalState,
    turnos: ts.length,
    errores_json_o_estado: r.turns.filter((t) => !t.ok || !t.estadoValido).length,
    reintentos_json: r.turns.reduce((a, t) => a + t.jsonRetries, 0),
    cortes_por_tokens: r.turns.filter((t) => t.stopReasons.includes('max_tokens')).length,
    palabras_prospecto_media: ts.length ? Math.round(ts.reduce((a, t) => a + t.prospectWords, 0) / ts.length) : 0,
    acepto_cita_en_turno: accepted?.index ?? null,
    cita_antes_del_turno_4: Boolean(accepted && accepted.index < 4),
    evasivas: evasive.length,
    insistio_tras_evasiva: evasive.some((t) => ASKS_PRICE.test(t.prospect)),
    alerta_desde_segunda_evasiva: evasive.length >= 2 ? Boolean(evasive[1].coaching?.alerta) : null,
    puntuacion_respuestas_honestas_precio: ts.filter((t) => t.priceReply === 'honest').map((t) => t.coaching?.puntuacion_mensaje),
    alerta_promesa_inventada: at('promesa_inventada').map((t) => Boolean(t.coaching?.alerta)),
    puntuacion_cierre_no_encaje: at('cierre_no_encaje').map((t) => t.coaching?.puntuacion_mensaje),
    puntuacion_cita_prematura_o_pitch: [...at('cita'), ...at('pitch'), ...at('interrogatorio')].filter((t) => t.index <= 2 || t.kind !== 'cita').map((t) => `${t.kind}@${t.index}:${t.coaching?.puntuacion_mensaje}`),
    precio_mencionado_por_prospecto_sin_documentar: r.project === 'bienestar' && ts.some((t) => /\d[\d.,]*\s*(usd|d[oó]lares|pesos|€|\$)|\$\s*\d/i.test(t.prospect)),
  };
};

// ─── Simulación (sin llamadas) ─────────────────────────────────────────────
const SAMPLE_PROFILE = {
  nombre: 'Nombre de ejemplo', origen: 'Un reel del experto', identidad: 'Profesional del nicho', situacion: 'Situación de ejemplo con dos hechos',
  emocion: 'Frustración', motivacion: 'Quiere resolverlo este trimestre', objeciones: ['No tengo tiempo', 'Ya lo intenté'],
  hechos_ocultos: ['Hecho uno', 'Hecho dos'], encaje: 'medio', apertura_inicial: 'Info',
};
const dryRun = () => {
  let expected = 0; let worst = 0; let calls = 0; let worstCalls = 0;
  const rows = [];
  const add = (inChars, maxOut, typicalOut) => {
    calls += 1; worstCalls += 2; // reintento de JSON en el peor caso
    expected += (estTokens(inChars) * PRICE.input + typicalOut * PRICE.output) / 1e6;
    worst += 2 * (estTokens(inChars) * PRICE.input + maxOut * PRICE.output) / 1e6;
  };
  const profileOf = (p, lowFit) => buildPrimerContactoProfilePrompt(PROJECTS[p.project], p) + (lowFit ? LOW_FIT_HINT : '');
  for (const c of conversations) {
    const pp = profileOf(c, c.forceLowFit);
    add(pp.length, OPS.profile.maxTokens, 350); add(pp.length, OPS.profile.maxTokens, 350); // hasta 2 intentos de perfil
    const system = buildPrimerContactoSystemPrompt(PROJECTS[c.project], { ...SAMPLE_PROFILE, ...c });
    let history = 40;
    for (const t of c.turns) {
      history += t.text.length + 260; // mensaje del alumno + respuesta típica del prospecto
      add(system.length + history, OPS.turn.maxTokens, 320);
    }
    rows.push({ id: c.id, categoria: c.category, combinacion: `${c.temperatura}/${c.resistencia}`, proyecto: c.project, turnos_max: c.turns.length, prompt_sistema_caracteres: system.length });
  }
  for (const p of profilesOnly) { const pp = profileOf(p); add(pp.length, OPS.profile.maxTokens, 350); add(pp.length, OPS.profile.maxTokens, 350); }
  console.table(rows);
  console.log(JSON.stringify({
    modelo: MODEL, operaciones: { perfil: { maxTokens: OPS.profile.maxTokens }, turno: { maxTokens: OPS.turn.maxTokens } },
    conversaciones: conversations.length, perfiles_solo: profilesOnly.length,
    llamadas_maximas_sin_reintentos: calls, llamadas_maximas_con_reintentos: worstCalls,
    costo_esperado_usd: Number(expected.toFixed(3)), costo_peor_caso_usd: Number(worst.toFixed(3)), tope_de_gasto_usd: MAX_USD,
  }, null, 2));
};

// ─── Ejecución real ────────────────────────────────────────────────────────
const md = (r) => {
  const lines = [`## ${r.id} · ${r.title}`, '', `${r.temperatura} / ${r.resistencia} · ${r.canal} · proyecto ${r.project} · precio ${r.pricePolicy}${r.forceLowFit ? ' · encaje bajo (prueba)' : ''}`, '', `Esperado: ${r.expect}`, ''];
  const pc = r.profileGeneration.checks;
  lines.push(`Perfil: ${pc.completo ? 'completo' : 'INCOMPLETO'} · encaje ${pc.encaje} · ${pc.intentos_api} llamada(s) · salida máx. ${pc.tokens_salida_max} tokens${pc.cortado_por_tokens ? ' · CORTADO' : ''}`, '');
  const prof = r.profileGeneration.tries.at(-1)?.normalized;
  if (prof) lines.push('```json', JSON.stringify(prof, null, 2), '```', '');
  if (r.error) { lines.push(`**${r.error}**`, ''); return lines.join('\n'); }
  lines.push(`**Prospecto:** ${r.opening.text}  _(apertura: ${r.opening.source})_`, '');
  for (const t of r.turns) {
    lines.push(`**Alumno (${t.kind}${t.priceReply ? `, precio ${t.priceReply}` : ''}):** ${t.setter}`, '');
    if (!t.ok) { lines.push(`> ${t.error}`, ''); continue; }
    const k = t.coaching || {};
    lines.push(`> Coaching ${k.puntuacion_mensaje}/10 · ${k.etapa_set} · bien: ${k.que_hizo_bien || '—'} · mejorar: ${k.que_mejorar || '—'}${k.alerta ? ` · ALERTA: ${k.alerta}` : ''}`, '');
    lines.push(`**Prospecto:** ${t.prospect}  _(estado: ${t.estado}${t.estadoValido ? '' : ' — INVÁLIDO'})_`, '');
  }
  lines.push('Observaciones automáticas:', '```json', JSON.stringify(r.observations, null, 2), '```', '');
  return lines.join('\n');
};

const main = async () => {
  if (!RUN) { dryRun(); console.log('\nSimulación: no se hizo ninguna llamada. Usa --run para ejecutar con la IA real.'); return; }
  mkdirSync(OUT_REAL, { recursive: true });
  console.log(`Resultados en: ${OUT_REAL}
Tope de gasto: ${MAX_USD} USD
`);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const results = { modelo: MODEL, fecha: new Date().toISOString(), tope_usd: MAX_USD, conversaciones: [], perfiles: [], detenido: null };
  try {
    for (const c of conversations) {
      process.stdout.write(`${c.id} … `);
      const r = await runConversation(c);
      results.conversaciones.push(r);
      console.log(`${r.finalState || r.error} · ${usage.usd.toFixed(4)} USD`);
    }
    for (const p of profilesOnly) {
      process.stdout.write(`${p.id} … `);
      const gen = await generateProfile(PROJECTS[p.project], { projectId: PROJECTS[p.project].id, ...p }, false);
      results.perfiles.push({ ...p, checks: profileChecks(gen), tries: gen.tries });
      console.log(`${gen.ok ? 'completo' : 'INCOMPLETO'} · ${usage.usd.toFixed(4)} USD`);
    }
  } catch (err) {
    // Cualquier error de la API (tras los reintentos del SDK) o de red detiene
    // toda la batería; lo ya obtenido se guarda.
    results.detenido = redact(err instanceof BudgetStop ? err.message : `Error: ${err?.status || ''} ${err?.message || err}`);
    console.log(`\nDetenido: ${results.detenido}`);
  }
  results.uso = { ...usage, usd: Number(usage.usd.toFixed(4)) };
  writeFileSync(resolve(OUT_REAL, `resultados-${stamp}.json`), redact(JSON.stringify(results, null, 2)));
  writeFileSync(resolve(OUT_REAL, `transcripciones-${stamp}.md`), redact([`# Primer contacto · ${MODEL} · ${results.fecha}`, '', `Uso: ${JSON.stringify(results.uso)}`, '', ...results.conversaciones.map(md)].join('\n')));
  console.log(`\nUso real: ${JSON.stringify(results.uso)}\nResultados en: ${OUT_REAL}`);
};

main().catch((err) => { console.error(redact(err?.message || err)); process.exit(1); });
