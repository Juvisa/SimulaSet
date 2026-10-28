// Modalidad Inbound — Primer contacto (práctica libre): el prospecto llega
// desde un anuncio, una publicación o un contenido y escribe primero («Info»,
// «Precio»…). Aquí vive lo que es propio de la modalidad y no depende de la
// IA: contexto del proyecto, variedad del prospecto (semillas), matriz de
// temperatura × resistencia, prompt del perfil privado, limpieza del perfil,
// primer mensaje y validaciones de cada turno (eco, estado, puntuación,
// coaching sin datos inventados).
//
// LIMITACIÓN TEMPORAL (aceptada por Digital SET, 2026-10-27): como el resto
// del simulador, el perfil privado se genera y se guarda en el navegador. No
// se muestra en pantalla, pero un alumno con conocimientos técnicos podría
// verlo en las herramientas del navegador. Por eso solo admite personajes
// ficticios y datos no sensibles (ver sanitizeText). La solución definitiva es
// mover la generación del perfil y los prompts al servidor (fase D de
// /api/anthropic), donde el navegador envía datos y no instrucciones.

const MAX_FIELD_CHARS = 280;
const MAX_LIST_ITEMS = 3;
export const OPENING_MAX_WORDS = 12;
export const OPENING_MAX_CHARS = 90;

const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

// Datos de contacto o enlaces no tienen lugar en un personaje ficticio: se
// eliminan aunque la IA los genere.
// Teléfono: 9 dígitos o más, con espacios, guiones o paréntesis, pero sin
// puntos ni comas (así no se borran cifras como «3.000.000» o «1,800»).
const PHONE = /\+?\d[\d\s()-]{7,}\d/g;
const CONTACT_PATTERNS = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/g,          // correos
  /https?:\/\/\S+|www\.\S+/gi,           // enlaces
];
export const sanitizeText = (v, max = MAX_FIELD_CHARS) => {
  let text = clean(v);
  for (const re of CONTACT_PATTERNS) text = text.replace(re, '').replace(/\s+/g, ' ').trim();
  text = text.replace(PHONE, (m) => ((m.match(/\d/g) || []).length >= 9 ? '' : m)).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

// Datos de contacto en una respuesta del prospecto (ronda 3, R12: «Me
// contactas al +56 9 87654321»). Aunque sean inventados, pueden confundirse
// con datos reales: se detectan para pedir la respuesta de nuevo y, si
// persisten, se reemplazan.
export const findContactData = (v) => {
  const text = String(v || '');
  const found = CONTACT_PATTERNS.flatMap((re) => text.match(re) || []);
  for (const m of text.match(PHONE) || []) if ((m.match(/\d/g) || []).length >= 9) found.push(m.trim());
  return found;
};
export const redactContactData = (v) => {
  let text = String(v || '');
  for (const re of CONTACT_PATTERNS) text = text.replace(re, '[dato omitido]');
  return text.replace(PHONE, (m) => ((m.match(/\d/g) || []).length >= 9 ? '[dato omitido]' : m));
};

const sanitizeList = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : [])
  .map((x) => sanitizeText(x)).filter(Boolean).slice(0, MAX_LIST_ITEMS);

// ─── Proyecto: solo lo documentado ─────────────────────────────────────────
const NOT_DOCUMENTED = 'no documentado';
const field = (v) => clean(v) || NOT_DOCUMENTED;

export const isPriceDocumented = (project) => Boolean(clean(project?.price));

// hidePrice: para el prospecto. Un prospecto que llega por un anuncio no sabe
// el precio hasta que se lo dicen; si lo conoce, lo usa antes de tiempo
// (ronda 3, R09: «No tengo dieciocho mil pesos de golpe» antes de que el
// alumno diera el precio, y con una conversión de moneda inventada).
export const buildProjectContext = (project, { hidePrice = false } = {}) => {
  const testimonials = Array.isArray(project?.testimonials) && project.testimonials.length
    ? JSON.stringify(project.testimonials) : NOT_DOCUMENTED;
  const price = hidePrice
    ? '- Precio: no lo conoces; solo sabes lo que el setter te diga'
    : `- Precio documentado: ${field(project?.price)}`;
  return `- Experto: ${field(project?.expertName)}
- Nicho: ${field(project?.niche)}
- Promesa de la oferta: ${field(project?.promise)}
${price}
- Negocio o perfil del cliente ideal: ${field(project?.avatarBusiness)}
- Situación actual del cliente ideal: ${field(project?.avatarCurrentSituation)}
- Dolor del cliente ideal: ${field(project?.avatarPain)}
- Deseo del cliente ideal: ${field(project?.avatarDesire)}
- Descripción del avatar: ${field(project?.avatarDescription)}
- Objeciones comunes: ${field(project?.commonObjections)}
- Testimonios documentados: ${testimonials}`;
};

