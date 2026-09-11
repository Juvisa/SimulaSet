import { supabase } from '../lib/supabase';

const REDEMPTION_FIELDS = 'id, user_id, reward_id, reward_title, xp_spent, status, created_at';

// reward_redemptions solo guarda user_id (RLS ya le permite a un admin leer
// todas las filas vía is_admin(), igual que profiles) — se resuelven los
// nombres con una segunda query y un join en JS, mismo patrón que ya usa
// AdminDashboard.jsx para cruzar profiles con mission_progress.
export const getRewardRedemptions = async () => {
  try {
    const { data: redemptions, error: redemptionsError } = await supabase
      .from('reward_redemptions')
      .select(REDEMPTION_FIELDS)
      .order('created_at', { ascending: false });

    if (redemptionsError) return { redemptions: [], error: redemptionsError.message };
    if (!redemptions?.length) return { redemptions: [], error: '' };

    const userIds = [...new Set(redemptions.map((r) => r.user_id))];
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, name, email')
      .in('id', userIds);

    if (profilesError) return { redemptions: [], error: profilesError.message };

    const profileById = new Map((profiles || []).map((p) => [p.id, p]));
    const enriched = redemptions.map((r) => ({
      ...r,
      student_name: profileById.get(r.user_id)?.name || 'Alumno desconocido',
      student_email: profileById.get(r.user_id)?.email || '',
    }));

    return { redemptions: enriched, error: '' };
  } catch (error) {
    return { redemptions: [], error: error instanceof Error ? error.message : 'Error inesperado' };
  }
};

export const markRedemptionDelivered = async (redemptionId) => {
  try {
    const { data, error } = await supabase
      .from('reward_redemptions')
      .update({ status: 'delivered' })
      .eq('id', redemptionId)
      .select(REDEMPTION_FIELDS)
      .single();

    return { redemption: data || null, error: error?.message || '' };
  } catch (error) {
    return { redemption: null, error: error instanceof Error ? error.message : 'Error inesperado' };
  }
};
