const ACTIONS = new Set(['enviar', 'esperar', 'preguntar', 'aportar_valor', 'aclarar', 'calificar', 'agendar', 'confirmar', 'reactivar', 'cerrar_conversacion']);
const PIECE_TYPES = new Set(['texto', 'audio_guion', 'video_guion', 'recurso']);
const COMMITMENT_LEVELS = new Set(['no_determinado', 'incipiente', 'explicito', 'comprometido']);
const AI_TEMPERATURES = new Set(['no_determinada', 'fria', 'tibia', 'caliente']);
const NULL_RESPONSE_ACTIONS = new Set(['esperar', 'cerrar_conversacion']);

export const SET_ENGINE_ERROR_CODES = {
  FORMAT: 'SET_FORMAT_ERROR',
  CONTRACT: 'SET_CONTRACT_ERROR',
  MAX_TOKENS: 'SET_MAX_TOKENS',
  RETRY_EXHAUSTED: 'SET_RETRY_EXHAUSTED',
};

export class SetEngineError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SetEngineError';
    this.code = code;
  }
}

const contractError = message => new SetEngineError(SET_ENGINE_ERROR_CODES.CONTRACT, message);

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireObject = (value, path) => {
  if (!isObject(value)) throw contractError(`Contrato SET inválido: ${path} debe ser un objeto.`);
};
const requireString = (value, path, { allowEmpty = false } = {}) => {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
    throw contractError(`Contrato SET inválido: ${path} debe ser texto${allowEmpty ? '' : ' no vacío'}.`);
  }
};
const requireArray = (value, path) => {
  if (!Array.isArray(value)) throw contractError(`Contrato SET inválido: ${path} debe ser un arreglo.`);
};
const requireEnum = (value, allowed, path) => {
  if (!allowed.has(value)) throw contractError(`Contrato SET inválido: ${path} contiene un valor no permitido.`);
};
const requireExactKeys = (value, keys, path) => {
  const expected = new Set(keys);
  const actual = Object.keys(value);
  if (actual.length !== expected.size || actual.some(key => !expected.has(key))) {
    throw contractError(`Contrato SET inválido: ${path} contiene campos inesperados o incompletos.`);
  }
};

const getActiveResourceIds = project => {
  const ids = new Set();
  (project?.resources || []).filter(resource => resource?.name).forEach(resource => resource.id && ids.add(resource.id));
  (project?.recursos?.guias_pdfs || []).filter(resource => resource?.activo && resource?.nombre).forEach(resource => resource.id && ids.add(resource.id));
  (project?.recursos?.videos_testimonios || []).filter(resource => resource?.activo && resource?.nombre).forEach(resource => resource.id && ids.add(resource.id));
  const vsl = project?.recursos?.vsl_presentacion;
  if (vsl?.activo && vsl?.nombre && vsl?.id) ids.add(vsl.id);
  return ids;
};

const validateQuestionLimit = (content, path) => {
  const openingMarks = (content.match(/¿/g) || []).length;
  const closingMarks = (content.match(/\?/g) || []).length;
  if (Math.max(openingMarks, closingMarks) > 1) {
    throw contractError(`Contrato SET inválido: ${path} puede contener como máximo una pregunta.`);
  }
};

const stripMarkdownFence = text => {
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : text.trim();
};

