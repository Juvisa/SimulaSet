import { getMyCommercialProfile } from '../../utils/opportunityMarketplace';
import { getMyPassport, getMyOnboardingForPassport, getMyTrainingSessions } from './passportApi';

// Carga compartida por la edición (/passport) y la vista profesional
// (/passport/vista). Siempre desde la sesión del propio alumno (RLS limita
// cada consulta a sus filas) y siempre fresca: historial completo paginado
// + SET Score recién leído de profiles. `withSuggestions` solo lo usa la
// edición, para precargar datos ya declarados en otras pantallas.
export const loadPassportSources = async ({ userId, refreshUser, fallbackSetScore, withSuggestions = false }) => {
  const [passportResult, sessionsResult, freshUser, commercialResult, onboardingResult] = await Promise.all([
    getMyPassport(userId),
    getMyTrainingSessions(userId),
    refreshUser(),
    withSuggestions ? getMyCommercialProfile(userId) : Promise.resolve({ profile: null }),
    withSuggestions ? getMyOnboardingForPassport(userId) : Promise.resolve({ onboarding: null }),
  ]);

  return {
    passportRow: passportResult.passport,
    unavailable: passportResult.unavailable,
    sessions: sessionsResult.sessions,
    setScore: freshUser?.user?.set_score ?? fallbackSetScore,
    commercialProfile: commercialResult.profile,
    onboarding: onboardingResult.onboarding,
    error: passportResult.error || sessionsResult.error,
  };
};
