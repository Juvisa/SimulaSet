const MODES = new Set(['analisis', 'inicio', 'reactivacion', 'follow_up']);
const ACTIONS = new Set(['enviar', 'esperar', 'preguntar', 'aportar_valor', 'aclarar', 'calificar', 'agendar', 'confirmar', 'reactivar', 'cerrar_conversacion']);
const PIECE_TYPES = new Set(['texto', 'audio_guion', 'video_guion', 'recurso']);
const COMMITMENT_LEVELS = new Set(['no_determinado', 'incipiente', 'explicito', 'comprometido']);
const AI_TEMPERATURES = new Set(['no_determinada', 'fria', 'tibia', 'caliente']);
const CONFIDENCE_LEVELS = new Set(['baja', 'media', 'alta']);
const CONVERSATION_STATES = new Set(['sin_contacto', 'apertura', 'exploracion', 'clarificacion', 'evaluacion', 'objecion', 'coordinacion', 'cita_agendada', 'esperando_respuesta', 'reactivacion', 'cerrada']);
const EVIDENCE_SOURCES = new Set(['mensaje', 'lead', 'project', 'memoria']);

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireObject = (value, path) => {
  if (!isObject(value)) throw new Error(`Contrato SET inválido: ${path} debe ser un objeto.`);
};
const requireString = (value, path, { allowEmpty = false } = {}) => {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
    throw new Error(`Contrato SET inválido: ${path} debe ser texto${allowEmpty ? '' : ' no vacío'}.`);
  }
};
const requireArray = (value, path) => {
  if (!Array.isArray(value)) throw new Error(`Contrato SET inválido: ${path} debe ser un arreglo.`);
};
const requireEnum = (value, allowed, path) => {
  if (!allowed.has(value)) throw new Error(`Contrato SET inválido: ${path} contiene un valor no permitido.`);
};

const validateEvidence = (evidence, path) => {
  requireObject(evidence, path);
  requireEnum(evidence.fuente, EVIDENCE_SOURCES, `${path}.fuente`);
  if (evidence.referencia_id !== null) requireString(evidence.referencia_id, `${path}.referencia_id`);
  requireString(evidence.extracto, `${path}.extracto`);
};

