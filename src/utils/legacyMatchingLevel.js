// ─── legacyMatchingLevel — COMPATIBILIDAD TEMPORAL, NO ES UN NIVEL VISIBLE ──
//
// Única razón de existir: calculateMatchScore() (matchingAlgorithm.js) usa una
// escala histórica 1–5 para el bonus streakOrLevelBonus del % de match en
// OpportunityHub. Cuando el nivel visible pasó a ser el nivel de práctica
// (practiceLevel.js, 6 niveles, solo volumen), se separó esta señal para que
// ese cambio NO alterara silenciosamente el match score.
//
// - NO representa el nivel de práctica (ver practiceLevel.js).
// - NO debe mostrarse en ninguna UI como nivel del setter.
// - Conserva EXACTAMENTE la fórmula e insumos anteriores (conteo de todas las
//   filas de simulator_sessions + profiles.set_score), por eso el match score
//   queda idéntico al de antes de este cambio.
// - Debe revisarse (y probablemente eliminarse) cuando se trabaje formalmente
//   el matching de oportunidades / SET Match.
const LEGACY_MATCHING_THRESHOLDS = [
  { value: 1, minSessions: 0, minAvg: 0 },
  { value: 2, minSessions: 5, minAvg: 50 },
  { value: 3, minSessions: 10, minAvg: 65 },
  { value: 4, minSessions: 15, minAvg: 80 },
  { value: 5, minSessions: 20, minAvg: 90 },
];

export const getLegacyMatchingLevel = (sessionRowCount, setScore) => {
  const totalSessions = Number.isFinite(sessionRowCount) ? sessionRowCount : 0;
  const avg = Number.isFinite(setScore) ? setScore : 0;
  let result = 1;
  LEGACY_MATCHING_THRESHOLDS.forEach((item) => {
    if (totalSessions >= item.minSessions && avg >= item.minAvg) result = item.value;
  });
  return result;
};
