const MODES = new Set(['analisis', 'inicio', 'reactivacion', 'follow_up']);
const ACTIONS = new Set(['enviar', 'esperar', 'preguntar', 'aportar_valor', 'aclarar', 'calificar', 'agendar', 'confirmar', 'reactivar', 'cerrar_conversacion']);
const PIECE_TYPES = new Set(['texto', 'audio_guion', 'video_guion', 'recurso']);
const COMMITMENT_LEVELS = new Set(['no_determinado', 'incipiente', 'explicito', 'comprometido']);
const AI_TEMPERATURES = new Set(['no_determinada', 'fria', 'tibia', 'caliente']);
const CONFIDENCE_LEVELS = new Set(['baja', 'media', 'alta']);
const CONVERSATION_STATES = new Set(['sin_contacto', 'apertura', 'exploracion', 'clarificacion', 'evaluacion', 'objecion', 'coordinacion', 'cita_agendada', 'esperando_respuesta', 'reactivacion', 'cerrada']);
const EVIDENCE_SOURCES = new Set(['mensaje', 'lead', 'project', 'memoria']);

const nullableObject = properties => ({
  anyOf: [
    {
      type: 'object',
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    },
    { type: 'null' },
  ],
});

const evidenceSchema = {
  type: 'object',
  properties: {
    fuente: { type: 'string', enum: [...EVIDENCE_SOURCES] },
    referencia_id: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    extracto: { type: 'string' },
  },
  required: ['fuente', 'referencia_id', 'extracto'],
  additionalProperties: false,
};

const anticipationSchema = nullableObject({
  accion: { type: 'string', enum: [...ACTIONS] },
  objetivo: { type: 'string' },
});

