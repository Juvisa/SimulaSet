import { supabase } from '../lib/supabase';

// completion_source: verified_watch | self_reported | legacy_self_reported
// (ver migración 202610170002_verified_lesson_progress.sql).
const PROGRESS_COLUMNS = 'lesson_id, status, completed_at, completion_source, verified_percent';

export const getLessonProgress = async ({ userId, courseId, moduleId }) => {
  const { data, error } = await supabase
    .from('lesson_progress')
    .select(PROGRESS_COLUMNS)
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('module_id', moduleId);

  return { progress: data || [], error: error?.message };
};

export const getLessonProgressForCourse = async ({ userId, courseId }) => {
  const { data, error } = await supabase
    .from('lesson_progress')
    .select(`module_id, ${PROGRESS_COLUMNS}`)
    .eq('user_id', userId)
    .eq('course_id', courseId);

  return { progress: data || [], error: error?.message };
};

// Completar una clase SOLO a través del servidor: complete_lesson vuelve a
// validar el 85 % de visualización (clases con video de Mux), registra el
// origen de la finalización y otorga los XP una única vez. Ya no existe la
// escritura directa ni la opción de desmarcar.
export const completeLesson = async ({ courseId, moduleId, lessonId }) => {
  const { data, error } = await supabase.rpc('complete_lesson', {
    p_course_id: courseId,
    p_module_id: moduleId,
    p_lesson_id: lessonId,
  });
  if (error) return { result: null, error: error.message };
  return { result: Array.isArray(data) ? data[0] || null : data, error: undefined };
};
