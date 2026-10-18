import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Estado del cliente de Supabase simulado: cada prueba decide qué devuelven
// getSession y refreshSession.
const authState = { configured: true, getSession: vi.fn(), refreshSession: vi.fn() };
vi.mock('../lib/supabase', () => ({
  get supabase() {
    return authState.configured ? { auth: { getSession: authState.getSession, refreshSession: authState.refreshSession } } : null;
  },
}));

const sessionWith = (token) => ({ data: { session: token ? { access_token: token } : null }, error: null });
const resetAuth = () => {
  authState.configured = true;
  authState.getSession.mockReset();
  authState.refreshSession.mockReset();
};

describe('getAiAuthHeaders', () => {
  beforeEach(resetAuth);

  it('devuelve el token de la sesión como Bearer', async () => {
    authState.getSession.mockResolvedValue(sessionWith('tok-123'));
    const { getAiAuthHeaders } = await import('./aiAuth.js');
    await expect(getAiAuthHeaders()).resolves.toEqual({ Authorization: 'Bearer tok-123' });
    expect(authState.refreshSession).not.toHaveBeenCalled();
  });

  it('con { refresh: true } renueva la sesión y usa el token nuevo', async () => {
    authState.refreshSession.mockResolvedValue(sessionWith('tok-nuevo'));
    const { getAiAuthHeaders } = await import('./aiAuth.js');
    await expect(getAiAuthHeaders({ refresh: true })).resolves.toEqual({ Authorization: 'Bearer tok-nuevo' });
    expect(authState.getSession).not.toHaveBeenCalled();
  });

  it('sin sesión devuelve {}', async () => {
    authState.getSession.mockResolvedValue(sessionWith(null));
    const { getAiAuthHeaders } = await import('./aiAuth.js');
    await expect(getAiAuthHeaders()).resolves.toEqual({});
  });

  it('si Supabase no está configurado devuelve {}', async () => {
    authState.configured = false;
    const { getAiAuthHeaders } = await import('./aiAuth.js');
    await expect(getAiAuthHeaders()).resolves.toEqual({});
  });

  it('nunca lanza aunque getSession o refreshSession fallen o devuelvan algo inesperado', async () => {
    const { getAiAuthHeaders } = await import('./aiAuth.js');
    authState.getSession.mockRejectedValue(new Error('red caída'));
    await expect(getAiAuthHeaders()).resolves.toEqual({});
    authState.getSession.mockImplementation(() => { throw new Error('síncrono'); });
    await expect(getAiAuthHeaders()).resolves.toEqual({});
    authState.getSession.mockResolvedValue(undefined);
    await expect(getAiAuthHeaders()).resolves.toEqual({});
    authState.refreshSession.mockRejectedValue(new Error('refresh caído'));
    await expect(getAiAuthHeaders({ refresh: true })).resolves.toEqual({});
  });
});

