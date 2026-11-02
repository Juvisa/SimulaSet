// Cortes de red en Inbound — Primer contacto («Failed to fetch»): el navegador
// no recibió ninguna respuesta del servidor. Cada turno hace 2 o 3 llamadas,
// así que un corte breve de la conexión es más probable que en las demás
// modalidades. Se reintenta una vez; los errores con respuesta del servidor
// (401, 403, 429, 5xx: AiRequestError) o de formato no se reintentan.

// Mensajes de fetch sin respuesta en Chrome, Firefox y Safari.
const NETWORK_MESSAGE = /failed to fetch|networkerror|network ?error|load failed|network request failed|the network connection was lost/i;
export const isNetworkError = (err) => err instanceof TypeError && NETWORK_MESSAGE.test(String(err?.message || ''));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Envuelve una función con el contrato de callClaude.
export const withNetworkRetry = (call, { retries = 1, delayMs = 800 } = {}) => async (...args) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await call(...args);
    } catch (err) {
      if (attempt >= retries || !isNetworkError(err)) throw err;
      await wait(delayMs);
    }
  }
};

export const NETWORK_ERROR_MESSAGE = 'Se cortó la conexión. Tu mensaje volvió al campo de texto para que lo reenvíes.';
