// Pruebas del endpoint /api/passport-assistant con dependencias simuladas
// (sin red, sin Supabase real, sin Anthropic). Vive fuera de api/ porque
// Vercel publicaría como función cualquier .js de esa carpeta.
import { describe, it, expect, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createPassportAssistantHandler, __limits } from '../../../../api/passport-assistant.js';

const USER = '11111111-1111-1111-1111-111111111111';
const HONEST = JSON.stringify({
  headline: 'Setter en formación enfocado en conversaciones de venta por chat',
  summary: 'Me estoy formando como setter para acompañar a negocios digitales en sus conversaciones de venta por chat. Me entreno de forma constante en SimulaSET, el simulador de conversaciones de venta de Digital SET, donde practico prospección, calificación de leads y seguimiento con escenarios realistas. Aplico la escucha activa y la constancia en cada conversación, y me interesa aportar orden y cercanía al proceso comercial. Busco una oportunidad como setter en modalidad remota para seguir creciendo con acompañamiento y aprender de un equipo comercial.',
});
const INVENTED = JSON.stringify({ headline: 'Setter certificado', summary: Array.from({ length: 80 }, () => 'palabra').join(' ') });

// ─── Dobles de prueba ───────────────────────────────────────────────────────
let world;
const reset = () => {
  world = {
    config: { supabaseUrl: 'https://x.supabase.co', anonKey: 'anon', serviceKey: 'service', anthropicKey: 'sk-test' },
    user: { id: USER },
    profile: { id: USER, role: 'setter', active: true },
    data: {
      error: null,
      passportRow: { experiences: [], preferred_roles: ['setter'], work_modes: ['remoto'], skills: [], tools: [], niches: [], languages: [] },
      onboarding: null,
      commercialProfile: null,
      sessions: Array.from({ length: 25 }, (_, i) => ({ id: `s${i}`, mode: 'outbound', scores: [8] })),
    },
    reserve: { outcome: 'reserved', reservation_id: 'r1', used_today: 0, remaining_today: 3, attempts_today: 1 },
    quota: { used_today: 1, remaining_today: 2, attempts_today: 2, busy: false },
    outputs: [{ text: HONEST, stopReason: 'end_turn', inputTokens: 900, outputTokens: 200 }],
    calls: { generate: [], rpc: [], writes: [], logs: [], userTokens: [] },
  };
};

const deps = () => ({
  getConfig: () => world.config,
  createUserClient: (config, token) => {
    world.calls.userTokens.push(token);
    const table = (name) => {
      const q = { filters: [] };
      const chain = {
        select: () => chain,
        eq: (col, val) => { q.filters.push([col, val]); return chain; },
        maybeSingle: async () => (name === 'profiles' ? { data: world.profile, error: null } : { data: null, error: null }),
        insert: (...a) => { world.calls.writes.push([name, 'insert', a]); return chain; },
        update: (...a) => { world.calls.writes.push([name, 'update', a]); return chain; },
        upsert: (...a) => { world.calls.writes.push([name, 'upsert', a]); return chain; },
        delete: (...a) => { world.calls.writes.push([name, 'delete', a]); return chain; },
      };
      return chain;
    };
    return {
      auth: { getUser: async (t) => (t === 'valid-token' && world.user ? { data: { user: world.user }, error: null } : { data: { user: null }, error: { message: 'bad' } }) },
      from: table,
    };
  },
  createServiceClient: () => ({
    rpc: (name, args) => {
      world.calls.rpc.push([name, args]);
      if (name === 'passport_ai_reserve') return Promise.resolve({ data: [world.reserve], error: null });
      if (name === 'passport_ai_quota') return Promise.resolve({ data: [world.quota], error: null });
      if (name === 'passport_ai_finish') return Promise.resolve({ data: 'ok', error: null });
      return Promise.resolve({ data: null, error: { code: 'unknown' } });
    },
  }),
  loadStudentData: async () => world.data,
  generateDraft: async (args) => {
    world.calls.generate.push(args);
    const next = world.outputs.shift();
    if (next instanceof Error) throw next;
    return next || { text: '', stopReason: 'end_turn', inputTokens: 0, outputTokens: 0 };
  },
  logEvent: (event, detail) => world.calls.logs.push([event, detail]),
});

