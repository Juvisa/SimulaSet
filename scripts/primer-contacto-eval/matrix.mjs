// Matriz de la TERCERA ronda de validación de Inbound — Primer contacto
// (control de estados conversacionales).
//
// Todo es FICTICIO: dos proyectos inventados (sin datos personales reales ni
// secretos comerciales). El alumno simulado es otra llamada a Haiku que
// responde a lo que dice el prospecto según una política; solo conoce lo
// documentado del proyecto y la conversación visible.
//
// Cada caso declara los desenlaces ACEPTABLES, no uno solo: hay casos
// positivos, negativos y ambiguos, y en varios el prospecto puede cambiar de
// opinión con motivo (precio respondido después de una evasiva, duda de pago
// aclarada con información documentada, encaje medio). Lo que no se acepta
// nunca está en `nunca`.

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

// Políticas del alumno simulado.
export const POLICIES = {
  competente: 'Eres un setter competente que aplica S.E.T.: una pregunta abierta por mensaje, construyes sobre lo que dice el prospecto, respondes con honestidad lo que te pregunta (si el precio está documentado, lo das; si algo no está documentado, dices con honestidad que lo detalla el equipo en la llamada). Propones una llamada solo cuando entendiste su situación y su motivo. Si te das cuenta de que la oferta no le conviene, lo dices con respeto y cierras sin insistir. Si el prospecto tiene una duda que lo documentado del proyecto responde (por ejemplo, formas de pago), se lo aclaras.',
  evasivo_precio: 'Eres un setter que NUNCA dice el precio: cada vez que el prospecto pregunta por el precio o el costo, respondes "eso lo vemos más adelante" y cambias de tema con una pregunta. En lo demás preguntas con normalidad.',
  evasivo_una_vez: 'Eres un setter que la PRIMERA vez que el prospecto pregunta el precio responde "eso lo vemos más adelante" y cambia de tema. Si vuelve a preguntarlo, te das cuenta del error, te disculpas y das el precio documentado con claridad. Después sigues como un setter competente: preguntas abiertas y propones una llamada cuando entiendes su situación y su motivo.',
  cita_forzada: 'Eres un setter impaciente: desde tu primer mensaje propones una llamada y en cada mensaje insistes en agendarla (día y hora), sin preguntar por su situación ni atender sus objeciones.',
  pitch: 'Eres un setter que en tu PRIMER mensaje manda la oferta completa sin preguntar nada: describe el programa con entusiasmo y termina con "inscríbete aquí: [enlace]". Después de eso, si el prospecto responde, pasas a preguntar con normalidad.',
};

export const MAX_TURNS = 8;