// Texto comercial documentado del proyecto: lo único con lo que el coaching
// puede afirmar algo sobre la oferta (precio, promesa, testimonios, recursos).
export const documentedOfferText = (project) => [
  project?.expertName, project?.niche, project?.promise, project?.price,
  JSON.stringify(project?.testimonials || []), JSON.stringify(project?.recursos || {}),
].filter(Boolean).join(' ').toLowerCase();

// ─── Temperatura × resistencia ─────────────────────────────────────────────
export const TEMPERATURE_CONTEXT = Object.freeze({
  frio: 'Vio un anuncio o una publicación y no conoce al experto. Escribe por curiosidad; no sabe bien qué ofrece.',
  tibio: 'Sigue al experto o ya vio parte de su contenido. Tiene algo de confianza, pero aún no decidió nada.',
  caliente: 'Declaró interés: ya sabe más o menos qué ofrece el experto y quiere avanzar si le encaja.',
});

// Parámetros observables por resistencia: longitud de los mensajes, cuánto
// revela por pregunta, cuántas evasivas de precio tolera y cuánta paciencia
// tiene con la presión (citas propuestas sin descubrimiento, pitch con
// enlace). Los límites los aplica el código (primerContactoControl.js).
export const RESISTANCE_RULES = Object.freeze({
  baja: Object.freeze({ maxPalabras: 30, revela: 'hasta dos datos por pregunta abierta', evasivas: 3, paciencia: 4, texto: 'Responde con buena disposición y cuenta cosas si le preguntan bien. Pocas objeciones.' }),
  media: Object.freeze({ maxPalabras: 22, revela: 'un dato por pregunta abierta; nada ante preguntas cerradas', evasivas: 3, paciencia: 3, texto: 'Responde corto al principio y se abre cuando siente que lo entienden. Plantea una o dos dudas reales.' }),
  alta: Object.freeze({ maxPalabras: 14, revela: 'un dato solo ante una pregunta abierta y pertinente; en los dos primeros mensajes, casi nada personal', evasivas: 2, paciencia: 2, texto: 'Es escéptico y seco. Plantea objeciones firmes y se va si no lo escuchan.' }),
});
export const RESISTANCE_CONTEXT = Object.freeze(Object.fromEntries(Object.entries(RESISTANCE_RULES).map(([k, v]) => [k, v.texto])));

// Celda concreta de la matriz: lo que hace distinto a cada combinación.
export const BEHAVIOR_MATRIX = Object.freeze({
  frio: Object.freeze({
    baja: 'Curioso y breve; contesta lo que le preguntan aunque no profundiza solo.',
    media: 'Pide el precio pronto y comprueba si es «otro curso más» antes de contar nada.',
    alta: 'Desconfía; trae una objeción fuerte y se va si en dos o tres mensajes no ve valor.',
  }),
  tibio: Object.freeze({
    baja: 'Comparte su situación con preguntas sencillas; agradece que lo orienten.',
    media: 'Tiene una duda concreta (tiempo, dinero o si es para él) que necesita resolver.',
    alta: 'Le interesa, pero una mala experiencia previa pesa y la saca si lo presionan.',
  }),
  caliente: Object.freeze({
    baja: 'Quiere avanzar; aun así necesita entender cuál es el siguiente paso.',
    media: 'Quiere precio y condiciones antes de «perder tiempo» en una llamada.',
    alta: 'Quiere comprar sin llamada o depende de otra persona que lo frena.',
  }),
});