const ANSWERS = { track: 'en_formacion', tone: 'cercano', strengths: ['empatia'] };
const request = (overrides = {}) => ({
  method: 'POST',
  headers: { origin: 'https://app.example.com', host: 'app.example.com', authorization: 'Bearer valid-token', 'content-length': '200', ...overrides.headers },
  body: overrides.body ?? { action: 'generate', answers: ANSWERS },
  ...(overrides.method ? { method: overrides.method } : {}),
});
// El handler recibe (req, res): adaptador.
const call = async (req) => {
  const res = { statusCode: 0, headers: {}, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  await createPassportAssistantHandler(deps())(req, res);
  return res;
};
const finishes = () => world.calls.rpc.filter(([n]) => n === 'passport_ai_finish').map(([, a]) => a);

beforeEach(reset);

describe('método, origen, tamaño y forma de la solicitud', () => {
  it('solo POST', async () => {
    const res = await call(request({ method: 'GET' }));
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('origen distinto o ausente → 403', async () => {
    expect((await call(request({ headers: { origin: 'https://evil.com' } }))).statusCode).toBe(403);
    expect((await call(request({ headers: { origin: undefined } }))).statusCode).toBe(403);
  });

  it('cuerpo demasiado grande → 413', async () => {
    expect((await call(request({ headers: { 'content-length': '9000' } }))).statusCode).toBe(413);
    const big = { action: 'generate', answers: { ...ANSWERS, highlight: 'x'.repeat(9000) } };
    expect((await call(request({ body: big }))).statusCode).toBe(413);
  });

  it('acción desconocida, cuerpo inválido o claves extra → 400 (no se aceptan métricas del navegador)', async () => {
    expect((await call(request({ body: { action: 'publish' } }))).statusCode).toBe(400);
    expect((await call(request({ body: 'no-json' }))).statusCode).toBe(400);
    expect((await call(request({ body: { action: 'generate', answers: ANSWERS, setScore: 100 } }))).statusCode).toBe(400);
    const r = await call(request({ body: { action: 'generate', answers: { ...ANSWERS, validSimulations: 500 } } }));
    expect(r.statusCode).toBe(400);
    expect(world.calls.generate).toHaveLength(0);
  });

  it('respuestas no-store', async () => {
    expect((await call(request())).headers['Cache-Control']).toBe('no-store');
  });
});

describe('autenticación y autorización (verificadas en el servidor)', () => {
  it('sin token o token inválido → 401', async () => {
    expect((await call(request({ headers: { authorization: '' } }))).statusCode).toBe(401);
    expect((await call(request({ headers: { authorization: 'Bearer otro' } }))).statusCode).toBe(401);
    expect(world.calls.rpc).toHaveLength(0);
  });

  it('admin o alumno inactivo → 403, sin reservar ni llamar a la IA', async () => {
    world.profile = { id: USER, role: 'admin', active: true };
    expect((await call(request())).statusCode).toBe(403);
    world.profile = { id: USER, role: 'setter', active: false };
    expect((await call(request())).statusCode).toBe(403);
    world.profile = null;
    expect((await call(request())).statusCode).toBe(403);
    expect(world.calls.rpc).toHaveLength(0);
    expect(world.calls.generate).toHaveLength(0);
  });

  it('las lecturas usan el token del propio alumno (RLS)', async () => {
    await call(request());
    expect(world.calls.userTokens).toEqual(['valid-token']);
  });

  it('falta configuración → 503 antes de reservar; nunca expone valores', async () => {
    world.config = { ...world.config, serviceKey: '' };
    let res = await call(request());
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/service|anon|sk-/);
    reset();
    world.config = { ...world.config, anthropicKey: '' };
    res = await call(request());
    expect(res.statusCode).toBe(503);
    expect(world.calls.rpc.filter(([n]) => n === 'passport_ai_reserve')).toHaveLength(0);
  });
});

describe('cuota', () => {
  it('status: devuelve la cuota sin llamar a la IA ni reservar', async () => {
    const res = await call(request({ body: { action: 'status' } }));
    expect(res.statusCode).toBe(200);
    expect(res.body.quota).toEqual({ used: 1, remaining: 2, attemptsLeft: 4, busy: false });
    expect(world.calls.rpc.map(([n]) => n)).toEqual(['passport_ai_quota']);
    expect(world.calls.generate).toHaveLength(0);
  });

  it('límite de 3 éxitos → 429 sin llamar a la IA', async () => {
    world.reserve = { outcome: 'limit_reached', reservation_id: null, used_today: 3, remaining_today: 0, attempts_today: 3 };
    const res = await call(request());
    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe('limit_reached');
    expect(world.calls.generate).toHaveLength(0);
    expect(finishes()).toHaveLength(0);
  });

  it('6 intentos → 429 attempts_exhausted', async () => {
    world.reserve = { outcome: 'attempts_exhausted', reservation_id: null, used_today: 1, remaining_today: 2, attempts_today: 6 };
    const res = await call(request());
    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe('attempts_exhausted');
  });

  it('concurrencia: una generación en curso → 409 busy sin llamar a la IA', async () => {
    world.reserve = { outcome: 'busy', reservation_id: null, used_today: 0, remaining_today: 3, attempts_today: 1 };
    const res = await call(request());
    expect(res.statusCode).toBe(409);
    expect(world.calls.generate).toHaveLength(0);
  });

  it('los límites del servidor coinciden con los de la base (3 / 6)', () => {
    expect(__limits).toMatchObject({ DAILY_LIMIT: 3, ATTEMPT_LIMIT: 6, MAX_MODEL_CALLS: 2 });
  });
});

describe('generación', () => {
  it('éxito: devuelve el borrador, consume 1 y cierra la reserva con tokens', async () => {
    const res = await call(request());
    expect(res.statusCode).toBe(200);
    expect(res.body.draft.headline).toMatch(/Setter en formación/);
    expect(res.body.quota).toMatchObject({ used: 1, remaining: 2 });
    expect(finishes()).toEqual([{ p_reservation_id: 'r1', p_user_id: USER, p_succeeded: true, p_input_tokens: 900, p_output_tokens: 200 }]);
  });

  it('salida inválida → 1 reintento con motivo → si vuelve a fallar, 502 y no consume', async () => {
    world.outputs = [{ text: INVENTED, stopReason: 'end_turn', inputTokens: 1, outputTokens: 1 }, { text: 'no json', stopReason: 'end_turn', inputTokens: 1, outputTokens: 1 }];
    const res = await call(request());
    expect(res.statusCode).toBe(502);
    expect(res.body.message).toMatch(/no consumió/);
    expect(world.calls.generate).toHaveLength(2);
    expect(world.calls.generate[1].userMessage).toMatch(/se descartó porque/);
    expect(finishes()[0]).toMatchObject({ p_succeeded: false, p_input_tokens: 2, p_output_tokens: 2 });
  });

  it('salida inválida y luego válida → éxito en la misma reserva', async () => {
    world.outputs = [{ text: INVENTED, stopReason: 'end_turn' }, { text: HONEST, stopReason: 'end_turn' }];
    const res = await call(request());
    expect(res.statusCode).toBe(200);
    expect(world.calls.rpc.filter(([n]) => n === 'passport_ai_reserve')).toHaveLength(1);
    expect(finishes()).toHaveLength(1);
  });

  it('rechazo del modelo, timeout o error del proveedor → 502, no consume y no expone el error', async () => {
    for (const output of [{ text: '', stopReason: 'refusal' }, Object.assign(new Error('Request timed out: sk-secret detalle'), { status: 408 }), Object.assign(new Error('overloaded'), { status: 529 })]) {
      reset();
      world.outputs = [output];
      const res = await call(request());
      expect(res.statusCode).toBe(502);
      expect(JSON.stringify(res.body)).not.toMatch(/sk-secret|overloaded|timed out/);
      expect(finishes()[0].p_succeeded).toBe(false);
    }
  });

  it('el prompt es el fijo del servidor y no contiene nombre, correo, ids ni SET Score', async () => {
    world.data.passportRow = { ...world.data.passportRow, headline: 'Mi titular' };
    await call(request());
    const { system, userMessage } = world.calls.generate[0];
    expect(system).toMatch(/Eres el redactor del SET Passport/);
    expect(userMessage).not.toMatch(new RegExp(USER));
    expect(userMessage).not.toMatch(/set_score|setScore|@|correo|email/i);
    expect(userMessage).toMatch(/"simulaciones_validas": 25/);
  });

  it('las métricas vienen de la base, no del navegador', async () => {
    world.data.sessions = [];
    await call(request());
    expect(world.calls.generate[0].userMessage).toMatch(/"banda_de_practica": "sin_simulaciones"/);
  });

  it('falta información esencial (transferible sin experiencia) → 400 sin reservar', async () => {
    const res = await call(request({ body: { action: 'generate', answers: { track: 'comercial_transferible', tone: 'cercano' } } }));
    expect(res.statusCode).toBe(400);
    expect(world.calls.rpc).toHaveLength(0);
  });

  it('error leyendo datos → 502 sin reservar', async () => {
    world.data = { ...world.data, error: 'data_error' };
    const res = await call(request());
    expect(res.statusCode).toBe(502);
    expect(world.calls.rpc).toHaveLength(0);
  });

  it('nunca escribe en tablas (solo lectura)', async () => {
    await call(request());
    expect(world.calls.writes).toEqual([]);
  });

  it('los logs no contienen contenido del alumno ni del modelo', async () => {
    world.outputs = [{ text: INVENTED, stopReason: 'end_turn' }, { text: INVENTED, stopReason: 'end_turn' }];
    await call(request({ body: { action: 'generate', answers: { ...ANSWERS, highlight: 'DATO-PRIVADO' } } }));
    const logs = JSON.stringify(world.calls.logs);
    expect(logs).not.toMatch(/DATO-PRIVADO|certificado|palabra/);
    expect(world.calls.logs.map(([e]) => e)).toContain('invalid_output');
  });
});

describe('compatibilidad con Vercel', () => {
  it('el endpoint se importa con Node ESM puro (sin Vite) y sin variables de entorno', () => {
    const file = fileURLToPath(new URL('../../../../api/passport-assistant.js', import.meta.url)).replace(/\\/g, '/');
    const out = execFileSync(process.execPath, ['--input-type=module', '-e',
      `const m = await import('file:///${file.replace(/^\//, '')}'); console.log(typeof m.default)`], { encoding: 'utf8', env: { PATH: process.env.PATH } });
    expect(out.trim()).toBe('function');
  });
});