export const SET_ENGINE_V1_SCHEMA = {
  type: 'object',
  properties: {
    version: { type: 'string', enum: ['set_engine_v1'] },
    modo: { type: 'string', enum: ['analisis'] },
    diagnostico: {
      type: 'object',
      properties: {
        situacion: {
          type: 'object',
          properties: {
            resumen: { type: 'string' },
            evidencias: { type: 'array', items: evidenceSchema },
          },
          required: ['resumen', 'evidencias'],
          additionalProperties: false,
        },
        emocion: {
          type: 'object',
          properties: {
            inferencia: { type: 'string' },
            confianza: { type: 'string', enum: [...CONFIDENCE_LEVELS] },
            evidencias: { type: 'array', items: evidenceSchema },
            condicion_necesaria_para_avanzar: { type: 'string' },
          },
          required: ['inferencia', 'confianza', 'evidencias', 'condicion_necesaria_para_avanzar'],
          additionalProperties: false,
        },
        transicion: {
          type: 'object',
          properties: {
            microcompromiso: { type: 'string' },
            razon: { type: 'string' },
          },
          required: ['microcompromiso', 'razon'],
          additionalProperties: false,
        },
      },
      required: ['situacion', 'emocion', 'transicion'],
      additionalProperties: false,
    },
    decision: {
      type: 'object',
      properties: {
        accion: { type: 'string', enum: [...ACTIONS] },
        objetivo: { type: 'string' },
        estrategia: { type: 'string' },
        respuesta: nullableObject({
          piezas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tipo: { type: 'string', enum: [...PIECE_TYPES] },
                contenido: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                recurso_id: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              },
              required: ['tipo', 'contenido', 'recurso_id'],
              additionalProperties: false,
            },
          },
        }),
        que_evitar: { type: 'array', items: { type: 'string' } },
      },
      required: ['accion', 'objetivo', 'estrategia', 'respuesta', 'que_evitar'],
      additionalProperties: false,
    },
    anticipacion: {
      type: 'object',
      properties: {
        si_avanza: anticipationSchema,
        si_objeta: anticipationSchema,
        si_no_responde: nullableObject({
          accion: { type: 'string', enum: [...ACTIONS] },
          objetivo: { type: 'string' },
          esperar_horas: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
        }),
      },
      required: ['si_avanza', 'si_objeta', 'si_no_responde'],
      additionalProperties: false,
    },
    estado_inferido: {
      type: 'object',
      properties: {
        nivel_compromiso: { type: 'string', enum: [...COMMITMENT_LEVELS] },
        temperatura_ia: { type: 'string', enum: [...AI_TEMPERATURES] },
        confianza_temperatura: { type: 'string', enum: [...CONFIDENCE_LEVELS] },
        estado_conversacional: { type: 'string', enum: [...CONVERSATION_STATES] },
        senales: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tipo: { type: 'string' },
              descripcion: { type: 'string' },
              evidencia: evidenceSchema,
            },
            required: ['tipo', 'descripcion', 'evidencia'],
            additionalProperties: false,
          },
        },
      },
      required: ['nivel_compromiso', 'temperatura_ia', 'confianza_temperatura', 'estado_conversacional', 'senales'],
      additionalProperties: false,
    },
    memoria: {
      type: 'object',
      properties: {
        hechos_confirmados: {
          type: 'array',
          items: {
            type: 'object',
            properties: { clave: { type: 'string' }, valor: { type: 'string' }, fuente_mensaje_id: { type: 'string' } },
            required: ['clave', 'valor', 'fuente_mensaje_id'],
            additionalProperties: false,
          },
        },
        compromisos: {
          type: 'array',
          items: {
            type: 'object',
            properties: { tipo: { type: 'string' }, detalle: { type: 'string' }, fuente_mensaje_id: { type: 'string' } },
            required: ['tipo', 'detalle', 'fuente_mensaje_id'],
            additionalProperties: false,
          },
        },
        preguntas_resueltas: { type: 'array', items: { type: 'string' } },
        preguntas_abiertas: { type: 'array', items: { type: 'string' } },
        recursos_entregados: {
          type: 'array',
          items: {
            type: 'object',
            properties: { recurso_id: { type: 'string' }, fuente_mensaje_id: { type: 'string' } },
            required: ['recurso_id', 'fuente_mensaje_id'],
            additionalProperties: false,
          },
        },
      },
      required: ['hechos_confirmados', 'compromisos', 'preguntas_resueltas', 'preguntas_abiertas', 'recursos_entregados'],
      additionalProperties: false,
    },
    alertas: { type: 'array', items: { type: 'string' } },
  },
  required: ['version', 'modo', 'diagnostico', 'decision', 'anticipacion', 'estado_inferido', 'memoria', 'alertas'],
  additionalProperties: false,
};

// Anthropic compiles this schema into a grammar. The complete schema above
// exceeds that grammar's size limit, so generation uses this structural
// projection and the validator below enforces the full frozen contract.
export const SET_ENGINE_V1_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    version: { type: 'string', enum: ['set_engine_v1'] },
    modo: { type: 'string', enum: ['analisis'] },
    diagnostico: {
      type: 'object',
      properties: {
        situacion: {},
        emocion: {},
        transicion: {},
      },
      required: ['situacion', 'emocion', 'transicion'],
      additionalProperties: false,
    },
    decision: {
      type: 'object',
      properties: {
        accion: { type: 'string' },
        objetivo: { type: 'string' },
        estrategia: { type: 'string' },
        respuesta: {},
        que_evitar: { type: 'array', items: { type: 'string' } },
      },
      required: ['accion', 'objetivo', 'estrategia', 'respuesta', 'que_evitar'],
      additionalProperties: false,
    },
    anticipacion: {
      type: 'object',
      properties: {
        si_avanza: {},
        si_objeta: {},
        si_no_responde: {},
      },
      required: ['si_avanza', 'si_objeta', 'si_no_responde'],
      additionalProperties: false,
    },
    estado_inferido: {
      type: 'object',
      properties: {
        nivel_compromiso: { type: 'string' },
        temperatura_ia: { type: 'string' },
        confianza_temperatura: { type: 'string' },
        estado_conversacional: { type: 'string' },
        senales: { type: 'array' },
      },
      required: ['nivel_compromiso', 'temperatura_ia', 'confianza_temperatura', 'estado_conversacional', 'senales'],
      additionalProperties: false,
    },
    memoria: {
      type: 'object',
      properties: {
        hechos_confirmados: { type: 'array' },
        compromisos: { type: 'array' },
        preguntas_resueltas: { type: 'array' },
        preguntas_abiertas: { type: 'array' },
        recursos_entregados: { type: 'array' },
      },
      required: ['hechos_confirmados', 'compromisos', 'preguntas_resueltas', 'preguntas_abiertas', 'recursos_entregados'],
      additionalProperties: false,
    },
    alertas: { type: 'array', items: { type: 'string' } },
  },
  required: ['version', 'modo', 'diagnostico', 'decision', 'anticipacion', 'estado_inferido', 'memoria', 'alertas'],
  additionalProperties: false,
};