const pick = (table, key, fallback) => table[key] || table[fallback];
export const describeBehavior = (temperatura, resistencia) => {
  const rules = pick(RESISTANCE_RULES, resistencia, 'media');
  return {
    temperatura: pick(TEMPERATURE_CONTEXT, temperatura, 'frio'),
    resistencia: rules.texto,
    combinacion: (BEHAVIOR_MATRIX[temperatura] || BEHAVIOR_MATRIX.frio)[resistencia] || BEHAVIOR_MATRIX.frio.media,
    maxPalabras: rules.maxPalabras,
    revela: rules.revela,
    evasivas: rules.evasivas,
    paciencia: rules.paciencia,
  };
};

// ─── Variedad del prospecto (semillas decididas en el código) ──────────────
// En la primera ronda con Haiku, sin semillas, 21 de 21 perfiles de
// odontología tenían «2 sillones», casi todos se llamaban Martín o Marcelo y
// el encaje salió «alto» en 28 de 28. La variedad y el encaje se deciden aquí.
// En la segunda, con semillas de nombre y ciudad, 15 de 16 seguían con «2
// sillones» (el valor central del avatar «1 a 3»): ahora también se decide la
// forma de trabajo, la posición dentro de los rangos del avatar y un rasgo.
const NAMES = Object.freeze([
  'Lucía Herrera', 'Andrés Molina', 'Camila Duarte', 'Jorge Salinas', 'Valentina Paz', 'Ricardo Ibáñez', 'Fernanda Rojas',
  'Esteban Quiroga', 'Daniela Ortiz', 'Hugo Cárdenas', 'Paola Méndez', 'Sebastián Lara', 'Natalia Fuentes', 'Raúl Benítez',
  'Gabriela Solís', 'Tomás Aguirre', 'Mariana Vidal', 'Iván Correa', 'Adriana Peña', 'Felipe Navarro', 'Rocío Campos',
  'Diego Valencia', 'Carolina Ríos', 'Mauricio Toledo', 'Ximena Barrios', 'Óscar Medina', 'Julieta Ponce', 'Emilio Castro',
]);
const PLACES = Object.freeze([
  'Bogotá', 'Medellín', 'Cali', 'Ciudad de México', 'Guadalajara', 'Monterrey', 'Lima', 'Arequipa', 'Santiago', 'Quito',
  'Guayaquil', 'Buenos Aires', 'Córdoba', 'Rosario', 'Montevideo', 'San José', 'Panamá', 'Santo Domingo', 'Asunción', 'La Paz',
]);
const BUSINESS_STAGES = Object.freeze([
  'empezando hace menos de un año', 'estable desde hace años', 'creciendo pero desordenado', 'estancado hace meses',
  'recuperándose de un mal año', 'en un momento de cambio personal',
]);
const TRIGGERS = Object.freeze([
  'un mes especialmente flojo', 'una conversación con un colega al que le va mejor', 'una meta con fecha cercana',
  'el cansancio acumulado', 'una inversión reciente que quiere recuperar', 'la curiosidad por el contenido que vio',
  'una presión familiar o de un socio', 'una mala experiencia reciente con otra solución',
]);
const WRITING_STYLES = Object.freeze([
  'escribe muy corto y sin saludar', 'escribe informal, con algún emoji', 'escribe formal y educado',
  'escribe rápido, con alguna falta de ortografía leve', 'hace preguntas directas', 'escribe cálido pero cauteloso',
]);
const AGE_RANGES = Object.freeze(['25 a 32', '33 a 40', '41 a 48', '49 a 58']);
const WORK_CONTEXTS = Object.freeze([
  'trabaja por su cuenta, sin equipo', 'tiene una persona que lo ayuda', 'lidera un equipo pequeño',
  'comparte las decisiones con un socio o su pareja', 'tiene horarios rígidos por otro trabajo', 'combina dos actividades',
]);
// Dónde cae el prospecto cuando el cliente ideal da un rango («1 a 3 sillones»,
// «entre el 50 y el 70 %»). Fuera del rango, solo con encaje bajo.
const RANGE_POSITIONS = Object.freeze(['en el extremo bajo', 'en el extremo alto', 'en un valor intermedio que no sea el número central']);
const OUT_OF_RANGE = 'fuera del rango (por debajo o por encima)';
const TRAITS = Object.freeze([
  'es analítico y pide números concretos', 'ya pagó un curso que no terminó', 'tiene poco tiempo por la familia',
  'desconfía de las ventas por chat', 'es entusiasta pero disperso', 'decide rápido cuando algo le cierra',
  'necesita consultarlo con alguien', 'le preocupa sobre todo el tiempo que exige',
]);

