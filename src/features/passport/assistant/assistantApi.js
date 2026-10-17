import { supabase } from '../../../lib/supabase';

// Llamadas del navegador al endpoint propio del asistente. Nunca envía
// métricas: el servidor las lee de la base. El token de sesión va solo a
// nuestro /api.
const ENDPOINT = '/api/passport-assistant';

const getAccessToken = async () => {
  try {
    const { data } = (await supabase?.auth.getSession()) || {};
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
};

const call = async (body) => {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: 'unauthenticated', message: 'Tu sesión expiró. Vuelve a iniciar sesión.' };
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: 'network', message: 'No pudimos conectar con el asistente. Revisa tu conexión.' };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, status: response.status, error: data.error || 'unknown', message: data.message || 'El asistente no está disponible en este momento.', quota: data.quota };
  }
  return { ok: true, ...data };
};

export const getAssistantQuota = () => call({ action: 'status' });
export const generateAssistantDraft = (answers) => call({ action: 'generate', answers });
