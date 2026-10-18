// POST /api/anthropic — proxy autenticado hacia Anthropic. La lógica y el orden
// de las comprobaciones están en api/_anthropic/handler.js; las operaciones
// permitidas y sus límites, en api/_anthropic/operations.js.
import { createAnthropicHandler } from './_anthropic/handler.js';
import { defaultDeps } from './_anthropic/server.js';

export default createAnthropicHandler(defaultDeps);
