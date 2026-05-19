import { createSession, clearSession } from './auth';

const KEYS = {
  USERS: 'simulaset_users',
  CURRENT_USER: 'simulaset_current_user',
  PROJECTS: 'simulaset_projects',
  SESSIONS: 'simulaset_sessions',
  ANALYSES: 'simulaset_analyses',
  ADMIN_FEEDBACK: 'simulaset_admin_feedback',
  REAL_LEADS: 'real_leads_sessions',
};

const get = (key) => {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
};

const set = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};

const hashPw = (pw) => btoa(pw);
const checkPw = (plain, stored) => stored === btoa(plain) || stored === plain; // support legacy plain

// Users
export const getUsers = () => get(KEYS.USERS) || [];
export const saveUsers = (users) => set(KEYS.USERS, users);
export const getCurrentUser = () => get(KEYS.CURRENT_USER);
export const saveCurrentUser = (user) => set(KEYS.CURRENT_USER, user);
export const clearCurrentUser = () => clearSession();

// Ensure admin account always exists
export const seedAdmin = () => {
  const users = getUsers();
  if (users.find(u => u.id === 'admin')) return;
  users.unshift({
    id: 'admin',
    name: 'Jul',
    nombre: 'Jul',
    email: 'admin@simulaset.com',
    password: hashPw('admin123'),
    role: 'admin',
    rol: 'admin',
    nivel: 'Admin',
    fecha_registro: new Date().toISOString(),
    activo: true,
    level: 5,
  });
  saveUsers(users);
};

export const registerUser = (name, email, password) => {
  seedAdmin();
  const users = getUsers();
  if (users.find(u => u.email === email.toLowerCase())) return { error: 'Email ya registrado' };
  const newUser = {
    id: crypto.randomUUID(),
    name,
    nombre: name,
    email: email.toLowerCase(),
    password: hashPw(password),
    role: 'setter',
    rol: 'setter',
    nivel: 'Setter Novato',
    fecha_registro: new Date().toISOString(),
    ultimo_acceso: new Date().toISOString(),
    activo: true,
    level: 1,
    totalSessions: 0,
    totalScore: 0,
  };
  users.push(newUser);
  saveUsers(users);
  createSession(newUser);
  return { user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role, level: 1 } };
};

export const loginUser = (email, password) => {
  seedAdmin();
  const users = getUsers();
  const user = users.find(u => u.email === email.toLowerCase() && checkPw(password, u.password));
  if (!user) return { error: 'Email o contraseña incorrectos' };
  if (user.activo === false) return { error: 'Cuenta desactivada' };
  const idx = users.findIndex(u => u.id === user.id);
  users[idx].ultimo_acceso = new Date().toISOString();
  saveUsers(users);
  const sessionUser = { id: user.id, name: user.name || user.nombre, email: user.email, role: user.role || user.rol, level: user.level || 1 };
  createSession(user);
  saveCurrentUser(sessionUser);
  return { user: sessionUser };
};

export const updatePassword = (userId, newPassword) => {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx < 0) return { error: 'Usuario no encontrado' };
  users[idx].password = hashPw(newPassword);
  saveUsers(users);
  return { ok: true };
};

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

export const getAllSessions = () => get(KEYS.SESSIONS) || [];

export const saveSession = (session) => {
  const all = get(KEYS.SESSIONS) || [];
  const idx = all.findIndex(s => s.id === session.id);
  if (idx >= 0) all[idx] = session;
  else all.push(session);
  set(KEYS.SESSIONS, all);
};

// Analyses
export const getAnalyses = (userId) => {
  const all = get(KEYS.ANALYSES) || [];
  return all.filter(a => a.userId === userId || a.setter_id === userId);
};

export const getAllAnalyses = () => get(KEYS.ANALYSES) || [];

export const saveAnalysis = (analysis) => {
  const all = get(KEYS.ANALYSES) || [];
  all.push(analysis);
  set(KEYS.ANALYSES, all);
};

// Admin feedback
export const getAdminFeedback = (sessionId) => {
  const all = get(KEYS.ADMIN_FEEDBACK) || [];
  return all.filter(f => f.sessionId === sessionId);
};

export const saveFeedback = (feedback) => {
  const all = get(KEYS.ADMIN_FEEDBACK) || [];
  all.push(feedback);
  set(KEYS.ADMIN_FEEDBACK, all);
};

export const getPendingFeedback = (userId) => {
  const all = get(KEYS.ADMIN_FEEDBACK) || [];
  return all.filter(f => f.targetUserId === userId && !f.seen);
};

export const markFeedbackSeen = (feedbackId) => {
  const all = get(KEYS.ADMIN_FEEDBACK) || [];
  const idx = all.findIndex(f => f.id === feedbackId);
  if (idx >= 0) all[idx].seen = true;
  set(KEYS.ADMIN_FEEDBACK, all);
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
  saveCurrentUser(users[idx]);
};

// Real Leads
export const getRealLeads = (userId) => {
  const all = get(KEYS.REAL_LEADS) || [];
  return all.filter(l => l.setter_id === userId);
};

export const getAllRealLeads = () => get(KEYS.REAL_LEADS) || [];

export const getRealLeadById = (id) => {
  const all = get(KEYS.REAL_LEADS) || [];
  return all.find(l => l.id === id) || null;
};

export const saveRealLead = (lead) => {
  const all = get(KEYS.REAL_LEADS) || [];
  const idx = all.findIndex(l => l.id === lead.id);
  const updated = { ...lead, updated_at: new Date().toISOString() };
  if (idx >= 0) all[idx] = updated;
  else all.push(updated);
  set(KEYS.REAL_LEADS, all);
  return updated;
};

export const deleteRealLead = (id) => {
  const all = (get(KEYS.REAL_LEADS) || []).filter(l => l.id !== id);
  set(KEYS.REAL_LEADS, all);
};

export const createRealLead = (data) => {
  const lead = {
    id: crypto.randomUUID(),
    setter_id: data.setter_id,
    project_id: data.project_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    nombre: data.nombre,
    origen: data.origen,
    canal: data.canal,
    dolor_principal: data.dolor_principal,
    nivel_consciencia: data.nivel_consciencia,
    temperatura: data.temperatura,
    notas_adicionales: data.notas_adicionales || '',
    estado: 'activo',
    ultimo_contacto: null,
    horas_sin_respuesta: 0,
    alerta_fantasma: false,
    conversacion: [],
    metricas: {
      total_turnos: 0,
      nivel_interes_actual: 0,
      etapa_set_actual: 'S',
      reactivaciones_enviadas: 0,
      apertura_generada: false,
    },
  };
  saveRealLead(lead);
  return lead;
};
