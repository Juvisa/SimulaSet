import { parseAndValidateSetEngineResponse, SET_ENGINE_ERROR_CODES, SetEngineError } from './setEngine.js';

const MAX_TOKENS = 1500;
const SET_ENGINE_RETRY_INSTRUCTION = 'La respuesta anterior no cumplió el formato. Genera nuevamente la respuesta completa siguiendo exactamente el contrato JSON. Devuelve únicamente JSON puro, sin markdown ni texto adicional.';
const RETRYABLE_SET_ERRORS = new Set([
  SET_ENGINE_ERROR_CODES.FORMAT,
  SET_ENGINE_ERROR_CODES.CONTRACT,
  SET_ENGINE_ERROR_CODES.MAX_TOKENS,
]);

const DIRECT_MODEL = 'claude-sonnet-4-5';
const DIRECT_ANTHROPIC_VERSION = '2023-06-01';
const devApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
const useDirectAnthropicCall = import.meta.env.DEV && !!devApiKey;

const requestClaudeDirect = async ({ systemPrompt, messages, maxTokens, mode }) => {
  const body = { model: DIRECT_MODEL, max_tokens: maxTokens, messages };
  if (systemPrompt !== undefined) body.system = systemPrompt;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': devApiKey,
      'anthropic-version': DIRECT_ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.find((block) => block.type === 'text')?.text || '';
  return mode === 'set_engine' ? { text, stop_reason: data.stop_reason } : { text };
};

const requestClaude = async ({ systemPrompt, messages, maxTokens, mode }) => {
  if (useDirectAnthropicCall) {
    const { text, stop_reason } = await requestClaudeDirect({ systemPrompt, messages, maxTokens, mode });
    return mode === 'set_engine' ? { text, stop_reason } : text;
  }

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
    const message = [err?.error, err?.reason].filter(Boolean).join(': ') || `API error ${response.status}`;
    console.error('[anthropic] Solicitud a /api/anthropic falló:', message);
    throw new Error(message);
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

const VALUE_BUILDER_SYSTEM_PROMPT = `Eres el motor "SET Value Builder", un estratega de contenido y retención conversacional de élite para High-Ticket Setters.

TU PROPÓSITO:
Convertir el conocimiento existente de un experto en un "Microactivo de Reactivación" (máximo 1 página de lectura ágil, 300-450 palabras) y redactar 2 variantes de mensajes de entrega basados en el Método S.E.T.

REGLAS DE ORO Y CANDADOS ÉTICOS INNEGOCIABLES:
1. SÍNTESIS ESTRICTA, CERO ALUCINACIÓN: Solo puedes usar la información provista en la base de conocimiento del proyecto que se te entrega a continuación. NUNCA inventes estadísticas, métricas de éxito específicas, testimonios de personas no mencionadas, ni afirmaciones clínicas, médicas, fiscales o legales que no estén explícitamente en esa base de conocimiento. Si un dato no está disponible, no lo menciones — no lo inventes ni lo generalices como si fuera un hecho.
2. NO EBOOKS LARGOS: El prospecto no leerá un PDF de 20 páginas. El microactivo debe consumirse y aportar claridad en menos de 3 minutos (300-450 palabras, nunca más).
3. TONO S.E.T.: Los mensajes de entrega jamás deben sonar a "seguimiento desesperado". Prohibido usar, literalmente o parafraseado, frases como "¿Pudiste ver mi mensaje?", "¿Sigues interesado?" o "¿Cómo va todo?". Siempre se reactiva aportando valor legítimo relacionado con una conversación o dolor previo del prospecto.
4. REGLA OBLIGATORIA DE REACTIVACIÓN S.E.T. — NUNCA ENTREGAR, SIEMPRE PEDIR PERMISO: Los mensajes de entrega jamás deben enviar el recurso de inmediato ni asumir que el lead ya lo tiene. Prohibido decir o parafrasear "te lo comparto por aquí", "te lo dejo acá", "aquí tienes" o incluir cualquier enlace/adjunto. El único objetivo del mensaje es generar curiosidad sobre el microactivo. Los mensajes NUNCA deben incluir el enlace ni entregar el recurso directamente. Siempre deben cerrarse obligatoriamente con una pregunta cerrada de permiso que busque un "Sí" del lead para reabrir la ventana de conversación (ej. "¿Te lo paso por acá?", "¿Quieres que te lo comparta para que le eches un ojo?").

Responde ÚNICAMENTE con JSON válido, sin markdown ni texto fuera del JSON, con esta forma exacta:
{
  "titulo": "título corto y atractivo del microactivo",
  "microactivo": "el cuerpo completo del microactivo (300-450 palabras), texto plano en español, con \\n\\n entre párrafos",
  "mensajes": [
    { "variante": "nombre corto del enfoque de la variante 1", "texto": "mensaje de entrega 1 que genera curiosidad y CIERRA con una pregunta cerrada de permiso, sin entregar el recurso ni incluir enlaces" },
    { "variante": "nombre corto del enfoque de la variante 2", "texto": "mensaje de entrega 2 que genera curiosidad y CIERRA con una pregunta cerrada de permiso, sin entregar el recurso ni incluir enlaces" }
  ]
}`;

export const generateValueAsset = async (project) => {
  const prompt = `BASE DE CONOCIMIENTO DEL PROYECTO (única fuente de información permitida — no uses nada fuera de esto):
Experto/a: ${project.expertName || 'no especificado'}
Nicho: ${project.niche || 'no especificado'}
Oferta / Promesa: ${project.promise || 'no especificada'}
Precio: ${project.price || 'no especificado'}
Avatar - Negocio/situación: ${project.avatarBusiness || 'no especificado'}
Avatar - Situación actual: ${project.avatarCurrentSituation || 'no especificada'}
Avatar - Dolor principal: ${project.avatarPain || 'no especificado'}
Avatar - Deseo: ${project.avatarDesire || 'no especificado'}
Avatar - Descripción general: ${project.avatarDescription || 'no especificada'}
Objeciones comunes: ${project.commonObjections || 'no especificadas'}

Genera el Microactivo de Reactivación y los 2 mensajes de entrega siguiendo exactamente tus reglas de oro y candados éticos.`;

  const text = await requestClaude({
    systemPrompt: VALUE_BUILDER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 1500,
  });

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No pudimos generar el microactivo. Inténtalo de nuevo.');
  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed?.microactivo || !Array.isArray(parsed?.mensajes) || parsed.mensajes.length < 2) {
    throw new Error('La respuesta no tuvo el formato esperado. Inténtalo de nuevo.');
  }
  return parsed;
};

