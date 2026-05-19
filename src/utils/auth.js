const SESSION_KEY = 'simulaset_session';

export const getSession = () => {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!s) return null;
    if (new Date(s.expira_en) < new Date()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch { return null; }
};

export const getSesionActual = getSession;

export const getSetterIdActual = () => getSession()?.user_id || null;

export const esAdmin = () => getSession()?.rol === 'admin';

export const filtrarPorSetter = (array) => {
  if (esAdmin()) return array;
  const id = getSetterIdActual();
  return array.filter(item => (item.setter_id || item.userId) === id);
};

export const perteneceAlSetter = (item) => {
  if (esAdmin()) return true;
  const id = getSetterIdActual();
  return (item.setter_id || item.userId) === id;
};

export const createSession = (user) => {
  const session = {
    user_id: user.id,
    email: user.email,
    nombre: user.name || user.nombre,
    rol: user.role || user.rol,
    token: crypto.randomUUID(),
    expira_en: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  // Legacy key for backwards compat with AuthContext
  localStorage.setItem('simulaset_current_user', JSON.stringify({
    id: user.id,
    name: user.name || user.nombre,
    email: user.email,
    role: user.role || user.rol,
    level: user.level || 1,
  }));
  return session;
};

export const clearSession = () => {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem('simulaset_current_user');
};

// Build a user object compatible with AuthContext from session
export const sessionToUser = (session) => ({
  id: session.user_id,
  name: session.nombre,
  email: session.email,
  role: session.rol,
});
