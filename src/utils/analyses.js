import { supabase } from '../lib/supabase';

const ANALYSIS_FIELDS = 'id, project_id, project_name, mode, conversation_text, result, created_at';

export const getAnalyses = async (userId) => {
  const { data, error } = await supabase
    .from('analyses')
    .select(ANALYSIS_FIELDS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return { analyses: data || [], error: error?.message };
};

export const createAnalysis = async ({ userId, projectId, projectName, mode, conversationText, result }) => {
  const { data, error } = await supabase
    .from('analyses')
    .insert({
      user_id: userId,
      project_id: projectId || null,
      project_name: projectName || null,
      mode: mode || null,
      conversation_text: conversationText,
      result,
    })
    .select(ANALYSIS_FIELDS)
    .single();

  return { analysis: data || null, error: error?.message };
};