// tipo: positivo | negativo | ambiguo. aceptables: desenlaces razonables.
// nunca: desenlaces que indicarían un error del simulador.
export const CONVERSATIONS = [
  { id: 'R01', tipo: 'positivo', title: 'Descubrimiento completo hasta la cita (odontología)', project: 'dental', temperatura: 'tibio', resistencia: 'baja', canal: 'WhatsApp', policy: 'competente', overrides: { encaje: 'alto', apertura: 'info' }, aceptables: ['cita_aceptada', 'cita_condicionada'], nunca: ['despedida', 'no_califica'] },
  { id: 'R02', tipo: 'positivo', title: 'Descubrimiento hasta la cita sin precio documentado (bienestar)', project: 'bienestar', temperatura: 'caliente', resistencia: 'media', canal: 'WhatsApp', policy: 'competente', overrides: { encaje: 'alto' }, aceptables: ['cita_aceptada', 'cita_condicionada'], nunca: ['despedida', 'no_califica'] },
  { id: 'R03', tipo: 'positivo', title: 'Abre con «Precio» y recibe el precio honesto', project: 'dental', temperatura: 'frio', resistencia: 'media', canal: 'WhatsApp', policy: 'competente', overrides: { encaje: 'alto', apertura: 'precio' }, aceptables: ['cita_aceptada', 'cita_condicionada', 'abierta'], nunca: ['despedida'] },
  { id: 'R04', tipo: 'negativo', title: 'Evasivas de precio (resistencia media: límite 3)', project: 'dental', temperatura: 'frio', resistencia: 'media', canal: 'WhatsApp', policy: 'evasivo_precio', overrides: { encaje: 'alto', apertura: 'precio' }, aceptables: ['despedida'], nunca: ['cita_aceptada'] },
  { id: 'R05', tipo: 'negativo', title: 'Evasivas de precio (resistencia alta: límite 2)', project: 'dental', temperatura: 'caliente', resistencia: 'alta', canal: 'Instagram DM', policy: 'evasivo_precio', overrides: { encaje: 'alto', apertura: 'precio' }, aceptables: ['despedida'], nunca: ['cita_aceptada'] },
  { id: 'R06', tipo: 'negativo', title: 'Cita forzada a un prospecto con buen encaje', project: 'dental', temperatura: 'caliente', resistencia: 'alta', canal: 'WhatsApp', policy: 'cita_forzada', overrides: { encaje: 'alto' }, aceptables: ['despedida', 'abierta'], nunca: ['cita_aceptada'] },
  { id: 'R07', tipo: 'negativo', title: 'Incompatibilidad definitiva bien identificada', project: 'dental', temperatura: 'tibio', resistencia: 'media', canal: 'WhatsApp', policy: 'competente', overrides: { encaje: 'bajo', incompatibilidad: 'definitiva' }, aceptables: ['no_califica', 'abierta'], nunca: ['cita_aceptada'], cierreBienPuntuado: true },
  { id: 'R08', tipo: 'negativo', title: 'Cita forzada a un prospecto con incompatibilidad definitiva', project: 'dental', temperatura: 'tibio', resistencia: 'media', canal: 'WhatsApp', policy: 'cita_forzada', overrides: { encaje: 'bajo', incompatibilidad: 'definitiva' }, aceptables: ['despedida', 'no_califica', 'abierta'], nunca: ['cita_aceptada'] },
  { id: 'R09', tipo: 'ambiguo', title: 'Duda de pago superable: puede cambiar de opinión si le aclaran las cuotas', project: 'dental', temperatura: 'tibio', resistencia: 'media', canal: 'WhatsApp', policy: 'competente', overrides: { encaje: 'bajo', incompatibilidad: 'superable', motivo_no_encaje: 'cree que no puede pagarlo de una sola vez y no sabe qué formas de pago hay' }, aceptables: ['cita_aceptada', 'cita_condicionada', 'no_califica', 'abierta'], nunca: ['despedida'] },
  { id: 'R10', tipo: 'ambiguo', title: 'Una evasiva y luego el precio honesto: debe seguir la conversación', project: 'dental', temperatura: 'frio', resistencia: 'media', canal: 'WhatsApp', policy: 'evasivo_una_vez', overrides: { encaje: 'alto', apertura: 'precio' }, aceptables: ['cita_aceptada', 'cita_condicionada', 'abierta'], nunca: ['despedida'] },
  { id: 'R11', tipo: 'ambiguo', title: 'Encaje medio con resistencia alta', project: 'dental', temperatura: 'frio', resistencia: 'alta', canal: 'Facebook Messenger', policy: 'competente', overrides: { encaje: 'medio' }, aceptables: ['cita_aceptada', 'cita_condicionada', 'abierta', 'no_califica'], nunca: [] },
  { id: 'R12', tipo: 'ambiguo', title: 'Pitch con enlace al inicio y luego preguntas', project: 'bienestar', temperatura: 'frio', resistencia: 'baja', canal: 'Instagram DM', policy: 'pitch', overrides: { encaje: 'alto', apertura: 'info' }, aceptables: ['abierta', 'cita_condicionada', 'cita_aceptada', 'despedida'], nunca: [], primerMensajeBajo: true },
];

// Perfiles sin forzar nada: variedad (forma de trabajo, posición en los
// rangos, rasgo, encaje bajo) y el tope de 500 tokens con los campos nuevos.
export const PROFILE_ONLY = [
  { id: 'Q01', project: 'dental', temperatura: 'frio', resistencia: 'baja', canal: 'WhatsApp' },
  { id: 'Q02', project: 'dental', temperatura: 'tibio', resistencia: 'media', canal: 'WhatsApp' },
  { id: 'Q03', project: 'dental', temperatura: 'caliente', resistencia: 'alta', canal: 'Instagram DM' },
  { id: 'Q04', project: 'dental', temperatura: 'tibio', resistencia: 'alta', canal: 'Facebook Messenger', overrides: { encaje: 'bajo', incompatibilidad: 'superable' } },
  { id: 'Q05', project: 'dental', temperatura: 'frio', resistencia: 'media', canal: 'WhatsApp', overrides: { encaje: 'bajo', incompatibilidad: 'definitiva' } },
  { id: 'Q06', project: 'bienestar', temperatura: 'tibio', resistencia: 'baja', canal: 'WhatsApp' },
  { id: 'Q07', project: 'bienestar', temperatura: 'caliente', resistencia: 'media', canal: 'WhatsApp', overrides: { encaje: 'bajo', incompatibilidad: 'superable' } },
  { id: 'Q08', project: 'bienestar', temperatura: 'frio', resistencia: 'alta', canal: 'Instagram DM' },
];
