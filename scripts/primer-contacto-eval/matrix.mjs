// Matriz de la QUINTA ronda (validación final) de Inbound — Primer contacto:
// los mismos casos de la ronda 4 (C01–C12, Q01–Q04, sin cambios, para
// comparar) más C13 y C14, que prueban las decisiones del 30/10/2026. La
// matriz de la ronda 3 está en el historial de git (39990f2).
//
// Todo es FICTICIO: dos proyectos inventados (sin datos personales reales ni
// secretos comerciales). El alumno simulado es otra llamada a Haiku que
// responde a lo que dice el prospecto según una política; solo conoce lo
// documentado del proyecto y la conversación visible.
//
// Cada caso declara los desenlaces ACEPTABLES (no uno solo) y lo que se
// verifica en él (`verifica`). Lo que no se acepta nunca está en `nunca`.

export const ROUND = 5;

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

const S_E_T = 'preguntas abiertas, una por mensaje, construyendo sobre lo que dice el prospecto; propones una llamada solo cuando entendiste su situación y su motivo';

// Políticas del alumno simulado.
export const POLICIES = {
  competente: 'Eres un setter competente que aplica S.E.T.: una pregunta abierta por mensaje, construyes sobre lo que dice el prospecto, respondes con honestidad lo que te pregunta (si el precio está documentado, lo das; si algo no está documentado, dices con honestidad que lo detalla el equipo en la llamada). Propones una llamada solo cuando entendiste su situación y su motivo. Si te das cuenta de que la oferta no le conviene, lo dices con respeto y cierras sin insistir. Si el prospecto tiene una duda que lo documentado del proyecto responde (por ejemplo, formas de pago o a quién va dirigido), se lo aclaras con ese dato.',
  excelente: 'Eres un setter excelente. En cada mensaje retomas las palabras exactas del prospecto y haces UNA pregunta abierta que profundiza en su situación o en por qué escribió. Si pregunta el precio documentado, lo das completo y claro y sigues con una pregunta pertinente. Propones la llamada solo cuando ya contó su situación y su motivo, conectándola con lo que dijo. Nunca afirmas nada que no esté documentado.',
  cita_temprana: 'Eres un setter apurado: haces UNA sola pregunta genérica y, desde tu segundo mensaje, propones una llamada aunque el prospecto todavía no haya contado su situación ni por qué escribió. Si se resiste, haces una pregunta más y vuelves a proponerla.',
  evasivo_una_vez: 'Eres un setter que la PRIMERA vez que el prospecto pregunta el precio responde "eso lo vemos más adelante" y cambia de tema. Si vuelve a preguntarlo, te das cuenta del error, te disculpas y das el precio documentado con claridad. Después sigues como un setter competente: ' + S_E_T + '.',
  inventa_condiciones: 'Eres un setter que en tu SEGUNDO mensaje afirma, como si fuera parte de la oferta: "solo requiere 3 horas por semana, incluye la gestión de tus anuncios y quedan pocos cupos este mes" (nada de eso está documentado). Fuera de eso: ' + S_E_T + '.',
  precio_aproximado: 'Eres un setter competente. Cuando el prospecto pregunte el precio, respondes con una referencia aproximada y honesta: "ronda los 2 mil dólares, y se puede pagar en cuotas". Fuera de eso: ' + S_E_T + '.',
  precio_incorrecto: 'Eres un setter que se equivoca con el precio: cuando el prospecto lo pregunta, respondes "son 1.500 USD". Fuera de eso: ' + S_E_T + '.',
  vago_precio: 'Eres un setter que nunca dice si hay o no un número: cada vez que el prospecto pregunta el precio, respondes "es una inversión accesible, depende del plan que elijas" y sigues con otra pregunta. Fuera de eso: ' + S_E_T + '.',
  promesa: 'Eres un setter que, en tu SEGUNDO mensaje, afirma que el programa tiene "garantía de resultados en 30 días o te devolvemos el dinero" (no está documentado). Fuera de eso: ' + S_E_T + '.',
  cita_forzada: 'Eres un setter impaciente: desde tu primer mensaje propones una llamada y en cada mensaje insistes en agendarla (día y hora), sin preguntar por su situación ni atender sus objeciones.',
  // Ronda 5 (decisiones del 30/10/2026).
  testimonio_promesa: 'Eres un setter que en tu SEGUNDO mensaje convierte el caso documentado en una promesa para el prospecto: "el sistema está diseñado para que sumes +40 pacientes nuevos en 3 meses". Más adelante, en otro mensaje, citas el mismo caso como lo que es: "el Dr. Luis, un caso documentado, sumó +40 pacientes nuevos en 3 meses". Fuera de eso: ' + S_E_T + '.',
  remision_repetida: 'Eres un setter que NUNCA dice si tiene o no el precio: cada vez que el prospecto pregunta por el precio, un rango o la forma de pago, respondes solo "eso te lo explica Marta en la llamada" (con esas palabras o muy parecidas) y sigues con una pregunta. No inventas planes, cuotas ni financiación. Fuera de eso: ' + S_E_T + '.',
};

