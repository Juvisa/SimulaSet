import { supabase } from '../lib/supabase';
import { spendXp } from './xp';

export const REWARDS = [
  { id: 'openers-pack', title: 'Pack de 10 Aperturas de Alta Respuesta', description: 'Recurso digital inmediato.', cost: 150 },
  { id: 'mentoria-extra', title: '+15 Minutos Extra en Sesión de Mentoría', description: 'Solicitud 1 a 1.', cost: 250 },
  { id: 'auditoria-async', title: 'Auditoría Express de Conversación Asincrónica', description: 'Feedback en audio de chats reales.', cost: 400 },
  { id: 'simulacion-personalizada', title: 'Simulación Personalizada en SimulaSet', description: 'Escenario de IA a medida.', cost: 600 },
  { id: 'bolsa-empleo', title: 'Recomendación a Bolsa de Empleo / Red de Closers', description: 'Acceso preferencial.', cost: 1200 },
];

export const redeemReward = async ({ userId, reward }) => {
  const { data: redemption, error: insertError } = await supabase
    .from('reward_redemptions')
    .insert({ user_id: userId, reward_id: reward.id, reward_title: reward.title, xp_spent: reward.cost, status: 'pending' })
    .select('id, reward_id, reward_title, xp_spent, status, created_at')
    .single();

  if (insertError || !redemption) {
    return { redemption: null, streak: null, error: insertError?.message || 'No pudimos registrar tu canje.' };
  }

  const { streak, error: spendError } = await spendXp({ userId, amount: reward.cost });
  if (spendError) {
    await supabase.from('reward_redemptions').delete().eq('id', redemption.id);
    return { redemption: null, streak: null, error: spendError };
  }

  return { redemption, streak, error: undefined };
};
