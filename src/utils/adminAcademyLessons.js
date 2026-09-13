import { supabase } from '../lib/supabase';

const ADMIN_LESSON_FIELDS = 'id, course_id, module_id, lesson_id, title, description, position, topics, resources, published, scheduled_at, video_status';

// 23505 = unique_violation (Postgres). El único UNIQUE real de la tabla es
// (course_id, module_id, lesson_id) — si llega aquí es porque ya existe una
// clase con esa combinación (posiblemente no cargada aún en el listado local).
// 42501 = insufficient_privilege, lo que Postgres devuelve cuando la política
// RLS de INSERT/UPDATE (academy_lessons_insert_admin / _update_admin, que
// exigen is_admin()) rechaza la escritura — antes este caso llegaba al usuario
// como el mensaje crudo de Postgres en vez de una explicación clara.
const friendlyError = (error) => {
  if (!error) return '';
  if (error.code === '23505') return 'Ya existe una clase con ese módulo e ID de lección.';
  if (error.code === '42501') return 'Tu cuenta no tiene permisos de administrador para guardar esta clase. Verifica tu sesión e inténtalo de nuevo.';
  return error.message || 'Error inesperado al guardar la clase.';
};

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
        resources: lesson.resources,
        published: lesson.published,
        scheduled_at: lesson.scheduled_at,
      })
      .select(ADMIN_LESSON_FIELDS)
      .single();

    return { lesson: data || null, error: friendlyError(error) };
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
        resources: lesson.resources,
        published: lesson.published,
        scheduled_at: lesson.scheduled_at,
      })
      .eq('id', id)
      .select(ADMIN_LESSON_FIELDS)
      .single();

    return { lesson: data || null, error: friendlyError(error) };
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
