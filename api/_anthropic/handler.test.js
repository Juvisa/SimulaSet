import { describe, expect, it, vi } from 'vitest';
import { AI_MESSAGES, createAnthropicHandler } from './handler.js';
import { AI_OPERATIONS, MODELS } from './operations.js';

const HOST = 'digitalset.simulaset.com';
const USER_ID = '00000000-0000-0000-0000-0000000000aa';

const makeDeps = ({ user = { id: USER_ID }, authError = null, profile = { id: USER_ID, role: 'setter', active: true }, profileError = null,
  config = { supabaseUrl: 'https://x.supabase.co', anonKey: 'anon', anthropicKey: 'sk-ant-test' }, anthropicResult, anthropicError } = {}) => {
  const create = vi.fn(async () => {
    if (anthropicError) throw anthropicError;
    return anthropicResult || { content: [{ type: 'text', text: '{"ok":true}' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } };
  });
  const getUser = vi.fn(async () => ({ data: { user }, error: authError }));
  const maybeSingle = vi.fn(async () => ({ data: profile, error: profileError }));
  const deps = {
    getConfig: vi.fn(() => config),
    createUserClient: vi.fn(() => ({ auth: { getUser }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) })),
    createAnthropic: vi.fn(() => ({ messages: { create } })),
    logEvent: vi.fn(),
  };
  return { deps, create, getUser };
};