describe('cliente de /api/anthropic: sesión, operación y errores', () => {
  const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });
  const errorResponse = (status, code, error = `mensaje ${code}`) => ({ ok: false, status, json: async () => ({ error, code }) });
  let fetchMock;

  const loadAnthropic = async (apiKey = '') => {
    vi.resetModules();
    vi.stubEnv('VITE_ANTHROPIC_API_KEY', apiKey);
    return import('./anthropic.js');
  };

  beforeEach(() => {
    resetAuth();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('con sesión: envía Authorization, la operación y el cuerpo; el token no va en el cuerpo', async () => {
    authState.getSession.mockResolvedValue(sessionWith('tok-abc'));
    fetchMock.mockResolvedValue(okResponse({ text: '{"ok":true}' }));
    const { callClaude } = await loadAnthropic();

    await expect(callClaude('sistema', [{ role: 'user', content: 'hola' }], { model: 'haiku', maxTokens: 800, operation: 'simulator_turn' })).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/anthropic');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer tok-abc' });
    expect(JSON.parse(init.body)).toEqual({ operation: 'simulator_turn', systemPrompt: 'sistema', messages: [{ role: 'user', content: 'hola' }], maxTokens: 800, model: 'haiku' });
    expect(init.body).not.toContain('tok-abc');
  });

  it('sin operación declarada: no llama al servidor', async () => {
    authState.getSession.mockResolvedValue(sessionWith('tok'));
    const { callClaude, AiRequestError } = await loadAnthropic();
    const error = await callClaude('s', [{ role: 'user', content: 'x' }]).catch((e) => e);
    expect(error).toBeInstanceOf(AiRequestError);
    expect(error.code).toBe('missing_operation');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('401: renueva la sesión una vez y reintenta con el token nuevo', async () => {
    authState.getSession.mockResolvedValue(sessionWith('tok-viejo'));
    authState.refreshSession.mockResolvedValue(sessionWith('tok-nuevo'));
    fetchMock
      .mockResolvedValueOnce(errorResponse(401, 'unauthenticated'))
      .mockResolvedValueOnce(okResponse({ text: '{"ok":true}' }));
    const { callClaude } = await loadAnthropic();

    await expect(callClaude('s', [{ role: 'user', content: 'x' }], { operation: 'simulation_report', maxTokens: 2000 })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok-viejo');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer tok-nuevo');
    expect(authState.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('401 persistente: un solo reintento y error con el mensaje del servidor', async () => {
    authState.getSession.mockResolvedValue(sessionWith('tok'));
    authState.refreshSession.mockResolvedValue(sessionWith(null));
    fetchMock.mockResolvedValue(errorResponse(401, 'unauthenticated', 'Tu sesión expiró. Recarga la página.'));
    const { callClaude, AiRequestError } = await loadAnthropic();

    const error = await callClaude('s', [{ role: 'user', content: 'x' }], { operation: 'simulator_turn', model: 'haiku', maxTokens: 800 }).catch((e) => e);
    expect(error).toBeInstanceOf(AiRequestError);
    expect(error).toMatchObject({ status: 401, code: 'unauthenticated', message: 'Tu sesión expiró. Recarga la página.' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([[403, 'forbidden'], [429, 'rate_limited'], [413, 'too_large'], [502, 'upstream_error']])('%s: sin reintento y sin pasar por el reintento de JSON', async (status, code) => {
    authState.getSession.mockResolvedValue(sessionWith('tok'));
    fetchMock.mockResolvedValue(errorResponse(status, code));
    const { callClaude } = await loadAnthropic();

    const error = await callClaude('s', [{ role: 'user', content: 'x' }], { operation: 'briefing', maxTokens: 2500 }).catch((e) => e);
    expect(error).toMatchObject({ status, code, message: `mensaje ${code}` });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authState.refreshSession).not.toHaveBeenCalled();
  });

  it('el reintento por JSON inválido mantiene token y operación', async () => {
    authState.getSession.mockResolvedValue(sessionWith('tok-retry'));
    fetchMock
      .mockResolvedValueOnce(okResponse({ text: 'no es json' }))
      .mockResolvedValueOnce(okResponse({ text: '{"ok":true}' }));
    const { callClaude } = await loadAnthropic();

    await expect(callClaude('s', [{ role: 'user', content: 'x' }], { operation: 'follow_up', maxTokens: 2000 })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers.Authorization).toBe('Bearer tok-retry');
      expect(JSON.parse(init.body).operation).toBe('follow_up');
    }
  });

  it('SET Engine declara su operación y recibe stop_reason', async () => {
    authState.getSession.mockResolvedValue(sessionWith('tok'));
    fetchMock.mockResolvedValue(okResponse({ text: '{}', stop_reason: 'max_tokens' }));
    const { createSetEngineCaller } = await loadAnthropic();
    const { requestClaude } = await import('./anthropic.js');
    await createSetEngineCaller(requestClaude)('s', [{ role: 'user', content: 'x' }], {}).catch(() => {});
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).operation).toBe('set_engine');
  });

  it('modo desarrollo directo: el token de Supabase NUNCA se envía a api.anthropic.com', async () => {
    authState.getSession.mockResolvedValue(sessionWith('tok-secreto'));
    fetchMock.mockResolvedValue(okResponse({ content: [{ type: 'text', text: '{"ok":true}' }] }));
    const { callClaude } = await loadAnthropic('sk-dev-local');

    await callClaude('s', [{ role: 'user', content: 'x' }], { operation: 'simulator_turn' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers.Authorization).toBeUndefined();
    expect(JSON.stringify(init)).not.toContain('tok-secreto');
    expect(authState.getSession).not.toHaveBeenCalled();
  });
});
