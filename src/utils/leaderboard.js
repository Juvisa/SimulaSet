import { supabase } from '../lib/supabase';

const LEADERBOARD_SELECT = 'user_id, name, avatar_url, set_score, lifetime_xp, current_streak, simulaciones_realizadas, misiones_completadas';

// Solo alumnos con al menos 1 simulación real cuentan para el Cuadro de Honor —
// evita mostrar públicamente a alumnos en cero absoluto (ver conversación sobre
// el criterio de mérito: simulaciones > SET Score > XP histórico).
export const getTopPerformers = async (limit = 3) => {
  const { data, error } = await supabase
    .from('leaderboard_stats')
    .select(LEADERBOARD_SELECT)
    .gt('simulaciones_realizadas', 0)
    .order('simulaciones_realizadas', { ascending: false })
    .order('set_score', { ascending: false })
    .order('lifetime_xp', { ascending: false })
    .limit(limit);

  return { performers: data || [], error: error?.message };
};
