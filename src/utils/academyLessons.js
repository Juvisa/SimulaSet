import { supabase } from '../lib/supabase';

export const getPublishedAcademyLessons = async (courseId) => {
  try {
    const { data, error } = await supabase
      .from('academy_lessons')
      .select('id, course_id, module_id, lesson_id, title, description, position, topics, resources, scheduled_at, video_provider, mux_playback_id, mux_playback_policy, video_status, duration_seconds')
      .eq('course_id', courseId)
      .eq('published', true)
      .order('module_id', { ascending: true })
      .order('position', { ascending: true });

    return { lessons: data || [], error: error?.message };
  } catch (error) {
    return { lessons: [], error: error instanceof Error ? error.message : 'Error inesperado' };
  }
};