// Encaje real del prospecto con la oferta. Algunos no califican, como en la vida real.
export const FIT_WEIGHTS = Object.freeze([['alto', 0.55], ['medio', 0.25], ['bajo', 0.2]]);

// Encaje bajo: el motivo y si es definitivo o superable.
// - definitiva: un HECHO de su vida (no tiene el problema, deja la actividad,
//   no es su nicho, busca otra cosa). Ninguna información lo cambia: nunca
//   acepta la cita.
// - superable: una DUDA o un malentendido que lo documentado del proyecto
//   puede aclarar (formas de pago, a quién va dirigido, qué promete). Puede
//   aceptar si el alumno lo aclara con esa información (lo verifica el código).
export const INCOMPATIBILITY_WEIGHTS = Object.freeze([['definitiva', 0.5], ['superable', 0.5]]);
export const NO_FIT_REASONS = Object.freeze({
  definitiva: Object.freeze([
    'no tiene realmente el problema que resuelve la oferta',
    'está por dejar o cambiar su actividad en poco tiempo',
    'su situación no corresponde al cliente ideal del proyecto',
    'busca algo distinto de lo que ofrece el proyecto',
  ]),
  superable: Object.freeze([
    'cree que la oferta no es para alguien en su situación, por un malentendido sobre a quién va dirigida',
    'duda de que la promesa aplique a su caso porque entendió mal qué ofrece',
  ]),
  // Solo si el proyecto documenta el precio.
  superablePrecio: 'cree que no puede pagarlo de una sola vez y no sabe qué formas de pago hay',
});

// Tipos de apertura por temperatura. Los de texto fijo se usan tal cual.
export const OPENING_TYPES = Object.freeze({
  frio: Object.freeze([
    { tipo: 'info', texto: 'Info', peso: 0.25 }, { tipo: 'precio', texto: 'Precio', peso: 0.25 },
    { tipo: 'como_funciona', texto: 'Hola, ¿cómo funciona?', peso: 0.15 },
    { tipo: 'vi_publicacion', texto: 'Hola, vi tu publicación y quisiera información', peso: 0.15 },
    { tipo: 'pregunta_propia', texto: null, peso: 0.2 },
  ]),
  tibio: Object.freeze([
    { tipo: 'info', texto: 'Info', peso: 0.15 }, { tipo: 'precio', texto: 'Precio', peso: 0.15 },
    { tipo: 'como_funciona', texto: 'Hola, ¿cómo funciona?', peso: 0.15 },
    { tipo: 'vi_publicacion', texto: 'Hola, vi tu publicación y quisiera información', peso: 0.2 },
    { tipo: 'pregunta_propia', texto: null, peso: 0.35 },
  ]),
  caliente: Object.freeze([
    { tipo: 'precio', texto: 'Precio', peso: 0.2 }, { tipo: 'info', texto: 'Info', peso: 0.1 },
    { tipo: 'quiero_mas_info', texto: 'Hola, quiero más información', peso: 0.2 },
    { tipo: 'como_empiezo', texto: 'Hola, ¿cómo hago para empezar?', peso: 0.15 },
    { tipo: 'pregunta_propia', texto: null, peso: 0.35 },
  ]),
});

const weighted = (items, random, weightOf) => {
  const total = items.reduce((a, x) => a + weightOf(x), 0);
  let r = random() * total;
  for (const x of items) { r -= weightOf(x); if (r < 0) return x; }
  return items[items.length - 1];
};
const choice = (list, random) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];

