import { supabase } from '../lib/supabase';
import { getUserStreak } from './xp';

export { getUserStreak };

const VALID_STATUSES = new Set(['pending', 'in_progress', 'in_review', 'completed']);

const PROGRESS_SELECT = 'mission_date, mission_id, status, set_score_achieved, evidence_url, evidence_note, criterion_answer, criterion_correct, criterion_completed_at, submitted_at, completed_at, updated_at';

const pad2 = (n) => String(n).padStart(2, '0');

export const toIsoDate = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

export const getIsoWeekday = (date) => {
  const day = date.getDay();
  return day === 0 ? 7 : day;
};

const addDays = (date, amount) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

export const getWeekDays = (referenceDate = new Date()) => {
  const monday = addDays(referenceDate, 1 - getIsoWeekday(referenceDate));
  const todayIso = toIsoDate(new Date());
  return Array.from({ length: 5 }, (_, i) => {
    const date = addDays(monday, i);
    const isoDate = toIsoDate(date);
    return {
      date,
      isoDate,
      isoWeekday: i + 1,
      isToday: isoDate === todayIso,
      isPast: isoDate < todayIso,
      isFuture: isoDate > todayIso,
    };
  });
};

export const previousBusinessDayIso = (isoDate) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  const weekday = getIsoWeekday(date);
  if (weekday === 6) date.setDate(date.getDate() - 1);
  else if (weekday === 7) date.setDate(date.getDate() - 2);
  return toIsoDate(date);
};

// isoDate es un día calendario LOCAL (ver toIsoDate); se construyen los límites
// de ese día en hora local y se convierten a ISO/UTC para filtrar created_at
// (timestamptz) en simulator_sessions — la única fuente real de sesiones desde
// que Simulator.jsx dejó de escribir también en localStorage.
export const getBestSimulatorScoreForDate = async (userId, isoDate) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);

  const { data, error } = await supabase
    .from('simulator_sessions')
    .select('average_score')
    .eq('user_id', userId)
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString());

  if (error || !data || data.length === 0) return null;
  return Math.max(...data.map((row) => row.average_score ?? 0));
};

export const getWeekMissionProgress = async ({ userId, isoDates }) => {
  const { data, error } = await supabase
    .from('daily_mission_progress')
    .select(PROGRESS_SELECT)
    .eq('user_id', userId)
    .in('mission_date', isoDates);

  if (error) return { progressByDate: {}, error: error.message };
  const progressByDate = Object.fromEntries((data || []).map((row) => [row.mission_date, row]));
  return { progressByDate, error: undefined };
};

export const getDailyMissionProgress = async ({ userId, isoDate }) => {
  const { data, error } = await supabase
    .from('daily_mission_progress')
    .select(PROGRESS_SELECT)
    .eq('user_id', userId)
    .eq('mission_date', isoDate)
    .maybeSingle();

  return { progress: data || null, error: error?.message };
};

export const markMissionInProgress = async ({ userId, isoDate, missionId }) => {
  const payload = {
    user_id: userId,
    mission_date: isoDate,
    mission_id: missionId,
    status: 'in_progress',
  };

  const { data, error } = await supabase
    .from('daily_mission_progress')
    .upsert(payload, { onConflict: 'user_id,mission_date', ignoreDuplicates: true })
    .select(PROGRESS_SELECT)
    .maybeSingle();

  if (error) return { progress: null, error: error.message };
  if (data) return { progress: data, error: undefined };
  return getDailyMissionProgress({ userId, isoDate });
};

const applyStreakAndXp = async ({ userId, isoDate, xpReward }) => {
  const { streak: current, error: readError } = await getUserStreak(userId);
  if (readError) return { streak: null, error: readError };

  const continuesStreak = current.last_completed_date === previousBusinessDayIso(isoDate);
  const newStreak = continuesStreak ? current.current_streak + 1 : 1;

  const payload = {
    user_id: userId,
    current_streak: newStreak,
    longest_streak: Math.max(newStreak, current.longest_streak || 0),
    total_xp: (current.total_xp || 0) + xpReward,
    last_completed_date: isoDate,
  };

  const { data, error } = await supabase
    .from('user_streaks')
    .upsert(payload, { onConflict: 'user_id' })
    .select('current_streak, longest_streak, total_xp, last_completed_date')
    .single();

  return { streak: data || null, error: error?.message };
};

// Cierra la misión por el flujo formativo: Reto de Criterio respondido
// correctamente + SET Score del día por encima del mínimo de la misión, sin
// depender de evidencia subida por el alumno (ver justificación de producto:
// los alumnos nuevos no tienen leads reales activos para capturar, y el
// análisis de chats reales ya vive en sus propios módulos — Analizador IA y
// Leads Reales — no en Misiones Diarias).
export const completeDailyMission = async ({ userId, isoDate, missionId, setScoreAchieved, minSetScore, xpReward }) => {
  const clampedScore = Number.isFinite(setScoreAchieved) ? Math.max(0, Math.min(100, Math.round(setScoreAchieved))) : null;
  if (clampedScore === null || clampedScore < minSetScore) {
    return { progress: null, streak: null, error: `Necesitas un SET Score válido (≥ ${minSetScore}) en el simulador para completar la misión de hoy.` };
  }

  // Guardia de idempotencia: si el día ya estaba 'completed' (doble clic,
  // reintento de red tras un timeout, etc.), NO se vuelve a upsertear ni se
  // llama a applyStreakAndXp — evita duplicar XP y, más grave, resetear la
  // racha (applyStreakAndXp compara last_completed_date contra el día ANTERIOR
  // a isoDate; en una segunda llamada ese valor ya es isoDate mismo, así que
  // la racha se reiniciaría a 1 en vez de mantenerse).
  const { progress: existing, error: readError } = await getDailyMissionProgress({ userId, isoDate });
  if (readError) return { progress: null, streak: null, error: readError };
  if (existing?.status === 'completed') {
    const { streak, error: streakError } = await getUserStreak(userId);
    return { progress: existing, streak, error: streakError };
  }

  const now = new Date().toISOString();
  const payload = {
    user_id: userId,
    mission_date: isoDate,
    mission_id: missionId,
    status: 'completed',
    set_score_achieved: clampedScore,
    completed_at: now,
  };

  const { data, error } = await supabase
    .from('daily_mission_progress')
    .upsert(payload, { onConflict: 'user_id,mission_date' })
    .select(PROGRESS_SELECT)
    .single();

  if (error || !data) return { progress: null, streak: null, error: error?.message || 'No pudimos completar la misión.' };

  const { streak, error: streakError } = await applyStreakAndXp({ userId, isoDate, xpReward });
  return { progress: data, streak, error: streakError };
};

export const submitCriterionAnswer = async ({ userId, isoDate, missionId, answerId, correct }) => {
  const payload = {
    user_id: userId,
    mission_date: isoDate,
    mission_id: missionId,
    criterion_answer: answerId,
    criterion_correct: correct,
    criterion_completed_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('daily_mission_progress')
    .upsert(payload, { onConflict: 'user_id,mission_date' })
    .select(PROGRESS_SELECT)
    .single();

  return { progress: data || null, error: error?.message };
};

export const isValidDailyMissionStatus = (status) => VALID_STATUSES.has(status);

