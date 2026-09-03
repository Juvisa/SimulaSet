export const MISSION_01_ID = 'mission_01_conversation_hunt';

export const MISSION_01 = {
  id: MISSION_01_ID,
  version: 1,
  number: '01',
  title: 'Caza Conversaciones',
  subtitle: 'Aprende a leer antes de responder.',
  introduction: 'Tu reto no es escribir el mensaje perfecto.\nTu reto es identificar qué necesita esta conversación para avanzar.',
  cases: [
    {
      id: 'design_smile',
      industry: 'Diseño de sonrisa',
      leadMessage: 'Hola, quisiera saber cuánto cuesta un diseño de sonrisa.',
      reference: {
        situacion: 'El lead pregunta por el precio, pero todavía no sabemos qué quiere mejorar de su sonrisa, qué conoce del procedimiento ni qué está evaluando.',
        emocion: 'Hay interés y curiosidad. Antes de recibir una explicación extensa necesita sentir que la conversación se adapta a su caso y que será orientado con relevancia.',
        transicion: 'El próximo microcompromiso no tiene que ser agendar todavía. Primero necesitamos que nos cuente qué le gustaría mejorar de su sonrisa.',
        movimiento: 'Claro 😊 Para orientarte mejor, ¿qué es lo que más te gustaría mejorar de tu sonrisa?',
      },
    },
    {
      id: 'car_dealership',
      industry: 'Concesionario',
      leadMessage: 'Hola, ¿todavía tienen disponible la Mazda CX-30?',
      reference: {
        situacion: 'El lead pregunta por la disponibilidad de un vehículo específico. Hay una señal concreta de interés, pero todavía no sabemos qué tan avanzada está su decisión ni qué necesita para continuar.',
        emocion: 'Probablemente necesita rapidez, claridad y sentir que puede obtener información útil sin entrar inmediatamente en un proceso de venta pesado.',
        transicion: 'Primero responder a su intención y conseguir un pequeño avance que permita entender qué información necesita para evaluar el vehículo.',
        movimiento: 'Claro, te ayudo con eso. ¿Qué te gustaría conocer primero de la CX-30: disponibilidad, versiones o condiciones de compra?',
      },
    },
    {
      id: 'digital_business',
      industry: 'Negocio digital',
      leadMessage: 'Vi tu historia y quiero información del programa.',
      reference: {
        situacion: 'El lead vio una historia y pidió información. Existe interés inicial, pero todavía no sabemos qué llamó su atención ni qué quiere resolver.',
        emocion: 'Hay curiosidad. Para avanzar necesita percibir que la conversación será relevante para su situación y no recibir inmediatamente un discurso de venta.',
        transicion: 'Conseguir que revele qué despertó su interés o qué está buscando resolver antes de presentar el programa.',
        movimiento: 'Claro 😊 Cuéntame, ¿qué fue lo que viste en la historia que más conectó con lo que estás buscando ahora?',
      },
    },
  ],
};

export const MISSION_FIELDS = [
  {
    key: 'situacion',
    label: 'S · SITUACIÓN',
    prompt: '¿Qué sabes realmente de esta persona y de este momento de la conversación?',
  },
  {
    key: 'emocion',
    label: 'E · EMOCIÓN',
    prompt: '¿Qué puede estar sintiendo o qué condición necesita para avanzar?',
  },
  {
    key: 'transicion',
    label: 'T · TRANSICIÓN',
    prompt: '¿Cuál es el próximo microcompromiso lógico?',
  },
  {
    key: 'movimiento',
    label: 'TU MOVIMIENTO',
    prompt: '¿Qué mensaje enviarías?',
  },
];

export const isMissionCaseComplete = response => MISSION_FIELDS.every(field =>
  typeof response?.[field.key] === 'string' && response[field.key].trim()
);

export const getMissionCompletedCaseCount = responses => MISSION_01.cases.filter(missionCase =>
  isMissionCaseComplete(responses?.[missionCase.id])
).length;

export const isMissionComplete = responses => getMissionCompletedCaseCount(responses) === MISSION_01.cases.length;