const validateEvidenceArray = (items, path) => {
  requireArray(items, path);
  items.forEach((item, index) => validateEvidence(item, `${path}[${index}]`));
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

const validateAnticipationBranch = (branch, path, { allowWait = false } = {}) => {
  if (branch === null) return;
  requireObject(branch, path);
  requireEnum(branch.accion, ACTIONS, `${path}.accion`);
  requireString(branch.objetivo, `${path}.objetivo`);
  if (allowWait) {
    if (branch.esperar_horas !== null && (!Number.isInteger(branch.esperar_horas) || branch.esperar_horas < 1)) {
      throw new Error(`Contrato SET inválido: ${path}.esperar_horas debe ser null o un entero positivo.`);
    }
  }
};

export const parseAndValidateSetEngineResponse = (text, project) => {
  let contract;
  try {
    contract = JSON.parse(text.trim());
  } catch {
    throw new Error('La IA no devolvió JSON puro válido. Puedes reintentar.');
  }

  requireObject(contract, 'raíz');
  if (contract.version !== 'set_engine_v1') throw new Error('Contrato SET inválido: versión incorrecta.');
  requireEnum(contract.modo, MODES, 'modo');
  if (contract.modo !== 'analisis') throw new Error('Contrato SET inválido: este flujo requiere modo analisis.');

  requireObject(contract.diagnostico, 'diagnostico');
  requireObject(contract.diagnostico.situacion, 'diagnostico.situacion');
  requireString(contract.diagnostico.situacion.resumen, 'diagnostico.situacion.resumen');
  validateEvidenceArray(contract.diagnostico.situacion.evidencias, 'diagnostico.situacion.evidencias');

  requireObject(contract.diagnostico.emocion, 'diagnostico.emocion');
  requireString(contract.diagnostico.emocion.inferencia, 'diagnostico.emocion.inferencia');
  requireEnum(contract.diagnostico.emocion.confianza, CONFIDENCE_LEVELS, 'diagnostico.emocion.confianza');
  validateEvidenceArray(contract.diagnostico.emocion.evidencias, 'diagnostico.emocion.evidencias');
  requireString(contract.diagnostico.emocion.condicion_necesaria_para_avanzar, 'diagnostico.emocion.condicion_necesaria_para_avanzar');

  requireObject(contract.diagnostico.transicion, 'diagnostico.transicion');
  requireString(contract.diagnostico.transicion.microcompromiso, 'diagnostico.transicion.microcompromiso');
  requireString(contract.diagnostico.transicion.razon, 'diagnostico.transicion.razon');

  requireObject(contract.decision, 'decision');
  requireEnum(contract.decision.accion, ACTIONS, 'decision.accion');
  requireString(contract.decision.objetivo, 'decision.objetivo');
  requireString(contract.decision.estrategia, 'decision.estrategia');
  requireArray(contract.decision.que_evitar, 'decision.que_evitar');
  contract.decision.que_evitar.forEach((item, index) => requireString(item, `decision.que_evitar[${index}]`));

  if (contract.decision.respuesta !== null) {
    requireObject(contract.decision.respuesta, 'decision.respuesta');
    requireArray(contract.decision.respuesta.piezas, 'decision.respuesta.piezas');
    if (!contract.decision.respuesta.piezas.length) throw new Error('Contrato SET inválido: la respuesta debe contener al menos una pieza.');
    const resourceIds = getActiveResourceIds(project);
    contract.decision.respuesta.piezas.forEach((piece, index) => {
      const path = `decision.respuesta.piezas[${index}]`;
      requireObject(piece, path);
      requireEnum(piece.tipo, PIECE_TYPES, `${path}.tipo`);
      if (piece.tipo === 'recurso') {
        if (piece.contenido !== null) throw new Error(`Contrato SET inválido: ${path}.contenido debe ser null para recursos.`);
        requireString(piece.recurso_id, `${path}.recurso_id`);
        if (!resourceIds.has(piece.recurso_id)) throw new Error('La IA recomendó un recurso inexistente o inactivo en el Project.');
      } else {
        requireString(piece.contenido, `${path}.contenido`);
        if (piece.recurso_id !== null) throw new Error(`Contrato SET inválido: ${path}.recurso_id debe ser null.`);
      }
    });
  }

  requireObject(contract.anticipacion, 'anticipacion');
  validateAnticipationBranch(contract.anticipacion.si_avanza, 'anticipacion.si_avanza');
  validateAnticipationBranch(contract.anticipacion.si_objeta, 'anticipacion.si_objeta');
  validateAnticipationBranch(contract.anticipacion.si_no_responde, 'anticipacion.si_no_responde', { allowWait: true });

  requireObject(contract.estado_inferido, 'estado_inferido');
  requireEnum(contract.estado_inferido.nivel_compromiso, COMMITMENT_LEVELS, 'estado_inferido.nivel_compromiso');
  requireEnum(contract.estado_inferido.temperatura_ia, AI_TEMPERATURES, 'estado_inferido.temperatura_ia');
  requireEnum(contract.estado_inferido.confianza_temperatura, CONFIDENCE_LEVELS, 'estado_inferido.confianza_temperatura');
  requireEnum(contract.estado_inferido.estado_conversacional, CONVERSATION_STATES, 'estado_inferido.estado_conversacional');
  requireArray(contract.estado_inferido.senales, 'estado_inferido.senales');
  contract.estado_inferido.senales.forEach((signal, index) => {
    const path = `estado_inferido.senales[${index}]`;
    requireObject(signal, path);
    requireString(signal.tipo, `${path}.tipo`);
    requireString(signal.descripcion, `${path}.descripcion`);
    validateEvidence(signal.evidencia, `${path}.evidencia`);
  });
  if (contract.estado_inferido.nivel_compromiso !== 'no_determinado' && !contract.estado_inferido.senales.length) {
    throw new Error('Contrato SET inválido: el nivel de compromiso requiere señales observables.');
  }

  requireObject(contract.memoria, 'memoria');
  ['hechos_confirmados', 'compromisos', 'preguntas_resueltas', 'preguntas_abiertas', 'recursos_entregados']
    .forEach(field => requireArray(contract.memoria[field], `memoria.${field}`));
  contract.memoria.hechos_confirmados.forEach((fact, index) => {
    const path = `memoria.hechos_confirmados[${index}]`;
    requireObject(fact, path);
    requireString(fact.clave, `${path}.clave`);
    requireString(fact.valor, `${path}.valor`);
    requireString(fact.fuente_mensaje_id, `${path}.fuente_mensaje_id`);
  });
  contract.memoria.compromisos.forEach((commitment, index) => {
    const path = `memoria.compromisos[${index}]`;
    requireObject(commitment, path);
    requireString(commitment.tipo, `${path}.tipo`);
    requireString(commitment.detalle, `${path}.detalle`);
    requireString(commitment.fuente_mensaje_id, `${path}.fuente_mensaje_id`);
  });
  ['preguntas_resueltas', 'preguntas_abiertas'].forEach(field => {
    contract.memoria[field].forEach((item, index) => requireString(item, `memoria.${field}[${index}]`));
  });
  contract.memoria.recursos_entregados.forEach((resource, index) => {
    const path = `memoria.recursos_entregados[${index}]`;
    requireObject(resource, path);
    requireString(resource.recurso_id, `${path}.recurso_id`);
    requireString(resource.fuente_mensaje_id, `${path}.fuente_mensaje_id`);
  });
  requireArray(contract.alertas, 'alertas');
  contract.alertas.forEach((item, index) => requireString(item, `alertas[${index}]`));

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
