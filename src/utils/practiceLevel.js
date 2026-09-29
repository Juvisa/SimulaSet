// ─── Nivel de práctica — FUENTE ÚNICA DE VERDAD ──────────────────────────────
//
// Responde SOLO "¿cuánto ha entrenado esta persona?". Se calcula únicamente
// con el número de simulaciones VÁLIDAS. No participa el SET Score (que ya
// representa desempeño y se lee tal cual de profiles.set_score), ni la
// elegibilidad SET Match, ni Setter Verified, ni ninguna certificación.
//
// Ningún componente debe declarar thresholds de nivel propios: todo pasa por
// este módulo (PRACTICE_LEVELS, getPracticeLevel, getPracticeMinimumStatus).

// Simulación válida = sesión con al menos un score de coaching guardado.
// Es exactamente la misma población que usa el trigger recalculate_set_score()
// para el SET Score (jsonb_array_length(scores) > 0, ver
// 202609100002_fix_set_score_average.sql) y la vista leaderboard_stats
// (202609290001_leaderboard_count_valid_simulations.sql). No depende de
// final_state ni distingue cierre natural vs botón "Terminar".
export const isValidSimulation = (session) =>
  Array.isArray(session?.scores) && session.scores.length > 0;

export const countValidSimulations = (sessions) =>
  (Array.isArray(sessions) ? sessions : []).filter(isValidSimulation).length;

// Volumen mínimo de entrenamiento. Es SOLO un indicador de volumen: NO
// significa "listo para proyecto", "elegible SET Match", "Setter Verified",
// certificado ni profesional. La elegibilidad SET Match es, por ahora, una
// decisión administrativa y no se calcula en ningún lugar del frontend.
export const PRACTICE_MINIMUM_SIMULATIONS = 20;

export const PRACTICE_LEVELS = [
  { id: 'en_inicio', rank: 1, name: 'En inicio', icon: '🌱', minSimulations: 0, color: '#9A9A9A' },
  { id: 'en_practica', rank: 2, name: 'En práctica', icon: '🔄', minSimulations: 5, color: '#2563EB' },
  { id: 'entrenado', rank: 3, name: 'Entrenado', icon: '⚡', minSimulations: 10, color: '#C9920A' },
  { id: 'avanzado', rank: 4, name: 'Avanzado', icon: '🔥', minSimulations: 20, color: '#E0605E' },
  { id: 'intensivo', rank: 5, name: 'Intensivo', icon: '💎', minSimulations: 40, color: '#7C3AED' },
  { id: 'dominio_practica', rank: 6, name: 'Dominio de práctica', icon: '🏆', minSimulations: 70, color: '#1D9E75' },
];

const normalizeCount = (validSimulations) => {
  const n = Number(validSimulations);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

export const getPracticeLevel = (validSimulations) => {
  const count = normalizeCount(validSimulations);
  let result = PRACTICE_LEVELS[0];
  PRACTICE_LEVELS.forEach((level) => {
    if (count >= level.minSimulations) result = level;
  });
  return result;
};

export const getPracticeLevelById = (id) =>
  PRACTICE_LEVELS.find((level) => level.id === id) || PRACTICE_LEVELS[0];

export const getPracticeProgress = (validSimulations) => {
  const count = normalizeCount(validSimulations);
  const current = getPracticeLevel(count);
  const next = PRACTICE_LEVELS.find((level) => level.rank === current.rank + 1) || null;
  if (!next) {
    return { percent: 100, next: null, simulationsToGo: 0, label: 'Nivel de práctica máximo alcanzado' };
  }
  const span = next.minSimulations - current.minSimulations;
  const percent = Math.round(((count - current.minSimulations) / span) * 100);
  const simulationsToGo = next.minSimulations - count;
  return {
    percent,
    next,
    simulationsToGo,
    label: `${next.name}: ${count}/${next.minSimulations} simulaciones válidas`,
  };
};

export const getPracticeMinimumStatus = (validSimulations) => {
  const count = normalizeCount(validSimulations);
  const met = count >= PRACTICE_MINIMUM_SIMULATIONS;
  return {
    met,
    label: met ? '✓ Mínimo de práctica cumplido' : 'En entrenamiento',
    validSimulations: count,
    required: PRACTICE_MINIMUM_SIMULATIONS,
    remaining: Math.max(0, PRACTICE_MINIMUM_SIMULATIONS - count),
  };
};

// Resumen visible de un setter: tres métricas INDEPENDIENTES. El SET Score se
// pasa tal cual (sin recalcular ni ajustar) — este módulo nunca lo modifica ni
// lo usa para clasificar.
export const getPracticeSummary = ({ validSimulations, setScore }) => ({
  validSimulations: normalizeCount(validSimulations),
  practiceLevel: getPracticeLevel(validSimulations),
  practiceMinimum: getPracticeMinimumStatus(validSimulations),
  setScore,
});
