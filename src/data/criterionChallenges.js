// Banco de Retos de Criterio S.E.T. — uno por día de la semana, vinculado por
// mission_id a data/dailyMissions.js. Cada reto tiene una mecánica distinta
// (ver `type`, solo metadata visual — el render en Missions.jsx es genérico:
// prompt + 4 opciones de opción única) y las 4 alternativas de cada uno están
// balanceadas en longitud a propósito, para que la correcta no se delate por
// ser el único párrafo largo. Los distractores son errores tácticos reales
// (pitch apresurado, validar sin conectar con la emoción, preguntas cerradas
// que matan la conversación, confundir curiosidad con dolor real) — no
// opciones absurdas o vacías fáciles de descartar a simple vista.
//
// Cada opción INCORRECTA lleva su propio `feedback`: la trampa táctica
// específica de esa elección, no la justificación genérica de por qué la
// correcta es correcta (eso vive en `explanation`, mostrado siempre). Así, si
// el alumno falla, Missions.jsx puede mostrarle exactamente qué error cometió
// él, no un texto idéntico sin importar cuál de las 3 trampas haya elegido.
export const CRITERION_CHALLENGES = {
  daily_lunes_apertura_outbound: {
    type: 'multiple_choice',
    label: 'Apertura táctica',
    prompt: 'Un lead frío en Instagram te responde "¿Quién eres?" después de tu primer mensaje. ¿Cuál es la MEJOR apertura?',
    options: [
      { id: 'a', text: '¡Hola! Vi tu perfil y creo que puedo ayudarte a escalar tu negocio, tengo el programa perfecto para ti.', feedback: 'Pitch apresurado: vendes el programa antes de dar cualquier razón específica de por qué le escribes a ÉL. El lead no distingue esto de un mensaje masivo.' },
      { id: 'b', text: 'Vi que sigues a [referencia] y ayudo a personas como tú a lograr [resultado concreto]. ¿Te cuento cómo?' },
      { id: 'c', text: 'Soy especialista en ventas digitales, llevo años ayudando a emprendedores a multiplicar sus ingresos.', feedback: 'Mensaje autocentrado: hablas de ti y de tu experiencia, no de él ni de su situación — el lead no tiene ninguna razón para sentirse identificado.' },
      { id: 'd', text: 'Hola, ¿tienes 5 minutos para que te cuente sobre mi servicio? Es una oportunidad realmente increíble.', feedback: 'Pides tiempo antes de dar valor: el lead todavía no tiene ninguna razón para invertir esos 5 minutos contigo.' },
    ],
    correctId: 'b',
    explanation: 'Da contexto específico (por qué le escribes a él) y un resultado concreto antes de pedir nada — las demás son variaciones de "muy comercial" o "demasiado genérica" que no distinguen al lead de cualquier otro contacto.',
  },
  daily_martes_objecion_precio: {
    type: 'diagnostico_set',
    label: 'Diagnóstico S.E.T.',
    prompt: 'El lead escribe: "Llevo 3 meses metiéndole a anuncios y no sale nada, ya no sé qué más hacer." El setter responde: "Te entiendo, los anuncios pueden ser complicados. ¿Qué tipo de anuncios has probado?" ¿Qué elemento del método S.E.T. está FALTANDO en la respuesta del setter?',
    options: [
      { id: 'a', text: 'Situación — el setter no indagó en qué consistían exactamente esos anuncios que probó.', feedback: 'El setter SÍ está indagando la situación (pregunta qué anuncios probó) — el hueco real no está ahí, sino en lo que ignoró antes de preguntar.' },
      { id: 'b', text: 'Emoción — el setter ignoró el desgaste y la frustración que el lead mostró, y fue directo a lo técnico.' },
      { id: 'c', text: 'Transición — el setter no propuso ningún siguiente paso concreto después de la pregunta.', feedback: 'Adelantarse a la transición sin resolver primero la emoción haría que cualquier siguiente paso sonara hueco o prematuro — ese no es el hueco principal aquí.' },
      { id: 'd', text: 'Movimiento — el mensaje del setter sonó demasiado formal para el tono que usó el lead.', feedback: 'El problema no es CÓMO lo dijo (tono/formalidad), sino QUÉ ignoró por completo: la carga emocional del mensaje del lead.' },
    ],
    correctId: 'b',
    explanation: '"Ya no sé qué más hacer" es una señal emocional clara (desgaste, frustración) que el setter saltó por completo para ir directo a lo técnico — sin nombrarla o validarla, el lead siente que le hablan a un formulario, no a una persona.',
  },
  daily_miercoles_reactivacion: {
    type: 'espejo_control',
    label: 'Espejo + control',
    prompt: 'El lead responde: "No sé, suena bien pero no tengo tiempo para esto ahorita." ¿Cuál es la MEJOR respuesta usando espejo + pregunta de control?',
    options: [
      { id: 'a', text: 'No hay problema, cuando tengas tiempo me avisas y seguimos platicando sobre el programa.', feedback: 'Cedes la iniciativa por completo: dejas que el lead controle si vuelve a escribir, y en la práctica casi nunca lo hace.' },
      { id: 'b', text: '¿No tienes tiempo... para esto? Cuéntame, ¿qué es lo que más tiempo te está consumiendo ahora mismo?' },
      { id: 'c', text: 'Entiendo que estás ocupado, pero este programa realmente te va a ahorrar tiempo a largo plazo.', feedback: 'Validas en la superficie ("entiendo") pero de inmediato empujas el pitch, sin conectar de verdad con la objeción real del lead.' },
      { id: 'd', text: '¿Prefieres que hablemos la próxima semana o el mes que entra, cuando tengas más disponibilidad?', feedback: 'Pregunta cerrada que solo pospone el tema — nunca exploras POR QUÉ el lead dice no tener tiempo.' },
    ],
    correctId: 'b',
    explanation: 'Repetir la objeción en forma de pregunta ("¿para esto?") abre la conversación en vez de cerrarla, y la pregunta de control busca la causa real. Las otras ceden la iniciativa, empujan el pitch sin conectar, o hacen una pregunta cerrada que solo pospone el tema sin explorarlo.',
  },
  daily_jueves_cierre_agenda: {
    type: 'calificacion_bant',
    label: 'Calificación ligera',
    prompt: 'El lead escribe: "Vi el anuncio y se ve interesante, ¿cuánto cuesta?" sin dar más contexto. ¿Esto es dolor real o solo curiosidad?',
    options: [
      { id: 'a', text: 'Dolor real — preguntar el precio ya es una señal de que está listo para comprar el programa.', feedback: 'Confundes curiosidad inicial con intención de compra — es el error de calificación más común, y lleva a "vender" antes de tiempo.' },
      { id: 'b', text: 'Curiosidad — preguntar el precio sin mencionar su situación real todavía no confirma un dolor concreto.' },
      { id: 'c', text: 'Dolor real — si no le interesara de verdad, no habría comentado el anuncio en primer lugar.', feedback: 'Asumes dolor real solo por el interés inicial, sin haber indagado todavía cuál es su situación de verdad.' },
      { id: 'd', text: 'Curiosidad — y por eso no vale la pena invertir más tiempo en intentar calificarlo.', feedback: 'Este es el error opuesto y igual de costoso: descartar al lead en vez de calificarlo con un par de preguntas más.' },
    ],
    correctId: 'b',
    explanation: 'Preguntar el precio es apenas una señal de interés inicial, no una confirmación de dolor — hay que indagar su situación antes de asumir que ya está listo para comprar (o descartarlo, que es el error opuesto).',
  },
  daily_viernes_simulacro_libre: {
    type: 'puente_agendamiento',
    label: 'Puente al agendamiento',
    prompt: 'El lead confirma: "Ok, me interesa, ¿cómo seguimos?" ¿Cuál es la MEJOR transición hacia agendar sin sonar desesperado?',
    options: [
      { id: 'a', text: '¡Genial! Aquí está el link de pago, cualquier duda que tengas me avisas sin problema.', feedback: 'Saltas directo a la venta sin agendar ni confirmar antes que el programa realmente encaja con su situación.' },
      { id: 'b', text: 'Perfecto. Para ver si encaja contigo, agendemos una llamada de 15 min: ¿mañana 4pm o jueves 10am?' },
      { id: 'c', text: 'Qué bueno que te interesó, dame unos minutitos para prepararte toda la información y ya te escribo.', feedback: 'Respuesta vaga sin ningún siguiente paso concreto — pierdes el momentum justo cuando el lead ya dijo que sí.' },
      { id: 'd', text: 'Podemos agendar cuando tú quieras, dime nada más qué día y hora te acomoda mejor a ti.', feedback: 'Dejas toda la iniciativa y la estructura en manos del lead, lo cual se lee como falta de dirección, no como flexibilidad.' },
    ],
    correctId: 'b',
    explanation: 'Ofrece el siguiente paso concreto (agenda) con opciones específicas de horario — sin saltar directo a la venta, sin quedar vago y sin dejar toda la iniciativa (y la estructura) en manos del lead.',
  },
};

export const getCriterionChallengeByMissionId = (missionId) => CRITERION_CHALLENGES[missionId] || null;
