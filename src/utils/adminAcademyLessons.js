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

// Objeto de error crudo de PostgREST/Postgres (code, message, details, hint)
// para mostrarlo sin filtrar en pantalla y en consola — friendlyError() solo
// da un resumen legible, esto es lo que realmente devolvió Supabase.
const toRawError = (error) => error
  ? { code: error.code || null, message: error.message || null, details: error.details || null, hint: error.hint || null }
  : null;

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
  const payload = {
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
  };
  console.error('[adminAcademyLessons] createAcademyLesson → payload enviado a Supabase:', payload);
  try {
    const { data, error } = await supabase
      .from('academy_lessons')
      .insert(payload)
      .select(ADMIN_LESSON_FIELDS)
      .single();

    if (error) console.error('[adminAcademyLessons] createAcademyLesson → error de Supabase:', error);
    else console.error('[adminAcademyLessons] createAcademyLesson → insert OK:', data);

    return { lesson: data || null, error: friendlyError(error), rawError: toRawError(error) };
  } catch (error) {
    console.error('[adminAcademyLessons] createAcademyLesson → excepción:', error);
    return { lesson: null, error: error instanceof Error ? error.message : 'Error inesperado', rawError: null };
  }
};

export const updateAcademyLesson = async (id, lesson) => {
  const payload = {
    title: lesson.title,
    description: lesson.description,
    position: lesson.position,
    topics: lesson.topics,
    resources: lesson.resources,
    published: lesson.published,
    scheduled_at: lesson.scheduled_at,
  };
  console.error('[adminAcademyLessons] updateAcademyLesson → payload enviado a Supabase:', { id, ...payload });
  try {
    const { data, error } = await supabase
      .from('academy_lessons')
      .update(payload)
      .eq('id', id)
      .select(ADMIN_LESSON_FIELDS)
      .single();

    if (error) console.error('[adminAcademyLessons] updateAcademyLesson → error de Supabase:', error);
    else console.error('[adminAcademyLessons] updateAcademyLesson → update OK:', data);

    return { lesson: data || null, error: friendlyError(error), rawError: toRawError(error) };
  } catch (error) {
    console.error('[adminAcademyLessons] updateAcademyLesson → excepción:', error);
    return { lesson: null, error: error instanceof Error ? error.message : 'Error inesperado', rawError: null };
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
