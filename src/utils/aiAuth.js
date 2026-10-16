import { supabase } from '../lib/supabase';

// Fase A de la protección de /api/anthropic: todas las llamadas a la IA envían
// el token de sesión de Supabase para que, más adelante, el servidor pueda
// exigirlo. Por ahora el servidor lo ignora, así que esto NUNCA debe bloquear
// ni romper una llamada: sin sesión (o si Supabase falla) se devuelve {} y la
// solicitud sale igual que antes. getSession() renueva el token si caducó.
// El token solo se envía a nuestro propio /api, nunca a api.anthropic.com.
export const getAiAuthHeaders = async () => {
  try {
    if (!supabase) return {};
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
};
