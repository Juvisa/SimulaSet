import { supabase } from '../lib/supabase';

const LEAD_FIELDS = [
  'id', 'setter_id', 'project_id', 'project_name', 'nombre', 'origen', 'canal',
  'dolor_principal', 'nivel_consciencia', 'temperatura', 'notas_adicionales',
  'estado', 'ultimo_contacto', 'alerta_fantasma', 'metricas', 'briefing',
  'created_at', 'updated_at',
].join(', ');

const MESSAGE_FIELDS = 'id, lead_id, tipo, mensaje, analisis_ia, formato, recurso_id, follow_up_id, opcion_elegida, created_at';

export const getRealLeads = async (setterId) => {
  const { data, error } = await supabase
    .from('real_leads')
    .select(LEAD_FIELDS)
    .eq('setter_id', setterId)
    .order('updated_at', { ascending: false });

  return { leads: data || [], error: error?.message };
};

export const getRealLeadById = async (id) => {
  const [{ data: lead, error: leadError }, { data: messages, error: messagesError }] = await Promise.all([
    supabase.from('real_leads').select(LEAD_FIELDS).eq('id', id).maybeSingle(),
    supabase.from('real_lead_messages').select(MESSAGE_FIELDS).eq('lead_id', id).order('created_at', { ascending: true }),
  ]);

  if (!lead) return { lead: null, messages: [], error: leadError?.message };
  return { lead: { ...lead, conversacion: messages || [] }, messages: messages || [], error: leadError?.message || messagesError?.message };
};

export const createRealLead = async (data) => {
  const { data: lead, error } = await supabase
    .from('real_leads')
    .insert({
      setter_id: data.setter_id,
      project_id: data.project_id || null,
      project_name: data.project_name || null,
      nombre: data.nombre,
      origen: data.origen,
      canal: data.canal,
      dolor_principal: data.dolor_principal,
      nivel_consciencia: data.nivel_consciencia,
      temperatura: data.temperatura,
      notas_adicionales: data.notas_adicionales || '',
    })
    .select(LEAD_FIELDS)
    .single();

  return { lead: lead ? { ...lead, conversacion: [] } : null, error: error?.message };
};

export const updateRealLead = async (id, updates) => {
  const { data, error } = await supabase
    .from('real_leads')
    .update(updates)
    .eq('id', id)
    .select(LEAD_FIELDS)
    .single();

  return { lead: data || null, error: error?.message };
};

// Inserta un turno de conversación y recalcula metricas.total_turnos +
// ultimo_contacto sobre el lead en un segundo paso — no es atómico entre las
// dos escrituras (no hay trigger de servidor para esto), mismo nivel de
// tolerancia a condiciones de carrera que el resto del proyecto usa para
// contadores derivados (ej. XP).
export const addLeadMessage = async (leadId, { tipo, mensaje, analisisIa, formato, recursoId, followUpId, opcionElegida }, currentMetricas) => {
  const { data: message, error: insertError } = await supabase
    .from('real_lead_messages')
    .insert({
      lead_id: leadId,
      tipo,
      mensaje,
      analisis_ia: analisisIa ?? null,
      formato: formato || null,
      recurso_id: recursoId || null,
      follow_up_id: followUpId || null,
      opcion_elegida: opcionElegida ?? null,
    })
    .select(MESSAGE_FIELDS)
    .single();

  if (insertError || !message) return { message: null, lead: null, error: insertError?.message };

  const { count } = await supabase
    .from('real_lead_messages')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId);

  const { lead, error: updateError } = await updateRealLead(leadId, {
    ultimo_contacto: message.created_at,
    metricas: { ...currentMetricas, total_turnos: count ?? (currentMetricas?.total_turnos || 0) + 1 },
  });

  return { message, lead, error: updateError };
};

export const updateMessageAnalysis = async (messageId, analisisIa) => {
  const { data, error } = await supabase
    .from('real_lead_messages')
    .update({ analisis_ia: analisisIa })
    .eq('id', messageId)
    .select(MESSAGE_FIELDS)
    .single();

  return { message: data || null, error: error?.message };
};
