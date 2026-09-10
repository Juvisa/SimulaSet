import { supabase } from '../lib/supabase';
import { getSessions } from './storage';
import { getUserStreak } from './xp';

export const getAverageSetScore = (userId) => {
  const sessions = getSessions(userId);
  if (sessions.length === 0) return 0;

  const scores = sessions.map((session) => {
    if (!Array.isArray(session.scores) || session.scores.length === 0) return 0;
    const avg = session.scores.reduce((a, b) => a + b, 0) / session.scores.length;
    return Math.round(avg * 10);
  });

  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
};

export const getVictoryCount = async (userId) => {
  const { count, error } = await supabase
    .from('community_posts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('post_type', 'victoria');

  return { count: count || 0, error: error?.message };
};

// A diferencia de getAverageSetScore (localStorage, solo accesible para el propio
// usuario en su navegador), esta función solo usa datos de Supabase, por lo que un
// admin puede consultarla para CUALQUIER candidato en la bandeja de talento.
export const getAdminVisibleMetrics = async (userId) => {
  const [{ streak }, { count: victoryCount }, { data: dailyRows }] = await Promise.all([
    getUserStreak(userId),
    getVictoryCount(userId),
    supabase
      .from('daily_mission_progress')
      .select('set_score_achieved')
      .eq('user_id', userId)
      .not('set_score_achieved', 'is', null),
  ]);

  const scores = (dailyRows || []).map((row) => row.set_score_achieved).filter(Number.isFinite);
  const avgSetScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return {
    avgSetScore,
    currentStreak: streak?.current_streak || 0,
    victoryCount,
  };
};

export const getUserTalentMetrics = async ({ userId, level }) => {
  const avgSetScore = getAverageSetScore(userId);
  const [{ streak }, { count: victoryCount, error: victoryError }] = await Promise.all([
    getUserStreak(userId),
    getVictoryCount(userId),
  ]);

  return {
    avgSetScore,
    currentStreak: streak?.current_streak || 0,
    level: level || 1,
    victoryCount,
    error: victoryError,
  };
};
