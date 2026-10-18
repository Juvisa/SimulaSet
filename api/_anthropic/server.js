// Dependencias de servidor de /api/anthropic (inyectables en las pruebas).
// Vercel no publica como ruta los archivos de carpetas que empiezan por "_".
import process from 'node:process';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const cleanUrl = (url) => String(url || '').trim().replace(/\/(?:rest|auth)\/v1\/?$/, '').replace(/\/+$/, '');

// Solo se informa si cada valor existe; los valores nunca salen de aquí.
export const getConfig = () => ({
  supabaseUrl: cleanUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
  anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
});

const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

// Cliente con la sesión del usuario: la validación del token y la lectura del
// perfil pasan por Supabase (RLS), nunca por datos enviados por el navegador.
export const createUserClient = (config, accessToken) => createClient(config.supabaseUrl, config.anonKey, {
  global: { headers: { Authorization: `Bearer ${accessToken}` } },
  auth: noSession,
});

export const createAnthropic = (apiKey) => new Anthropic({ apiKey });

// Registro mínimo: nunca prompts, respuestas ni tokens de sesión.
export const logEvent = (event, data = {}) => {
  console.log(JSON.stringify({ scope: 'api/anthropic', event, ...data }));
};

export const defaultDeps = { getConfig, createUserClient, createAnthropic, logEvent };