const makeReq = ({ method = 'POST', token = 'valid-token', origin = `https://${HOST}`, body, headers = {} } = {}) => ({
  method,
  headers: { host: HOST, ...(origin ? { origin } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
  body: body ?? { operation: 'simulator_turn', model: 'haiku', maxTokens: 800, systemPrompt: 'Eres un prospecto.', messages: [{ role: 'user', content: 'Hola' }] },
});

const makeRes = () => {
  const res = { statusCode: 0, body: null, headers: {} };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return res;
};

const run = async (reqOptions, depsOptions) => {
  const { deps, create, getUser } = makeDeps(depsOptions);
  const res = makeRes();
  await createAnthropicHandler(deps)(makeReq(reqOptions), res);
  return { res, create, getUser, deps };
};

describe('sin sesión: 401 antes de llegar a Anthropic', () => {
  it('sin cabecera Authorization → 401, sin validar Supabase ni llamar a Anthropic', async () => {
    const { res, create, getUser } = await run({ token: null });
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: AI_MESSAGES.unauthenticated, code: 'unauthenticated' });
    expect(getUser).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('sin sesión y con un cuerpo inválido → 401 (no revela reglas de validación)', async () => {
    const { res, create } = await run({ token: null, body: {} });
    expect(res.statusCode).toBe(401);
    expect(JSON.stringify(res.body)).not.toMatch(/maxTokens|sonnet|haiku/);
    expect(create).not.toHaveBeenCalled();
  });

  it('token inválido según Supabase → 401, sin llamar a Anthropic', async () => {
    const { res, create } = await run({}, { user: null, authError: { message: 'invalid JWT' } });
    expect(res.statusCode).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it('Supabase lanza una excepción al validar → 401', async () => {
    const { deps, create } = makeDeps();
    deps.createUserClient = () => ({ auth: { getUser: async () => { throw new Error('red'); } } });
    const res = makeRes();
    await createAnthropicHandler(deps)(makeReq(), res);
    expect(res.statusCode).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it('el mensaje de 401 sirve también a pestañas antiguas (pide recargar)', () => {
    expect(AI_MESSAGES.unauthenticated).toMatch(/Recarga la página/);
  });
});

describe('autorización', () => {
  it.each([
    ['perfil inactivo', { id: USER_ID, role: 'setter', active: false }],
    ['rol no permitido', { id: USER_ID, role: 'company', active: true }],
    ['sin perfil', null],
  ])('%s → 403', async (_, profile) => {
    const { res, create } = await run({}, { profile });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('forbidden');
    expect(create).not.toHaveBeenCalled();
  });

  it.each([['alumno', 'setter'], ['administrador', 'admin']])('%s activo → 200', async (_, role) => {
    const { res, create } = await run({}, { profile: { id: USER_ID, role, active: true } });
    expect(res.statusCode).toBe(200);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('el id de usuario sale del token validado, no del cuerpo', async () => {
    const { res, getUser } = await run({ body: { ...makeReq().body, userId: 'otro', user_id: 'otro' } });
    expect(getUser).toHaveBeenCalledWith('valid-token');
    expect(res.statusCode).toBe(200);
  });
});

describe('método, origen y tamaño', () => {
  it('GET → 405', async () => {
    const { res } = await run({ method: 'GET' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it.each([['origen ajeno', 'https://sitio-ajeno.example'], ['sin origen', null]])('%s → 403', async (_, origin) => {
    const { res, create } = await run({ origin });
    expect(res.statusCode).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it('cuerpo declarado mayor al límite → 413', async () => {
    const { res } = await run({ headers: { 'content-length': '9000000' } });
    expect(res.statusCode).toBe(413);
  });

  it('no se cachea', async () => {
    const { res } = await run();
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});

describe('lista cerrada de operaciones y límites', () => {
  const base = makeReq().body;
  it.each([
    ['operación desconocida', { ...base, operation: 'chat_libre' }],
    ['sin operación', { ...base, operation: undefined }],
    ['operación heredada de Object', { ...base, operation: 'toString' }],
    ['modelo no permitido para la operación', { ...base, model: 'sonnet' }],
    ['maxTokens por encima del tope', { ...base, maxTokens: 801 }],
    ['maxTokens no entero', { ...base, maxTokens: '800' }],
    ['rol de mensaje inválido', { ...base, messages: [{ role: 'system', content: 'x' }] }],
    ['mensajes vacíos', { ...base, messages: [] }],
    ['bloque de tipo desconocido', { ...base, messages: [{ role: 'user', content: [{ type: 'tool_use', id: 'x' }] }] }],
  ])('%s → 400 sin llamar a Anthropic', async (_, body) => {
    const { res, create } = await run({ body });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: AI_MESSAGES.invalid_request, code: 'invalid_request' });
    expect(create).not.toHaveBeenCalled();
  });

  it('el error 400 no revela la lista de modelos ni los topes', async () => {
    const { res } = await run({ body: { ...base, model: 'opus' } });
    expect(JSON.stringify(res.body)).not.toMatch(/sonnet|haiku|800/);
  });

  it('system prompt demasiado largo → 413', async () => {
    const { res, create } = await run({ body: { ...base, systemPrompt: 'x'.repeat(40_001) } });
    expect(res.statusCode).toBe(413);
    expect(create).not.toHaveBeenCalled();
  });

  it('texto total demasiado largo → 413', async () => {
    const { res } = await run({ body: { ...base, messages: [{ role: 'user', content: 'x'.repeat(200_001) }] } });
    expect(res.statusCode).toBe(413);
  });

  const image = (overrides = {}) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=', ...overrides } });
  const extract = (content) => ({ operation: 'analyzer_extract', maxTokens: 2000, messages: [{ role: 'user', content }] });

  it('imagen en una operación sin imágenes → 400', async () => {
    const { res, create } = await run({ body: { ...base, messages: [{ role: 'user', content: [image(), { type: 'text', text: 'x' }] }] } });
    expect(res.statusCode).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('imagen en analyzer_extract → 200 con Sonnet', async () => {
    const { res, create } = await run({ body: extract([image(), { type: 'text', text: 'Extrae la conversación' }]) });
    expect(res.statusCode).toBe(200);
    expect(create.mock.calls[0][0].model).toBe(MODELS.sonnet);
  });

  it.each([
    ['dos imágenes', [image(), image()], 400],
    ['tipo de imagen no permitido', [image({ media_type: 'image/svg+xml' })], 413],
    ['imagen por URL', [{ type: 'image', source: { type: 'url', url: 'https://x' } }], 413],
  ])('analyzer_extract con %s → rechazada', async (_, content, status) => {
    const { res, create } = await run({ body: extract(content) });
    expect(res.statusCode).toBe(status);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('llamada a Anthropic y respuesta', () => {
  it('usa el modelo real de la operación, el tope pedido y el system prompt con caché', async () => {
    const { res, create } = await run();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ text: '{"ok":true}' });
    const params = create.mock.calls[0][0];
    expect(params.model).toBe(MODELS.haiku);
    expect(params.max_tokens).toBe(800);
    expect(params.system[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('sin modelo en el cuerpo usa el de la operación', async () => {
    const { create } = await run({ body: { operation: 'analyzer_extract', maxTokens: 2000, messages: [{ role: 'user', content: 'x' }] } });
    expect(create.mock.calls[0][0].model).toBe(MODELS.sonnet);
    expect(create.mock.calls[0][0].system).toBeUndefined();
  });

  it('set_engine devuelve también stop_reason', async () => {
    const { res } = await run({ body: { operation: 'set_engine', model: 'sonnet', maxTokens: 3000, messages: [{ role: 'user', content: 'x' }] } },
      { anthropicResult: { content: [{ type: 'text', text: 'json' }], stop_reason: 'max_tokens' } });
    expect(res.body).toEqual({ text: 'json', stop_reason: 'max_tokens' });
  });

  it('error de Anthropic → 502 saneado (sin el mensaje original)', async () => {
    const { res } = await run({}, { anthropicError: Object.assign(new Error('credit balance too low for org xyz'), { status: 400 }) });
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: AI_MESSAGES.upstream_error, code: 'upstream_error' });
  });

  it('sin configuración del servidor → 503', async () => {
    const { res, create } = await run({}, { config: { supabaseUrl: '', anonKey: '', anthropicKey: '' } });
    expect(res.statusCode).toBe(503);
    expect(create).not.toHaveBeenCalled();
  });

  it('el registro nunca incluye prompts, mensajes ni el token', async () => {
    const { deps } = await run();
    const logged = JSON.stringify(deps.logEvent.mock.calls);
    expect(logged).not.toMatch(/Eres un prospecto|Hola|valid-token/);
  });
});

describe('catálogo de operaciones', () => {
  it('cada operación tiene modelos conocidos y un tope de tokens razonable', () => {
    for (const [name, op] of Object.entries(AI_OPERATIONS)) {
      expect(op.models.length, name).toBeGreaterThan(0);
      op.models.forEach((m) => expect(Object.keys(MODELS), name).toContain(m));
      expect(op.maxTokens, name).toBeGreaterThan(0);
      expect(op.maxTokens, name).toBeLessThanOrEqual(3000);
    }
    expect(Object.entries(AI_OPERATIONS).filter(([, op]) => op.images).map(([n]) => n)).toEqual(['analyzer_extract']);
  });
});
