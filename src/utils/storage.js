const KEYS = {
  USERS: 'simulaset_users',
  PROJECTS: 'simulaset_projects',
  SESSIONS: 'simulaset_sessions',
};

const get = (key) => {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
};

const set = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* localStorage no disponible — se ignora */ }
};

// Users
export const getUsers = () => get(KEYS.USERS) || [];
export const saveUsers = (users) => set(KEYS.USERS, users);

// Projects
export const getProjects = (userId) => {
  const all = get(KEYS.PROJECTS) || [];
  return all.filter(p => p.userId === userId || p.setter_id === userId);
};

export const getAllProjects = () => get(KEYS.PROJECTS) || [];

export const saveProject = (project) => {
  const all = get(KEYS.PROJECTS) || [];
  const idx = all.findIndex(p => p.id === project.id);
  if (idx >= 0) all[idx] = project;
  else all.push(project);
  set(KEYS.PROJECTS, all);
};

export const deleteProject = (id) => {
  const all = (get(KEYS.PROJECTS) || []).filter(p => p.id !== id);
  set(KEYS.PROJECTS, all);
};

// Sessions
export const getSessions = (userId) => {
  const all = get(KEYS.SESSIONS) || [];
  return all.filter(s => s.userId === userId || s.setter_id === userId);
};

export const saveSession = (session) => {
  const all = get(KEYS.SESSIONS) || [];
  const idx = all.findIndex(s => s.id === session.id);
  if (idx >= 0) all[idx] = session;
  else all.push(session);
  set(KEYS.SESSIONS, all);
};

// Update user stats after session
export const updateUserStats = (userId, score) => {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx < 0) return;
  users[idx].totalSessions = (users[idx].totalSessions || 0) + 1;
  users[idx].totalScore = (users[idx].totalScore || 0) + score;
  users[idx].lastActivity = new Date().toISOString();
  const avg = users[idx].totalScore / users[idx].totalSessions;
  const total = users[idx].totalSessions;
  if (total >= 20 && avg > 90) users[idx].level = 5;
  else if (total >= 15 && avg > 80) users[idx].level = 4;
  else if (total >= 10 && avg > 65) users[idx].level = 3;
  else if (total >= 5 && avg > 50) users[idx].level = 2;
  else users[idx].level = 1;
  saveUsers(users);
};
