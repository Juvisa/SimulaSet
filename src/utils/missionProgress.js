import { supabase } from '../lib/supabase';

const VALID_STATUSES = new Set(['in_progress', 'completed']);

export const getMissionProgress = async ({ userId, missionId }) => {
  const { data, error } = await supabase
    .from('mission_progress')
    .select('mission_id, responses, status, started_at, completed_at, updated_at')
    .eq('user_id', userId)
    .eq('mission_id', missionId)
    .maybeSingle();

  return { progress: data || null, error: error?.message };
};

export const startMissionProgress = async ({ userId, missionId }) => {
  const payload = {
    user_id: userId,
    mission_id: missionId,
    responses: {},
    status: 'in_progress',
    completed_at: null,
  };

  const { data, error } = await supabase
    .from('mission_progress')
    .upsert(payload, { onConflict: 'user_id,mission_id', ignoreDuplicates: true })
    .select('mission_id, responses, status, started_at, completed_at, updated_at')
    .maybeSingle();

  if (error) return { progress: null, error: error.message };
  if (data) return { progress: data, error: undefined };
  return getMissionProgress({ userId, missionId });
};

export const saveMissionProgress = async ({ userId, missionId, responses, status = 'in_progress' }) => {
  if (!VALID_STATUSES.has(status)) return { progress: null, error: 'Estado de misión inválido.' };
  if (!responses || Array.isArray(responses) || typeof responses !== 'object') {
    return { progress: null, error: 'Las respuestas de la misión son inválidas.' };
  }

  const payload = {
    user_id: userId,
    mission_id: missionId,
    responses,
    status,
    completed_at: status === 'completed' ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase
    .from('mission_progress')
    .upsert(payload, { onConflict: 'user_id,mission_id' })
    .select('mission_id, responses, status, started_at, completed_at, updated_at')
    .single();

  return { progress: data || null, error: error?.message };
};
