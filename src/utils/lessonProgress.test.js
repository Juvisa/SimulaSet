import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = { rpc: [], from: [] };
let rpcResponse = { data: null, error: null };
vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: async (name, args) => { calls.rpc.push([name, args]); return rpcResponse; },
    from: (table) => {
      calls.from.push(table);
      const chain = { select: () => chain, eq: () => chain, upsert: () => chain, insert: () => chain, update: () => chain, then: (r) => r({ data: [], error: null }) };
      return chain;
    },
  },
}));

const { completeLesson, getLessonProgressForCourse } = await import('./lessonProgress.js');
const lessonProgress = await import('./lessonProgress.js');

beforeEach(() => { calls.rpc.length = 0; calls.from.length = 0; rpcResponse = { data: null, error: null }; });

describe('completeLesson', () => {
  it('llama a la RPC complete_lesson con la identidad de la clase (nunca escribe la tabla)', async () => {
    rpcResponse = { data: [{ outcome: 'completed', completion_source: 'verified_watch', watched_percent: 91, required_percent: 85, xp_awarded: true }], error: null };
    const { result, error } = await completeLesson({ courseId: 'set-academy', moduleId: 'week-01', lessonId: 'set-method-foundations' });
    expect(error).toBeUndefined();
    expect(result.outcome).toBe('completed');
    expect(calls.rpc).toEqual([['complete_lesson', { p_course_id: 'set-academy', p_module_id: 'week-01', p_lesson_id: 'set-method-foundations' }]]);
    expect(calls.from).toEqual([]);
  });

  it('devuelve el error del servidor', async () => {
    rpcResponse = { data: null, error: { message: 'Clase no disponible.' } };
    expect(await completeLesson({ courseId: 'a', moduleId: 'b', lessonId: 'c' })).toEqual({ result: null, error: 'Clase no disponible.' });
  });

  it('ya no existe la escritura directa (setLessonProgress)', () => {
    expect(lessonProgress.setLessonProgress).toBeUndefined();
  });

  it('la lectura incluye el origen de la finalización', async () => {
    await getLessonProgressForCourse({ userId: 'u', courseId: 'set-academy' });
    expect(calls.from).toEqual(['lesson_progress']);
  });
});
