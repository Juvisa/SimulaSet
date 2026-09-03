import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-5';
const ALLOWED_MAX_TOKENS = new Set([500, 1500, 2000, 3000]);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { systemPrompt, messages, maxTokens } = req.body || {};

  if (
    (systemPrompt !== undefined && typeof systemPrompt !== 'string') ||
    !Array.isArray(messages) ||
    messages.length === 0 ||
    !ALLOWED_MAX_TOKENS.has(maxTokens)
  ) {
    return res.status(400).json({ error: 'Solicitud inválida' });
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
    return res.status(200).json({ text });
  } catch {
    return res.status(502).json({ error: 'No se pudo completar la solicitud de IA' });
  }
}
