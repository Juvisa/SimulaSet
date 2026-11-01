// Validación focalizada de la «Urgencia del prospecto» (Primer contacto):
// respuestas FIJAS del prospecto, sin perfiles, alumnos ni conversaciones
// generadas. Haiku solo clasifica la urgencia, con los mismos prompts y el
// mismo código de la app: el coaching del turno (runCoachTurn) y el cierre
// (runPendingUrgency). Casos: aplazamiento, fracaso pasado, urgencia
// auténtica y condiciones de compra (frases reales de las rondas 7 y 8).
//
// Garantías (como run.mjs): sin Supabase; clave solo de
// SIMULASET_EVAL_ANTHROPIC_KEY (nunca se imprime); solo api.anthropic.com;
// sin --run no llama a nadie; con --run se detiene antes de superar --max-usd;
// resultados fuera del repositorio.
//   node scripts/primer-contacto-eval/urgencia-focal.mjs                    # simulación
//   node scripts/primer-contacto-eval/urgencia-focal.mjs --run --max-usd 0.15 --out <carpeta>
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { AI_OPERATIONS, MODELS } from '../../api/_anthropic/operations.js';
import { runCoachTurn, runPendingUrgency } from '../../src/utils/primerContactoTurn.js';
import { createUrgencyState, markProcessed } from '../../src/utils/prospectUrgency.js';
import { PROJECTS } from './matrix.mjs';

const arg = (name, def) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; };
const RUN = process.argv.includes('--run');
const MAX_USD = Number(arg('--max-usd', '0.15'));
const REPS = Number(arg('--reps', '2'));
const OUT = resolve(arg('--out', resolve(process.cwd(), '..', 'urgencia-focal-output')));
const KEY = process.env.SIMULASET_EVAL_ANTHROPIC_KEY || '';
const PRICE = { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 };
const SETTER = 'Entiendo. ¿Me cuentas un poco más?';

// nunca: [señal, postura?] que no debe aceptarse · espera: al menos uno de estos.
const CASES = [
  { id: 'A1', tipo: 'aplazamiento', project: 'bienestar', contexto: '¿Para cuándo necesitarías empezar a sentir cambios?', msg: 'Enero próximo idealmente. Pero primero necesito saber el rango de precio. ¿Es accesible o no?', nunca: [['prioridad_temporal', 'afirma'], ['motivacion'], ['costo_de_no_actuar']] },
  { id: 'A2', tipo: 'aplazamiento', project: 'bienestar', contexto: '¿Qué tan prioritario es para ti?', msg: 'La verdad no tengo apuro, lo veo para el año que viene.', nunca: [['prioridad_temporal', 'afirma']], espera: [['prioridad_temporal', 'niega']] },
  { id: 'A3', tipo: 'aplazamiento', project: 'dental', contexto: '¿Cuándo te gustaría empezar?', msg: 'Me gustaría arrancar en marzo, ahora estoy con mil cosas en el consultorio.', nunca: [['prioridad_temporal', 'afirma']] },
  { id: 'F1', tipo: 'fracaso pasado', project: 'bienestar', contexto: '¿Qué tan prioritario es para ti cambiar esto?', msg: 'Es prioritario, pero honesto: gasté en dos programas que no completé. ¿Cuánto cuesta esto? No quiero tirar dinero de nuevo.', nunca: [['consecuencias'], ['costo_de_no_actuar']] },
  { id: 'F2', tipo: 'fracaso pasado', project: 'dental', contexto: '¿Qué específicamente no funcionó?', msg: 'Los anuncios llegaban pero no convertían. Gasté bastante y al final no vi pacientes nuevos reales.', nunca: [['consecuencias'], ['costo_de_no_actuar']] },
  { id: 'F3', tipo: 'fracaso pasado', project: 'dental', contexto: '¿Qué no funcionó en esa publicidad?', msg: 'Gastaba dinero y no llegaban pacientes reales. Una agencia me cobró bastante y los resultados fueron nulos.', nunca: [['consecuencias'], ['costo_de_no_actuar'], ['motivacion']] },
  { id: 'U1', tipo: 'urgencia auténtica', project: 'dental', contexto: '¿Qué pasa si sigues así?', msg: 'Si sigo así dos meses más voy a tener que cerrar un sillón. Necesito resolverlo este mes.', nunca: [], espera: [['costo_de_no_actuar', 'afirma'], ['prioridad_temporal', 'afirma']] },
  { id: 'U2', tipo: 'urgencia auténtica', project: 'dental', contexto: '¿Eso es lo que necesitas resolver antes de cerrar?', msg: 'Exacto, eso es. Necesito pacientes que realmente lleguen y agenden, no solo tráfico. Antes de cerrar es crítico.', nunca: [['costo_de_no_actuar']], espera: [['prioridad_temporal', 'afirma']] },
  { id: 'U3', tipo: 'urgencia auténtica', project: 'dental', contexto: '¿Cómo te afecta?', msg: 'La agenda está al 50 % y no llego a cubrir los gastos fijos. Me tiene muy estresado.', nunca: [], espera: [['consecuencias', 'afirma'], ['reconoce_problema', 'afirma']] },
  { id: 'K1', tipo: 'condición de compra', project: 'dental', contexto: 'Te cuento cómo funciona el programa.', msg: '¿Cuánto cuesta? Necesito saber el precio antes de seguir.', nunca: [['*']] },
  { id: 'K2', tipo: 'condición de compra', project: 'dental', contexto: '¿Agendamos una llamada mañana?', msg: 'Necesito hablar con mi pareja antes de cualquier decisión. ¿Puedo confirmar mañana?', nunca: [['*']] },
  { id: 'K3', tipo: 'condición de compra', project: 'dental', contexto: 'Incluye un acompañamiento de 90 días.', msg: '¿Incluye seguimiento o es solo un curso? ¿Cuánto tiempo me pide?', nunca: [['*']] },
];

