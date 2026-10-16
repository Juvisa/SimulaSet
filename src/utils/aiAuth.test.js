import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Estado del cliente de Supabase simulado: cada prueba decide qué devuelve getSession.
const authState = { configured: true, getSession: vi.fn() };
vi.mock('../lib/supabase', () => ({
  get supabase() {
    return authState.configured ? { auth: { getSession: authState.getSession } } : null;
  },
}));

const sessionWith = (token) => ({ data: { session: token ? { access_token: token } : null }, error: null });

describe('getAiAuthHeaders', () => {
  beforeEach(() => {
    authState.configured = true;
    authState.getSession.mockReset();
  });

  it('devuelve el token de la sesión como Bearer', async () => {
    authState.getSession.mockResolvedValue(sessionWith('tok-123'));
    const { getAiAuthHeaders } = await import('./aiAuth.js');
    await expect(getAiAuthHeaders()).resolves.toEqual({ Authorization: 'Bearer tok-123' });
  });

  it('sin sesión devuelve {} (la llamada sale igual que antes)', async () => {
    authState.getSession.mockResolvedValue(sessionWith(null));
    const { getAiAuthHeaders } = await import('./aiAuth.js');
    await expect(getAiAuthHeaders()).resolves.toEqual({});
  });

  it('si Supabase no está configurado devuelve {}', async () => {
    authState.configured = false;
    const { getAiAuthHeaders } = await import('./aiAuth.js');
    await expect(getAiAuthHeaders()).resolves.toEqual({});
  });

  it('nunca lanza aunque getSession falle o devuelva algo inesperado', async () => {
    const { getAiAuthHeaders } = await import('./aiAuth.js');
    authState.getSession.mockRejectedValue(new Error('red caída'));
    await expect(getAiAuthHeaders()).resolves.toEqual({});
    authState.getSession.mockImplementation(() => { throw new Error('síncrono'); });
    await expect(getAiAuthHeaders()).resolves.toEqual({});
    authState.getSession.mockResolvedValue(undefined);
    await expect(getAiAuthHeaders()).resolves.toEqual({});
  });
});

describe('callClaude envía el token a /api/anthropic sin cambiar la solicitud', () => {
  const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });
  let fetchMock;

  const loadAnthropic = async (apiKey) => {
    vi.resetModules();
    vi.stubEnv('VITE_ANTHROPIC_API_KEY', apiKey);
    return import('./anthropic.js');
  };

  beforeEach(() => {
    authState.configured = true;
    authState.getSession.mockReset();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('con sesión: añade Authorization y conserva cuerpo y Content-Type', async () => {
    authState.getSession.mockResolvedValue(sessionWith('tok-abc'));
    fetchMock.mockResolvedValue(okResponse({ text: '{"ok":true}' }));
    const { callClaude } = await loadAnthropic('');

    await expect(callClaude('sistema', [{ role: 'user', content: 'hola' }], { model: 'haiku', maxTokens: 800 })).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/anthropic');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer tok-abc' });
    expect(JSON.parse(init.body)).toEqual({ systemPrompt: 'sistema', messages: [{ role: 'user', content: 'hola' }], maxTokens: 800, model: 'haiku' });
    expect(init.body).not.toContain('tok-abc');
  });

  it('sin sesión: la solicitud sale exactamente como antes (sin Authorization)', async () => {
    authState.getSession.mockResolvedValue(sessionWith(null));
    fetchMock.mockResolvedValue(okResponse({ text: '{"ok":true}' }));
    const { callClaude } = await loadAnthropic('');

    await callClaude('sistema', [{ role: 'user', content: 'hola' }]);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('si getSession falla, la llamada a la IA no se interrumpe', async () => {
    authState.getSession.mockRejectedValue(new Error('auth caído'));
    fetchMock.mockResolvedValue(okResponse({ text: '{"ok":true}' }));
    const { callClaude } = await loadAnthropic('');

    await expect(callClaude('s', [{ role: 'user', content: 'x' }])).resolves.toEqual({ ok: true });
  });

  it('el reintento por JSON inválido también envía el token', async () => {
    authState.getSession.mockResolvedValue(sessionWith('tok-retry'));
    fetchMock
      .mockResolvedValueOnce(okResponse({ text: 'no es json' }))
      .mockResolvedValueOnce(okResponse({ text: '{"ok":true}' }));
    const { callClaude } = await loadAnthropic('');

    await expect(callClaude('s', [{ role: 'user', content: 'x' }])).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) expect(init.headers.Authorization).toBe('Bearer tok-retry');
  });

  it('modo desarrollo directo: el token de Supabase NUNCA se envía a api.anthropic.com', async () => {
    authState.getSession.mockResolvedValue(sessionWith('tok-secreto'));
    fetchMock.mockResolvedValue(okResponse({ content: [{ type: 'text', text: '{"ok":true}' }] }));
    const { callClaude } = await loadAnthropic('sk-dev-local');

    await callClaude('s', [{ role: 'user', content: 'x' }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers.Authorization).toBeUndefined();
    expect(JSON.stringify(init)).not.toContain('tok-secreto');
    expect(authState.getSession).not.toHaveBeenCalled();
  });
});
