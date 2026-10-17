import { supabase, supabaseAnonKey, supabaseUrl } from '../../lib/supabase';

// Llamadas de red del seguimiento de visualización. Todo pasa por la RPC
// record_lesson_watch (el servidor valida y acumula); el navegador nunca
// escribe la tabla directamente (no tiene permiso).

// Progreso guardado del propio alumno (RLS: solo su fila).
export const getLessonWatchProgress = async (lessonUuid) => {
  const { data, error } = await supabase
    .from('lesson_watch_progress')
    .select('watched_seconds, duration_seconds, last_position_seconds, mux_asset_id')
    .eq('lesson_id', lessonUuid)
    .maybeSingle();
  return { progress: data || null, error };
};

const toRpcArgs = ({ lessonId, segments, position }) => ({
  p_lesson_id: lessonId,
  p_segments: segments,
  p_position: position,
});

const record = async (payload) => {
  const { data, error } = await supabase.rpc('record_lesson_watch', toRpcArgs(payload));
  if (error) return { error };
  return { data: Array.isArray(data) ? data[0] : data };
};

// Token de sesión en memoria para el envío final: en pagehide no hay tiempo
// de esperar a getSession(). Se refresca en cada envío normal.
let cachedToken = null;
export const refreshCachedToken = async () => {
  try {
    const { data } = (await supabase?.auth.getSession()) || {};
    cachedToken = data?.session?.access_token || null;
  } catch {
    cachedToken = null;
  }
  return cachedToken;
};

// Envío "dispara y olvida" que sobrevive al cierre de la pestaña.
const recordKeepalive = (payload) => {
  if (!cachedToken || !supabaseUrl || !supabaseAnonKey) return;
  try {
    fetch(`${supabaseUrl}/rest/v1/rpc/record_lesson_watch`, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${cachedToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toRpcArgs(payload)),
    }).catch(() => {});
  } catch {
    // El navegador puede rechazar keepalive (cuerpo grande, pestaña ya cerrada): no pasa nada.
  }
};

export const lessonWatchTransport = {
  record: async (payload) => {
    const result = await record(payload);
    refreshCachedToken();
    return result;
  },
  recordKeepalive,
};
