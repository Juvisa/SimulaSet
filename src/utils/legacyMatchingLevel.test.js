import { describe, it, expect } from 'vitest';
import { getLegacyMatchingLevel } from './legacyMatchingLevel';
import { calculateMatchScore } from './matchingAlgorithm';

// Garantiza que separar el nivel de práctica NO cambió el % de match: la señal
// legacy conserva la escala 1–5 y los thresholds históricos (sesiones + SET
// Score), y calculateMatchScore la consume por su nombre explícito.
describe('legacyMatchingLevel (compatibilidad temporal del matching)', () => {
  it.each([
    [0, 0, 1],
    [5, 50, 2],
    [10, 65, 3],
    [15, 80, 4],
    [20, 90, 5],
    [25, 80, 4],
    [32, 75, 3],
    [100, 49, 1],
  ])('%i filas + SET Score %i → %i', (sessions, score, expected) => {
    expect(getLegacyMatchingLevel(sessions, score)).toBe(expected);
  });

  it('calculateMatchScore usa legacyMatchingLevel y no otras propiedades de nivel', () => {
    const profile = { primary_niche: 'fitness', role_type: 'setter' };
    const vacancy = { industry_niche: 'fitness', role_needed: 'setter', min_set_score: 70 };
    const base = { avgSetScore: 80, currentStreak: 0 };

    const legacy4 = calculateMatchScore(profile, vacancy, { ...base, legacyMatchingLevel: 4 });
    // Un nivel de práctica (rank 6) presente en el objeto no debe afectar el match.
    const withPractice = calculateMatchScore(profile, vacancy, {
      ...base, legacyMatchingLevel: 4, practiceLevel: { rank: 6 }, level: 6,
    });
    expect(withPractice.score).toBe(legacy4.score);
    expect(legacy4.breakdown.bonus).toBe(12);
  });
});
