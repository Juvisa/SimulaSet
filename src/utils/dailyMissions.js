import { supabase } from '../lib/supabase';
import { getSessions } from './storage';
import { getUserStreak } from './xp';

export { getUserStreak };

const VALID_STATUSES = new Set(['pending', 'in_progress', 'in_review', 'completed']);

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

export const getBestSimulatorScoreForDate = (userId, isoDate) => {
  const sessions = getSessions(userId).filter((session) => {
    if (!session.createdAt) return false;
    return toIsoDate(new Date(session.createdAt)) === isoDate;
  });
  if (sessions.length === 0) return null;

  const scoresForSession = (session) => {
    if (!Array.isArray(session.scores) || session.scores.length === 0) return 0;
    const avg = session.scores.reduce((a, b) => a + b, 0) / session.scores.length;
    return Math.round(avg * 10);
  };

  return Math.max(...sessions.map(scoresForSession));
};

export const getWeekMissionProgress = async ({ userId, isoDates }) => {
  const { data, error } = await supabase
    .from('daily_mission_progress')
    .select('mission_date, mission_id, status, set_score_achieved, evidence_url, evidence_note, submitted_at, completed_at, updated_at')
    .eq('user_id', userId)
    .in('mission_date', isoDates);

  if (error) return { progressByDate: {}, error: error.message };
  const progressByDate = Object.fromEntries((data || []).map((row) => [row.mission_date, row]));
  return { progressByDate, error: undefined };
};

export const getDailyMissionProgress = async ({ userId, isoDate }) => {
  const { data, error } = await supabase
    .from('daily_mission_progress')
    .select('mission_date, mission_id, status, set_score_achieved, evidence_url, evidence_note, submitted_at, completed_at, updated_at')
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
    .select('mission_date, mission_id, status, set_score_achieved, evidence_url, evidence_note, submitted_at, completed_at, updated_at')
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

export const submitDailyMissionEvidence = async ({
  userId, isoDate, missionId, evidenceUrl, evidenceNote, setScoreAchieved, minSetScore, xpReward,
}) => {
  if (!evidenceUrl?.trim() || !evidenceNote?.trim()) {
    return { progress: null, streak: null, error: 'Agrega la evidencia y una nota sobre la objeción enfrentada.' };
  }

  const clampedScore = Number.isFinite(setScoreAchieved) ? Math.max(0, Math.min(100, Math.round(setScoreAchieved))) : null;
  const scoreQualifies = clampedScore !== null && clampedScore >= minSetScore;
  const status = scoreQualifies ? 'completed' : 'in_review';
  const now = new Date().toISOString();

  const payload = {
    user_id: userId,
    mission_date: isoDate,
    mission_id: missionId,
    status,
    set_score_achieved: clampedScore,
    evidence_url: evidenceUrl.trim(),
    evidence_note: evidenceNote.trim(),
    submitted_at: now,
    completed_at: status === 'completed' ? now : null,
  };

  const { data, error } = await supabase
    .from('daily_mission_progress')
    .upsert(payload, { onConflict: 'user_id,mission_date' })
    .select('mission_date, mission_id, status, set_score_achieved, evidence_url, evidence_note, submitted_at, completed_at, updated_at')
    .single();

  if (error || !data) return { progress: null, streak: null, error: error?.message || 'No pudimos guardar tu evidencia.' };
  if (!scoreQualifies) {
    return {
      progress: data,
      streak: null,
      error: `Aún no detectamos un SET Score válido (≥ ${minSetScore}) para hoy. Tu evidencia quedó guardada en revisión.`,
    };
  }

  const { streak, error: streakError } = await applyStreakAndXp({ userId, isoDate, xpReward });
  return { progress: data, streak, error: streakError };
};

const sanitizeFileName = (name) => name.replace(/[^a-zA-Z0-9.\-_]/g, '_');

export const uploadMissionEvidenceFile = async ({ userId, isoDate, file }) => {
  const path = `${userId}/${isoDate}-${Date.now()}-${sanitizeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from('mission-evidence').upload(path, file, { upsert: false });
  if (uploadError) return { url: null, error: uploadError.message };

  const { data } = supabase.storage.from('mission-evidence').getPublicUrl(path);
  return { url: data?.publicUrl || null, error: data?.publicUrl ? undefined : 'No pudimos generar el enlace de tu captura.' };
};

export const isValidDailyMissionStatus = (status) => VALID_STATUSES.has(status);
