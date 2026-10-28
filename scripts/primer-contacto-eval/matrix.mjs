// Matriz de validación de Inbound — Primer contacto con la IA real.
//
// Todo es FICTICIO: dos proyectos inventados (sin datos personales reales ni
// secretos comerciales) y turnos del alumno predefinidos. El alumno simulado
// sigue un guion fijo con una sola regla reactiva: si el prospecto pregunta
// por el precio, el siguiente mensaje empieza con la respuesta que marque la
// política de precio del caso (honesta o evasiva). Así se aísla lo que se
// quiere observar: cómo reacciona el PROSPECTO (Haiku) y cómo lo EVALÚA el
// coaching.

export const PROJECTS = {
  dental: {
    id: 'eval-dental',
    name: 'Agenda Llena (ficticio)',
    expertName: 'Dra. Ana Torres (ficticia)',
    niche: 'Odontólogos con consultorio propio',
    promise: 'Llenar la agenda con pacientes nuevos sin depender solo de referidos, en 90 días',
    price: '1.800 USD o 3 cuotas de 650 USD',
    avatarBusiness: 'Consultorio dental independiente de 1 a 3 sillones',
    avatarCurrentSituation: 'Depende de referidos; la agenda va entre el 50 y el 70 %',
    avatarPain: 'Meses flojos sin pacientes nuevos y miedo a no cubrir los gastos fijos',
    avatarDesire: 'Agenda estable y poder abrir un segundo consultorio',
    avatarDescription: 'Odontólogo independiente de 30 a 50 años en Latinoamérica',
    commonObjections: 'Ya probé con una agencia de anuncios; no tengo tiempo; es caro',
    testimonials: [{ nombre: 'Caso ficticio: Dr. Luis', resultado: '+40 pacientes nuevos en 3 meses' }],
    resources: [],
    recursos: {
      guias_pdfs: [{ nombre: 'Guía de retención de pacientes', descripcion: '5 pasos para que los pacientes vuelvan', momento_uso: 'antes de la llamada', activo: true, link: 'https://ejemplo.invalid/guia' }],
      videos_testimonios: [],
      vsl_presentacion: { nombre: '', link: '', activo: false },
      scripts_apertura: { outbound: '', inbound: '', reactivacion: '' },
    },
  },
  bienestar: {
    id: 'eval-bienestar',
    name: 'Cuerpo en Calma (ficticio)',
    expertName: 'Coach Marta Ruiz (ficticia)',
    niche: 'Mujeres profesionales de 35 a 55 años con estrés y sedentarismo',
    promise: 'Recuperar energía y hábitos sostenibles de movimiento y alimentación en 12 semanas',
    price: '',
    avatarBusiness: 'Profesional con empleo o negocio propio y poco tiempo libre',
    avatarCurrentSituation: 'Trabaja muchas horas, duerme mal y empezó varias dietas sin sostenerlas',
    avatarPain: 'Cansancio constante y frustración por no poder mantener un hábito',
    avatarDesire: 'Sentirse con energía y tener una rutina que encaje con su agenda',
    avatarDescription: 'Mujer profesional de 35 a 55 años, urbana, con hijos o personas a cargo',
    commonObjections: 'No tengo tiempo; ya lo intenté y lo dejé; no sé si es para mí',
    testimonials: [],
    resources: [],
    recursos: { guias_pdfs: [], videos_testimonios: [], vsl_presentacion: { nombre: '', link: '', activo: false }, scripts_apertura: {} },
  },
};

// Respuestas de precio que antepone el alumno simulado cuando el prospecto
// pregunta por el precio.
export const PRICE_REPLIES = {
  honest: {
    dental: 'Claro, te cuento: la inversión es de 1.800 USD o 3 cuotas de 650 USD.',
    bienestar: 'Te soy honesta: el valor depende del plan que te recomienden y no te quiero dar un número inventado; lo ven contigo en la llamada.',
  },
  evasive: {
    dental: 'Eso lo vemos más adelante 😊',
    bienestar: 'Eso lo vemos más adelante 😊',
  },
};

