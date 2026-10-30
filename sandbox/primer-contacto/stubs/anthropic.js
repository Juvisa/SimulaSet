// Preview local: la IA responde con el guion del escenario (sin red ni clave).
// Exporta lo que usa la pantalla del simulador.
import { sandbox } from '../state.js';

export class AiRequestError extends Error {
  constructor(message) { super(message); this.name = 'AiRequestError'; }
}
export const callClaude = (systemPrompt, messages) => sandbox.fakeCall(systemPrompt, messages);
export const generateProspectProfile = (project, mode, config) => sandbox.fakeProfile(project, mode, config);