const wireObject = (properties, required = Object.keys(properties)) => ({
  type: 'object', properties, required, additionalProperties: false,
});
const wireStringArray = { type: 'array', items: { type: 'string' } };
const wireEvidence = wireObject({ f: { type: 'string' }, i: { type: 'string' }, q: { type: 'string' } });

export const SET_ENGINE_V1_WIRE_SCHEMA = wireObject({
  d: wireObject({
    s: wireObject({ r: { type: 'string' }, e: { type: 'array', items: wireEvidence } }),
    e: wireObject({ i: { type: 'string' }, c: { type: 'string' }, e: { type: 'array', items: wireEvidence }, n: { type: 'string' } }),
    t: wireObject({ m: { type: 'string' }, r: { type: 'string' } }),
  }),
  x: wireObject({
    a: { type: 'string' }, o: { type: 'string' }, s: { type: 'string' },
    p: { type: 'array', items: wireObject({ t: { type: 'string' }, c: { type: 'string' }, r: { type: 'string' } }) },
    v: wireStringArray,
  }),
  a: wireObject({ v: wireStringArray, o: wireStringArray, n: wireStringArray }),
  s: wireObject({
    n: { type: 'string' }, t: { type: 'string' }, c: { type: 'string' }, e: { type: 'string' },
    g: { type: 'array', items: wireObject({ t: { type: 'string' }, d: { type: 'string' }, e: wireEvidence }) },
  }),
  m: wireObject({
    h: { type: 'array', items: wireObject({ k: { type: 'string' }, v: { type: 'string' }, i: { type: 'string' } }) },
    c: { type: 'array', items: wireObject({ t: { type: 'string' }, d: { type: 'string' }, i: { type: 'string' } }) },
    r: wireStringArray,
    a: wireStringArray,
    e: { type: 'array', items: wireObject({ r: { type: 'string' }, i: { type: 'string' } }) },
  }),
  z: wireStringArray,
});

export const SET_ENGINE_V1_COMPACT_WIRE_SCHEMA = wireObject({
  d: wireStringArray,
  x: wireStringArray,
  a: wireStringArray,
  s: wireStringArray,
  m: wireStringArray,
  z: wireStringArray,
});

const WIRE_ACTIONS = { en: 'enviar', es: 'esperar', p: 'preguntar', av: 'aportar_valor', ac: 'aclarar', ca: 'calificar', ag: 'agendar', co: 'confirmar', re: 'reactivar', cc: 'cerrar_conversacion' };
const WIRE_PIECES = { t: 'texto', ag: 'audio_guion', vg: 'video_guion', r: 'recurso' };
const WIRE_SOURCES = { m: 'mensaje', l: 'lead', p: 'project', r: 'memoria' };
const WIRE_COMMITMENT = { nd: 'no_determinado', i: 'incipiente', e: 'explicito', c: 'comprometido' };
const WIRE_TEMPERATURE = { nd: 'no_determinada', f: 'fria', tb: 'tibia', c: 'caliente' };
const WIRE_CONFIDENCE = { b: 'baja', m: 'media', a: 'alta' };
const WIRE_STATES = { sc: 'sin_contacto', ap: 'apertura', ex: 'exploracion', cl: 'clarificacion', ev: 'evaluacion', ob: 'objecion', co: 'coordinacion', ca: 'cita_agendada', er: 'esperando_respuesta', re: 'reactivacion', ce: 'cerrada' };

