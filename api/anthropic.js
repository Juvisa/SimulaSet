import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';

const MODEL = 'claude-sonnet-4-5';
const ALLOWED_MAX_TOKENS = new Set([500, 1500, 2000]);

const stringArray = {
  type: 'array',
  items: { type: 'string' },
};

const analyzerSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['diagnostico', 'prediccion_lead', 'plan_accion', 'puntuacion_setter'],
  properties: {
    diagnostico: {
      type: 'object',
      additionalProperties: false,
      required: ['etapas_presentes', 'etapas_ausentes', 'mensajes_efectivos', 'mensajes_con_friccion', 'oportunidades_perdidas'],
      properties: {
        etapas_presentes: stringArray,
        etapas_ausentes: stringArray,
        mensajes_efectivos: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['mensaje', 'razon'],
            properties: { mensaje: { type: 'string' }, razon: { type: 'string' } },
          },
        },
        mensajes_con_friccion: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['mensaje', 'razon'],
            properties: { mensaje: { type: 'string' }, razon: { type: 'string' } },
          },
        },
        oportunidades_perdidas: stringArray,
      },
    },
    prediccion_lead: {
      type: 'object',
      additionalProperties: false,
      required: ['interes_genuino', 'senales_interes', 'senales_alerta', 'energia_a_invertir', 'explicacion'],
      properties: {
        interes_genuino: { type: 'string' },
        senales_interes: stringArray,
        senales_alerta: stringArray,
        energia_a_invertir: { type: 'string' },
        explicacion: { type: 'string' },
      },
    },
    plan_accion: {
      type: 'object',
      additionalProperties: false,
      required: ['siguiente_mensaje', 'tecnica_recomendada', 'recurso_a_entregar', 'cuando_enviar', 'tipo_seguimiento'],
      properties: {
        siguiente_mensaje: { type: 'string' },
        tecnica_recomendada: { type: 'string' },
        recurso_a_entregar: { type: 'string' },
        cuando_enviar: { type: 'string' },
        tipo_seguimiento: { type: 'string' },
      },
    },
    puntuacion_setter: {
      type: 'object',
      additionalProperties: false,
      required: ['score', 'nivel_set_aplicado', 'aprendizajes'],
      properties: {
        score: { type: 'number' },
        nivel_set_aplicado: { type: 'string' },
        aprendizajes: stringArray,
      },
    },
  },
};

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
const hasOnlyKeys = (value, keys) => Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key));
const isMessageList = (value) => Array.isArray(value) && value.every((item) => (
  isObject(item)
  && hasOnlyKeys(item, ['mensaje', 'razon'])
  && typeof item.mensaje === 'string'
  && typeof item.razon === 'string'
));

const isAnalyzerResult = (value) => {
  if (!isObject(value) || !hasOnlyKeys(value, ['diagnostico', 'prediccion_lead', 'plan_accion', 'puntuacion_setter'])) return false;
  const { diagnostico, prediccion_lead, plan_accion, puntuacion_setter } = value;
  return isObject(diagnostico)
    && hasOnlyKeys(diagnostico, ['etapas_presentes', 'etapas_ausentes', 'mensajes_efectivos', 'mensajes_con_friccion', 'oportunidades_perdidas'])
    && isStringArray(diagnostico.etapas_presentes)
    && isStringArray(diagnostico.etapas_ausentes)
    && isMessageList(diagnostico.mensajes_efectivos)
    && isMessageList(diagnostico.mensajes_con_friccion)
    && isStringArray(diagnostico.oportunidades_perdidas)
    && isObject(prediccion_lead)
    && hasOnlyKeys(prediccion_lead, ['interes_genuino', 'senales_interes', 'senales_alerta', 'energia_a_invertir', 'explicacion'])
    && typeof prediccion_lead.interes_genuino === 'string'
    && isStringArray(prediccion_lead.senales_interes)
    && isStringArray(prediccion_lead.senales_alerta)
    && typeof prediccion_lead.energia_a_invertir === 'string'
    && typeof prediccion_lead.explicacion === 'string'
    && isObject(plan_accion)
    && hasOnlyKeys(plan_accion, ['siguiente_mensaje', 'tecnica_recomendada', 'recurso_a_entregar', 'cuando_enviar', 'tipo_seguimiento'])
    && ['siguiente_mensaje', 'tecnica_recomendada', 'recurso_a_entregar', 'cuando_enviar', 'tipo_seguimiento']
      .every((key) => typeof plan_accion[key] === 'string')
    && isObject(puntuacion_setter)
    && hasOnlyKeys(puntuacion_setter, ['score', 'nivel_set_aplicado', 'aprendizajes'])
    && typeof puntuacion_setter.score === 'number'
    && Number.isFinite(puntuacion_setter.score)
    && typeof puntuacion_setter.nivel_set_aplicado === 'string'
    && isStringArray(puntuacion_setter.aprendizajes);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { systemPrompt, messages, maxTokens, mode } = req.body || {};

  if (
    (systemPrompt !== undefined && typeof systemPrompt !== 'string') ||
    !Array.isArray(messages) ||
    messages.length === 0 ||
    !ALLOWED_MAX_TOKENS.has(maxTokens) ||
    (mode !== undefined && mode !== 'analyzer')
  ) {
    return res.status(400).json({ error: 'Solicitud inválida' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'El servicio de IA no está configurado' });
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const params = {
      model: MODEL,
      max_tokens: maxTokens,
      messages,
    };

    if (systemPrompt !== undefined) params.system = systemPrompt;

    if (mode === 'analyzer') {
      try {
        const response = await anthropic.messages.parse({
          ...params,
          output_config: { format: jsonSchemaOutputFormat(analyzerSchema) },
        });
        if (!isAnalyzerResult(response.parsed_output)) {
          return res.status(502).json({ error: 'La respuesta del análisis no tuvo el formato esperado' });
        }
        return res.status(200).json({ text: JSON.stringify(response.parsed_output) });
      } catch {
        return res.status(502).json({ error: 'La respuesta del análisis no tuvo el formato esperado' });
      }
    }

    const response = await anthropic.messages.create(params);
    const text = response.content.find((block) => block.type === 'text')?.text || '';
    return res.status(200).json({ text });
  } catch {
    return res.status(502).json({ error: 'No se pudo completar la solicitud de IA' });
  }
}
