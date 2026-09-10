import { supabase } from '../lib/supabase';

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
