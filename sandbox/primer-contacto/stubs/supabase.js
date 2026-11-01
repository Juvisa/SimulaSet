// Preview local: Supabase deshabilitado. Si algún módulo intenta usarlo, falla
// de inmediato y a la vista (en vez de conectarse a una base real).
const disabled = new Proxy({}, {
  get() { throw new Error('Preview local: Supabase está deshabilitado.'); },
});

export const supabase = disabled;
export const supabaseConfigured = false;
export const supabaseUrl = '';
export const supabaseAnonKey = '';
