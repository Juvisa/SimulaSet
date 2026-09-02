import { supabase } from '../lib/supabase';

const ADMIN_LESSON_FIELDS = 'id, course_id, module_id, lesson_id, title, description, position, topics, published, scheduled_at, video_status';

export const getAllAcademyLessons = async () => {
  try {
    const { data, error } = await supabase
      .from('academy_lessons')
      .select(ADMIN_LESSON_FIELDS)
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

export const createAcademyLesson = async (lesson) => {
  try {
    const { data, error } = await supabase
      .from('academy_lessons')
      .insert({
        course_id: 'set-academy',
        module_id: lesson.module_id,
        lesson_id: lesson.lesson_id,
        title: lesson.title,
        description: lesson.description,
        position: lesson.position,
        topics: lesson.topics,
        published: lesson.published,
        scheduled_at: lesson.scheduled_at,
      })
      .select(ADMIN_LESSON_FIELDS)
      .single();

    return { lesson: data || null, error: error?.message || '' };
  } catch (error) {
    return { lesson: null, error: error instanceof Error ? error.message : 'Error inesperado' };
  }
};

export const updateAcademyLesson = async (id, lesson) => {
  try {
    const { data, error } = await supabase
      .from('academy_lessons')
      .update({
        title: lesson.title,
        description: lesson.description,
        position: lesson.position,
        topics: lesson.topics,
        published: lesson.published,
        scheduled_at: lesson.scheduled_at,
      })
      .eq('id', id)
      .select(ADMIN_LESSON_FIELDS)
      .single();

    return { lesson: data || null, error: error?.message || '' };
  } catch (error) {
    return { lesson: null, error: error instanceof Error ? error.message : 'Error inesperado' };
  }
};

export const deleteAcademyLesson = async (id) => {
  try {
    const { data, error } = await supabase
      .from('academy_lessons')
      .delete()
      .eq('id', id)
      .select('id')
      .single();

    return { deletedId: data?.id || null, error: error?.message || '' };
  } catch (error) {
    return { deletedId: null, error: error instanceof Error ? error.message : 'Error inesperado' };
  }
};