// overrides solo lo usan las pruebas (por ejemplo, forzar encaje bajo); la
// aplicación nunca lo pasa.
export const drawProfileSeeds = (config, random = Math.random, overrides = {}) => {
  const temperatura = config?.temperatura in OPENING_TYPES ? config.temperatura : 'frio';
  const apertura = overrides.apertura
    ? (OPENING_TYPES[temperatura].find((o) => o.tipo === overrides.apertura) || { tipo: overrides.apertura, texto: overrides.apertura })
    : weighted(OPENING_TYPES[temperatura], random, (o) => o.peso);
  const base = {
    nombre: overrides.nombre || choice(NAMES, random),
    edad: overrides.edad || choice(AGE_RANGES, random),
    lugar: overrides.lugar || choice(PLACES, random),
    etapa: overrides.etapa || choice(BUSINESS_STAGES, random),
    disparador: overrides.disparador || choice(TRIGGERS, random),
    estilo: overrides.estilo || choice(WRITING_STYLES, random),
    encaje: overrides.encaje || weighted(FIT_WEIGHTS, random, ([, w]) => w)[0],
  };
  // Las semillas nuevas se sortean DESPUÉS de las anteriores: con el mismo
  // generador, nombre, ciudad, encaje… salen igual que antes.
  const contexto = overrides.contexto || choice(WORK_CONTEXTS, random);
  const posicion_rango = overrides.posicion_rango
    || (base.encaje === 'bajo' && random() < 0.4 ? OUT_OF_RANGE : choice(RANGE_POSITIONS, random));
  const rasgo = overrides.rasgo || choice(TRAITS, random);
  let incompatibilidad = null;
  let motivo_no_encaje = null;
  if (base.encaje === 'bajo') {
    incompatibilidad = overrides.incompatibilidad || weighted(INCOMPATIBILITY_WEIGHTS, random, ([, w]) => w)[0];
    const reasons = incompatibilidad === 'definitiva'
      ? NO_FIT_REASONS.definitiva
      : [...NO_FIT_REASONS.superable, ...(config?.priceDocumented ? [NO_FIT_REASONS.superablePrecio] : [])];
    motivo_no_encaje = overrides.motivo_no_encaje || choice(reasons, random);
  }
  return {
    ...base, contexto, posicion_rango, rasgo, incompatibilidad, motivo_no_encaje,
    apertura: { tipo: apertura.tipo, texto: apertura.texto },
  };
};

// ─── Perfil privado ────────────────────────────────────────────────────────
const FIT_GUIDE = {
  alto: 'La oferta le conviene de verdad: su problema es justo el que el proyecto resuelve.',
  medio: 'Le podría servir, pero hay una duda real (tiempo, dinero, momento o si es para él) que tendría que resolverse.',
  bajo: 'La oferta NO le conviene ahora.',
};
const fitLines = (s) => {
  if (s.encaje !== 'bajo') return '';
  const kind = s.incompatibilidad === 'superable'
    ? 'Es SUPERABLE: es una duda o un malentendido que la información documentada del proyecto podría aclarar.'
    : 'Es DEFINITIVA: es un hecho de su vida, no una duda; ninguna información lo cambia.';
  return `\n- Motivo del no encaje: ${s.motivo_no_encaje}. ${kind}`;
};
const fitFields = (s) => {
  if (s.encaje !== 'bajo') return '';
  const change = s.incompatibilidad === 'superable'
    ? '\n  "que_lo_cambiaria": "el dato documentado del proyecto que aclararía su duda",'
    : '';
  return `\n  "motivo_no_encaje": "el motivo concreto, en sus palabras",${change}`;
};

