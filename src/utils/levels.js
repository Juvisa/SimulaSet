export const LEVELS = [
  { level: 1, name: 'Setter Novato', minSessions: 0, minAvg: 0, color: '#9A9A9A', icon: '🌱' },
  { level: 2, name: 'Setter Aprendiz', minSessions: 5, minAvg: 50, color: '#2563EB', icon: '📘' },
  { level: 3, name: 'Setter Practicante', minSessions: 10, minAvg: 65, color: '#C9920A', icon: '⚡' },
  { level: 4, name: 'Setter Pro', minSessions: 15, minAvg: 80, color: '#E0605E', icon: '🔥' },
  { level: 5, name: 'Setter Élite', minSessions: 20, minAvg: 90, color: '#1D9E75', icon: '👑' },
];

export const getLevelInfo = (level) => LEVELS.find(l => l.level === level) || LEVELS[0];

export const getProgressToNext = (user) => {
  const current = getLevelInfo(user.level);
  const next = LEVELS.find(l => l.level === user.level + 1);
  if (!next) return { percent: 100, label: 'Nivel máximo alcanzado' };
  const avg = user.totalSessions > 0 ? user.totalScore / user.totalSessions : 0;
  const sessionPct = Math.min(100, (user.totalSessions / next.minSessions) * 100);
  const avgPct = Math.min(100, (avg / next.minAvg) * 100);
  const percent = Math.round((sessionPct + avgPct) / 2);
  return {
    percent,
    label: `${next.name}: ${user.totalSessions}/${next.minSessions} sesiones, promedio ${Math.round(avg)}/${next.minAvg}`,
    next,
  };
};
