// Matriz de la SEGUNDA ronda de validación de Inbound — Primer contacto.
//
// Todo es FICTICIO: dos proyectos inventados (sin datos personales reales ni
// secretos comerciales). El alumno simulado ya no sigue un guion fijo: es
// otra llamada a Haiku que responde a lo que dice el prospecto según una
// política (competente, evasivo con el precio, fuerza la cita, inventa una
// promesa o hace pitch al inicio). Solo conoce lo que conocería un alumno real:
// lo documentado del proyecto y la conversación visible.

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
  competente: 'Eres un setter competente que aplica S.E.T.: una pregunta abierta por mensaje, construyes sobre lo que dice el prospecto, respondes con honestidad lo que te pregunta (si el precio está documentado, lo das; si algo no está documentado, dices con honestidad que lo detalla el equipo en la llamada). Propones una llamada solo cuando entendiste su situación y su motivo. Si te das cuenta de que la oferta no le conviene, lo dices con respeto y cierras sin insistir.',
  evasivo_precio: 'Eres un setter que NUNCA dice el precio: cada vez que el prospecto pregunta por el precio o el costo, respondes "eso lo vemos más adelante" y cambias de tema con una pregunta. En lo demás preguntas con normalidad.',
  cita_forzada: 'Eres un setter impaciente: desde tu primer mensaje propones una llamada y en cada mensaje insistes en agendarla (día y hora), sin preguntar por su situación ni atender sus objeciones.',
  promesa: 'Eres un setter que, en tu SEGUNDO mensaje, afirma que el programa tiene "garantía de resultados en 30 días o te devolvemos el dinero" (aunque no esté documentado). Fuera de eso, preguntas con normalidad.',
  pitch: 'Eres un setter que en tu PRIMER mensaje manda la oferta completa sin preguntar nada: describe el programa con entusiasmo y termina con "inscríbete aquí: [enlace]". Después de eso, si el prospecto responde, pasas a preguntar con normalidad.',
};

export const MAX_TURNS = 8;

export const CONVERSATIONS = [
  { id: 'E01', category: 'precio_honesto', title: 'Pregunta de precio respondida con honestidad (precio documentado)', project: 'dental', temperatura: 'frio', resistencia: 'media', canal: 'WhatsApp', policy: 'competente', overrides: { encaje: 'alto', apertura: 'precio' }, expect: 'La respuesta honesta no se penaliza; el prospecto sigue la conversación.' },
  { id: 'E02', category: 'precio_evasivo', title: 'Evasivas de precio (resistencia media: se va a la tercera)', project: 'dental', temperatura: 'frio', resistencia: 'media', canal: 'WhatsApp', policy: 'evasivo_precio', overrides: { encaje: 'alto', apertura: 'precio' }, expect: 'Insiste y se despide tras 3 evasivas (cerrado); alerta por evasiva reiterada.' },
  { id: 'E03', category: 'precio_evasivo', title: 'Evasivas de precio (resistencia alta: se va a la segunda)', project: 'dental', temperatura: 'caliente', resistencia: 'alta', canal: 'Instagram DM', policy: 'evasivo_precio', overrides: { encaje: 'alto', apertura: 'precio' }, expect: 'Se despide tras 2 evasivas; mensajes muy cortos.' },
  { id: 'E04', category: 'precio_no_documentado', title: 'Precio no documentado respondido con honestidad', project: 'bienestar', temperatura: 'tibio', resistencia: 'media', canal: 'WhatsApp', policy: 'competente', overrides: { encaje: 'alto', apertura: 'precio' }, expect: 'La respuesta "lo vemos en la llamada" no se penaliza; nadie inventa una cifra.' },
  { id: 'E05', category: 'cita_aceptada', title: 'Camino S.E.T. hasta la cita (odontología)', project: 'dental', temperatura: 'tibio', resistencia: 'baja', canal: 'WhatsApp', policy: 'competente', overrides: { encaje: 'alto', apertura: 'info' }, expect: 'Acepta la cita tras el descubrimiento y queda registrada (pidio_llamada).' },
  { id: 'E06', category: 'cita_aceptada', title: 'Camino S.E.T. hasta la cita (bienestar)', project: 'bienestar', temperatura: 'caliente', resistencia: 'media', canal: 'WhatsApp', policy: 'competente', overrides: { encaje: 'alto' }, expect: 'Acepta la cita y queda registrada; no se inventa precio.' },
  { id: 'E07', category: 'no_califica', title: 'Falta de encaje descubierta y bien cerrada', project: 'dental', temperatura: 'tibio', resistencia: 'media', canal: 'WhatsApp', policy: 'competente', overrides: { encaje: 'bajo' }, expect: 'El alumno descubre la falta de encaje; cierre no_califica; coaching alto.' },
  { id: 'E08', category: 'no_califica', title: 'Cita forzada a un prospecto sin encaje', project: 'dental', temperatura: 'caliente', resistencia: 'alta', canal: 'WhatsApp', policy: 'cita_forzada', overrides: { encaje: 'bajo' }, expect: 'No acepta la cita; coaching bajo y alerta por insistir.' },
  { id: 'E09', category: 'revelacion_resistencia_alta', title: 'Revelación progresiva con resistencia alta (odontología)', project: 'dental', temperatura: 'frio', resistencia: 'alta', canal: 'Facebook Messenger', policy: 'competente', overrides: { encaje: 'medio' }, expect: 'Mensajes muy cortos al inicio; revela un dato por pregunta buena.' },
  { id: 'E10', category: 'revelacion_resistencia_alta', title: 'Revelación progresiva con resistencia alta (bienestar)', project: 'bienestar', temperatura: 'tibio', resistencia: 'alta', canal: 'Instagram DM', policy: 'competente', overrides: { encaje: 'alto' }, expect: 'Escéptica y breve; se abre de a poco.' },
  { id: 'E11', category: 'coaching_promesa', title: 'El alumno afirma una garantía no documentada', project: 'dental', temperatura: 'tibio', resistencia: 'media', canal: 'WhatsApp', policy: 'promesa', overrides: { encaje: 'alto' }, expect: 'Alerta por promesa no documentada; ningún mensaje sugerido inventa condiciones.' },
  { id: 'E12', category: 'coaching_pitch', title: 'Pitch con enlace en el primer mensaje', project: 'dental', temperatura: 'frio', resistencia: 'baja', canal: 'Instagram DM', policy: 'pitch', overrides: { encaje: 'alto', apertura: 'info' }, expect: 'Coaching bajo y alerta por pitch; el prospecto se enfría.' },
];

// Perfiles sin forzar nada, para medir variedad, encaje, aperturas y el tope de 500 tokens.
const COMBOS = [];
for (const temperatura of ['frio', 'tibio', 'caliente']) for (const resistencia of ['baja', 'media', 'alta']) COMBOS.push({ temperatura, resistencia });
export const PROFILE_ONLY = [
  ...COMBOS.map((c, i) => ({ id: `Q${String(i + 1).padStart(2, '0')}`, project: i % 2 ? 'bienestar' : 'dental', ...c, canal: 'WhatsApp' })),
  { id: 'Q10', project: 'dental', temperatura: 'frio', resistencia: 'baja', canal: 'Instagram DM' },
  { id: 'Q11', project: 'bienestar', temperatura: 'caliente', resistencia: 'alta', canal: 'WhatsApp' },
  { id: 'Q12', project: 'dental', temperatura: 'tibio', resistencia: 'media', canal: 'Facebook Messenger' },
];
