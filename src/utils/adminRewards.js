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

// Sube (o reemplaza) el archivo maestro de una recompensa digital de la
// Tienda XP en el bucket privado 'reward-files'. RLS solo permite este
// insert/update a un admin (ver migración 202609150001) — el mismo File del
// <input> se sube tal cual, sin reescribir ni regenerar contenido, tal como
// exige el spec de la Tienda XP.
export const uploadRewardFile = async (reward, file) => {
  try {
    const path = `${reward.id}/${reward.fileName}`;
    const { error } = await supabase.storage
      .from('reward-files')
      .upload(path, file, { upsert: true, contentType: file.type });

    return { error: error?.message || '' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Error inesperado' };
  }
};

// Para que AdminRewards muestre qué recompensas YA tienen su archivo subido
// (y cuáles todavía faltan) — verifica, por cada recompensa, si su archivo
// exacto existe dentro de su propia carpeta {reward.id}/ en el bucket.
export const getUploadedRewardIds = async (rewards) => {
  try {
    const results = await Promise.all(
      rewards.map(async (reward) => {
        const { data } = await supabase.storage.from('reward-files').list(reward.id, { search: reward.fileName });
        return (data || []).some((entry) => entry.name === reward.fileName) ? reward.id : null;
      })
    );
    return { rewardIds: new Set(results.filter(Boolean)), error: '' };
  } catch (error) {
    return { rewardIds: new Set(), error: error instanceof Error ? error.message : 'Error inesperado' };
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
