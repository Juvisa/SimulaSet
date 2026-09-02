import { supabase } from '../lib/supabase';

const VALID_STATUSES = new Set(['pending', 'completed']);

export const getLessonProgress = async ({ userId, courseId, moduleId }) => {
  const { data, error } = await supabase
    .from('lesson_progress')
    .select('lesson_id, status, completed_at')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('module_id', moduleId);

  return { progress: data || [], error: error?.message };
};

export const setLessonProgress = async ({ userId, courseId, moduleId, lessonId, status }) => {
  if (!VALID_STATUSES.has(status)) return { error: 'Estado de lección inválido.' };

  const payload = {
    user_id: userId,
    course_id: courseId,
    module_id: moduleId,
    lesson_id: lessonId,
    status,
    completed_at: status === 'completed' ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase
    .from('lesson_progress')
    .upsert(payload, { onConflict: 'user_id,course_id,module_id,lesson_id' })
    .select('lesson_id, status, completed_at')
    .single();

  return { progress: data, error: error?.message };
};
