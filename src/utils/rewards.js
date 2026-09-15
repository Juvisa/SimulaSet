import { supabase } from '../lib/supabase';

// Tienda XP: catálogo de 7 recompensas digitales de descarga instantánea
// (reemplaza las 5 recompensas anteriores de entrega manual). `fileName` es
// el nombre EXACTO con el que el admin debe subir cada archivo en
// AdminRewards — la ruta en el bucket 'reward-files' siempre es
// `{id}/{fileName}`, fija y predecible para el propio backend (no para el
// alumno: RLS impide leer el objeto sin haber canjeado, ver migración
// 202609150001_create_reward_files_bucket.sql).
export const REWARDS = [
  {
    id: 'set-10-aperturas',
    title: '10 Aperturas de Alta Respuesta',
    description: '10 estructuras de apertura para iniciar conversaciones según el contexto sin sonar automático, invasivo ni desesperado por vender.',
    label: 'INICIO DE CONVERSACIONES',
    cost: 150,
    fileName: '01_150XP_10_Aperturas_Alta_Respuesta.pdf',
  },
  {
    id: 'set-short-replies',
    title: 'SET Short Replies',
    description: "Aprende a leer y mover conversaciones cuando el lead responde con 'ok', 'sí', 'bien', 'no sé', emojis o respuestas mínimas.",
    label: 'RESPUESTAS CORTAS',
    cost: 200,
    fileName: '02_200XP_SET_Short_Replies.docx',
  },
  {
    id: 'set-deep-questions',
    title: 'SET Deep Questions',
    description: 'Banco táctico para profundizar en situación, deseo, brecha e importancia sin convertir el chat en un interrogatorio.',
    label: 'PROFUNDIZACIÓN',
    cost: 300,
    fileName: '03_300XP_SET_Deep_Questions.docx',
  },
  {
    id: 'set-transition-map',
    title: 'SET Transition Map',
    description: 'Mapa para saber cuándo pasar de contexto a situación, deseo, brecha, puente, cita, venta o espera sin saltarse etapas.',
    label: 'TRANSICIONES',
    cost: 450,
    fileName: '04_450XP_SET_Transition_Map.docx',
  },
  {
    id: 'set-conversations-lab',
    title: 'SET Conversations Lab',
    description: '8 conversaciones desarmadas mensaje por mensaje para entrenar lectura, criterio y siguiente movimiento bajo metodología S.E.T.',
    label: 'CASOS REALES DE ENTRENAMIENTO',
    cost: 600,
    fileName: '05_600XP_SET_Conversations_Lab.docx',
  },
  {
    id: 'set-edge-cases',
    title: 'SET Edge Cases',
    description: 'Playbook de 12 situaciones difíciles: garantías, descuentos, decisores, preguntas técnicas, soporte gratis, leads hostiles y más.',
    label: 'ESCENARIOS DIFÍCILES',
    cost: 800,
    fileName: '06_800XP_SET_Edge_Cases.docx',
  },
  {
    id: 'set-black-book',
    title: 'SET Black Book',
    description: 'Manual avanzado de lectura, decisión y conducción High Ticket para setters que quieren operar con criterio, no con scripts.',
    label: 'NIVEL AVANZADO',
    cost: 1200,
    fileName: '07_1200XP_SET_Black_Book.docx',
  },
];

export const getRewardById = (rewardId) => REWARDS.find((r) => r.id === rewardId) || null;

const storagePathFor = (reward) => `${reward.id}/${reward.fileName}`;

// Qué recompensas ya canjeó el alumno — una fila en reward_redemptions (sin
// importar su status pending/delivered, ver nota en la migración) ya
// significa "tiene acceso", porque esa fila solo existe si redeem_reward()
// descontó el XP con éxito.
export const getMyRedeemedRewardIds = async (userId) => {
  const { data, error } = await supabase
    .from('reward_redemptions')
    .select('reward_id')
    .eq('user_id', userId);

  if (error) return { rewardIds: new Set(), error: error.message };
  return { rewardIds: new Set((data || []).map((r) => r.reward_id)), error: undefined };
};

// URL firmada de corta duración (5 min) — se pide una nueva cada vez que el
// alumno hace clic en "Descargar", nunca se guarda ni se reutiliza. Supabase
// evalúa la política SELECT del bucket antes de emitirla: si el alumno no
// canjeó esta recompensa, esto falla con un error de RLS, no con un archivo.
export const getRewardDownloadUrl = async (reward) => {
  const { data, error } = await supabase.storage
    .from('reward-files')
    .createSignedUrl(storagePathFor(reward), 300);

  if (error || !data?.signedUrl) {
    return { url: null, error: error?.message || 'No pudimos generar el enlace de descarga.' };
  }
  return { url: data.signedUrl, error: undefined };
};

// El descuento de XP y el registro del canje ocurren en una sola transacción
// atómica dentro de redeem_reward() (Postgres, SECURITY DEFINER) — evita la
// condición de carrera de doble-canje que tenía el patrón anterior de
// insert + upsert manual desde el cliente.
export const redeemReward = async ({ reward }) => {
  const { data, error } = await supabase
    .rpc('redeem_reward', {
      p_reward_id: reward.id,
      p_reward_title: reward.title,
      p_cost: reward.cost,
    })
    .single();

  if (error || !data) {
    return { redemption: null, streak: null, error: error?.message || 'No pudimos registrar tu canje.' };
  }

  return {
    redemption: {
      id: data.redemption_id,
      reward_id: data.reward_id,
      reward_title: data.reward_title,
      xp_spent: data.xp_spent,
      status: data.status,
      created_at: data.created_at,
    },
    streak: {
      current_streak: data.current_streak,
      longest_streak: data.longest_streak,
      total_xp: data.total_xp,
      lifetime_xp: data.lifetime_xp,
      last_completed_date: data.last_completed_date,
    },
    error: undefined,
  };
};
