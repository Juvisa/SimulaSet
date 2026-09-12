import { supabase } from '../lib/supabase';

const FEEDBACK_FIELDS = 'id, target_user_id, admin_id, simulator_session_id, lead_ref_id, comment, seen, created_at';

export const getPendingFeedback = async (userId) => {
  const { data, error } = await supabase
    .from('admin_feedback')
    .select(FEEDBACK_FIELDS)
    .eq('target_user_id', userId)
    .eq('seen', false)
    .order('created_at', { ascending: true });

  return { feedback: data || [], error: error?.message };
};

export const markFeedbackSeen = async (feedbackId) => {
  const { error } = await supabase
    .from('admin_feedback')
    .update({ seen: true })
    .eq('id', feedbackId);

  return { error: error?.message };
};

export const getFeedbackForSession = async (sessionId) => {
  const { data, error } = await supabase
    .from('admin_feedback')
    .select(FEEDBACK_FIELDS)
    .eq('simulator_session_id', sessionId)
    .order('created_at', { ascending: true });

  return { feedback: data || [], error: error?.message };
};

export const getFeedbackForLead = async (leadId) => {
  const { data, error } = await supabase
    .from('admin_feedback')
    .select(FEEDBACK_FIELDS)
    .eq('lead_ref_id', leadId)
    .order('created_at', { ascending: true });

  return { feedback: data || [], error: error?.message };
};

export const createSessionFeedback = async ({ sessionId, targetUserId, adminId, comment }) => {
  const { data, error } = await supabase
    .from('admin_feedback')
    .insert({ simulator_session_id: sessionId, target_user_id: targetUserId, admin_id: adminId, comment })
    .select(FEEDBACK_FIELDS)
    .single();

  return { feedback: data || null, error: error?.message };
};

export const createLeadFeedback = async ({ leadId, targetUserId, adminId, comment }) => {
  const { data, error } = await supabase
    .from('admin_feedback')
    .insert({ lead_ref_id: leadId, target_user_id: targetUserId, admin_id: adminId, comment })
    .select(FEEDBACK_FIELDS)
    .single();

  return { feedback: data || null, error: error?.message };
};
