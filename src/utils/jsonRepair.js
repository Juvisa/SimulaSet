// Utilidades para parsear JSON devuelto por un LLM, que en ocasiones rompe
// JSON.parse() por comillas tipográficas, comas colgantes o saltos de línea
// literales dentro de un valor de string (el modelo "quiso" escribir un
// párrafo con salto de línea, pero eso es inválido en JSON estricto si no
// viene escapado como \n). Nada de esto reemplaza la validación del contrato
// de cada llamador — solo mejora la tasa de éxito de JSON.parse() antes de
// llegar a un fallback más agresivo (ver parseJsonLoose).

export const stripMarkdownFence = (text) => {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : trimmed).trim();
};

export const extractJsonSlice = (text) => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end >= start ? text.slice(start, end + 1) : text;
};

// Repara los errores más comunes: comillas/apóstrofes tipográficos que el
// modelo a veces mezcla con comillas rectas, comas colgantes antes de } o ],
// y saltos de línea/tabs literales DENTRO de un valor string (fuera de
// comillas no se tocan, para no alterar el formato del JSON en sí).
export const repairJsonPunctuation = (text) => {
  const withStraightQuotes = text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1');

  let inString = false;
  let repaired = '';
  for (let i = 0; i < withStraightQuotes.length; i += 1) {
    const char = withStraightQuotes[i];
    const prevChar = withStraightQuotes[i - 1];
    if (char === '"' && prevChar !== '\\') inString = !inString;
    if (inString && (char === '\n' || char === '\r' || char === '\t')) {
      repaired += char === '\t' ? '\\t' : '\\n';
      continue;
    }
    repaired += char;
  }
  return repaired;
};

// Intenta JSON.parse() directo sobre el bloque {...} extraído; si falla,
// reintenta sobre la versión reparada. Devuelve null (nunca lanza) si ambos
// intentos fallan, para que el llamador decida su propio fallback.
export const parseJsonLoose = (rawText) => {
  const withoutFence = stripMarkdownFence(rawText);
  const slice = extractJsonSlice(withoutFence);

  try {
    return JSON.parse(slice);
  } catch {
    // sigue al intento reparado
  }

  try {
    return JSON.parse(repairJsonPunctuation(slice));
  } catch {
    return null;
  }
};
