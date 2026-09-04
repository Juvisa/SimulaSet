export const MISSION_01_ID = 'mission_01_conversation_hunt';

export const MISSION_01 = {
  id: MISSION_01_ID,
  version: 2,
  number: '01',
  title: 'Caza Conversaciones',
  subtitle: 'Aprende a leer antes de responder.',
  introduction: 'Tu reto no es escribir el mensaje perfecto.\nTu reto es identificar qué necesita esta conversación para avanzar.',
  cases: [
    {
      id: 'evergreen_vsl',
      industry: 'Evergreen · VSL',
      context: 'Ads → Landing → VSL → WhatsApp',
      leadMessage: 'Vi el video y quisiera saber cuánto cuesta.',
      reference: {
        situacion: 'El lead ya pasó por Ads, Landing y VSL antes de llegar a WhatsApp. No es un contacto completamente frío: consumió una pieza de venta y ahora pregunta por precio. Aun así, no sabemos qué entendió de la oferta, qué problema quiere resolver, qué tan identificado se sintió ni qué está evaluando para decidir.',
        emocion: 'Puede haber interés real combinado con necesidad de claridad, control y validación antes de avanzar. Preguntar por precio no demuestra por sí solo que “solo le importa el precio”; esa sería una interpretación no confirmada.',
        transicion: 'El siguiente microcompromiso lógico es confirmar qué parte de la propuesta conectó con su situación o qué está buscando resolver, sin ignorar su pregunta ni forzarlo prematuramente a una llamada.',
        movimiento: 'Claro. Antes de orientarte mal, cuéntame algo: ¿qué fue lo que más conectó contigo del video o qué estás buscando resolver ahora mismo?',
      },
      reflection: {
        situacion: '¿Usaste el contexto del funnel o analizaste el mensaje como si fuera aislado? ¿Diferenciaste hechos de suposiciones?',
        emocion: '¿Planteaste una hipótesis razonable o afirmaste como certeza algo que el lead nunca dijo?',
        transicion: '¿Tu próximo paso corresponde al nivel de avance del lead o intentaste saltar directamente a agenda/venta?',
        movimiento: '¿Tu mensaje ejecuta realmente la transición que elegiste? ¿Reconoce el momento del lead y facilita respuesta?',
      },
    },
    {
      id: 'masterclass_launch',
      industry: 'Lanzamiento · Masterclass',
      context: 'Registro → Masterclass → conversación',
      leadMessage: 'Estuve en la masterclass de ayer, pero todavía no sé si este programa es para mí.',
      reference: {
        situacion: 'El lead ya invirtió tiempo en una masterclass y expresa una duda específica de encaje. Hay interés suficiente para seguir conversando, pero todavía no sabemos qué parte del programa cree que podría no aplicar a su situación, qué objetivo tiene ni qué condición necesita validar.',
        emocion: 'La señal dominante no es rechazo sino incertidumbre sobre relevancia o ajuste. Puede necesitar claridad, seguridad y sentirse comprendido antes de considerar un siguiente paso.',
        transicion: 'El microcompromiso lógico es conseguir que explique qué le genera la duda de encaje. Antes de presentar módulos, precio o agenda, necesitamos entender qué significa para esa persona “no sé si es para mí”.',
        movimiento: 'Tiene sentido. Para no darte una respuesta genérica, ¿qué parte es la que te hace dudar de si encaja contigo: tu punto de partida, tu situación actual o el resultado que quieres conseguir?',
      },
      reflection: {
        situacion: '¿Reconociste que ya consumió la masterclass y que no está en el mismo punto que un lead recién llegado?',
        emocion: '¿Leíste la duda como una señal a explorar o la convertiste automáticamente en una objeción?',
        transicion: '¿Buscaste descubrir el motivo de la duda antes de explicar, convencer o agendar?',
        movimiento: '¿Tu mensaje ayuda a que el lead nombre su incertidumbre con facilidad y sin sentirse presionado?',
      },
    },
    {
      id: 'reactivation',
      industry: 'Seguimiento · Reactivación',
      context: 'Conversación previa → silencio → reactivación',
      leadMessage: 'Hola, perdón que desaparecí. He estado full. Sí sigo interesada.',
      reference: {
        situacion: 'Existe una conversación previa y el lead vuelve por iniciativa propia confirmando que el interés continúa. El contexto anterior importa: no corresponde tratarlo como un contacto nuevo ni repetir preguntas que ya respondió.',
        emocion: 'Puede haber interés junto con sensación de atraso, ocupación o necesidad de retomar sin fricción. No hace falta castigar la ausencia ni dramatizarla; conviene facilitar continuidad y control.',
        transicion: 'El próximo microcompromiso depende de dónde quedó la conversación antes del silencio. La transición correcta es retomarla desde el último punto útil y proponer el siguiente paso pendiente, no reiniciar el diagnóstico.',
        movimiento: 'Tranqui 😊 retomemos desde donde quedamos. La última vez estábamos en [último punto relevante]. ¿Te parece si seguimos desde ahí y vemos el siguiente paso?',
      },
      reflection: {
        situacion: '¿Usaste la memoria de la conversación o la reiniciaste desde cero?',
        emocion: '¿Facilitaste el regreso o hiciste sentir al lead que debía justificar su ausencia?',
        transicion: '¿Tu siguiente paso parte del último punto real de la conversación?',
        movimiento: '¿Tu mensaje reduce fricción y permite retomar sin repetir preguntas innecesarias?',
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
