const normalize = (value) => (value || '').toString().trim().toLowerCase();

const nicheAffinity = (talentProfile, vacancy) => {
  const talentNiche = normalize(talentProfile?.primary_niche);
  const vacancyNiche = normalize(vacancy?.industry_niche);
  if (!talentNiche || !vacancyNiche) return 0;
  if (talentNiche === vacancyNiche) return 35;
  if (talentNiche.includes(vacancyNiche) || vacancyNiche.includes(talentNiche)) return 20;
  return 0;
};

const roleAndExperienceAffinity = (talentProfile, vacancy) => {
  let points = 0;
  if (talentProfile?.role_type && talentProfile.role_type === vacancy?.role_needed) points += 15;

  const talentTicket = normalize(talentProfile?.ticket_experience);
  const vacancyTicket = normalize(vacancy?.offer_ticket_range);
  if (talentTicket && vacancyTicket) {
    const talentNumbers = talentTicket.match(/\d+/g) || [];
    const vacancyNumbers = vacancyTicket.match(/\d+/g) || [];
    const overlaps = talentNumbers.some((n) => vacancyNumbers.includes(n));
    if (overlaps || talentTicket.includes(vacancyTicket) || vacancyTicket.includes(talentTicket)) points += 10;
  }
  return points;
};

// Bonus por racha activa o nivel alto: se toma el mayor de los dos, no se suman.
const streakOrLevelBonus = (userMetrics) => {
  const streakBonus = Math.min(15, Math.round((Math.min(userMetrics?.currentStreak || 0, 5) / 5) * 15));
  const levelBonus = Math.min(15, Math.round(((userMetrics?.level || 1) / 5) * 15));
  return Math.max(streakBonus, levelBonus);
};

const normalizedScoreBonus = (userMetrics) => {
  const score = Math.max(0, Math.min(100, userMetrics?.avgSetScore || 0));
  return Math.round((score / 100) * 25);
};

/**
 * Función pura: calcula el % de match entre un perfil comercial y una vacante.
 * No hace I/O — recibe los datos ya cargados.
 *
 * @returns {{ score: number, blocked: boolean, reason: string, breakdown: object }}
 */
export const calculateMatchScore = (talentProfile, vacancy, userMetrics) => {
  const avgSetScore = Math.round(userMetrics?.avgSetScore || 0);
  const minRequired = vacancy?.min_set_score ?? 70;

  if (avgSetScore < minRequired) {
    return {
      score: 0,
      blocked: true,
      reason: `Requiere SET Score ${minRequired}. Tu actual es ${avgSetScore} — entrena en el simulador para desbloquear.`,
      breakdown: { niche: 0, roleExperience: 0, bonus: 0, scoreNormalized: 0 },
    };
  }

  const niche = nicheAffinity(talentProfile, vacancy);
  const roleExperience = roleAndExperienceAffinity(talentProfile, vacancy);
  const bonus = streakOrLevelBonus(userMetrics);
  const scoreNormalized = normalizedScoreBonus(userMetrics);

  const score = Math.max(0, Math.min(100, niche + roleExperience + bonus + scoreNormalized));

  return {
    score,
    blocked: false,
    reason: '',
    breakdown: { niche, roleExperience, bonus, scoreNormalized },
  };
};