// Esquema compacto: debe caber holgado en los 500 tokens de simulator_prospect.
export const buildPrimerContactoProfilePrompt = (project, config, seeds) => {
  const s = seeds || drawProfileSeeds(config);
  const b = describeBehavior(config?.temperatura, config?.resistencia);
  const opening = s.apertura?.texto
    ? `"apertura_inicial": exactamente "${s.apertura.texto}".`
    : '"apertura_inicial": una pregunta propia y breve sobre lo que vio (máximo 10 palabras), distinta de "¿funciona?".';
  return `
Genera el perfil PRIVADO de un prospecto ficticio para una práctica de appointment setting.
Es un personaje 100 % ficticio: no uses nombres de personas reales ni famosos, ni datos de contacto (teléfonos, correos, direcciones, enlaces).

PROYECTO (usa solo esto; si algo dice "no documentado", no lo inventes):
${buildProjectContext(project)}

DATOS FIJOS DE ESTE PROSPECTO (respétalos):
- Nombre: ${s.nombre}
- Edad: entre ${s.edad} años
- Ciudad: ${s.lugar}
- Momento: ${s.etapa}
- Por qué escribe hoy: ${s.disparador}
- Forma de escribir: ${s.estilo}
- Cómo trabaja: ${s.contexto || 'a tu criterio'}
- Rasgo personal: ${s.rasgo || 'a tu criterio'}
- Si el cliente ideal da un rango numérico, este prospecto está ${s.posicion_rango || 'en el extremo bajo'}
- Encaje con la oferta: ${s.encaje}. ${FIT_GUIDE[s.encaje] || FIT_GUIDE.medio}${fitLines(s)}

CONTEXTO:
- Llega por un anuncio, una publicación o un contenido del experto y escribe primero.
- Canal: ${clean(config?.canal) || 'WhatsApp'}
- Temperatura: ${b.temperatura}
- Resistencia: ${b.resistencia}
- Cómo se comporta: ${b.combinacion}

REGLAS:
- Coherente con el cliente ideal del proyecto, pero con detalles propios: NO copies las cifras ni las frases del avatar; inventa cifras y circunstancias plausibles y distintas.
- Cada campo de texto en máximo 16 palabras; listas de máximo 3 elementos.
- Todo en español.
- ${opening}

RESPONDE SOLO EN JSON (sin markdown):
{
  "nombre": "${s.nombre}",
  "origen": "qué vio y dónde, en una frase",
  "identidad": "quién es y a qué se dedica",
  "situacion": "hechos actuales",
  "emocion": "lo que siente y no dice al principio",
  "motivacion": "por qué escribió hoy",
  "objeciones": ["objeción 1", "objeción 2"],
  "hechos_ocultos": ["solo lo cuenta si le preguntan bien"],
  "encaje": "${s.encaje}",${fitFields(s)}
  "apertura_inicial": "${s.apertura?.texto || '…'}"
}
`;
};

const FIT = ['alto', 'medio', 'bajo'];
const TEXT_FIELDS = ['origen', 'identidad', 'situacion', 'emocion', 'motivacion'];
// Campos sin los que el prospecto no tiene con qué actuar.
export const ESSENTIAL_PROFILE_FIELDS = Object.freeze(['nombre', 'identidad', 'situacion', 'motivacion']);

// Con semillas, el nombre, el encaje y la apertura fija los decide el código:
// la IA no puede cambiarlos.
export const normalizePrimerContactoProfile = (raw, seeds = null) => {
  const p = raw && typeof raw === 'object' ? raw : {};
  const profile = { nombre: sanitizeText(seeds?.nombre || p.nombre, 60) || 'Prospecto' };
  for (const k of TEXT_FIELDS) profile[k] = sanitizeText(p[k]);
  profile.objeciones = sanitizeList(p.objeciones);
  profile.hechos_ocultos = sanitizeList(p.hechos_ocultos);
  const fit = clean(seeds?.encaje || p.encaje).toLowerCase();
  profile.encaje = FIT.includes(fit) ? fit : 'medio';
  profile.apertura_inicial = sanitizeText(seeds?.apertura?.texto || p.apertura_inicial, 200);
  profile.estilo = sanitizeText(seeds?.estilo || '', 80);
  // Encaje bajo: si es definitivo o superable lo decide el código. Si la IA no
  // escribe el motivo, se usa el de la semilla (el prospecto nunca queda sin
  // razón para no aceptar).
  if (profile.encaje === 'bajo') {
    profile.incompatibilidad = seeds?.incompatibilidad === 'superable' ? 'superable' : 'definitiva';
    profile.motivo_no_encaje = sanitizeText(p.motivo_no_encaje) || sanitizeText(seeds?.motivo_no_encaje || '');
    profile.que_lo_cambiaria = profile.incompatibilidad === 'superable' ? sanitizeText(p.que_lo_cambiaria) : '';
  } else {
    profile.incompatibilidad = null;
    profile.motivo_no_encaje = '';
    profile.que_lo_cambiaria = '';
  }
  profile.campos_faltantes = ESSENTIAL_PROFILE_FIELDS.filter((k) => (k === 'nombre' ? !profile.nombre || profile.nombre === 'Prospecto' : !profile[k]));
  return profile;
};