const history = (c) => [{ role: 'prospect', content: 'Info' }, { role: 'setter', content: c.contexto }, { role: 'prospect', content: c.msg }];
const matches = (e, [senal, postura]) => senal === '*' || (e.senal === senal && (!postura || e.postura === postura));
const judge = (c, events) => {
  const bad = events.filter((e) => c.nunca.some((rule) => matches(e, rule)));
  const missing = c.espera && !events.some((e) => c.espera.some((rule) => matches(e, rule)));
  return { ok: !bad.length && !missing, falsos_positivos: bad.map((e) => `${e.senal}/${e.postura} «${e.cita}»`), falta_esperada: Boolean(missing) };
};

// ─── Llamadas (con tope) ───────────────────────────────────────────────────
const usage = { calls: 0, usd: 0 };
let reserved = 0;
const redact = (v) => String(v ?? '').split(KEY || '\u0000').join('[clave]').replace(/sk-ant-[A-Za-z0-9_-]{6,}/g, '[clave]');
const guardedFetch = (url, init) => {
  const host = new URL(typeof url === 'string' ? url : url.url).host;
  if (host !== 'api.anthropic.com') throw new Error(`Conexión no permitida: ${host}`);
  return globalThis.fetch(url, init);
};
const client = RUN ? new Anthropic({ apiKey: KEY, maxRetries: 2, timeout: 60_000, logLevel: 'off', fetch: guardedFetch }) : null;
class BudgetStop extends Error {}
const call = async (system, messages, options) => {
  const op = AI_OPERATIONS[options.operation];
  if (!op || !op.models.includes(options.model) || options.maxTokens > op.maxTokens) throw new Error('Llamada fuera de la lista del servidor');
  const chars = system.length + messages.reduce((a, m) => a + m.content.length, 0);
  const reserve = 3 * (Math.ceil(chars / 2) * PRICE.cacheWrite + options.maxTokens * PRICE.output) / 1e6;
  if (usage.usd + reserved + reserve > MAX_USD) throw new BudgetStop(`Tope: ${usage.usd.toFixed(4)} USD gastados; la siguiente llamada podría superar ${MAX_USD} USD.`);
  reserved += reserve;
  let res;
  try {
    res = await client.messages.create({ model: MODELS.haiku, max_tokens: options.maxTokens, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages });
  } finally { reserved -= reserve; }
  const u = res.usage || {};
  usage.calls += 1;
  usage.usd += ((u.input_tokens || 0) * PRICE.input + (u.output_tokens || 0) * PRICE.output + (u.cache_creation_input_tokens || 0) * PRICE.cacheWrite + (u.cache_read_input_tokens || 0) * PRICE.cacheRead) / 1e6;
  const text = res.content?.find((b) => b.type === 'text')?.text || '';
  const m = text.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m?.[0] || ''); } catch { throw new Error('Respuesta inválida de la IA'); }
};

