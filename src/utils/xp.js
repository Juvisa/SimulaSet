import { supabase } from '../lib/supabase';

const STREAK_SELECT = 'current_streak, longest_streak, total_xp, lifetime_xp, last_completed_date';

export const getUserStreak = async (userId) => {
  const { data, error } = await supabase
    .from('user_streaks')
    .select(STREAK_SELECT)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { streak: null, error: error.message };
  return {
    streak: data || { current_streak: 0, longest_streak: 0, total_xp: 0, lifetime_xp: 0, last_completed_date: null },
    error: undefined,
  };
};

export const addXp = async ({ userId, amount }) => {
  const { streak: current, error: readError } = await getUserStreak(userId);
  if (readError) return { streak: null, error: readError };

  const payload = {
    user_id: userId,
    current_streak: current.current_streak || 0,
    longest_streak: current.longest_streak || 0,
    total_xp: (current.total_xp || 0) + amount,
    lifetime_xp: (current.lifetime_xp || 0) + amount,
    last_completed_date: current.last_completed_date,
  };

  const { data, error } = await supabase
    .from('user_streaks')
    .upsert(payload, { onConflict: 'user_id' })
    .select(STREAK_SELECT)
    .single();

  return { streak: data || null, error: error?.message };
};
