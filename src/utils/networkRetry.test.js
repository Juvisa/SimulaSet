// «Failed to fetch» en Primer contacto: un reintento ante cortes de red, nunca
// ante errores con respuesta del servidor ni de formato.
import { describe, expect, it, vi } from 'vitest';
import { isNetworkError, withNetworkRetry } from './networkRetry';
import { AiRequestError } from './anthropic';
import { runPrimerContactoTurn } from './primerContactoTurn';
import { PROFILE, PROJECT } from './primerContacto.fixtures';
import { createControlState } from './primerContactoControl';

const netError = () => new TypeError('Failed to fetch');

describe('isNetworkError', () => {
  it('reconoce el corte de red en Chrome, Firefox y Safari', () => {
    for (const m of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed', 'The network connection was lost.']) {
      expect(isNetworkError(new TypeError(m)), m).toBe(true);
    }
  });
  it('no confunde otros errores', () => {
    expect(isNetworkError(new AiRequestError('Límite', { status: 429 }))).toBe(false);
    expect(isNetworkError(new Error('Respuesta inválida de la IA'))).toBe(false);
    expect(isNetworkError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false);
    expect(isNetworkError(new SyntaxError('Unexpected token'))).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});

describe('withNetworkRetry', () => {
  it('un corte de red se reintenta una vez y, si la segunda llega, se usa', async () => {
    const call = vi.fn().mockRejectedValueOnce(netError()).mockResolvedValueOnce({ ok: 1 });
    await expect(withNetworkRetry(call, { delayMs: 0 })('s', [], { operation: 'simulator_turn' })).resolves.toEqual({ ok: 1 });
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[1]).toEqual(['s', [], { operation: 'simulator_turn' }]);
  });
  it('si el corte persiste, lanza el error de red tras un solo reintento', async () => {
    const call = vi.fn().mockRejectedValue(netError());
    await expect(withNetworkRetry(call, { delayMs: 0 })()).rejects.toThrow('Failed to fetch');
    expect(call).toHaveBeenCalledTimes(2);
  });
  it('los errores con respuesta del servidor o de formato no se reintentan', async () => {
    for (const err of [new AiRequestError('Sesión vencida', { status: 401 }), new AiRequestError('Límite', { status: 429 }), new Error('Respuesta inválida de la IA')]) {
      const call = vi.fn().mockRejectedValue(err);
      await expect(withNetworkRetry(call, { delayMs: 0 })()).rejects.toBe(err);
      expect(call).toHaveBeenCalledTimes(1);
    }
  });
  it('sin errores, una sola llamada', async () => {
    const call = vi.fn().mockResolvedValue({ ok: 1 });
    await withNetworkRetry(call, { delayMs: 0 })();
    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe('turno de Primer contacto con un corte de red', () => {
  const HISTORY = [{ role: 'prospect', content: 'Info' }];
  const COACH = { etapa_set: 'S', que_hizo_bien: 'Bien.', que_mejorar: 'Más.', mensaje_alternativo: '', alerta: '', probabilidad_cita: 30, puntuacion_mensaje: 7, urgencia: [] };
  const PROSPECT = { respuesta_prospecto: 'Tengo la agenda al 60 %.', acepta_cita: 'no', estado_lead: 'interesado' };
  it('el corte del prospecto se recupera con el reintento y el turno sigue normal', async () => {
    let failedOnce = false;
    const raw = vi.fn(async (system) => {
      if (String(system).includes('Eres coach')) return COACH;
      if (!failedOnce) { failedOnce = true; throw netError(); }
      return PROSPECT;
    });
    const r = await runPrimerContactoTurn({ call: withNetworkRetry(raw, { delayMs: 0 }), project: PROJECT, profile: PROFILE, history: HISTORY, setterText: '¿Cómo está tu agenda?', control: createControlState(PROFILE) });
    expect(r.respuesta_prospecto).toBe(PROSPECT.respuesta_prospecto);
    expect(r.coaching.puntuacion_mensaje).toBe(7);
  });
  it('si el corte persiste, el turno falla con el error de red (la pantalla devuelve el mensaje al campo)', async () => {
    const raw = vi.fn(async (system) => { if (String(system).includes('Eres coach')) return COACH; throw netError(); });
    const err = await runPrimerContactoTurn({ call: withNetworkRetry(raw, { delayMs: 0 }), project: PROJECT, profile: PROFILE, history: HISTORY, setterText: '¿Cómo está tu agenda?', control: createControlState(PROFILE) }).catch((e) => e);
    expect(isNetworkError(err)).toBe(true);
  });
});
