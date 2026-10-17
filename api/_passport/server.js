// Dependencias de servidor del asistente de SET Passport. Vercel no publica
// como ruta los archivos de carpetas que empiezan por "_".
import process from 'node:process';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { fetchAllTrainingSessions } from '../../src/features/passport/trainingSessions.js';

// Modelo fijo del MVP (decisión de producto). No lo elige el navegador.
export const ASSISTANT_MODEL = 'claude-haiku-4-5';
const MAX_OUTPUT_TOKENS = 1000;
const REQUEST_TIMEOUT_MS = 25_000;

const PASSPORT_COLUMNS = 'headline, summary, availability, hours_per_week, languages, skills, tools, niches, experience_track, experiences, preferred_roles, work_modes';

// Solo se informa si cada valor existe; los valores nunca salen de aquí.
export const getConfig = () => ({
  supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
});

const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

// Cliente con la sesión del alumno: toda lectura pasa por RLS.
export const createUserClient = (config, accessToken) => createClient(config.supabaseUrl, config.anonKey, {
  global: { headers: { Authorization: `Bearer ${accessToken}` } },
  auth: noSession,
});

// Cliente service_role: SOLO para las funciones de cuota.
export const createServiceClient = (config) => createClient(config.supabaseUrl, config.serviceKey, { auth: noSession });

// Datos del propio alumno, leídos con su sesión. Nunca se lee el SET Score.
export const loadStudentData = async (client, userId) => {
  const [passport, onboarding, commercial, sessions] = await Promise.all([
    client.from('setter_passports').select(PASSPORT_COLUMNS).eq('user_id', userId).maybeSingle(),
    client.from('onboarding').select('crm, crm_other, worked_setter, worked_closer, sold_by_chat, participated_launch, worked_digital_business').eq('user_id', userId).maybeSingle(),
    client.from('commercial_profiles').select('role_type, primary_niche, bio_pitch').eq('user_id', userId).maybeSingle(),
    fetchAllTrainingSessions(client, userId),
  ]);
  const error = passport.error || onboarding.error || commercial.error || (sessions.complete ? null : { message: sessions.error });
  return {
    error: error ? 'data_error' : null,
    passportRow: passport.data || null,
    onboarding: onboarding.data || null,
    commercialProfile: commercial.data || null,
    sessions: sessions.sessions,
  };
};

// Una llamada al modelo. Devuelve texto, tokens y motivo de parada.
export const generateDraft = async ({ apiKey, system, userMessage }) => {
  const client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
  const response = await client.messages.create({
    model: ASSISTANT_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0.4,
    system,
    messages: [{ role: 'user', content: userMessage }],
  });
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return {
    text,
    stopReason: response.stop_reason,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
};

// Registro sin contenido: solo el evento y un código. Nunca prompts, textos,
// tokens de sesión ni mensajes del proveedor.
export const logEvent = (event, detail = {}) => {
  console.error(`[passport-assistant] ${event}`, JSON.stringify(detail));
};

export const defaultDeps = { getConfig, createUserClient, createServiceClient, loadStudentData, generateDraft, logEvent };
