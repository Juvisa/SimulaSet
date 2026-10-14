import { describe, it, expect, vi, beforeEach } from 'vitest';

const api = {
  getMyPassport: vi.fn(),
  getMyTrainingSessions: vi.fn(),
  getMyOnboardingForPassport: vi.fn(),
};
const market = { getMyCommercialProfile: vi.fn() };
vi.mock('./passportApi', () => api);
vi.mock('../../utils/opportunityMarketplace', () => market);

const { loadPassportSources } = await import('./passportData');

beforeEach(() => {
  vi.clearAllMocks();
  api.getMyPassport.mockResolvedValue({ passport: { headline: 'Setter' }, unavailable: false });
  api.getMyTrainingSessions.mockResolvedValue({ sessions: [{ id: 's1', scores: [8] }] });
  api.getMyOnboardingForPassport.mockResolvedValue({ onboarding: { crm: 'kommo' } });
  market.getMyCommercialProfile.mockResolvedValue({ profile: { primary_niche: 'Info' } });
});

describe('loadPassportSources', () => {
  it('vista profesional: solo lo propio guardado + evidencia; no pide sugerencias', async () => {
    const refreshUser = vi.fn().mockResolvedValue({ user: { set_score: 77 } });
    const result = await loadPassportSources({ userId: 'u1', refreshUser, fallbackSetScore: 10 });
    expect(api.getMyPassport).toHaveBeenCalledWith('u1');
    expect(api.getMyTrainingSessions).toHaveBeenCalledWith('u1');
    expect(market.getMyCommercialProfile).not.toHaveBeenCalled();
    expect(api.getMyOnboardingForPassport).not.toHaveBeenCalled();
    expect(result).toMatchObject({ setScore: 77, commercialProfile: null, onboarding: null, passportRow: { headline: 'Setter' } });
  });

  it('edición: incluye sugerencias de commercial_profiles y onboarding', async () => {
    const refreshUser = vi.fn().mockResolvedValue({ user: { set_score: 77 } });
    const result = await loadPassportSources({ userId: 'u1', refreshUser, fallbackSetScore: 10, withSuggestions: true });
    expect(result.commercialProfile).toEqual({ primary_niche: 'Info' });
    expect(result.onboarding).toEqual({ crm: 'kommo' });
  });

  it('si no se puede refrescar el perfil, usa el SET Score ya cargado (misma fuente oficial)', async () => {
    const refreshUser = vi.fn().mockResolvedValue({ error: 'offline' });
    const result = await loadPassportSources({ userId: 'u1', refreshUser, fallbackSetScore: 64 });
    expect(result.setScore).toBe(64);
  });

  it('propaga errores de carga para que la vista avise antes de descargar', async () => {
    api.getMyTrainingSessions.mockResolvedValue({ sessions: [], error: 'timeout' });
    const result = await loadPassportSources({ userId: 'u1', refreshUser: vi.fn().mockResolvedValue({}), fallbackSetScore: 0 });
    expect(result.error).toBe('timeout');
  });
});
