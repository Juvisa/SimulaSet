import { supabase } from '../lib/supabase';

export const REWARDS = [
  { id: 'openers-pack', title: 'Pack de 10 Aperturas de Alta Respuesta', description: 'Recurso digital inmediato.', cost: 150 },
  { id: 'mentoria-extra', title: '+15 Minutos Extra en Sesión de Mentoría', description: 'Solicitud 1 a 1.', cost: 250 },
  { id: 'auditoria-async', title: 'Auditoría Express de Conversación Asincrónica', description: 'Feedback en audio de chats reales.', cost: 400 },
  { id: 'simulacion-personalizada', title: 'Simulación Personalizada en SimulaSet', description: 'Escenario de IA a medida.', cost: 600 },
  { id: 'bolsa-empleo', title: 'Recomendación a Bolsa de Empleo / Red de Closers', description: 'Acceso preferencial.', cost: 1200 },
];

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
