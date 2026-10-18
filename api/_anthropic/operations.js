// Lista CERRADA de operaciones de IA que el frontend puede pedir a
// /api/anthropic. Cada una fija sus modelos permitidos y su tope de tokens de
// salida, igual a lo que usa hoy su pantalla (medido en el código): el servidor
// nunca da más de lo que la app necesita. Cualquier otra operación se rechaza.
//
// Fase D (pendiente, requisito de la Acreditación de Práctica v2): mover aquí
// también los prompts de las operaciones evaluadoras, para que el navegador
// envíe datos y no instrucciones.

// Alias de modelo → modelo real. El navegador nunca envía un id de modelo.
export const MODELS = Object.freeze({
  sonnet: 'claude-sonnet-4-5',
  haiku: 'claude-haiku-4-5-20251001',
});

const op = (models, maxTokens, extra = {}) => Object.freeze({ models: Object.freeze(models), maxTokens, images: false, stopReason: false, ...extra });

export const AI_OPERATIONS = Object.freeze({
  // Simulador
  simulator_prospect: op(['haiku'], 500),
  simulator_turn: op(['haiku'], 800),
  simulation_report: op(['sonnet'], 2000),
  // Analizador de conversaciones
  analyzer_extract: op(['sonnet'], 2000, { images: true }),
  analyzer_analysis: op(['sonnet'], 3000),
  // Conversaciones reales (SET Engine)
  set_engine: op(['sonnet'], 3000, { stopReason: true }),
  real_lead_break_ice: op(['sonnet'], 2000),
  real_lead_reactivation: op(['sonnet'], 2000),
  briefing: op(['sonnet'], 2500),
  follow_up: op(['sonnet'], 2000),
  // Otras herramientas
  value_asset: op(['sonnet'], 2000),
  set_coach: op(['haiku'], 450),
  mission_evaluation: op(['sonnet'], 1500),
});

// Límites de tamaño comunes (holgados respecto al uso real, pero acotados).
export const LIMITS = Object.freeze({
  bodyBytes: 4_500_000, // límite de Vercel para el cuerpo de una función
  systemPromptChars: 40_000,
  messages: 120,
  textChars: 200_000, // suma de todo el texto de los mensajes
  imagesPerRequest: 1,
  imageBase64Chars: 4_400_000,
});

export const IMAGE_MEDIA_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
