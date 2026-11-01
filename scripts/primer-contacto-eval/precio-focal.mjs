// Microvalidación de la regla de precio de Primer contacto (02/11/2026): el
// setter no revela el precio por chat. Solo el COACHING real (runCoachTurn,
// mismo prompt y mismo código de la app) sobre mensajes fijos, con un
// proyecto ficticio de USD 1997. Sin perfiles, prospecto ni alumno simulado.
// Garantías como en run.mjs: sin Supabase; clave solo de
// SIMULASET_EVAL_ANTHROPIC_KEY (nunca se imprime); solo api.anthropic.com;
// sin --run no llama; tope de llamadas (--max-calls) y de gasto (--max-usd).
//   node scripts/primer-contacto-eval/precio-focal.mjs                  # simulación
//   node scripts/primer-contacto-eval/precio-focal.mjs --run --out <carpeta>
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { AI_OPERATIONS, MODELS } from '../../api/_anthropic/operations.js';
import { PRICE_REVEAL_MAX_SCORE, runCoachTurn } from '../../src/utils/primerContactoTurn.js';
import { mentionsCommercialTerms } from '../../src/utils/primerContactoControl.js';
import { PROJECTS } from './matrix.mjs';

const arg = (name, def) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; };
const RUN = process.argv.includes('--run');
const MAX_USD = Number(arg('--max-usd', '0.05'));
const MAX_CALLS = Number(arg('--max-calls', '8'));
const REPS = Number(arg('--reps', '2'));
const OUT = resolve(arg('--out', resolve(process.cwd(), '..', 'precio-focal-output')));
const KEY = process.env.SIMULASET_EVAL_ANTHROPIC_KEY || '';
const PRICE = { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 };
const PROJECT = { ...PROJECTS.dental, id: 'eval-precio-1997', name: 'Agenda Llena 1997 (ficticio)', price: 'USD 1997' };

const P = (content) => ({ role: 'prospect', content });
const S = (content) => ({ role: 'setter', content });
const OPEN = [P('Info'), S('¡Hola! ¿Qué te llamó la atención de la publicación?'), P('Tengo consultorio con la agenda al 60 % y quiero abrir un segundo sillón este año.')];
// transparente: el setter no da la cifra (no debe penalizarse) · revela: tope de 5.
const CASES = [
  { id: 'P1', situacion: 'pregunta inicial de precio', tipo: 'transparente',
    history: [P('Hola, ¿cuánto cuesta el programa?')],
    setter: 'Buena pregunta, es lógico querer saberlo. La propuesta comercial la presenta la especialista en la llamada, según tu caso. Para ver si te sirve: ¿cómo está hoy tu agenda?' },
  { id: 'P2', situacion: 'insistencia antes de agendar', tipo: 'transparente',
    history: [...OPEN, S('¿Te parece una llamada corta con la Dra. Ana para verlo?'), P('Ya te pregunté el precio. Si no me dices cuánto cuesta, no agendo nada.')],
    setter: 'Te entiendo, nadie quiere agendar a ciegas. Mi rol es entender tu caso; la inversión y las condiciones las presenta la Dra. Ana en la llamada, con números claros. ¿Te sirve el jueves para que lo veas directo con ella?' },
  { id: 'P3', situacion: 'respuesta transparente del setter', tipo: 'transparente',
    history: [...OPEN, S('¿Y por qué ahora lo del segundo sillón?'), P('Porque los meses flojos me están ahorcando. ¿Y esto cuánto sale?')],
    setter: 'Tiene sentido que lo preguntes. No me corresponde darte el precio por chat: lo ve la especialista contigo según lo que necesites. Antes, ¿qué pasa en esos meses flojos con los gastos fijos?' },
  { id: 'P4', situacion: 'revelación del precio por el setter', tipo: 'revela',
    history: [P('Hola, ¿cuánto cuesta el programa?')],
    setter: 'El programa cuesta USD 1997. ¿Cómo está hoy tu agenda?' },
];

// ¿El coaching (lo que escribió Haiku, antes del filtro) recomienda revelar
// cifras o condiciones? Solo cuenta una RECOMENDACIÓN (consejo o imperativo
// inequívoco), no la crítica «Revela el precio por chat» (falso positivo de
// la microvalidación precio1, P4), ni una frase negada («no reveles el precio»).
const RECOMMENDS_REVEAL = /\b(deberias|deberia|podrias|podria|conviene|convendria|te recomiendo|recomiendo|hay que|tendrias que|seria (bueno|mejor)|mejor|intenta|procura)\b[^.]{0,25}\b(dar|darle|compartir|mencionar|decir|decirle|indicar|informar|revelar|transparentar)\b[^.]{0,25}\b(precio|costo|valor|inversion|cifra|monto|rango)\b|\b(dale|comparte|compartile|mencionale|dile|decile|indicale|informale)\b[^.]{0,25}\b(precio|costo|valor|inversion|cifra|monto|rango)\b/;
const NEGATED = /\b(no|nunca|jamas|sin)\b[^.]{0,12}$/;
const normText = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const recommendsReveal = (text) => normText(text).split(/[.!?;\n]+/).some((s) => {
  const m = s.match(RECOMMENDS_REVEAL);
  return Boolean(m) && !NEGATED.test(s.slice(0, m.index));
});
// Dos lecturas por separado: la regla de precio (lo que se valida) y el
// criterio original de la microvalidación (que además exigía nota ≥ 7).
const judge = (c, raw, result) => {
  const altConCifras = mentionsCommercialTerms(raw?.mensaje_alternativo || '', PROJECT);
  const recomienda = recommendsReveal(raw?.que_mejorar) || recommendsReveal(raw?.alerta) || altConCifras;
  const nota = result.coaching?.puntuacion_mensaje ?? null;
  const tope = result.issues.some((i) => i.startsWith('tope_'));
  const reglaPrecio = c.tipo === 'revela'
    ? nota !== null && nota <= PRICE_REVEAL_MAX_SCORE && Boolean(result.coaching?.alerta) && !altConCifras
    : !recomienda && !tope;
  const ok = c.tipo === 'revela' ? reglaPrecio : reglaPrecio && nota !== null && nota >= 7;
  return { ok, regla_precio: reglaPrecio, nota, nota_ia: raw?.puntuacion_mensaje ?? null, recomienda_revelar: recomienda, alerta: result.coaching?.alerta || '', que_mejorar: raw?.que_mejorar || '', alternativa_ia: raw?.mensaje_alternativo || '', issues: result.issues };
};