const runCase = async (c) => {
  const project = PROJECTS[c.project];
  const h = history(c);
  const coach = await runCoachTurn({ call, project, history: h, setterText: SETTER }).then((r) => r.urgencyEvents, (e) => { if (e instanceof BudgetStop || e?.status) throw e; return { error: e.message }; });
  const pending = markProcessed(createUrgencyState(), 0);
  const cierre = await runPendingUrgency({ call, project, history: h, urgency: pending }).then((r) => r.cierre.aceptadas, (e) => { if (e instanceof BudgetStop || e?.status) throw e; return { error: e.message }; });
  const verdict = (ev) => (Array.isArray(ev) ? { eventos: ev.map((e) => `${e.senal}/${e.postura} «${e.cita}»`), ...judge(c, ev) } : { error: ev.error, ok: false });
  return { coaching: verdict(coach), cierre: verdict(cierre) };
};

if (!RUN) {
  // Coaching ≈ 4.000 tokens de entrada (la mayoría en caché tras la primera) y ≈ 420 de salida; cierre ≈ 1.900 y ≈ 40.
  const perCase = (400 * PRICE.input + 3600 * PRICE.cacheRead + 420 * PRICE.output) / 1e6 + (1900 * PRICE.input + 40 * PRICE.output) / 1e6;
  console.log(JSON.stringify({ casos: CASES.length, repeticiones: REPS, llamadas: CASES.length * REPS * 2, costo_estimado_usd: Number((perCase * CASES.length * REPS + 0.01).toFixed(3)), tope_usd: MAX_USD }, null, 2));
  console.log('Simulación: no se hizo ninguna llamada. Usa --run para ejecutar.');
  process.exit(0);
}
if (!KEY) { console.error('Falta SIMULASET_EVAL_ANTHROPIC_KEY. No se hizo ninguna llamada.'); process.exit(2); }
mkdirSync(OUT, { recursive: true });
const results = [];
let detenido = null;
try {
  for (let rep = 1; rep <= REPS; rep += 1) {
    for (const c of CASES) {
      const r = await runCase(c);
      results.push({ id: c.id, tipo: c.tipo, rep, msg: c.msg, ...r });
      console.log(`${c.id} #${rep} ${c.tipo.padEnd(19)} coaching ${r.coaching.ok ? 'OK ' : 'FALLA'} · cierre ${r.cierre.ok ? 'OK ' : 'FALLA'} · ${usage.usd.toFixed(4)} USD`);
    }
  }
} catch (err) {
  detenido = redact(err instanceof BudgetStop ? err.message : `Error: ${err?.status || ''} ${err?.message || err}`);
  console.log(`Detenido: ${detenido}`);
}
const ok = results.flatMap((r) => [r.coaching.ok, r.cierre.ok]);
const resumen = { evaluaciones: ok.length, correctas: ok.filter(Boolean).length, usd: Number(usage.usd.toFixed(4)), llamadas: usage.calls, detenido };
writeFileSync(resolve(OUT, `urgencia-focal-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), redact(JSON.stringify({ resumen, results }, null, 2)));
console.log(JSON.stringify(resumen), `\nResultados en: ${OUT}`);