export const MAX_TURNS = 7;

// tipo: positivo | negativo | ambiguo. foco: qué F se confirma.
// La apertura de cada caso es la que tuvo en la ronda 4 (la tabla de aperturas
// cambió el 29/10 y, sin fijarla, la semilla elegiría otra). C13 y C14 usan dos
// de las aperturas nuevas.
export const CONVERSATIONS = [
  { id: 'C01', tipo: 'positivo', foco: 'F1 · F5', title: 'Descubrimiento real y alumno excelente', project: 'dental', temperatura: 'tibio', resistencia: 'baja', canal: 'WhatsApp', policy: 'excelente', overrides: { encaje: 'alto', apertura: 'info' }, aceptables: ['cita_aceptada', 'cita_condicionada'], nunca: ['despedida', 'no_califica'], verifica: 'la cita se registra con situación y motivo confirmados por citas reales; aparecen notas altas (9–10) si el mensaje lo merece' },
  { id: 'C02', tipo: 'ambiguo', foco: 'F1', title: 'Cita propuesta con descubrimiento insuficiente', project: 'dental', temperatura: 'frio', resistencia: 'media', canal: 'WhatsApp', policy: 'cita_temprana', overrides: { encaje: 'alto', apertura: 'info' }, aceptables: ['abierta', 'cita_condicionada', 'despedida', 'cita_aceptada'], nunca: [], verifica: 'ninguna cita sin las dos citas verificadas; si se acepta, debe haber evidencia real en los mensajes' },
  { id: 'C03', tipo: 'ambiguo', foco: 'F2', title: 'Duda de pago superable aclarada con las cuotas', project: 'dental', temperatura: 'tibio', resistencia: 'media', canal: 'WhatsApp', policy: 'competente', overrides: { encaje: 'bajo', incompatibilidad: 'superable', motivo_no_encaje: 'cree que no puede pagarlo de una sola vez y no sabe qué formas de pago hay', apertura: 'vi_publicacion' }, aceptables: ['cita_aceptada', 'cita_condicionada', 'no_califica', 'abierta'], nunca: ['despedida'], verifica: 'una paráfrasis legítima del dato de las cuotas habilita la cita; sin ese dato, no' },
  { id: 'C04', tipo: 'ambiguo', foco: 'F2', title: 'Malentendido sobre a quién va dirigido (bienestar)', project: 'bienestar', temperatura: 'caliente', resistencia: 'media', canal: 'WhatsApp', policy: 'competente', overrides: { encaje: 'bajo', incompatibilidad: 'superable', motivo_no_encaje: 'cree que la oferta no es para alguien en su situación, por un malentendido sobre a quién va dirigida', apertura: 'info' }, aceptables: ['cita_aceptada', 'cita_condicionada', 'no_califica', 'abierta'], nunca: ['despedida'], verifica: 'el cambio de opinión se apoya en un dato documentado (nicho o avatar) dicho por el alumno' },
  { id: 'C05', tipo: 'ambiguo', foco: 'F4', title: 'Una evasiva y luego el precio honesto', project: 'dental', temperatura: 'frio', resistencia: 'media', canal: 'WhatsApp', policy: 'evasivo_una_vez', overrides: { encaje: 'alto', apertura: 'precio' }, aceptables: ['cita_aceptada', 'cita_condicionada', 'abierta'], nunca: ['despedida'], verifica: 'la respuesta honesta reinicia el conteo; la conversación sigue' },
  { id: 'C06', tipo: 'negativo', foco: 'F5 · F3', title: 'Condiciones comerciales inventadas (horas, servicios, cupos)', project: 'dental', temperatura: 'tibio', resistencia: 'media', canal: 'WhatsApp', policy: 'inventa_condiciones', overrides: { encaje: 'alto', apertura: 'pregunta_propia' }, aceptables: ['abierta', 'cita_condicionada', 'cita_aceptada', 'despedida'], nunca: [], verifica: 'el turno con las invenciones tiene nota ≤ 3 y alerta; el prospecto no repite ni amplía lo inventado' },
  { id: 'C07', tipo: 'positivo', foco: 'F4', title: 'Precio aproximado honesto («ronda los 2 mil»)', project: 'dental', temperatura: 'caliente', resistencia: 'media', canal: 'WhatsApp', policy: 'precio_aproximado', overrides: { encaje: 'alto', apertura: 'precio' }, aceptables: ['cita_aceptada', 'cita_condicionada', 'abierta'], nunca: ['despedida'], verifica: 'se clasifica como aproximada, no como evasiva ni incorrecta' },
  { id: 'C08', tipo: 'negativo', foco: 'F4 · F5', title: 'Precio incorrecto («son 1.500 USD»)', project: 'dental', temperatura: 'caliente', resistencia: 'media', canal: 'WhatsApp', policy: 'precio_incorrecto', overrides: { encaje: 'alto', apertura: 'precio' }, aceptables: ['cita_aceptada', 'cita_condicionada', 'abierta', 'despedida'], nunca: [], verifica: 'se marca como precio incorrecto (no evasiva) y ese turno tiene nota ≤ 3' },
  { id: 'C09', tipo: 'negativo', foco: 'F4', title: 'Precio no documentado respondido con vaguedades', project: 'bienestar', temperatura: 'frio', resistencia: 'media', canal: 'WhatsApp', policy: 'vago_precio', overrides: { encaje: 'alto', apertura: 'precio' }, aceptables: ['despedida', 'abierta', 'cita_condicionada'], nunca: ['cita_aceptada'], verifica: 'desde la segunda pregunta seguida, «depende del plan» cuenta como evasiva' },
  { id: 'C10', tipo: 'negativo', foco: 'F5', title: 'Garantía inventada', project: 'dental', temperatura: 'tibio', resistencia: 'media', canal: 'WhatsApp', policy: 'promesa', overrides: { encaje: 'alto', apertura: 'como_funciona' }, aceptables: ['abierta', 'cita_condicionada', 'cita_aceptada', 'despedida'], nunca: [], verifica: 'el turno de la garantía tiene nota ≤ 3 y alerta' },
  { id: 'C11', tipo: 'negativo', foco: 'presión', title: 'Cita forzada', project: 'dental', temperatura: 'caliente', resistencia: 'alta', canal: 'WhatsApp', policy: 'cita_forzada', overrides: { encaje: 'alto', apertura: 'quiero_mas_info' }, aceptables: ['despedida', 'abierta'], nunca: ['cita_aceptada'], verifica: 'rechazo ante la presión y despedida al límite de paciencia' },
  { id: 'C12', tipo: 'negativo', foco: 'no califica', title: 'Incompatibilidad definitiva', project: 'dental', temperatura: 'tibio', resistencia: 'media', canal: 'WhatsApp', policy: 'competente', overrides: { encaje: 'bajo', incompatibilidad: 'definitiva', apertura: 'info' }, aceptables: ['no_califica', 'abierta'], nunca: ['cita_aceptada'], verifica: 'nunca hay cita; un cierre respetuoso recibe nota alta' },
  // Ronda 5.
  { id: 'C13', tipo: 'negativo', foco: 'F5 · testimonio', title: 'Testimonio convertido en promesa (y luego citado bien)', project: 'dental', temperatura: 'tibio', resistencia: 'media', canal: 'WhatsApp', policy: 'testimonio_promesa', overrides: { encaje: 'alto', apertura: 'me_interesa' }, aceptables: ['cita_aceptada', 'cita_condicionada', 'abierta', 'despedida'], nunca: [], verifica: 'el turno de la promesa tiene nota ≤ 3 y alerta «testimonio presentado como promesa»; el turno que cita el caso como del Dr. Luis no recibe tope' },
  { id: 'C14', tipo: 'negativo', foco: 'F4 · remisión', title: 'Remisión repetida ante preguntas concretas de precio (no documentado)', project: 'bienestar', temperatura: 'caliente', resistencia: 'media', canal: 'WhatsApp', policy: 'remision_repetida', overrides: { encaje: 'alto', apertura: 'saber_precio' }, aceptables: ['despedida', 'abierta', 'cita_condicionada'], nunca: [], verifica: 'la primera remisión honesta no es evasiva; desde la segunda remisión seguida ante una pregunta concreta (rango, cota, forma de pago) cuenta como evasiva; nunca se registra una cita con el precio pendiente' },
];

// Perfiles sin conversación: que se generen sin precios ni conversiones de
// moneda ahora que el generador no ve el precio (F3), y dentro de 500 tokens.
export const PROFILE_ONLY = [
  { id: 'Q01', project: 'dental', temperatura: 'tibio', resistencia: 'media', canal: 'WhatsApp', overrides: { encaje: 'bajo', incompatibilidad: 'superable', motivo_no_encaje: 'cree que no puede pagarlo de una sola vez y no sabe qué formas de pago hay' } },
  { id: 'Q02', project: 'dental', temperatura: 'caliente', resistencia: 'alta', canal: 'Instagram DM', overrides: { encaje: 'bajo', incompatibilidad: 'superable', motivo_no_encaje: 'cree que no puede pagarlo de una sola vez y no sabe qué formas de pago hay' } },
  { id: 'Q03', project: 'dental', temperatura: 'frio', resistencia: 'baja', canal: 'WhatsApp' },
  { id: 'Q04', project: 'bienestar', temperatura: 'tibio', resistencia: 'media', canal: 'WhatsApp' },
];
