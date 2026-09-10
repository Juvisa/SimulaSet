import { supabase } from '../lib/supabase';
import { getUserStreak } from './xp';

// Fuente única de verdad del SET Score: profiles.set_score (Supabase), recalculada
// automáticamente por un trigger cada vez que se guarda una sesión en
// simulator_sessions. Tanto "Soy Comercial" como "Soy Empresa" leen de aquí — ya no
// hay ninguna dependencia de localStorage para este cálculo.
export const getMySetScore = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('set_score')
    .eq('id', userId)
    .maybeSingle();

  return { setScore: data?.set_score ?? 0, error: error?.message };
};

export const getVictoryCount = async (userId) => {
  const { count, error } = await supabase
    .from('community_posts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('post_type', 'victoria');

  return { count: count || 0, error: error?.message };
};

// Usada por el admin para ver el SET Score de CUALQUIER candidato en la bandeja de
// talento (antes usaba daily_mission_progress como proxy; ahora lee la misma columna
// profiles.set_score que usa el propio alumno, unificando la fuente de verdad).
export const getAdminVisibleMetrics = async (userId) => {
  const [{ setScore }, { streak }, { count: victoryCount }] = await Promise.all([
    getMySetScore(userId),
    getUserStreak(userId),
    getVictoryCount(userId),
  ]);

  return {
    avgSetScore: setScore,
    currentStreak: streak?.current_streak || 0,
    victoryCount,
  };
};

export const getUserTalentMetrics = async ({ userId, level }) => {
  const [{ setScore, error: scoreError }, { streak }, { count: victoryCount, error: victoryError }] = await Promise.all([
    getMySetScore(userId),
    getUserStreak(userId),
    getVictoryCount(userId),
  ]);

  return {
    avgSetScore: setScore,
    currentStreak: streak?.current_streak || 0,
    level: level || 1,
    victoryCount,
    error: scoreError || victoryError,
  };
};
