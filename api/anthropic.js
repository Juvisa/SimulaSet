import Anthropic from '@anthropic-ai/sdk';

// Mapa cerrado de alias -> modelo real. El cliente nunca manda un model id
// arbitrario (evita que alguien manipule el request para forzar un modelo
// caro); solo puede pedir una de estas dos claves. 'sonnet' es el default
// implícito (model ausente) para no romper ningún caller existente que aún
// no fue migrado. Debe mantenerse en sync con MODEL_IDS en src/utils/anthropic.js
// (usado solo por el path de desarrollo directo a la API).
const MODELS = {
  sonnet: 'claude-sonnet-4-5',
  haiku: 'claude-haiku-4-5-20251001',
};
const DEFAULT_MODEL_KEY = 'sonnet';
const MIN_MAX_TOKENS = 1;
const MAX_MAX_TOKENS = 4096;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { systemPrompt, messages, maxTokens, mode, model } = req.body || {};
  const modelKey = model === undefined ? DEFAULT_MODEL_KEY : model;

  // Antes esto validaba maxTokens contra una lista fija de valores exactos
  // (500/1500/2000/3000): cualquier feature nueva con un presupuesto de tokens
  // distinto (ej. 800) quedaba rechazada con un "Solicitud inválida" genérico,
  // sin ninguna pista de por qué. Se reemplaza por un rango razonable, y se
  // reporta EXACTAMENTE qué campo falló.
  const validationErrors = [];
  if (systemPrompt !== undefined && typeof systemPrompt !== 'string') {
    validationErrors.push('systemPrompt debe ser texto (string) si se envía.');
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    validationErrors.push('messages debe ser un array con al menos un mensaje.');
  }
  if (!Number.isInteger(maxTokens) || maxTokens < MIN_MAX_TOKENS || maxTokens > MAX_MAX_TOKENS) {
    validationErrors.push(`maxTokens debe ser un entero entre ${MIN_MAX_TOKENS} y ${MAX_MAX_TOKENS} (recibido: ${JSON.stringify(maxTokens)}).`);
  }
  if (!Object.prototype.hasOwnProperty.call(MODELS, modelKey)) {
    validationErrors.push(`model debe ser uno de: ${Object.keys(MODELS).join(', ')} (recibido: ${JSON.stringify(model)}).`);
  }

  if (validationErrors.length > 0) {
    console.error('[api/anthropic] Solicitud inválida:', validationErrors.join(' '));
    return res.status(400).json({ error: 'Solicitud inválida', reason: validationErrors.join(' ') });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'El servicio de IA no está configurado' });
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const params = {
      model: MODELS[modelKey],
      max_tokens: maxTokens,
      messages,
    };

    // Prompt Caching: el breakpoint se pone siempre que hay systemPrompt, no
    // solo para el simulador. Por debajo del mínimo cacheable de Anthropic
    // (~1024 tokens para Sonnet, ~2048 para Haiku) esto es un no-op inofensivo;
    // para el simulador (system prompt largo, idéntico turno a turno dentro de
    // la misma sesión porque project/prospectProfile/mode no cambian) es
    // exactamente donde se gana el ~90% de descuento en lectura de caché.
    if (systemPrompt !== undefined) {
      params.system = [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];
    }

    const response = await anthropic.messages.create(params);
    const text = response.content.find((block) => block.type === 'text')?.text || '';
    if (mode === 'set_engine') {
      return res.status(200).json({ text, stop_reason: response.stop_reason });
    }
    return res.status(200).json({ text });
  } catch (error) {
    console.error('[api/anthropic] Error llamando a Anthropic:', error);
    return res.status(502).json({ error: 'No se pudo completar la solicitud de IA', reason: error?.message });
  }
}
