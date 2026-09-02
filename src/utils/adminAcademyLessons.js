import { supabase } from '../lib/supabase';

export const getAllAcademyLessons = async () => {
  try {
    const { data, error } = await supabase
      .from('academy_lessons')
      .select('id, course_id, module_id, lesson_id, title, position, published, scheduled_at, video_status')
      .order('module_id', { ascending: true })
      .order('position', { ascending: true })
      .order('lesson_id', { ascending: true });

    return { lessons: data || [], error: error?.message || '' };
  } catch (error) {
    return {
      lessons: [],
      error: error instanceof Error ? error.message : 'Error inesperado',
    };
  }
};