// --reevaluar <resultados.json>: vuelve a juzgar resultados guardados, sin llamadas.
const SAVED = arg('--reevaluar', '');
if (SAVED) {
  const { readFileSync } = await import('node:fs');
  const saved = JSON.parse(readFileSync(resolve(SAVED), 'utf8'));
  const rows = saved.results.map((r) => {
    const c = CASES.find((x) => x.id === r.id);
    const raw = { que_mejorar: r.que_mejorar, mensaje_alternativo: r.alternativa_ia, puntuacion_mensaje: r.nota_ia };
    const v = judge(c, raw, { coaching: { puntuacion_mensaje: r.nota, alerta: r.alerta }, issues: r.issues });
    return { id: r.id, rep: r.rep, situacion: r.situacion, nota: v.nota, nota_ia: v.nota_ia, regla_precio: v.regla_precio, criterio_original: v.ok, recomienda_revelar: v.recomienda_revelar };
  });
  for (const r of rows) console.log(`${r.id} #${r.rep} ${r.situacion.padEnd(36)} nota ${r.nota} (IA ${r.nota_ia}) · regla de precio ${r.regla_precio ? 'OK' : 'FALLA'} · criterio original ${r.criterio_original ? 'OK' : 'FALLA'} · recomienda revelar: ${r.recomienda_revelar ? 'sí' : 'no'}`);
  console.log(JSON.stringify({ regla_precio: `${rows.filter((r) => r.regla_precio).length}/${rows.length}`, criterio_original: `${rows.filter((r) => r.criterio_original).length}/${rows.length}` }));
  process.exit(0);
}

const usage = { calls: 0, usd: 0 };
let reserved = 0;
const redact = (v) => String(v ?? '').split(KEY || '\u0000').join('[clave]').replace(/sk-ant-[A-Za-z0-9_-]{6,}/g, '[clave]');
const guardedFetch = (url, init) => {
  const host = new URL(typeof url === 'string' ? url : url.url).host;
  if (host !== 'api.anthropic.com') throw new Error(`Conexión no permitida: ${host}`);
  return globalThis.fetch(url, init);
};
const client = RUN ? new Anthropic({ apiKey: KEY, maxRetries: 0, timeout: 60_000, logLevel: 'off', fetch: guardedFetch }) : null;
class BudgetStop extends Error {}
let lastRaw = null;
const call = async (system, messages, options) => {
  const op = AI_OPERATIONS[options.operation];
  if (!op || !op.models.includes(options.model) || options.maxTokens > op.maxTokens) throw new Error('Llamada fuera de la lista del servidor');
  if (usage.calls >= MAX_CALLS) throw new BudgetStop(`Tope de ${MAX_CALLS} llamadas alcanzado.`);
  const chars = system.length + messages.reduce((a, m) => a + m.content.length, 0);
  const reserve = (Math.ceil(chars / 3) * PRICE.cacheWrite + options.maxTokens * PRICE.output) / 1e6;
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
  try { lastRaw = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || ''); } catch { throw new Error('Respuesta inválida de la IA'); }
  return lastRaw;
};

if (!RUN) {
  // Coaching ≈ 4.000 tokens de entrada (caché desde la segunda llamada) y ≈ 420 de salida.
  const first = (4000 * PRICE.cacheWrite + 420 * PRICE.output) / 1e6;
  const next = (400 * PRICE.input + 3600 * PRICE.cacheRead + 420 * PRICE.output) / 1e6;
  const n = CASES.length * REPS;
  console.log(JSON.stringify({ casos: CASES.length, repeticiones: REPS, llamadas: n, costo_estimado_usd: Number((first + next * (n - 1)).toFixed(3)), tope_usd: MAX_USD, tope_llamadas: MAX_CALLS }, null, 2));
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
      lastRaw = null;
      const result = await runCoachTurn({ call, project: PROJECT, history: c.history, setterText: c.setter });
      const v = judge(c, lastRaw, result);
      results.push({ id: c.id, situacion: c.situacion, rep, ...v });
      console.log(`${c.id} #${rep} ${c.situacion.padEnd(36)} nota ${v.nota} (IA ${v.nota_ia}) ${v.ok ? 'OK' : 'FALLA'} · ${usage.usd.toFixed(4)} USD`);
    }
  }
} catch (err) {
  detenido = redact(err instanceof BudgetStop ? err.message : `Error: ${err?.status || ''} ${err?.message || err}`);
  console.log(`Detenido: ${detenido}`);
}
const resumen = { evaluaciones: results.length, correctas: results.filter((r) => r.ok).length, usd: Number(usage.usd.toFixed(4)), llamadas: usage.calls, detenido };
writeFileSync(resolve(OUT, `precio-focal-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), redact(JSON.stringify({ resumen, results }, null, 2)));
console.log(JSON.stringify(resumen), `\nResultados en: ${OUT}`);