const expandEvidence = item => ({ fuente: WIRE_SOURCES[item.f], referencia_id: item.i || null, extracto: item.q });
const expandBranch = (items, withHours = false) => {
  if (!items.length) return null;
  const branch = { accion: WIRE_ACTIONS[items[0]], objetivo: items[1] };
  if (withHours) branch.esperar_horas = items[2] ? Number(items[2]) : null;
  return branch;
};

export const parseAndExpandSetEngineWireResponse = text => {
  let wire;
  try {
    wire = JSON.parse(text.trim());
  } catch {
    throw new Error('La IA no devolvió JSON wire puro válido. Puedes reintentar.');
  }
  const parseField = (value, path) => {
    try { return JSON.parse(value); } catch { throw new Error(`Wire SET inválido: ${path} no contiene JSON válido.`); }
  };
  if (wire.d.length !== 8 || wire.x.length !== 5 || wire.a.length !== 3 || wire.s.length !== 5 || wire.m.length !== 5) {
    throw new Error('Wire SET inválido: longitud de sección incorrecta.');
  }
  const situationEvidence = parseField(wire.d[1], 'd[1]');
  const emotionEvidence = parseField(wire.d[4], 'd[4]');
  const wirePieces = parseField(wire.x[3], 'x[3]');
  const avoid = parseField(wire.x[4], 'x[4]');
  const anticipation = wire.a.map((value, index) => parseField(value, `a[${index}]`));
  const signals = parseField(wire.s[4], 's[4]');
  const memory = wire.m.map((value, index) => parseField(value, `m[${index}]`));
  const pieces = wirePieces.map(item => ({
    tipo: WIRE_PIECES[item.t],
    contenido: item.t === 'r' ? null : item.c,
    recurso_id: item.t === 'r' ? item.r : null,
  }));
  return {
    version: 'set_engine_v1',
    modo: 'analisis',
    diagnostico: {
      situacion: { resumen: wire.d[0], evidencias: situationEvidence.map(expandEvidence) },
      emocion: { inferencia: wire.d[2], confianza: WIRE_CONFIDENCE[wire.d[3]], evidencias: emotionEvidence.map(expandEvidence), condicion_necesaria_para_avanzar: wire.d[5] },
      transicion: { microcompromiso: wire.d[6], razon: wire.d[7] },
    },
    decision: { accion: WIRE_ACTIONS[wire.x[0]], objetivo: wire.x[1], estrategia: wire.x[2], respuesta: pieces.length ? { piezas: pieces } : null, que_evitar: avoid },
    anticipacion: { si_avanza: expandBranch(anticipation[0]), si_objeta: expandBranch(anticipation[1]), si_no_responde: expandBranch(anticipation[2], true) },
    estado_inferido: {
      nivel_compromiso: WIRE_COMMITMENT[wire.s[0]], temperatura_ia: WIRE_TEMPERATURE[wire.s[1]], confianza_temperatura: WIRE_CONFIDENCE[wire.s[2]], estado_conversacional: WIRE_STATES[wire.s[3]],
      senales: signals.map(item => ({ tipo: item.t, descripcion: item.d, evidencia: expandEvidence(item.e) })),
    },
    memoria: {
      hechos_confirmados: memory[0].map(item => ({ clave: item.k, valor: item.v, fuente_mensaje_id: item.i })),
      compromisos: memory[1].map(item => ({ tipo: item.t, detalle: item.d, fuente_mensaje_id: item.i })),
      preguntas_resueltas: memory[2], preguntas_abiertas: memory[3],
      recursos_entregados: memory[4].map(item => ({ recurso_id: item.r, fuente_mensaje_id: item.i })),
    },
    alertas: wire.z,
  };
};

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
