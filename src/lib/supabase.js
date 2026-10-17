import { createClient } from '@supabase/supabase-js';

// Exportadas para llamadas fetch con keepalive al cerrar la pestaña (la clave
// anon es pública por diseño; los permisos los aplica RLS con el token).
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  ?.trim()
  .replace(/\/(?:rest|auth)\/v1\/?$/, '');
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = supabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
}) : null;
