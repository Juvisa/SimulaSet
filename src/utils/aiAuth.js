import { supabase } from '../lib/supabase';

// Token de sesión de Supabase para /api/anthropic, que exige sesión y lo valida
// en el servidor. Nunca lanza: sin sesión (o si Supabase falla) devuelve {} y
// el servidor responderá 401 con un mensaje para el alumno.
// - getSession() renueva el token si caducó;
// - { refresh: true } fuerza la renovación (se usa tras un 401, una sola vez).
// El token solo se envía a nuestro propio /api, nunca a api.anthropic.com.
export const getAiAuthHeaders = async ({ refresh = false } = {}) => {
  try {
    if (!supabase) return {};
    const { data } = refresh ? await supabase.auth.refreshSession() : await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
};
