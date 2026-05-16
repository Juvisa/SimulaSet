const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 1500;

export const callClaude = async (systemPrompt, messages) => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  const text = data.content[0]?.text || '';

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

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Error generando perfil');
  }
  const data = await response.json();
  const text = data.content[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Perfil inválido');
  const profile = JSON.parse(jsonMatch[0]);
  return { ...profile, temperatura: config.temperatura, canal: config.canal, resistencia: config.resistencia };
};
