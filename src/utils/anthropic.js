import { parseAndValidateSetEngineResponse, SET_ENGINE_ERROR_CODES, SetEngineError } from './setEngine.js';

const MAX_TOKENS = 1500;
const SET_ENGINE_RETRY_INSTRUCTION = 'La respuesta anterior no cumplió el formato. Genera nuevamente la respuesta completa siguiendo exactamente el contrato JSON. Devuelve únicamente JSON puro, sin markdown ni texto adicional.';
const RETRYABLE_SET_ERRORS = new Set([
  SET_ENGINE_ERROR_CODES.FORMAT,
  SET_ENGINE_ERROR_CODES.CONTRACT,
  SET_ENGINE_ERROR_CODES.MAX_TOKENS,
]);

const requestClaude = async ({ systemPrompt, messages, maxTokens, mode }) => {
  const payload = { systemPrompt, messages, maxTokens };
  if (mode !== undefined) payload.mode = mode;
  const response = await fetch('/api/anthropic', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error || `API error ${response.status}`);
  }

  const data = await response.json();
  return mode === 'set_engine' ? data : data.text || '';
};

export const callClaude = async (systemPrompt, messages) => {
  const text = await requestClaude({ systemPrompt, messages, maxTokens: MAX_TOKENS });

  // Parse JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Respuesta inválida de la IA');
  return JSON.parse(jsonMatch[0]);
};

const runSetEngineAttempt = async (request, systemPrompt, messages, project) => {
  const result = await request({ systemPrompt, messages, maxTokens: 3000, mode: 'set_engine' });
  if (result.stop_reason === 'max_tokens') {
    throw new SetEngineError(SET_ENGINE_ERROR_CODES.MAX_TOKENS, 'La respuesta de la IA se truncó por límite de tokens.');
  }
  return parseAndValidateSetEngineResponse(result.text || '', project);
};

export const createSetEngineCaller = request => async (systemPrompt, messages, project) => {
  try {
    return await runSetEngineAttempt(request, systemPrompt, messages, project);
  } catch (error) {
    if (!RETRYABLE_SET_ERRORS.has(error?.code)) throw error;
  }

  try {
    return await runSetEngineAttempt(request, `${systemPrompt}\n${SET_ENGINE_RETRY_INSTRUCTION}`, messages, project);
  } catch (error) {
    if (!RETRYABLE_SET_ERRORS.has(error?.code)) throw error;
    throw new SetEngineError(
      SET_ENGINE_ERROR_CODES.RETRY_EXHAUSTED,
      'La IA no pudo generar un análisis válido después de dos intentos. Puedes reintentar.',
    );
  }
};

export const callSetEngine = createSetEngineCaller(requestClaude);

export const generateProspectProfile = async (project, mode, config) => {
  const prompt = `
Genera un perfil realista de prospecto para una simulación de ventas.

PROYECTO: ${project.expertName} — ${project.niche}
PROMESA: ${project.promise}
AVATAR: ${project.avatarDescription}
MODO: ${mode}
TEMPERATURA: ${config.temperatura}
CANAL: ${config.canal}
RESISTENCIA: ${config.resistencia}

RESPONDE EN JSON (sin markdown):
{
  "nombre": "nombre completo ficticio",
  "tipNegocio": "tipo específico de negocio o perfil",
  "dolor": "dolor principal específico y concreto",
  "objecion_probable": "objeción más probable en este modo",
  "nivel_consciencia": "bajo | medio | alto",
  "apertura_inicial": "primer mensaje del prospecto o contexto de apertura"
}
`;

  const text = await requestClaude({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 500,
  });
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Perfil inválido');
  const profile = JSON.parse(jsonMatch[0]);
  return { ...profile, temperatura: config.temperatura, canal: config.canal, resistencia: config.resistencia };
};

export const extractConversationText = async (messages) => {
  return requestClaude({ messages, maxTokens: 2000 });
};
