// Preview local: proyecto ficticio del escenario activo.
import { sandbox } from '../state.js';

export const getProjectById = async () => ({ project: sandbox.scenario()?.project || null });
