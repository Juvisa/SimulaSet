import { supabase } from '../lib/supabase';
import { countValidSimulations } from './practiceLevel';

// project_name se guarda como snapshot congelado al momento de la sesión (no
// hay foreign key de project_id hacia projects), así que sigue mostrándose
// aunque el proyecto original se haya borrado — es historial de práctica real,
// no debería desaparecer solo porque el perfil del proyecto ya no existe. El
// project_id sí se conserva para que el llamador pueda detectar ese caso (ej.
// comparándolo contra la lista de proyectos activos del usuario) y avisar que
// el proyecto ya no existe, en vez de mostrarlo como si siguiera activo.
export const getSimulatorSessions = async (userId) => {
  const { data, error } = await supabase
    .from('simulator_sessions')
    .select('id, project_id, project_name, mode, average_score, final_state, scores, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return { sessions: [], error: error.message };
  return {
    sessions: (data || []).map((row) => ({
      id: row.id,
      projectId: row.project_id,
      projectName: row.project_name,
      mode: row.mode,
      averageScore: row.average_score,
      finalState: row.final_state,
      scores: Array.isArray(row.scores) ? row.scores : [],
      createdAt: row.created_at,
    })),
    error: undefined,
  };
};

// Número de simulaciones VÁLIDAS (ver isValidSimulation en practiceLevel.js)
// — es el contador que alimenta el nivel de práctica en widgets que no
// necesitan el historial completo (Sidebar, SimulationReport). Trae solo la
// columna scores y filtra con el mismo predicado JS que el resto de la app,
// para no mantener una segunda definición de "válida" en un filtro PostgREST.
export const getValidSimulationCount = async (userId) => {
  const { data, error } = await supabase
    .from('simulator_sessions')
    .select('scores')
    .eq('user_id', userId);

  return { count: countValidSimulations(data), error: error?.message };
};

// LEGACY: cuenta TODAS las filas (incluidas las que no tienen ningún score).
// Solo existe para alimentar getLegacyMatchingLevel() en OpportunityHub con
// exactamente el mismo insumo que antes, de modo que el match score no cambie.
// NO usar para mostrar "simulaciones" ni para el nivel de práctica.
export const getLegacyTotalSessionRowCount = async (userId) => {
  const { count, error } = await supabase
    .from('simulator_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  return { count: count || 0, error: error?.message };
};

export const saveSimulatorSession = async ({ userId, projectId, projectName, mode, scores, finalState }) => {
  const averageScore = Array.isArray(scores) && scores.length > 0
    ? Math.max(0, Math.min(100, Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10)))
    : 0;

  const { data, error } = await supabase
    .from('simulator_sessions')
    .insert({
      user_id: userId,
      project_id: projectId || null,
      project_name: projectName || null,
      mode: mode || null,
      average_score: averageScore,
      final_state: finalState || null,
      scores: Array.isArray(scores) ? scores : [],
    })
    .select('id, average_score, created_at')
    .single();

  return { session: data || null, averageScore, error: error?.message };
};
