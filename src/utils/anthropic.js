const MAX_TOKENS = 1500;

const requestClaude = async ({ systemPrompt, messages, maxTokens, mode }) => {
  const response = await fetch('/api/anthropic', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ systemPrompt, messages, maxTokens, mode }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error || `API error ${response.status}`);
  }

  const data = await response.json();
  return data.text || '';
};

export const callClaude = async (systemPrompt, messages, options = {}) => {
  const text = await requestClaude({ systemPrompt, messages, maxTokens: MAX_TOKENS, mode: options.mode });

  // Parse JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Respuesta inválida de la IA');
  return JSON.parse(jsonMatch[0]);
};

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