// Turnos base por proyecto (S → E → T). Cada turno lleva su intención.
const goodPath = {
  dental: [
    { kind: 'situacion', text: '¡Hola! Gracias por escribir 😊 Para orientarte bien, ¿qué fue lo que te llamó la atención de la publicación?' },
    { kind: 'situacion', text: 'Entiendo. ¿Y cómo te llegan hoy los pacientes nuevos al consultorio?' },
    { kind: 'emocion', text: '¿Y qué pasa en los meses en que llegan menos? ¿Cómo te afecta eso?' },
    { kind: 'emocion', text: 'Tiene sentido. Si eso se resolviera, ¿qué te gustaría lograr en los próximos meses?' },
    { kind: 'cita', text: 'Por lo que me cuentas, vale la pena verlo con calma. ¿Te parece una llamada de 30 minutos con el equipo de la Dra. Ana para revisar tu caso y ver si el programa encaja? ¿Mejor jueves o viernes?' },
    { kind: 'confirmacion', text: 'Perfecto. Te envío el enlace por aquí y una guía corta para que llegues con tus números a mano. ¿Te parece?' },
  ],
  bienestar: [
    { kind: 'situacion', text: '¡Hola! Qué bueno que escribiste 😊 Para orientarte, ¿qué te llamó la atención de la publicación?' },
    { kind: 'situacion', text: 'Te entiendo. ¿Cómo es hoy un día normal para ti, entre trabajo y descanso?' },
    { kind: 'emocion', text: '¿Y cómo te está afectando ese cansancio en lo que más te importa?' },
    { kind: 'emocion', text: 'Gracias por contármelo. ¿Por qué sientes que es el momento de hacer algo ahora?' },
    { kind: 'cita', text: 'Creo que vale la pena verlo con calma. ¿Te parece una llamada corta con el equipo de Marta para revisar tu caso y ver si el programa te encaja? ¿Mejor esta semana o la próxima?' },
    { kind: 'confirmacion', text: 'Genial. Te envío el enlace por aquí. ¿Algo que quieras que veamos sí o sí en la llamada?' },
  ],
};

const replace = (turns, index, turn) => turns.map((t, i) => (i === index ? turn : t));

// 9 combinaciones con el camino S.E.T. completo y precio honesto.
const COMBOS = [];
for (const temperatura of ['frio', 'tibio', 'caliente']) {
  for (const resistencia of ['baja', 'media', 'alta']) COMBOS.push({ temperatura, resistencia });
}
const CHANNELS = ['WhatsApp', 'Instagram DM', 'Facebook Messenger'];

