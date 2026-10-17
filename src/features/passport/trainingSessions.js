// Historial COMPLETO de simulaciones de un alumno, paginado. Recibe el cliente
// de Supabase como parámetro para usarse igual en el navegador (passportApi) y
// en el servidor (api/passport-assistant), siempre con la sesión del alumno
// para que RLS limite la lectura a sus propias filas.
//
// PostgREST corta cada respuesta en `max_rows` (1000 por defecto en Supabase)
// sin devolver error, así que una sola consulta podría truncar el historial.
// Se pide el total exacto en la primera página y se avanza con las filas
// realmente recibidas (funciona con cualquier max_rows). El orden estable
// (created_at, id) evita saltos o repeticiones entre páginas, y se deduplica
// por id por si una página se solapa. Solo lectura: no toca el historial.
const SESSIONS_PAGE_SIZE = 1000;
const SESSIONS_MAX_PAGES = 100;

export const fetchAllTrainingSessions = async (client, userId) => {
  const byId = new Map();
  let total = null;
  let offset = 0;

  for (let page = 0; page < SESSIONS_MAX_PAGES; page += 1) {
    const { data, error, count } = await client
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
