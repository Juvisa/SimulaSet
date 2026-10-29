// Preview local: no se guarda nada. Se muestra la fila que la aplicación
// habría insertado en simulator_sessions (mismo cálculo de average_score que
// src/utils/simulatorSessions.js).
import { sandbox } from '../state.js';

export const saveSimulatorSession = async ({ mode, scores, finalState }) => {
  const averageScore = Array.isArray(scores) && scores.length > 0
    ? Math.max(0, Math.min(100, Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10)))
    : 0;
  sandbox.recordSave({ mode: mode || null, final_state: finalState || null, scores: Array.isArray(scores) ? scores : [], average_score: averageScore });
  return { session: null, averageScore, error: undefined };
};