export const CONVERSATIONS = [
  ...COMBOS.map((c, i) => ({
    id: `C${String(i + 1).padStart(2, '0')}`,
    category: 'combinacion',
    title: `Camino S.E.T. completo · ${c.temperatura} / ${c.resistencia}`,
    project: 'dental', ...c, canal: CHANNELS[i % 3], pricePolicy: 'honest',
    turns: goodPath.dental,
    expect: 'Diferencias visibles por temperatura y resistencia; revelación gradual; la cita solo después de descubrir (no antes del turno 4).',
  })),
  {
    id: 'C10', category: 'precio_honesto_sin_documentar', title: 'Precio no documentado respondido con honestidad',
    project: 'bienestar', temperatura: 'tibio', resistencia: 'media', canal: 'WhatsApp', pricePolicy: 'honest', turns: goodPath.bienestar,
    expect: 'La respuesta honesta sin cifra no se penaliza; el prospecto no inventa un precio.',
  },
  {
    id: 'C11', category: 'precio_evasivo', title: 'Evasivas reiteradas sobre el precio (frío)',
    project: 'dental', temperatura: 'frio', resistencia: 'media', canal: 'WhatsApp', pricePolicy: 'evasive', forcePriceOpening: true,
    turns: goodPath.dental.slice(0, 5),
    expect: 'El prospecto insiste, se enfría y a la tercera evasiva se va (cerrado); el coaching marca la evasiva desde la segunda.',
  },
  {
    id: 'C12', category: 'precio_evasivo', title: 'Evasivas reiteradas sobre el precio (caliente)',
    project: 'dental', temperatura: 'caliente', resistencia: 'media', canal: 'Instagram DM', pricePolicy: 'evasive', forcePriceOpening: true,
    turns: goodPath.dental.slice(0, 5),
    expect: 'Igual que C11, con un prospecto que quiere avanzar: la evasiva le cuesta interés.',
  },
  {
    id: 'C13', category: 'precio_honesto', title: 'Pregunta de precio respondida con honestidad desde el inicio',
    project: 'dental', temperatura: 'frio', resistencia: 'alta', canal: 'WhatsApp', pricePolicy: 'honest', forcePriceOpening: true,
    turns: goodPath.dental,
    expect: 'La respuesta honesta no se penaliza; puede generar una objeción real, no un rechazo automático.',
  },
  {
    id: 'C14', category: 'promesa_inventada', title: 'El alumno afirma una garantía que no está documentada',
    project: 'dental', temperatura: 'tibio', resistencia: 'media', canal: 'WhatsApp', pricePolicy: 'honest',
    turns: replace(goodPath.dental, 2, { kind: 'promesa_inventada', text: 'Además tienes garantía de devolución del 100 % y resultados asegurados en 30 días. ¿Qué pasa hoy en los meses flojos?' }),
    expect: 'El coaching marca la promesa no documentada; el prospecto puede dudar o pedir detalles.',
  },
  {
    id: 'C15', category: 'cierre_prematuro', title: 'Cita propuesta en los dos primeros mensajes',
    project: 'dental', temperatura: 'tibio', resistencia: 'baja', canal: 'WhatsApp', pricePolicy: 'honest',
    turns: [
      { kind: 'cita', text: '¡Hola! ¿Agendamos una llamada hoy mismo y te cuento todo?' },
      { kind: 'cita', text: 'Es mejor verlo en llamada, son 30 minutos. ¿Te queda bien hoy a las 6?' },
      ...goodPath.dental.slice(1, 5),
    ],
    expect: 'No acepta la cita sin descubrimiento; el coaching penaliza la cita prematura.',
  },
  {
    id: 'C16', category: 'cierre_prematuro', title: 'Pitch con enlace en el primer mensaje',
    project: 'dental', temperatura: 'frio', resistencia: 'media', canal: 'Instagram DM', pricePolicy: 'honest',
    turns: [
      { kind: 'pitch', text: 'Hola! El programa Agenda Llena incluye 12 sesiones, plantillas y acompañamiento. Inscríbete aquí: [enlace]' },
      ...goodPath.dental.slice(1, 5),
    ],
    expect: 'Respuesta más corta y con menos interés; el coaching penaliza el pitch prematuro.',
  },
  {
    id: 'C17', category: 'no_califica', title: 'Falta de encaje identificada con respeto',
    project: 'dental', temperatura: 'tibio', resistencia: 'media', canal: 'WhatsApp', pricePolicy: 'honest', forceLowFit: true,
    turns: [
      ...goodPath.dental.slice(0, 3),
      { kind: 'cierre_no_encaje', text: 'Gracias por contarme con tanta claridad. Siendo honesta, por lo que me dices no creo que el programa sea lo que necesitas ahora y no te quiero vender algo que no te sirva. ¿Te parece si te escribo más adelante si tenemos algo que encaje mejor?' },
      { kind: 'cierre_no_encaje', text: 'Con gusto. Mucho éxito y aquí estoy si te surge cualquier duda.' },
    ],
    expect: 'Cierre no_califica; el coaching puntúa alto la identificación de la falta de encaje.',
  },
  {
    id: 'C18', category: 'no_califica', title: 'Se fuerza la cita aunque no hay encaje',
    project: 'dental', temperatura: 'caliente', resistencia: 'alta', canal: 'WhatsApp', pricePolicy: 'honest', forceLowFit: true,
    turns: [
      goodPath.dental[0], goodPath.dental[1],
      { kind: 'cita', text: 'Igual te conviene la llamada, ahí te explican todo. ¿Jueves o viernes?' },
      { kind: 'cita', text: 'Son solo 30 minutos, no pierdes nada. ¿Te agendo el jueves?' },
      { kind: 'cita', text: 'Te dejo agendado el jueves a las 5, ¿listo?' },
    ],
    expect: 'No acepta la cita; el coaching penaliza forzarla.',
  },
  {
    id: 'C19', category: 'interrogatorio', title: 'Interrogatorio en lista en el primer mensaje',
    project: 'bienestar', temperatura: 'frio', resistencia: 'alta', canal: 'Instagram DM', pricePolicy: 'honest',
    turns: [
      { kind: 'interrogatorio', text: 'Hola! Para ayudarte dime: 1) ¿cuántos años tienes? 2) ¿a qué te dedicas? 3) ¿cuánto pesas? 4) ¿cuánto puedes invertir?' },
      ...goodPath.bienestar.slice(1, 5),
    ],
    expect: 'Respuesta corta o incómoda; el coaching penaliza el interrogatorio.',
  },
  {
    id: 'C20', category: 'segundo_proyecto', title: 'Camino S.E.T. completo en otro nicho',
    project: 'bienestar', temperatura: 'caliente', resistencia: 'baja', canal: 'WhatsApp', pricePolicy: 'honest', turns: goodPath.bienestar,
    expect: 'El prospecto usa el contexto del segundo proyecto (no mezcla odontología) y no inventa precio.',
  },
];

// Perfiles adicionales solo para medir el límite de 500 tokens.
export const PROFILE_ONLY = [
  ...COMBOS.map((c, i) => ({ id: `P${String(i + 1).padStart(2, '0')}`, project: i % 2 ? 'bienestar' : 'dental', ...c, canal: CHANNELS[i % 3] })),
  { id: 'P10', project: 'dental', temperatura: 'caliente', resistencia: 'alta', canal: 'WhatsApp' },
];

// Solo para C17/C18 (prueba): se pide al generador de perfiles un caso con
// encaje bajo. No forma parte del prompt de la aplicación.
export const LOW_FIT_HINT = '\nEN ESTE CASO DE PRUEBA el encaje debe ser "bajo": dale al prospecto una razón concreta y creíble por la que la oferta no le conviene ahora.';

// Primer mensaje forzado en los casos de precio (para que el precio aparezca).
export const PRICE_OPENING = 'Precio';
