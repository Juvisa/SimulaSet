import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ACCESS_STATE, fetchAcademyAccess, pickActiveScope } from '../utils/academyAccess';

// Recordar la generación elegida es solo una comodidad: si el navegador no
// permite guardar, se usa la generación por defecto.
const storageKey = (userId) => `simulaset.academy.scope.${userId}`;
const readStoredScope = (userId) => {
  try { return window.localStorage.getItem(storageKey(userId)); } catch { return null; }
};
const writeStoredScope = (userId, key) => {
  try { window.localStorage.setItem(storageKey(userId), key); } catch { /* sin almacenamiento: no se recuerda */ }
};

export const useAcademyAccess = () => {
  const { user } = useAuth();
  const [reload, setReload] = useState(0);
  const requestKey = `${user.id}:${user.role}:${reload}`;
  const [result, setResult] = useState({ key: null, access: null });
  const [storedScope, setStoredScope] = useState(() => readStoredScope(user.id));

  useEffect(() => {
    let active = true;
    fetchAcademyAccess({ userId: user.id, role: user.role }).then((access) => {
      if (active) setResult({ key: requestKey, access });
    });
    return () => { active = false; };
  }, [user.id, user.role, requestKey]);

  const selectScope = useCallback((key) => {
    setStoredScope(key);
    writeStoredScope(user.id, key);
  }, [user.id]);
  const retry = useCallback(() => setReload((n) => n + 1), []);

  const loaded = result.key === requestKey ? result.access : null;
  const access = loaded || { state: ACCESS_STATE.LOADING, cohorts: [], collections: [], scopes: [], error: '' };
  return { ...access, activeScope: pickActiveScope(access.scopes, storedScope), selectScope, retry };
};
