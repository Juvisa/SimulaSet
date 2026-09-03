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
    },
    {
      id: 'car_dealership',
      industry: 'Concesionario',
      leadMessage: 'Hola, ¿todavía tienen disponible la Mazda CX-30?',
    },
    {
      id: 'digital_business',
      industry: 'Negocio digital',
      leadMessage: 'Vi tu historia y quiero información del programa.',
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