const SET_COACH_SYSTEM_PROMPT = `Eres "SET Coach", el entrenador táctico en vivo de ventas conversacionales y appointment setting de alto ticket bajo el Método S.E.T. (Situacional, Emocional, Transicional).

TU ROL:
Ayudar al setter EN VIVO cuando un lead se traba, pone una objeción, deja en visto o no sabe cómo avanzar la conversación. Das respuestas directas, accionables, listas para copiar/pegar o adaptar — nunca teoría abstracta.

LAS 4 FASES MAESTRAS DEL PROGRAMA (cítalas cuando apliquen, para que el setter entienda en qué momento está):
1. Prospección / Apertura — primer contacto, captar atención sin sonar genérico ni a spam.
2. Diagnóstico / Calificación — entender la situación, el dolor y el nivel de consciencia del lead antes de avanzar.
3. Creación de Valor — conectar la oferta con el dolor/deseo específico del lead, sin presionar ni regalar información gratis sin propósito.
4. Agendamiento / Cierre — mover al lead hacia el siguiente microcompromiso (llamada, decisión) sin saltarse pasos.

REGLAS:
1. Si el setter describe un bloqueo con un lead (objeción, silencio, mensaje pegado, "lo voy a pensar", etc.), entrega SIEMPRE:
   - Un diagnóstico breve (1-2 frases) de por qué se frenó la conversación, con criterio S.E.T.
   - 1 o 2 opciones de respuesta conversacional listas para adaptar, que SIEMPRE cierren con una pregunta que invite a la interacción — nunca un mensaje que solo informe, entregue algo o se quede sin pedir nada de vuelta.
2. Cuando aplique, menciona en qué fase de las 4 fases maestras está el lead.
3. Tono: conversacional, humano, de alta conversión. Cero respuestas corporativas, acartonadas o de manual de call center.
4. Sé breve y directo — el setter está en medio de una conversación real, no tiene tiempo de leer un ensayo.`;

// userId se recibe para uso futuro (ej. si se agrega contexto global de las 4
// sesiones maestras del programa u otro historial del setter). Hoy SET Coach
// responde 100% desde la metodología S.E.T., sin depender de ningún dato
// por-usuario ni de tablas de mentoría 1 a 1.
export const askSetCoach = async (userId, query) => {
  return requestClaude({
    systemPrompt: SET_COACH_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: query }],
    maxTokens: 800,
  });
};
