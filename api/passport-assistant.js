// POST /api/passport-assistant — asistente de IA de SET Passport.
//
// Independiente de /api/anthropic. Flujo:
//   1. método, origen y tamaño;  2. token → auth.getUser();
//   3. perfil: alumno (setter) activo;  4. respuestas con esquema cerrado;
//   5. datos GUARDADOS + métricas, leídos con la sesión del alumno (RLS);
//   6. passport_ai_reserve (service_role);  7. Claude con prompt fijo;
//   8. validación de la salida (1 reintento);  9. passport_ai_finish (finally).
// Solo lee: nunca escribe en setter_passports, onboarding ni commercial_profiles.
// No guarda prompts ni textos generados.
import { defaultDeps } from './_passport/server.js';
import {
  ASSISTANT_LIMITS,
  ASSISTANT_SYSTEM_PROMPT,
  buildAssistantFacts,
  buildAssistantUserMessage,
  findMissingEssentials,
  validateAssistantAnswers,
  validateAssistantDraft,
} from '../src/features/passport/assistant/assistantContract.js';

const DAILY_LIMIT = 3;
const ATTEMPT_LIMIT = 6;
const MAX_MODEL_CALLS = 2; // 1 llamada + 1 reintento por salida inválida, en la misma reserva

const MESSAGES = {
  method_not_allowed: 'Método no permitido.',
  forbidden_origin: 'Origen no permitido.',
  too_large: 'La solicitud es demasiado grande.',
  invalid_request: 'Solicitud inválida.',
  unauthenticated: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  forbidden: 'El asistente solo está disponible para alumnos con acceso activo.',
  not_configured: 'El asistente no está disponible en este momento.',
  data_error: 'No pudimos leer tu perfil. Inténtalo de nuevo en unos minutos.',
  busy: 'Ya hay una propuesta generándose. Espera unos segundos.',
  limit_reached: 'Ya usaste tus 3 propuestas de hoy. Podrás generar más mañana.',
  attempts_exhausted: 'Alcanzaste el máximo de intentos de hoy. Podrás intentarlo de nuevo mañana.',
  generation_failed: 'No pudimos generar una propuesta válida. Este intento no consumió tus propuestas del día.',
};

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

