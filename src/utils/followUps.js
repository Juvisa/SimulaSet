import { supabase } from '../lib/supabase';

const FOLLOW_UP_FIELDS = [
  'id', 'setter_id', 'lead_id', 'project_id', 'programado_para', 'tipo_seguimiento',
  'nota', 'estado', 'ultima_interaccion', 'dias_sin_respuesta', 'temperatura_actual',
  'mensaje_generado', 'mensaje_enviado', 'opcion_elegida', 'enviado_en', 'resultado', 'created_at',
].join(', ');

// "lead_nombre" se resuelve vía join a real_leads en vez de guardarse
// congelado en la fila (como sí se hace con project_name en simulator_sessions/
// analyses) — un follow-up es de corta duración (se cumple o vence en días),
// así que no hay razón para preservar un snapshot si el lead cambia de nombre.
const normalize = (row) => ({ ...row, lead_nombre: row.real_leads?.nombre || '' });

export const getFollowUps = async (setterId) => {
  const { data, error } = await supabase
    .from('follow_ups')
    .select(`${FOLLOW_UP_FIELDS}, real_leads(nombre)`)
    .eq('setter_id', setterId)
    .order('programado_para', { ascending: true });

  return { followUps: (data || []).map(normalize), error: error?.message };
};

export const getFollowUpsByLead = async (leadId) => {
  const { data, error } = await supabase
    .from('follow_ups')
    .select(FOLLOW_UP_FIELDS)
    .eq('lead_id', leadId)
    .order('programado_para', { ascending: true });

  return { followUps: data || [], error: error?.message };
};

export const getPendingFollowUpsForLead = async (leadId) => {
  const { data, error } = await supabase
    .from('follow_ups')
    .select(FOLLOW_UP_FIELDS)
    .eq('lead_id', leadId)
    .eq('estado', 'pendiente')
    .order('programado_para', { ascending: true });

  return { followUps: data || [], error: error?.message };
};

export const createFollowUp = async (data) => {
  const { data: followUp, error } = await supabase
    .from('follow_ups')
    .insert({
      setter_id: data.setter_id,
      lead_id: data.lead_id,
      project_id: data.project_id || null,
      programado_para: data.programado_para,
      tipo_seguimiento: data.tipo_seguimiento,
      nota: data.nota || '',
      ultima_interaccion: data.ultima_interaccion || null,
      dias_sin_respuesta: data.dias_sin_respuesta || 0,
      temperatura_actual: data.temperatura_actual || null,
    })
    .select(FOLLOW_UP_FIELDS)
    .single();

  return { followUp: followUp || null, error: error?.message };
};

export const updateFollowUpEstado = async (id, estado, extra = {}) => {
  const { data, error } = await supabase
    .from('follow_ups')
    .update({ estado, ...extra })
    .eq('id', id)
    .select(FOLLOW_UP_FIELDS)
    .single();

  return { followUp: data || null, error: error?.message };
};

// Reemplaza a verificarSeguimientosPendientes (followUpChecker.js): antes
// "vencido" se escribía de vuelta a localStorage como side-effect de leer
// (se reescribía la key completa en cada llamada). Aquí "vencido" es un
// estado puramente DERIVADO — la fila solo guarda pendiente/enviado, y se
// clasifica como vencido/hoy/próximos comparando fechas en memoria, sin
// ninguna escritura. Misma lógica de límites (toDateString para "hoy") que
// el checker original.
export const getSeguimientosPendientes = async (setterId) => {
  const { data, error } = await supabase
    .from('follow_ups')
    .select(`${FOLLOW_UP_FIELDS}, real_leads(nombre)`)
    .eq('setter_id', setterId)
    .eq('estado', 'pendiente')
    .order('programado_para', { ascending: true });

  const pendientes = (data || []).map(normalize);
  const ahora = new Date();
  const hoyStr = ahora.toDateString();
  const en7dias = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000);

  // horas_vencido se precalcula aquí (fuera del render) para que los
  // componentes que lo muestran no necesiten llamar Date.now() ellos mismos.
  const vencidos = pendientes
    .filter(f => new Date(f.programado_para) <= ahora)
    .map(f => ({ ...f, horas_vencido: Math.round((ahora - new Date(f.programado_para)) / 3600000) }));
  const hoy = pendientes.filter(f => {
    const fecha = new Date(f.programado_para);
    return fecha > ahora && fecha.toDateString() === hoyStr;
  });
  const proximos = pendientes.filter(f => {
    const fecha = new Date(f.programado_para);
    return fecha > ahora && fecha <= en7dias && fecha.toDateString() !== hoyStr;
  });

  return { vencidos, hoy, proximos, total_activos: pendientes.length, error: error?.message };
};