export const parseAndValidateSetEngineResponse = (text, project) => {
  let contract;
  try {
    contract = JSON.parse(stripMarkdownFence(text));
  } catch {
    throw new SetEngineError(SET_ENGINE_ERROR_CODES.FORMAT, 'La IA no devolvió JSON puro válido. Puedes reintentar.');
  }

  requireObject(contract, 'raíz');
  requireExactKeys(contract, ['version', 'diagnostico', 'decision', 'estado'], 'raíz');
  if (contract.version !== 'set_core_v1_beta') throw contractError('Contrato SET inválido: versión incorrecta.');

  requireObject(contract.diagnostico, 'diagnostico');
  requireExactKeys(contract.diagnostico, ['situacion', 'emocion', 'transicion'], 'diagnostico');
  requireObject(contract.diagnostico.situacion, 'diagnostico.situacion');
  requireExactKeys(contract.diagnostico.situacion, ['resumen'], 'diagnostico.situacion');
  requireString(contract.diagnostico.situacion.resumen, 'diagnostico.situacion.resumen');

  requireObject(contract.diagnostico.emocion, 'diagnostico.emocion');
  requireExactKeys(contract.diagnostico.emocion, ['inferencia', 'condicion_necesaria_para_avanzar'], 'diagnostico.emocion');
  requireString(contract.diagnostico.emocion.inferencia, 'diagnostico.emocion.inferencia');
  requireString(contract.diagnostico.emocion.condicion_necesaria_para_avanzar, 'diagnostico.emocion.condicion_necesaria_para_avanzar');

  requireObject(contract.diagnostico.transicion, 'diagnostico.transicion');
  requireExactKeys(contract.diagnostico.transicion, ['microcompromiso', 'razon'], 'diagnostico.transicion');
  requireString(contract.diagnostico.transicion.microcompromiso, 'diagnostico.transicion.microcompromiso');
  requireString(contract.diagnostico.transicion.razon, 'diagnostico.transicion.razon');

  requireObject(contract.decision, 'decision');
  requireExactKeys(contract.decision, ['accion', 'objetivo', 'estrategia', 'respuesta', 'que_evitar'], 'decision');
  requireEnum(contract.decision.accion, ACTIONS, 'decision.accion');
  requireString(contract.decision.objetivo, 'decision.objetivo');
  requireString(contract.decision.estrategia, 'decision.estrategia');
  requireArray(contract.decision.que_evitar, 'decision.que_evitar');
  contract.decision.que_evitar.forEach((item, index) => requireString(item, `decision.que_evitar[${index}]`));

  if (contract.decision.respuesta === null) {
    if (!NULL_RESPONSE_ACTIONS.has(contract.decision.accion)) {
      throw contractError('Contrato SET inválido: esta acción requiere una respuesta.');
    }
  } else {
    requireObject(contract.decision.respuesta, 'decision.respuesta');
    requireExactKeys(contract.decision.respuesta, ['tipo', 'contenido', 'recurso_id'], 'decision.respuesta');
    const piece = contract.decision.respuesta;
    const resourceIds = getActiveResourceIds(project);
    requireEnum(piece.tipo, PIECE_TYPES, 'decision.respuesta.tipo');
    if (piece.tipo === 'recurso') {
      if (piece.contenido !== null) throw contractError('Contrato SET inválido: decision.respuesta.contenido debe ser null para recursos.');
      requireString(piece.recurso_id, 'decision.respuesta.recurso_id');
      if (!resourceIds.has(piece.recurso_id)) throw contractError('La IA recomendó un recurso inexistente o inactivo en el Project.');
    } else {
      requireString(piece.contenido, 'decision.respuesta.contenido');
      if (piece.recurso_id !== null) throw contractError('Contrato SET inválido: decision.respuesta.recurso_id debe ser null.');
      validateQuestionLimit(piece.contenido, 'decision.respuesta.contenido');
    }
  }

  requireObject(contract.estado, 'estado');
  requireExactKeys(contract.estado, ['nivel_compromiso', 'temperatura_ia'], 'estado');
  requireEnum(contract.estado.nivel_compromiso, COMMITMENT_LEVELS, 'estado.nivel_compromiso');
  requireEnum(contract.estado.temperatura_ia, AI_TEMPERATURES, 'estado.temperatura_ia');

  return contract;
};

export const findProjectResource = (project, resourceId) => {
  const resources = [
    ...(project?.resources || []),
    ...(project?.recursos?.guias_pdfs || []),
    ...(project?.recursos?.videos_testimonios || []),
    project?.recursos?.vsl_presentacion,
  ].filter(Boolean);
  return resources.find(resource => resource.id === resourceId) || null;
};

export const getSetDecisionView = contract => {
  const isCore = contract.version === 'set_core_v1_beta';
  return {
    estado: isCore ? contract.estado : contract.estado_inferido,
    pieces: contract.decision.respuesta === null
      ? []
      : isCore ? [contract.decision.respuesta] : contract.decision.respuesta.piezas,
    branches: isCore ? [] : [
      ['Si avanza', contract.anticipacion.si_avanza],
      ['Si objeta', contract.anticipacion.si_objeta],
      ['Si no responde', contract.anticipacion.si_no_responde],
    ].filter(([, branch]) => branch !== null),
  };
};
