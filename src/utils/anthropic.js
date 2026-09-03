const MAX_TOKENS = 1500;

const SET_ENGINE_WIRE_INSTRUCTIONS = `
FORMATO DE TRANSPORTE OBLIGATORIO: devuelve {"d":[],"x":[],"a":[],"s":[],"m":[],"z":[]}.
d tiene 8 strings: [resumen_situacion, evidencias_situacion_json, inferencia_emocion, confianza, evidencias_emocion_json, condicion_necesaria, microcompromiso, razon].
x tiene 5 strings: [accion, objetivo, estrategia, piezas_json, que_evitar_json].
a tiene 3 strings JSON: si_avanza, si_objeta, si_no_responde. Usa "[]" para null; ramas [accion,objetivo] y no_responde [accion,objetivo,esperar_horas_o_string_vacio].
s tiene 5 strings: [nivel_compromiso, temperatura_ia, confianza_temperatura, estado_conversacional, senales_json].
m tiene 5 strings JSON: [hechos, compromisos, preguntas_resueltas, preguntas_abiertas, recursos_entregados]. z es el arreglo de alertas.
Códigos: acciones en/es/p/av/ac/ca/ag/co/re/cc; piezas t/ag/vg/r; fuentes m/l/p/r; compromiso nd/i/e/c; temperatura nd/f/tb/c; confianza b/m/a; estado sc/ap/ex/cl/ev/ob/co/ca/er/re/ce.
Evidencia JSON: {"f":"m","i":"id o vacío","q":"extracto"}. Pieza: {"t":"t","c":"contenido o vacío","r":"recurso_id o vacío"}. Señal: {"t":"tipo","d":"descripción","e":evidencia}.
Hecho: {"k":"clave","v":"valor","i":"mensaje_id"}. Compromiso: {"t":"tipo","d":"detalle","i":"mensaje_id"}. Recurso entregado: {"r":"recurso_id","i":"mensaje_id"}.
Todos los valores de d, x, a, s y m deben ser strings. Las colecciones internas van serializadas como strings JSON válidos.
`;

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

export const callClaudeText = async (systemPrompt, messages) => {
  const result = await requestClaude({ systemPrompt: `${systemPrompt}\n${SET_ENGINE_WIRE_INSTRUCTIONS}`, messages, maxTokens: 3000, mode: 'set_engine' });
  if (result.stop_reason === 'max_tokens') {
    throw new Error('La respuesta de la IA se truncó por límite de tokens. Puedes reintentar.');
  }
  return JSON.stringify(parseAndExpandSetEngineWireResponse(result.text || ''));
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
import { parseAndExpandSetEngineWireResponse } from './setEngine';
