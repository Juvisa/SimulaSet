import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-5';
const MIN_MAX_TOKENS = 1;
const MAX_MAX_TOKENS = 4096;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { systemPrompt, messages, maxTokens, mode } = req.body || {};

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
      model: MODEL,
      max_tokens: maxTokens,
      messages,
    };

    if (systemPrompt !== undefined) params.system = systemPrompt;

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
