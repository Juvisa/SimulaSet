export const CRITERION_CHALLENGES = {
  daily_lunes_apertura_outbound: {
    type: 'multiple_choice',
    label: 'Elige la mejor respuesta',
    prompt: 'Un lead frío en Instagram te responde "¿Quién eres?" después de tu primer mensaje. ¿Cuál es la MEJOR respuesta?',
    options: [
      { id: 'a', text: '¡Hola! Soy Camila, vendo el programa X, te va a encantar 🚀' },
      { id: 'b', text: 'Vi que sigues a [referencia] y ayudo a personas como tú a [resultado concreto]. ¿Te interesa saber más?' },
      { id: 'c', text: 'jaja buena pregunta, ¿tú quién eres? 😄' },
      { id: 'd', text: 'Disculpa la molestia, ¿tienes 2 minutos para una llamada rápida?' },
    ],
    correctId: 'b',
    explanation: 'Da contexto específico (por qué le escribes) y valor concreto antes de pedir nada, sin sonar genérico ni evasivo.',
  },
  daily_martes_objecion_precio: {
    type: 'error_spotting',
    label: 'Detecta el error',
    prompt: 'El lead pregunta "¿Cuánto cuesta?". El setter responde: "Cuesta $1,500, pero si me dices que sí hoy te lo dejo en $1,000 🔥". ¿Cuál es el error principal?',
    options: [
      { id: 'a', text: 'Dar el precio exacto sin calificar antes' },
      { id: 'b', text: 'Ofrecer un descuento inmediato sin que el lead haya mostrado ningún compromiso' },
      { id: 'c', text: 'Usar un emoji en la respuesta' },
      { id: 'd', text: 'Responder demasiado rápido' },
    ],
    correctId: 'b',
    explanation: 'Regalar un descuento antes de que el lead diga o haga algo que lo justifique entrena al lead a esperar rebajas y devalúa la oferta.',
  },
  daily_miercoles_reactivacion: {
    type: 'multiple_choice',
    label: 'Elige la mejor respuesta',
    prompt: 'Retomas a un lead que dejó de responder hace 5 días. ¿Cuál es la MEJOR apertura de reactivación?',
    options: [
      { id: 'a', text: '¿Sigues ahí? 👀' },
      { id: 'b', text: 'Hola de nuevo, seguimos con la promo si te interesa' },
      { id: 'c', text: 'Retomando donde quedamos: la última vez hablábamos de [tema]. ¿Sigue siendo prioridad para ti?' },
      { id: 'd', text: 'Última oportunidad antes de cerrar cupos' },
    ],
    correctId: 'c',
    explanation: 'Retomar desde el último punto real de la conversación reduce fricción y no obliga al lead a repetir contexto.',
  },
  daily_jueves_cierre_agenda: {
    type: 'error_spotting',
    label: 'Detecta el error',
    prompt: 'El lead dice "suena interesante, cuéntame más". El setter responde: "Perfecto, ¿tienes disponibilidad mañana a las 3pm para la llamada?". ¿Cuál es el error?',
    options: [
      { id: 'a', text: 'Proponer un horario específico' },
      { id: 'b', text: 'Saltar directo a agendar sin haber dado la información que el lead pidió' },
      { id: 'c', text: 'Usar la palabra "perfecto"' },
      { id: 'd', text: 'Responder en el mismo mensaje' },
    ],
    correctId: 'b',
    explanation: 'El lead pidió más información, no una cita. Saltarse el microcompromiso intermedio genera resistencia.',
  },
  daily_viernes_simulacro_libre: {
    type: 'multiple_choice',
    label: 'Elige la mejor respuesta',
    prompt: 'El lead confirma: "sí, me interesa, ¿cómo seguimos?". ¿Cuál es la MEJOR respuesta?',
    options: [
      { id: 'a', text: 'Genial, te paso el link de pago' },
      { id: 'b', text: 'Perfecto. Para asegurarnos de que es lo correcto para ti, agendemos una llamada de 15 min: ¿mañana a las 4pm o el jueves a las 10am?' },
      { id: 'c', text: '🙌🙌🙌' },
      { id: 'd', text: 'Cualquier duda me dices' },
    ],
    correctId: 'b',
    explanation: 'Ofrece el siguiente paso concreto (agenda) con opciones específicas, sin saltar a la venta directa ni dejar la iniciativa en el lead.',
  },
};

export const getCriterionChallengeByMissionId = (missionId) => CRITERION_CHALLENGES[missionId] || null;
