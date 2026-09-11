import { supabase } from '../lib/supabase';

const TRANSCRIPT_SELECT = 'id, session_title, session_date, session_type, content, created_at';

export const getMentorshipTranscripts = async (userId) => {
  const { data, error } = await supabase
    .from('mentorship_transcripts')
    .select(TRANSCRIPT_SELECT)
    .eq('user_id', userId)
    .order('session_date', { ascending: false });

  return { transcripts: data || [], error: error?.message };
};