const sameHost = (origin, host) => {
  try {
    return Boolean(origin) && Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
};

const quotaView = ({ used, remaining, attempts, busy = false }) => ({
  used,
  remaining,
  attemptsLeft: Math.max(ATTEMPT_LIMIT - attempts, 0),
  busy,
});

export const createPassportAssistantHandler = (deps = defaultDeps) => async function handler(req, res) {
  const send = (status, payload) => res.status(status).json(payload);
  const fail = (status, error, extra = {}) => send(status, { error, message: extra.message || MESSAGES[error], ...extra.body });
  res.setHeader('Cache-Control', 'no-store');

  // 1. Método, origen y tamaño.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(405, 'method_not_allowed');
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!sameHost(req.headers.origin, host)) return fail(403, 'forbidden', { message: MESSAGES.forbidden_origin });
  if (Number(req.headers['content-length'] || 0) > ASSISTANT_LIMITS.bodyBytes) return fail(413, 'too_large');

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return fail(400, 'invalid_request'); }
  }
  if (!isPlainObject(body)) return fail(400, 'invalid_request');
  if (JSON.stringify(body).length > ASSISTANT_LIMITS.bodyBytes) return fail(413, 'too_large');
  // Solo "action" y "answers": nada de métricas ni otros datos del navegador.
  if (Object.keys(body).some(k => !['action', 'answers'].includes(k))) return fail(400, 'invalid_request');
  if (body.action !== 'status' && body.action !== 'generate') return fail(400, 'invalid_request');

  // 2. Autenticación verificada en el servidor con Supabase.
  const authorization = req.headers.authorization || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!accessToken) return fail(401, 'unauthenticated');

  const config = deps.getConfig();
  if (!config.supabaseUrl || !config.anonKey || !config.serviceKey) {
    deps.logEvent('not_configured', { supabase: Boolean(config.supabaseUrl && config.anonKey), service: Boolean(config.serviceKey) });
    return fail(503, 'not_configured');
  }

  const userClient = deps.createUserClient(config, accessToken);
  const { data: authData, error: authError } = await userClient.auth.getUser(accessToken);
  const userId = authData?.user?.id;
  if (authError || !userId) return fail(401, 'unauthenticated');

  // 3. Solo alumnos activos.
  const { data: profile, error: profileError } = await userClient
    .from('profiles').select('id, role, active').eq('id', userId).maybeSingle();
  if (profileError) return fail(502, 'data_error');
  if (!profile || profile.role !== 'setter' || profile.active !== true) return fail(403, 'forbidden');

  const service = deps.createServiceClient(config);

  if (body.action === 'status') {
    const { data, error } = await service.rpc('passport_ai_quota', { p_user_id: userId });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      deps.logEvent('quota_error', { code: error?.code || 'empty' });
      return fail(503, 'not_configured');
    }
    return send(200, { quota: quotaView({ used: row.used_today, remaining: row.remaining_today, attempts: row.attempts_today, busy: row.busy }) });
  }

  // 4. Respuestas: esquema cerrado.
  const checked = validateAssistantAnswers(body.answers);
  if (!checked.ok) return fail(400, 'invalid_request', { message: checked.error });
  const answers = checked.value;

  if (!config.anthropicKey) {
    deps.logEvent('not_configured', { anthropic: false });
    return fail(503, 'not_configured');
  }

  // 5. Datos guardados y métricas reales (RLS con la sesión del alumno).
  const data = await deps.loadStudentData(userClient, userId);
  if (data.error) return fail(502, 'data_error');
  const missing = findMissingEssentials({ passportRow: data.passportRow, answers });
  if (missing) return fail(400, 'invalid_request', { message: missing });
  const facts = buildAssistantFacts({ ...data, answers });

  // 6. Reserva de cuota (atómica, por alumno).
  const { data: reserveData, error: reserveError } = await service.rpc('passport_ai_reserve', { p_user_id: userId });
  const reservation = Array.isArray(reserveData) ? reserveData[0] : reserveData;
  if (reserveError || !reservation) {
    deps.logEvent('reserve_error', { code: reserveError?.code || 'empty' });
    return fail(503, 'not_configured');
  }
  const quotaBefore = { used: reservation.used_today, remaining: reservation.remaining_today, attempts: reservation.attempts_today };
  if (reservation.outcome === 'busy') return fail(409, 'busy', { body: { quota: quotaView(quotaBefore) } });
  if (reservation.outcome === 'limit_reached') return fail(429, 'limit_reached', { body: { quota: quotaView(quotaBefore) } });
  if (reservation.outcome === 'attempts_exhausted') return fail(429, 'attempts_exhausted', { body: { quota: quotaView(quotaBefore) } });
  if (reservation.outcome !== 'reserved' || !reservation.reservation_id) return fail(403, 'forbidden');

  // 7–9. Generación + validación; la reserva se cierra SIEMPRE.
  let draft = null;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    let retryReason = null;
    for (let call = 0; call < MAX_MODEL_CALLS && !draft; call += 1) {
      const result = await deps.generateDraft({
        apiKey: config.anthropicKey,
        system: ASSISTANT_SYSTEM_PROMPT,
        userMessage: buildAssistantUserMessage(facts, retryReason),
      });
      inputTokens += result.inputTokens || 0;
      outputTokens += result.outputTokens || 0;
      if (result.stopReason === 'refusal') {
        deps.logEvent('model_refusal', {});
        break;
      }
      const verdict = validateAssistantDraft(result.text, facts);
      if (verdict.ok) draft = verdict.draft;
      else {
        retryReason = verdict.reason;
        deps.logEvent('invalid_output', { reason: verdict.reason, call });
      }
    }
  } catch (error) {
    deps.logEvent('model_error', { status: error?.status || null, type: error?.name || 'Error' });
  } finally {
    const { error: finishError } = await service.rpc('passport_ai_finish', {
      p_reservation_id: reservation.reservation_id,
      p_user_id: userId,
      p_succeeded: Boolean(draft),
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
    }).then(r => r, e => ({ error: e }));
    if (finishError) deps.logEvent('finish_error', { code: finishError.code || 'exception' });
  }

  if (!draft) {
    return fail(502, 'generation_failed', { body: { quota: quotaView({ ...quotaBefore }) } });
  }
  return send(200, {
    draft,
    quota: quotaView({ used: quotaBefore.used + 1, remaining: Math.max(quotaBefore.remaining - 1, 0), attempts: quotaBefore.attempts }),
  });
};

export default createPassportAssistantHandler();

// Límites expuestos para pruebas.
export const __limits = { DAILY_LIMIT, ATTEMPT_LIMIT, MAX_MODEL_CALLS };
