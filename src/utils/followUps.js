// ─── Follow-up storage utilities ─────────────────────────────────────────────

const KEY = 'follow_up_schedule';

const get = () => JSON.parse(localStorage.getItem(KEY) || '[]');
const set = (data) => localStorage.setItem(KEY, JSON.stringify(data));

export const getFollowUps = (setterId) =>
  get().filter(f => f.setter_id === setterId);

export const getFollowUpsByLead = (leadId) =>
  get().filter(f => f.lead_id === leadId);

export const saveFollowUp = (followUp) => {
  const all = get();
  const idx = all.findIndex(f => f.id === followUp.id);
  if (idx >= 0) all[idx] = followUp;
  else all.push(followUp);
  set(all);
};

export const updateFollowUpEstado = (id, estado, extra = {}) => {
  const all = get();
  const idx = all.findIndex(f => f.id === id);
  if (idx >= 0) all[idx] = { ...all[idx], estado, ...extra };
  set(all);
};

export const createFollowUp = (data) => {
  const fu = {
    id: crypto.randomUUID(),
    setter_id: data.setter_id,
    lead_id: data.lead_id,
    lead_nombre: data.lead_nombre,
    project_id: data.project_id,
    created_at: new Date().toISOString(),
    programado_para: data.programado_para,
    tipo_seguimiento: data.tipo_seguimiento,
    nota: data.nota || '',
    estado: 'pendiente',
    vencido_notificado: false,
    ultima_interaccion: data.ultima_interaccion || '',
    dias_sin_respuesta: data.dias_sin_respuesta || 0,
    temperatura_actual: data.temperatura_actual || 'Tibio',
    mensaje_generado: null,
    mensaje_enviado: null,
    opcion_elegida: null,
    enviado_en: null,
    resultado: null,
  };
  saveFollowUp(fu);
  return fu;
};

export const getPendingFollowUpsForLead = (leadId) =>
  get().filter(f => f.lead_id === leadId && ['pendiente', 'vencido'].includes(f.estado));