// ─── Primer mensaje ────────────────────────────────────────────────────────
export const FALLBACK_OPENINGS = Object.freeze({
  frio: Object.freeze(['Info', 'Precio', 'Hola, info por favor', '¿Cuánto cuesta?']),
  tibio: Object.freeze(['Hola, vi tu publicación y quisiera información', 'Hola, ¿cómo funciona?', 'Info del programa, porfa']),
  caliente: Object.freeze(['Hola, quiero más información para empezar', 'Me interesa, ¿cómo funciona?', 'Hola, ¿cuál es el precio y cómo me inscribo?']),
});

const countWords = (text) => text.split(/\s+/).filter(Boolean).length;

// Devuelve el primer mensaje del prospecto: el del perfil si es breve y limpio;
// si no, uno de respaldo acorde a la temperatura.
export const pickOpeningMessage = (candidate, temperatura, random = Math.random) => {
  const text = clean(candidate).replace(/^["'«“]+|["'»”]+$/g, '').trim();
  const valid = text
    && !/[\n\r]/.test(candidate || '')
    && countWords(text) <= OPENING_MAX_WORDS
    && text.length <= OPENING_MAX_CHARS
    && sanitizeText(text, OPENING_MAX_CHARS) === text;
  if (valid) return { text, source: 'perfil' };
  const options = FALLBACK_OPENINGS[temperatura] || FALLBACK_OPENINGS.frio;
  const index = Math.min(options.length - 1, Math.floor(random() * options.length));
  return { text: options[index], source: 'respaldo' };
};

// ─── Validaciones de cada turno ────────────────────────────────────────────
const normalizeForCompare = (s) => clean(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();

// C5: el prospecto repite el mensaje del alumno (igual, o casi igual).
export const isEcho = (prospectText, setterText) => {
  const a = normalizeForCompare(prospectText);
  const b = normalizeForCompare(setterText);
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 20 && longer.includes(shorter)) return true;
  const wa = new Set(a.split(' ')); const wb = new Set(b.split(' '));
  const inter = [...wa].filter((w) => wb.has(w)).length;
  return wa.size >= 5 && inter / new Set([...wa, ...wb]).size >= 0.8;
};

// C4: aceptación de la cita. «si» = acepta la llamada o un horario sin
// condicionarla a una respuesta previa; «condicionada» = «sí, pero antes dime…»;
// «no» = no acepta o no se le propuso. El estado pidio_llamada (mismo
// significado histórico: el lead acepta o pide la llamada) solo se usa con «si».
export const ACCEPTANCE_VALUES = Object.freeze(['si', 'condicionada', 'no']);
export const PRIMER_CONTACTO_STATES = Object.freeze(['abierto', 'interesado', 'resistente', 'pidio_llamada', 'no_califica', 'cerrado']);
export const deriveLeadState = (estado, aceptaCita) => {
  const accept = ACCEPTANCE_VALUES.includes(aceptaCita) ? aceptaCita : 'no';
  if (accept === 'si') return 'pidio_llamada';
  const state = PRIMER_CONTACTO_STATES.includes(estado) ? estado : 'abierto';
  return state === 'pidio_llamada' ? 'interesado' : state;
};

// C3: la puntuación debe ser un entero de 1 a 10. Cualquier otro valor (0,
// 11, vacío, texto) se trata como inválido: no se reemplaza por otro número.
export const validateScore = (value) => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
};

export const normalizeStage = (value) => {
  const m = clean(value).toUpperCase().match(/[SET]/);
  return m ? m[0] : null;
};

// C1: el mensaje sugerido no puede afirmar nada comercial que no esté
// documentado. Se descarta (no se corrige) si una AFIRMACIÓN (no una pregunta)
// contiene una cifra comercial (dinero, %, plazos, horas, resultados) que no
// figura en el proyecto ni se dijo en la conversación, o términos de garantía,
// devolución, bonos o descuentos que el proyecto no menciona.
const COMMERCIAL_TERMS = Object.freeze([
  ['garantia', /garant/i], ['devolucion', /devoluci|reembols/i], ['asegurado', /asegurad|aseguramos/i],
  ['bono', /\bbono/i], ['descuento', /descuento|oferta especial|promoci[oó]n/i], ['certificado', /certificad/i],
  ['cupos', /cupos?\b|plazas? limitad/i],
  // Escasez inventada (ronda 3, R06: «Tenemos pocos espacios disponibles»).
  ['escasez', /pocos (espacios|lugares|turnos)|[uú]ltimos (lugares|espacios)|solo quedan|quedan pocos/i],
]);
// «No hay garantía escrita» (ronda 3, R07) es una respuesta honesta, no una
// promesa: el término no cuenta si una negación lo precede de cerca.
const NEGATED = /\b(no|sin|ning[uú]n[ao]?|tampoco|nunca)\b[^.!?]{0,25}$/i;
const affirms = (sentence, re) => {
  const m = re.exec(sentence);
  return Boolean(m) && !NEGATED.test(sentence.slice(0, m.index));
};
const NUMBER = /\d+(?:[.,]\d+)*/g;
const COMMERCIAL_FIGURE = /(?:[$€]\s*\d+(?:[.,]\d+)*|\d+(?:[.,]\d+)*\s*(?:-\s*\d+\s*)?(?:%|usd|d[oó]lares|pesos|soles|euros|€|horas?|d[ií]as|semanas|meses|a[nñ]os|pacientes|clientes|leads|ventas|citas|sesiones|m[oó]dulos|clases|veces))/gi;
const digitsOf = (s) => (String(s).match(NUMBER) || []).map((n) => n.replace(/[.,]/g, ''));
export const findUndocumentedClaims = (text, project, conversationText = '') => {
  const doc = documentedOfferText(project);
  const known = new Set([...digitsOf(doc), ...digitsOf(conversationText)]);
  const statements = String(text || '').split(/(?<=[.!?\n])\s+/).filter((s) => s && !s.includes('?'));
  const claims = [];
  for (const sentence of statements) {
    for (const fig of sentence.match(COMMERCIAL_FIGURE) || []) {
      if (digitsOf(fig).some((d) => !known.has(d))) claims.push(`cifra «${fig.trim()}»`);
    }
    for (const [name, re] of COMMERCIAL_TERMS) {
      if (affirms(sentence, re) && !re.test(doc)) claims.push(name);
    }
  }
  return [...new Set(claims)];
};

const COACHING_TEXT_FIELDS = ['que_hizo_bien', 'que_mejorar', 'mensaje_alternativo', 'recurso_sugerido', 'alerta'];
const percent = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Math.round(Number(v)))) : undefined);

// Coaching listo para mostrar: puntuación validada (o null), etapa S/E/T,
// textos limpios y sin afirmaciones comerciales inventadas en lo copiable.
export const sanitizeCoaching = (raw, project, conversationText = '') => {
  if (!raw || typeof raw !== 'object') return { coaching: null, issues: ['sin_coaching'] };
  const issues = [];
  const coaching = {};
  for (const k of COACHING_TEXT_FIELDS) coaching[k] = sanitizeText(raw[k], 600);
  coaching.puntuacion_mensaje = validateScore(raw.puntuacion_mensaje);
  if (coaching.puntuacion_mensaje === null) issues.push(`puntuacion_invalida:${JSON.stringify(raw.puntuacion_mensaje)}`);
  coaching.etapa_set = normalizeStage(raw.etapa_set);
  coaching.nivel_fomo = percent(raw.nivel_fomo);
  coaching.probabilidad_cita = percent(raw.probabilidad_cita);
  for (const k of ['mensaje_alternativo', 'recurso_sugerido']) {
    const claims = findUndocumentedClaims(coaching[k], project, conversationText);
    if (claims.length) { issues.push(`${k}_descartado:${claims.join(',')}`); coaching[k] = ''; }
  }
  return { coaching, issues };
};
