import { supabase } from '../../lib/supabase';

// Columnas declaradas de setter_passports (ver 202610130001_create_setter_passports.sql
// y 202610160001_passport_professional_profile.sql).
export const PASSPORT_SELECT = 'user_id, headline, summary, country, city, timezone, availability, hours_per_week, open_to_opportunities, languages, skills, tools, niches, experience_track, experiences, preferred_roles, work_modes, opportunity_notes, created_at, updated_at';

// Columna desconocida (base sin la migración del bloque 3): Postgres 42703 al
// leer, PostgREST PGRST204 al escribir. No es lo mismo que "tabla inexistente".
const isMissingColumn = (error) =>
  Boolean(error) && (error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist/i.test(error.message || ''));

// Si la migración aún no se aplicó en la base, PostgREST responde que la
// tabla no existe. La UI lo muestra como "no disponible" en vez de romperse.
const isMissingTable = (error) =>
  Boolean(error) && (
    error.code === 'PGRST205'
    || error.code === '42P01'
    || (!isMissingColumn(error) && /setter_passports/.test(error.message || '') && /does not exist|schema cache/i.test(error.message || ''))
  );

export const getMyPassport = async (userId) => {
  const { data, error } = await supabase
    .from('setter_passports')
    .select(PASSPORT_SELECT)
    .eq('user_id', userId)
    .maybeSingle();

  if (isMissingTable(error)) return { passport: null, unavailable: true, error: undefined };
  if (isMissingColumn(error)) return { passport: null, unavailable: true, error: describeSaveError(error) };
  return { passport: data || null, unavailable: false, error: error?.message };
};

// Traduce los rechazos esperables de la base a mensajes para el alumno, sin
// exponer detalles técnicos. Lo inesperado conserva el mensaje original.
export const describeSaveError = (error) => {
  if (!error) return undefined;
  const message = error.message || '';
  if (isMissingTable(error)) return 'SET Passport todavía no está habilitado.';
  if (error.code === '42501' || /row-level security/i.test(message)) {
    return 'Tu cuenta no tiene permiso para editar este perfil. Si tu acceso está inactivo, contacta al equipo de Digital SET.';
  }
  if (error.code === 'PGRST116') return 'No encontramos tu SET Passport para actualizarlo. Recarga la página e inténtalo de nuevo.';
  if (error.code === '23514') return 'Algún dato no cumple el formato o supera los límites permitidos. Revisa el formulario.';
  if (isMissingColumn(error)) return 'SET Passport se está actualizando. Recarga la página en unos minutos.';
  return message || 'Error desconocido.';
};

// Guardado explícito insert-o-update (no upsert): la policy de update y los
// grants por columna no permiten escribir user_id, y un upsert de PostgREST lo
// incluiría en el SET. `exists` lo decide el caller según lo que cargó; si dos
// pestañas insertan a la vez, la violación de PK (23505) cae al update.
export const saveMyPassport = async ({ userId, payload, exists }) => {
  const update = () => supabase
    .from('setter_passports')
    .update(payload)
    .eq('user_id', userId)
    .select(PASSPORT_SELECT)
    .single();

  if (exists) {
    const { data, error } = await update();
    return { passport: data || null, error: describeSaveError(error) };
  }

  const { data, error } = await supabase
    .from('setter_passports')
    .insert({ ...payload, user_id: userId })
    .select(PASSPORT_SELECT)
    .single();

  if (error?.code === '23505') {
    const retry = await update();
    return { passport: retry.data || null, error: describeSaveError(retry.error) };
  }
  return { passport: data || null, error: describeSaveError(error) };
};

// Historial COMPLETO de simulaciones del alumno, paginado.
//
// PostgREST corta cada respuesta en `max_rows` (1000 por defecto en Supabase)
// sin devolver error, así que una sola consulta podría truncar el historial.
// Se pide el total exacto en la primera página y se avanza con las filas
// realmente recibidas (funciona con cualquier max_rows). El orden estable
// (created_at, id) evita saltos o repeticiones entre páginas, y se deduplica
// por id por si una página se solapa. Solo lectura: no toca el historial.
const SESSIONS_PAGE_SIZE = 1000;
const SESSIONS_MAX_PAGES = 100;

export const getMyTrainingSessions = async (userId) => {
  const byId = new Map();
  let total = null;
  let offset = 0;

  for (let page = 0; page < SESSIONS_MAX_PAGES; page += 1) {
    const { data, error, count } = await supabase
      .from('simulator_sessions')
      .select('id, mode, scores, created_at', page === 0 ? { count: 'exact' } : undefined)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + SESSIONS_PAGE_SIZE - 1);

    if (error) return { sessions: [...byId.values()], error: error.message, complete: false };
    if (page === 0) total = Number.isFinite(count) ? count : null;

    const rows = data || [];
    rows.forEach((row) => {
      byId.set(row.id, {
        id: row.id,
        mode: row.mode,
        scores: Array.isArray(row.scores) ? row.scores : [],
        createdAt: row.created_at,
      });
    });
    offset += rows.length;

    const reachedTotal = total !== null ? offset >= total : rows.length < SESSIONS_PAGE_SIZE;
    if (rows.length === 0 || reachedTotal) return { sessions: [...byId.values()], error: undefined, complete: true };
  }
  return { sessions: [...byId.values()], error: 'El historial es demasiado grande para cargarlo completo.', complete: false };
};

// Datos que el setter ya declaró en el diagnóstico inicial (solo lectura).
// La policy onboarding_select_own limita la lectura a la propia fila.
export const getMyOnboardingForPassport = async (userId) => {
  const { data, error } = await supabase
    .from('onboarding')
    .select('crm, crm_other, worked_setter, worked_closer, sold_by_chat, participated_launch, worked_digital_business')
    .eq('user_id', userId)
    .maybeSingle();

  return { onboarding: data || null, error: error?.message };
};
