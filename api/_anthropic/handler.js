// POST /api/anthropic — proxy autenticado hacia Anthropic.
//
// Orden de comprobaciones (cada paso corta antes de llegar al siguiente):
//   1. método, origen y tamaño;
//   2. token de sesión → 401 si falta (antes de mirar el cuerpo);
//   3. token validado por Supabase (auth.getUser) → 401 si no es válido;
//   4. perfil: alumno o administrador activo → 403 si no;
//   5. operación de la lista cerrada, modelo y tope de tokens de esa operación,
//      tamaño de prompt/mensajes e imágenes solo donde se permiten → 400/413;
//   6. llamada a Anthropic; los errores se devuelven saneados (502).
// Nunca se confía en identificadores enviados por el navegador ni se registran
// prompts, respuestas o tokens.
//
// Compatibilidad: el campo `error` lleva un mensaje legible porque las pestañas
// abiertas con el frontend anterior lo muestran tal cual al alumno.
import { AI_OPERATIONS, IMAGE_MEDIA_TYPES, LIMITS, MODELS } from './operations.js';

export const AI_MESSAGES = Object.freeze({
  method_not_allowed: 'Método no permitido.',
  forbidden_origin: 'Origen no permitido.',
  too_large: 'La solicitud es demasiado grande (por ejemplo, una imagen muy pesada).',
  invalid_request: 'Solicitud no válida para esta herramienta de IA.',
  unauthenticated: 'Tu sesión expiró o SimulaSET se actualizó. Recarga la página e inicia sesión de nuevo para continuar.',
  forbidden: 'Tu cuenta no tiene acceso a las herramientas de IA.',
  not_configured: 'El servicio de IA no está disponible en este momento.',
  upstream_error: 'No se pudo completar la solicitud de IA. Inténtalo de nuevo en unos segundos.',
});

const ALLOWED_ROLES = new Set(['setter', 'admin']);
const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

const sameHost = (origin, host) => {
  try {
    return Boolean(origin) && Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
};

// Valida los mensajes y cuenta texto e imágenes. Devuelve un motivo (solo para
// el registro del servidor) o null si es válido.
const checkMessages = (messages, operation) => {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > LIMITS.messages) return 'messages_count';
  let textChars = 0;
  let images = 0;
  for (const message of messages) {
    if (!isPlainObject(message) || !['user', 'assistant'].includes(message.role)) return 'message_shape';
    if (typeof message.content === 'string') {
      textChars += message.content.length;
      continue;
    }
    if (!Array.isArray(message.content) || message.content.length === 0) return 'message_content';
    for (const block of message.content) {
      if (!isPlainObject(block)) return 'block_shape';
      if (block.type === 'text' && typeof block.text === 'string') {
        textChars += block.text.length;
      } else if (block.type === 'image') {
        if (!operation.images || message.role !== 'user') return 'image_not_allowed';
        const source = block.source;
        if (!isPlainObject(source) || source.type !== 'base64' || !IMAGE_MEDIA_TYPES.includes(source.media_type)
          || typeof source.data !== 'string' || source.data.length > LIMITS.imageBase64Chars) return 'image_invalid';
        images += 1;
      } else {
        return 'block_type';
      }
    }
  }
  if (images > LIMITS.imagesPerRequest) return 'too_many_images';
  if (textChars > LIMITS.textChars) return 'text_too_long';
  return null;
};

export const createAnthropicHandler = (deps) => async function handler(req, res) {
  const send = (status, payload) => res.status(status).json(payload);
  const fail = (status, code) => send(status, { error: AI_MESSAGES[code], code });
  res.setHeader('Cache-Control', 'no-store');

  // 1. Método, origen y tamaño.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(405, 'method_not_allowed');
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!sameHost(req.headers.origin, host)) return fail(403, 'forbidden_origin');
  if (Number(req.headers['content-length'] || 0) > LIMITS.bodyBytes) return fail(413, 'too_large');

  // 2. Sesión obligatoria, antes de mirar el cuerpo.
  const authorization = req.headers.authorization || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!accessToken) return fail(401, 'unauthenticated');

  const config = deps.getConfig();
  if (!config.supabaseUrl || !config.anonKey || !config.anthropicKey) {
    deps.logEvent('not_configured', { supabase: Boolean(config.supabaseUrl && config.anonKey), anthropic: Boolean(config.anthropicKey) });
    return fail(503, 'not_configured');
  }

  // 3. Token validado por Supabase (no se confía en ningún id del navegador).
  const userClient = deps.createUserClient(config, accessToken);
  let userId;
  try {
    const { data, error } = await userClient.auth.getUser(accessToken);
    userId = error ? null : data?.user?.id;
  } catch {
    userId = null;
  }
  if (!userId) return fail(401, 'unauthenticated');

  // 4. Perfil: alumno o administrador activo.
  const { data: profile, error: profileError } = await userClient
    .from('profiles').select('id, role, active').eq('id', userId).maybeSingle();
  if (profileError) {
    deps.logEvent('profile_error', { code: profileError.code || 'unknown' });
    return fail(503, 'not_configured');
  }
  if (!profile || profile.active !== true || !ALLOWED_ROLES.has(profile.role)) return fail(403, 'forbidden');

  // 5. Operación de la lista cerrada y sus límites.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return fail(400, 'invalid_request'); }
  }
  if (!isPlainObject(body)) return fail(400, 'invalid_request');
  const reject = (reason, status = 400) => {
    deps.logEvent('rejected', { reason, operation: typeof body.operation === 'string' ? body.operation.slice(0, 40) : null });
    return fail(status, status === 413 ? 'too_large' : 'invalid_request');
  };

  const operation = Object.prototype.hasOwnProperty.call(AI_OPERATIONS, body.operation) ? AI_OPERATIONS[body.operation] : null;
  if (!operation) return reject('unknown_operation');
  const modelKey = body.model === undefined ? operation.models[0] : body.model;
  if (!operation.models.includes(modelKey)) return reject('model_not_allowed');
  if (!Number.isInteger(body.maxTokens) || body.maxTokens < 1 || body.maxTokens > operation.maxTokens) return reject('max_tokens');
  if (body.systemPrompt !== undefined && (typeof body.systemPrompt !== 'string' || body.systemPrompt.length > LIMITS.systemPromptChars)) {
    return reject('system_prompt', typeof body.systemPrompt === 'string' ? 413 : 400);
  }
  const messagesProblem = checkMessages(body.messages, operation);
  if (messagesProblem) return reject(messagesProblem, ['text_too_long', 'image_invalid'].includes(messagesProblem) ? 413 : 400);

  // 6. Anthropic.
  const params = { model: MODELS[modelKey], max_tokens: body.maxTokens, messages: body.messages };
  // Prompt caching: no-op por debajo del mínimo cacheable; útil en el simulador.
  if (body.systemPrompt !== undefined) {
    params.system = [{ type: 'text', text: body.systemPrompt, cache_control: { type: 'ephemeral' } }];
  }

  try {
    const response = await deps.createAnthropic(config.anthropicKey).messages.create(params);
    const text = response.content?.find((block) => block.type === 'text')?.text || '';
    deps.logEvent('ok', { operation: body.operation, model: modelKey, input_tokens: response.usage?.input_tokens, output_tokens: response.usage?.output_tokens });
    return send(200, operation.stopReason ? { text, stop_reason: response.stop_reason } : { text });
  } catch (error) {
    deps.logEvent('upstream_error', { operation: body.operation, status: error?.status || null });
    return fail(502, 'upstream_error');
  }
};
