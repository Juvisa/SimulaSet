// Modalidad Inbound — Primer contacto (práctica libre): el prospecto llega
// desde un anuncio, una publicación o un contenido y escribe primero («Info»,
// «Precio»…). Aquí vive lo que es propio de la modalidad y no depende de la
// IA: contexto del proyecto, matriz de temperatura × resistencia, prompt del
// perfil privado, limpieza del perfil y del primer mensaje.
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

const sanitizeList = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : [])
  .map((x) => sanitizeText(x)).filter(Boolean).slice(0, MAX_LIST_ITEMS);

// ─── Proyecto: solo lo documentado ─────────────────────────────────────────
const NOT_DOCUMENTED = 'no documentado';
const field = (v) => clean(v) || NOT_DOCUMENTED;

export const isPriceDocumented = (project) => Boolean(clean(project?.price));

export const buildProjectContext = (project) => {
  const testimonials = Array.isArray(project?.testimonials) && project.testimonials.length
    ? JSON.stringify(project.testimonials) : NOT_DOCUMENTED;
  return `- Experto: ${field(project?.expertName)}
- Nicho: ${field(project?.niche)}
- Promesa de la oferta: ${field(project?.promise)}
- Precio documentado: ${field(project?.price)}
- Negocio o perfil del cliente ideal: ${field(project?.avatarBusiness)}
- Situación actual del cliente ideal: ${field(project?.avatarCurrentSituation)}
- Dolor del cliente ideal: ${field(project?.avatarPain)}
- Deseo del cliente ideal: ${field(project?.avatarDesire)}
- Descripción del avatar: ${field(project?.avatarDescription)}
- Objeciones comunes: ${field(project?.commonObjections)}
- Testimonios documentados: ${testimonials}`;
};

// ─── Temperatura × resistencia ─────────────────────────────────────────────
export const TEMPERATURE_CONTEXT = Object.freeze({
  frio: 'Vio un anuncio o una publicación y no conoce al experto. Escribe por curiosidad; no sabe bien qué ofrece.',
  tibio: 'Sigue al experto o ya vio parte de su contenido. Tiene algo de confianza, pero aún no decidió nada.',
  caliente: 'Declaró interés: ya sabe más o menos qué ofrece el experto y quiere avanzar si le encaja.',
});

export const RESISTANCE_CONTEXT = Object.freeze({
  baja: 'Responde con buena disposición y cuenta cosas si le preguntan bien. Pocas objeciones.',
  media: 'Responde corto al principio y se abre cuando siente que lo entienden. Plantea una o dos dudas reales.',
  alta: 'Es escéptico y paciente solo si ve valor rápido. Plantea objeciones firmes y puede irse si no lo escuchan.',
});

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
export const describeBehavior = (temperatura, resistencia) => ({
  temperatura: pick(TEMPERATURE_CONTEXT, temperatura, 'frio'),
  resistencia: pick(RESISTANCE_CONTEXT, resistencia, 'media'),
  combinacion: (BEHAVIOR_MATRIX[temperatura] || BEHAVIOR_MATRIX.frio)[resistencia] || BEHAVIOR_MATRIX.frio.media,
});

// ─── Perfil privado ────────────────────────────────────────────────────────
// Esquema compacto: debe caber holgado en los 500 tokens de simulator_prospect.
export const buildPrimerContactoProfilePrompt = (project, config) => {
  const b = describeBehavior(config?.temperatura, config?.resistencia);
  return `
Genera el perfil PRIVADO de un prospecto ficticio para una práctica de appointment setting.
Es un personaje 100 % ficticio: no uses nombres de personas reales ni famosos, ni datos de contacto (teléfonos, correos, direcciones, enlaces).

PROYECTO (usa solo esto; si algo dice "no documentado", no lo inventes):
${buildProjectContext(project)}

CONTEXTO DEL PROSPECTO:
- Llega por un anuncio, una publicación o un contenido del experto y escribe primero.
- Canal: ${clean(config?.canal) || 'WhatsApp'}
- Temperatura: ${b.temperatura}
- Resistencia: ${b.resistencia}
- Cómo se comporta: ${b.combinacion}

REGLAS:
- Coherente con el cliente ideal del proyecto, pero con detalles propios (no copies el avatar palabra por palabra).
- "encaje": "alto", "medio" o "bajo". Usa "bajo" en algunos casos: hay prospectos a los que la oferta no les conviene.
- Cada campo de texto en máximo 20 palabras; listas de máximo 3 elementos.
- "apertura_inicial": el primer mensaje que el prospecto escribe, máximo 12 palabras, natural para el canal (ejemplos: "Info", "Precio", "Hola, vi tu publicación y quisiera información", "Hola, ¿cómo funciona?").

RESPONDE SOLO EN JSON (sin markdown):
{
  "nombre": "nombre ficticio",
  "origen": "qué vio y dónde, en una frase",
  "identidad": "quién es y a qué se dedica",
  "situacion": "hechos actuales",
  "emocion": "lo que siente y no dice al principio",
  "motivacion": "por qué escribió hoy",
  "objeciones": ["objeción 1", "objeción 2"],
  "hechos_ocultos": ["solo lo cuenta si le preguntan bien"],
  "encaje": "alto",
  "apertura_inicial": "Info"
}
`;
};

const FIT = ['alto', 'medio', 'bajo'];
const TEXT_FIELDS = ['origen', 'identidad', 'situacion', 'emocion', 'motivacion'];
// Campos sin los que el prospecto no tiene con qué actuar.
export const ESSENTIAL_PROFILE_FIELDS = Object.freeze(['nombre', 'identidad', 'situacion', 'motivacion']);

export const normalizePrimerContactoProfile = (raw) => {
  const p = raw && typeof raw === 'object' ? raw : {};
  const profile = { nombre: sanitizeText(p.nombre, 60) || 'Prospecto' };
  for (const k of TEXT_FIELDS) profile[k] = sanitizeText(p[k]);
  profile.objeciones = sanitizeList(p.objeciones);
  profile.hechos_ocultos = sanitizeList(p.hechos_ocultos);
  profile.encaje = FIT.includes(clean(p.encaje).toLowerCase()) ? clean(p.encaje).toLowerCase() : 'medio';
  profile.apertura_inicial = sanitizeText(p.apertura_inicial, 200);
  profile.campos_faltantes = ESSENTIAL_PROFILE_FIELDS.filter((k) => (k === 'nombre' ? !sanitizeText(p.nombre, 60) : !profile[k]));
  return profile;
};

// ─── Primer mensaje ────────────────────────────────────────────────────────
export const FALLBACK_OPENINGS = Object.freeze({
  frio: Object.freeze(['Info', 'Precio', 'Hola, info por favor', '¿Cuánto cuesta?']),
  tibio: Object.freeze(['Hola, vi tu publicación y quisiera información', 'Hola, ¿cómo funciona?', 'Info del programa, porfa']),
  caliente: Object.freeze(['Hola, quiero más información para empezar', 'Me interesa, ¿cómo funciona?', 'Hola, ¿cuál es el precio y cómo me inscribo?']),
});

const countWords = (text) => text.split(/\s+/).filter(Boolean).length;

// Devuelve el primer mensaje del prospecto: el de la IA si es breve y limpio;
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
