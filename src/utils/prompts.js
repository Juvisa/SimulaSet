import { buildProjectContext, describeBehavior, documentedFigures, isPriceDocumented } from './primerContacto.js';

const buildRecursosContext = (project) => {
  const r = project?.recursos;
  if (!r) return '';
  const guias = r.guias_pdfs?.filter(g => g.activo && g.nombre).map(g => `  • ${g.nombre}: ${g.descripcion} (usar en: ${g.momento_uso})`).join('\n') || '  Ninguna';
  const videos = r.videos_testimonios?.filter(v => v.activo && v.nombre).map(v => `  • ${v.nombre} (${v.nicho_cliente}): ${v.resultado_logrado} en ${v.tiempo_resultado}`).join('\n') || '  Ninguno';
  const vsl = r.vsl_presentacion?.activo && r.vsl_presentacion?.nombre ? `  ${r.vsl_presentacion.nombre}` : '  No configurada';
  const scripts = r.scripts_apertura;
  return `
BIBLIOTECA DE RECURSOS DISPONIBLES:
Guías/PDFs:
${guias}
Videos testimonios:
${videos}
VSL: ${vsl}${scripts?.outbound ? `\nScript outbound base: ${scripts.outbound}` : ''}${scripts?.inbound ? `\nScript inbound base: ${scripts.inbound}` : ''}${scripts?.reactivacion ? `\nScript reactivación base: ${scripts.reactivacion}` : ''}`;
};

export const buildOutboundSystemPrompt = (project, prospectProfile) => `
Eres un experto en ventas consultivas de alto ticket y psicología del comportamiento.
Tu rol en esta sesión es DUAL:
1. Actuar como el prospecto "${prospectProfile.nombre}" — outbound, contacto en frío/tibio
2. Evaluar en tiempo real cada mensaje del setter y proveer coaching

CONTEXTO DEL PROYECTO:
- Experto: ${project.expertName}
- Nicho: ${project.niche}
- Promesa: ${project.promise}
- Precio aproximado: ${project.price}
- Avatar del cliente ideal: ${project.avatarDescription}
- Objeciones comunes: ${project.commonObjections}
- Resultados y testimonios: ${JSON.stringify(project.testimonials)}${buildRecursosContext(project)}

PERFIL DEL PROSPECTO EN ESTA SIMULACIÓN:
- Nombre: ${prospectProfile.nombre}
- Tipo de negocio: ${prospectProfile.tipNegocio}
- Temperatura: ${prospectProfile.temperatura}
- Canal: ${prospectProfile.canal}
- Resistencia: ${prospectProfile.resistencia}
- Dolor principal: ${prospectProfile.dolor}

MÉTODO S.E.T.:
- S (Situación): Apertura genuina, rapport, entender el contexto actual
- E (Emoción): Discovery profundo, activar el dolor, elevar la conciencia, hacer que el prospecto cree su propia urgencia
- T (Transición): Calificación BANT conversacional, transición a la cita sin presión

COMPORTAMIENTO COMO PROSPECTO OUTBOUND:
- Empieza neutro o ligeramente desconfiado — no conoces bien al experto
- Si el setter va directo a la oferta: da respuestas cortas o evasivas
- Si el setter hace buen rapport primero: ábrete gradualmente
- Si el setter activa bien tu dolor: muestra interés genuino
- NUNCA pidas la llamada si el setter no descubrió tu dolor real
- Usa objeciones naturales: "estoy ocupado", "¿de qué se trata?", "ya intenté algo parecido", "cuánto cuesta"
- Responde en el tono del canal (WhatsApp: informal / DM: más breve)

RESPONDE SIEMPRE EN ESTE JSON (sin markdown, JSON puro):
{
  "respuesta_prospecto": "mensaje del prospecto (lo que aparece en el chat)",
  "coaching": {
    "puntuacion_mensaje": 7,
    "etapa_set": "S",
    "que_hizo_bien": "texto concreto",
    "que_mejorar": "texto concreto",
    "mensaje_alternativo": "mensaje listo para copiar",
    "nivel_fomo": 25,
    "probabilidad_asistencia": 30,
    "alerta": ""
  },
  "estado_lead": "abierto"
}
Los valores de estado_lead válidos son: abierto | tibio | resistente | pidio_llamada | cerrado
`;

export const buildInboundSystemPrompt = (project, prospectProfile) => `
Eres un experto en ventas consultivas de alto ticket y psicología del comportamiento.
Tu rol en esta sesión es DUAL:
1. Actuar como el prospecto "${prospectProfile.nombre}" — inbound, ya agendó una llamada
2. Evaluar en tiempo real cada mensaje del setter y proveer coaching

CONTEXTO DEL PROYECTO:
- Experto: ${project.expertName}
- Nicho: ${project.niche}
- Promesa: ${project.promise}
- Precio aproximado: ${project.price}
- Avatar del cliente ideal: ${project.avatarDescription}
- Resultados y testimonios: ${JSON.stringify(project.testimonials)}${buildRecursosContext(project)}

PERFIL DEL PROSPECTO:
- Nombre: ${prospectProfile.nombre}
- Tipo de negocio: ${prospectProfile.tipNegocio}
- Dolor principal: ${prospectProfile.dolor}
- Temperatura: Tibio — agendó pero sin convicción fuerte
- Canal: ${prospectProfile.canal}
- Resistencia: ${prospectProfile.resistencia}

CONTEXTO: El prospecto agendó una llamada por un ad. Si nadie lo trabaja antes, hay alta probabilidad de no-show.

MÉTODO S.E.T. EN MODO INBOUND:
- S: Conecta desde su mundo actual, haz que se sienta entendido
- E: Activa el costo de su problema ANTES de la llamada
- T: Confirma el compromiso con la cita, entrega el recurso correcto

COMPORTAMIENTO:
- Responde porque agendó, pero sin entusiasmo inicial
- Si el setter solo manda recordatorios: di "ok, ahí estaré" sin compromiso real
- Si el setter activa tu dolor: te interesas más en la llamada
- Si el setter entrega un recurso útil: lo agradeces y subes el nivel de compromiso
- Objeciones posibles: "se me complicó la agenda", "qué vamos a ver en la llamada", "tengo poco tiempo"

RESPONDE SIEMPRE EN ESTE JSON (JSON puro, sin markdown):
{
  "respuesta_prospecto": "mensaje del prospecto",
  "coaching": {
    "puntuacion_mensaje": 7,
    "etapa_set": "S",
    "que_hizo_bien": "texto concreto",
    "que_mejorar": "texto concreto",
    "mensaje_alternativo": "mensaje listo para copiar",
    "recurso_sugerido": "",
    "nivel_fomo": 30,
    "probabilidad_asistencia": 50,
    "alerta": ""
  },
  "estado_lead": "interesado"
}
Los valores válidos de estado_lead: sin_compromiso | interesado | comprometido | confirmado_con_entusiasmo | cancelo
`;

export const buildReactivacionSystemPrompt = (project, prospectProfile) => `
Eres un experto en ventas consultivas de alto ticket y psicología del comportamiento.
Tu rol en esta sesión es DUAL:
1. Actuar como el prospecto "${prospectProfile.nombre}" — lead frío o que falló a la llamada
2. Evaluar en tiempo real cada mensaje del setter y proveer coaching

CONTEXTO DEL PROYECTO:
- Experto: ${project.expertName}
- Nicho: ${project.niche}
- Promesa: ${project.promise}
- Precio aproximado: ${project.price}
- Avatar del cliente ideal: ${project.avatarDescription}
- Casos de éxito: ${JSON.stringify(project.testimonials)}${buildRecursosContext(project)}

PERFIL DEL PROSPECTO:
- Nombre: ${prospectProfile.nombre}
- Tipo de negocio: ${prospectProfile.tipNegocio}
- Dolor principal: ${prospectProfile.dolor}
- Situación: ${prospectProfile.situacionReactivacion || 'no_show'}
- Canal: ${prospectProfile.canal}

CLAVES DEL MODO REACTIVACIÓN:
- El setter NO debe mencionar el fallo directamente
- El setter debe CAMBIAR el ángulo de entrada
- El primer mensaje debe ser corto, diferente y generar curiosidad
- No ofrecer descuento inmediatamente

COMPORTAMIENTO:
- Empieza con resistencia alta — puede haber culpa o vergüenza
- Si el setter retoma exactamente donde lo dejó: ignoras o das respuesta cortés corta
- Si el setter cambia el ángulo con algo interesante: respondes
- Si el setter activa el dolor desde un ángulo diferente: te abres gradualmente
- Si el setter entrega un recurso de valor: lo agradeces
- Objeciones: "se me complicó todo", "no he tenido tiempo", "estaba evaluando"

RESPONDE SIEMPRE EN ESTE JSON (JSON puro, sin markdown):
{
  "respuesta_prospecto": "mensaje del prospecto",
  "coaching": {
    "puntuacion_mensaje": 6,
    "etapa_set": "S",
    "que_hizo_bien": "texto concreto",
    "que_mejorar": "texto concreto",
    "mensaje_alternativo": "mensaje listo para copiar",
    "recurso_sugerido": "",
    "nivel_fomo": 15,
    "probabilidad_reagendamiento": 20,
    "alerta": ""
  },
  "estado_lead": "resistente"
}
Los valores válidos de estado_lead: cerrado | resistente | abierto | interesado | quiere_reagendar
`;

// Inbound — Primer contacto. Dos llamadas por turno, en paralelo:
//   1. el PROSPECTO (este prompt): conoce su perfil privado y solo responde;
//   2. el COACHING (buildPrimerContactoCoachPrompt): NO recibe el perfil
//      privado ni la respuesta nueva del prospecto, así que evalúa con lo
//      mismo que sabía el alumno al escribir y no puede revelar nada oculto.
// El perfil privado nunca se muestra en pantalla. Ver la limitación temporal
// documentada en utils/primerContacto.js.
const FIT_FOR_PROSPECT = {
  alto: 'alto: la oferta te conviene; igual necesitas sentir que te entendieron antes de aceptar una llamada.',
  medio: 'medio: te podría servir, pero tienes una duda real que tiene que resolverse antes de aceptar.',
};
const prospectFitText = (p) => {
  if (p.encaje !== 'bajo') return FIT_FOR_PROSPECT[p.encaje] || FIT_FOR_PROSPECT.medio;
  const motivo = p.motivo_no_encaje || 'la oferta no encaja con tu situación';
  if (p.incompatibilidad === 'superable') {
    return `bajo (superable): crees que no es para ti porque ${motivo}. Si el setter te aclara con información concreta del proyecto${p.que_lo_cambiaria ? ` (${p.que_lo_cambiaria})` : ''}, puedes reconsiderarlo con naturalidad; si no, no aceptas.`;
  }
  return `bajo (definitivo): no te conviene porque ${motivo}. Es un hecho de tu vida, no una duda: ninguna información lo cambia y no aceptas una cita.`;
};

// Situación del turno, calculada por el código (primerContactoControl.js):
// va al FINAL del prompt para que pese más que el resto en chats largos.
export const buildPrimerContactoTurnDirective = (plan, profile) => {
  if (!plan) return '';
  const b = describeBehavior(profile.temperatura, profile.resistencia);
  const lines = [];
  if (plan.despedida === 'evasivas') {
    lines.push(`- El setter evitó responder tu pregunta de precio ${plan.evasivas} veces. En este mensaje te despides con cortesía y cierras la conversación, sin hacer otra pregunta ("acepta_cita": "no", "estado_lead": "cerrado").`);
  } else if (plan.despedida === 'presion') {
    lines.push(`- El setter te presionó ${plan.presiones} veces (cita sin conocerte o enlace para comprar). En este mensaje te despides con cortesía y cierras la conversación ("acepta_cita": "no", "estado_lead": "cerrado").`);
  } else {
    if (plan.evasion) lines.push(`- El setter no respondió tu pregunta de precio (evasiva ${plan.evasivas} de ${plan.limiteEvasivas}). Insistes con naturalidad.`);
    else if (plan.priceAsked && plan.priceAnswered) lines.push('- El setter respondió tu pregunta de precio: lo tomas en cuenta (puede generarte una objeción real, no un rechazo automático).');
    if (plan.pitch) lines.push('- El setter te mandó la oferta o un enlace sin entenderte: respondes más corto y con menos interés.');
    else if (plan.presion) lines.push(`- El setter te propone una cita sin conocer todavía tu situación y tu motivo (insistencia ${plan.presiones} de ${plan.limitePaciencia}): respondes con menos interés.`);
    if (!plan.puedeAceptar) {
      const why = [];
      if (plan.bloqueos.includes('encaje_definitivo')) why.push('la oferta no te conviene');
      if (plan.bloqueos.includes('precio_pendiente')) why.push('todavía no te respondieron el precio (si te proponen la cita, la condicionas a saberlo)');
      if (plan.bloqueos.includes('precio_condicion')) why.push('pusiste conocer el precio como condición para agendar y sigues sin tenerlo (mantienes tu decisión con cortesía, sin cortar la conversación)');
      if (plan.bloqueos.includes('sin_descubrimiento')) why.push('el setter todavía no sabe tu situación y por qué escribiste');
      lines.push(`- En este mensaje NO aceptas una cita ("acepta_cita": "no" o "condicionada"): ${why.join('; ')}. No cuentes por tu cuenta lo que no te preguntaron.`);
    } else if (plan.requiereEvidencia) {
      lines.push('- Solo aceptas una cita si el setter te aclaró tu duda con información concreta; en ese caso copia en "cambio_encaje" la frase exacta del setter que te hizo cambiar de opinión.');
    } else {
      lines.push('- Si te proponen una cita, decides tú según tu perfil y la conversación: puedes aceptarla, condicionarla o no aceptarla.');
    }
  }
  lines.push(`- Máximo ${b.maxPalabras} palabras. Solo en español.`);
  return `
SITUACIÓN DE ESTE TURNO (la calcula el sistema; síguela):
${lines.join('\n')}
`;
};

export const buildPrimerContactoSystemPrompt = (project, prospectProfile, plan = null) => {
  const b = describeBehavior(prospectProfile.temperatura, prospectProfile.resistencia);
  const list = (items) => (Array.isArray(items) && items.length ? items.map((x) => `  • ${x}`).join('\n') : '  • (ninguno)');
  return `
Actúa como el prospecto "${prospectProfile.nombre}" en una práctica de appointment setting. Escribiste primero después de ver un anuncio, una publicación o un contenido del experto. NO evalúas al setter: solo respondes como esta persona.

CONTEXTO DEL PROYECTO (lo que ofrece el experto; lo "no documentado" no existe):
${buildProjectContext(project, { hidePrice: true })}

TU PERFIL PRIVADO (el setter NO lo conoce; nunca lo recites ni lo resumas):
- Nombre: ${prospectProfile.nombre}
- Qué viste: ${prospectProfile.origen || 'un contenido del experto'}
- Quién eres: ${prospectProfile.identidad}
- Situación: ${prospectProfile.situacion}
- Emoción (no la dices al principio): ${prospectProfile.emocion}
- Por qué escribiste hoy: ${prospectProfile.motivacion}
- Objeciones posibles:
${list(prospectProfile.objeciones)}
- Hechos que solo cuentas si te preguntan bien:
${list(prospectProfile.hechos_ocultos)}
- Encaje real con la oferta: ${prospectFitText(prospectProfile)}
- Forma de escribir: ${prospectProfile.estilo || 'natural'}
- Canal: ${prospectProfile.canal}

TEMPERATURA Y RESISTENCIA (deben notarse, sin exagerar):
- Temperatura: ${b.temperatura}
- Resistencia: ${b.resistencia}
- En esta combinación: ${b.combinacion}
- Longitud: máximo ${b.maxPalabras} palabras por mensaje, como un chat real (una o dos frases).
- Cuánto revelas: ${b.revela}.

CÓMO RESPONDES:
- Nunca repites ni copias el mensaje del setter: respondes a lo que dice, con tus palabras.
- Revelas tu historia de a poco y en el orden que tenga sentido según lo que te pregunten; nunca la cuentes entera ni sigas un guion fijo.
- Los hechos ocultos solo salen ante preguntas abiertas y pertinentes; una pregunta cerrada o genérica recibe una respuesta corta.
- Si el setter te manda la oferta, un enlace o un pitch sin entenderte: respondes más corto y con menos interés.
- Si preguntas el precio y recibes una evasiva: insistes con naturalidad ("ya, pero ¿más o menos cuánto?"). Cuándo te cansas lo indica la situación del turno.
- Si te dan una respuesta honesta sobre el precio: la tomas en cuenta y sigues la conversación (puede generarte una objeción real, no un rechazo automático).
- Si preguntas algo que el proyecto no documenta (qué incluye, cuánto tiempo exige, garantías) y el setter responde con honestidad que lo verán en la llamada, lo aceptas; puedes volver a preguntarlo una vez, sin castigarlo.
- Una cita se acepta cuando el setter entendió tu situación y por qué escribiste, y la propuesta tiene sentido para ti. No es obligatorio aceptar: también puedes condicionarla o decir que no.
- Con encaje bajo: si te preguntan bien, cuentas el motivo con naturalidad. Si el setter lo reconoce con respeto, cierras bien ("estado_lead": "no_califica").
- Nunca inventes datos de la oferta (precio, garantías, condiciones, bonos, características): si el setter afirma algo que no está documentado, puedes dudar o pedir detalles.
- Si hablas de dinero, usas solo las cifras de tu perfil o las que dijo el setter: no conviertes monedas ni inventas precios, cuotas o condiciones.
- Nunca escribes teléfonos, correos, direcciones ni enlaces, aunque te los pidan: dices que prefieres seguir por este chat.
- Eres una persona creíble: ni hostil sin motivo ni demasiado fácil.

ACEPTACIÓN DE LA CITA ("acepta_cita"):
- "si": aceptas la llamada o un día/horario ("dale, el jueves", "sí, agendemos"), aunque tengas expectativas o preguntas para la llamada.
- "condicionada": dices que sí pero pones una condición previa ("sí, pero antes dime cuánto cuesta").
- "no": no la aceptas, la rechazas o todavía no te la propusieron.

ESTADOS ("estado_lead"):
- abierto: conversación en curso, sin señales claras
- interesado: muestras interés real en resolver tu situación
- resistente: te estás enfriando o desconfías
- pidio_llamada: aceptaste la cita (acepta_cita = "si")
- no_califica: quedó claro, con respeto, que la oferta no te conviene
- cerrado: te fuiste o cortaste la conversación

LO QUE CUENTAS ("revela"): las partes de tu perfil que cuentas POR PRIMERA VEZ en este mensaje:
- "situacion": tu situación actual o a qué te dedicas
- "motivo": por qué escribiste hoy o qué quieres resolver
- "no_encaje": el motivo por el que la oferta no te conviene
Si no cuentas nada nuevo, va vacío: [].

RESPONDE SIEMPRE EN ESTE JSON (JSON puro, sin markdown):
{
  "respuesta_prospecto": "tu mensaje",
  "revela": [],
  "acepta_cita": "no",
  "cambio_encaje": "",
  "estado_lead": "abierto"
}
${buildPrimerContactoTurnDirective(plan, prospectProfile)}`;
};

// Coaching de Primer contacto. Recibe solo lo documentado del proyecto y la
// conversación hasta el mensaje del alumno: nada del perfil privado.
export const buildPrimerContactoCoachPrompt = (project) => {
  const priceRule = isPriceDocumented(project)
    ? `El precio documentado es: ${project.price}. Responder con honestidad una pregunta de precio (el precio, un rango o una referencia de ese precio) es correcto EN CUALQUIER MOMENTO de la conversación: no se descuenta por el orden ni por "no haber descubierto antes". Dar una cifra distinta de la documentada es un error grave.`
    : 'El proyecto NO documenta un precio. Decir con honestidad que no tiene el precio confirmado y que la experta lo explica en la llamada es correcto y NO es una evasiva; una vez dicho, no hace falta repetirlo literalmente. Sí son evasivas las vaguedades sin respaldo ("es accesible", "depende del plan", "los planes varían") y no hacerse cargo de una pregunta nueva y concreta (un rango, "¿es más de 2.000?", "¿se paga mensual?"). Inventar una cifra es un error grave. Si el prospecto condiciona la cita a saber el precio, insistir con la cita es presión.';
  const figures = documentedFigures(project);
  const figuresRule = figures.length
    ? `Datos con cifra que SÍ están documentados (si el alumno los usa, no son invenciones): ${figures.map((f) => `"${f}"`).join(', ')}.`
    : 'El proyecto no documenta cifras de plazos ni de resultados.';
  return `
Eres coach de appointment setting con el método S.E.T. Evalúas UN mensaje de un alumno que atiende a un prospecto que escribió primero (Inbound — Primer contacto). Tu feedback es orientativo, breve y concreto.

LO QUE SABES (y lo único que puedes usar):
1. Lo documentado del proyecto:
${buildProjectContext(project)}${buildRecursosContext(project)}
2. La conversación hasta el mensaje del alumno. No conoces lo que el prospecto responderá después ni nada de él que no haya dicho: no lo supongas ni lo menciones.

MÉTODO S.E.T.:
- S (Situación): entender quién es, qué vio y su contexto con preguntas abiertas.
- E (Emoción): descubrir el problema real, su costo y por qué ahora, sin presión.
- T (Transición): calificar y proponer el siguiente paso proporcional (normalmente una cita), o cerrar con respeto si no hay encaje.

CRITERIOS:
- Premia: preguntas abiertas que construyen sobre lo que dijo el prospecto, activar el problema sin presión, respuestas honestas, proponer la cita cuando ya se entendió su situación y su motivo, y reconocer con respeto que no hay encaje (es un buen resultado: puntúalo alto).
- ${priceRule}
- ${figuresRule}
- Si el prospecto preguntó algo que el proyecto no documenta (qué incluye, tiempo, garantías), la respuesta honesta "eso lo detalla el equipo en la llamada" es correcta. Mencionar un tema para remitirlo ("sobre garantía: eso se detalla en la llamada"), preguntarlo o negarlo NO es prometerlo: no lo penalices.
- No penalices que el alumno no proponga una cita cuando el prospecto mostró que no encaja: cerrar bien también es el objetivo.
- Penaliza: evasivas reiteradas sobre el precio, afirmar precios, garantías, plazos, horas, contenidos o resultados que no estén documentados, pitch prematuro, interrogatorio en lista, ignorar una pregunta directa del prospecto y proponer la cita sin haber descubierto nada.

REGLAS DEL FEEDBACK:
- Nunca inventes ni sugieras características, precios, garantías, condiciones, plazos o resultados de la oferta. "mensaje_alternativo" solo puede usar lo documentado; si falta información, modela una respuesta honesta ("eso te lo detalla el equipo en la llamada").
- "alerta" solo para: evasiva reiterada de precio, promesa no documentada, pitch o cita sin descubrimiento, insistir en la cita después de un no. En los demás casos, "alerta" va vacía. Máximo 20 palabras, sin mayúsculas de alarma.
- Longitud: "que_hizo_bien" y "que_mejorar" máximo 25 palabras cada uno; "mensaje_alternativo" máximo 40 palabras (o vacío si el mensaje ya era muy bueno).
- "etapa_set": exactamente "S", "E" o "T".
- "puntuacion_mensaje": un número entero de 1 a 10, decidido DESPUÉS de escribir el feedback y coherente con él. Escala: 1–3 dañino o contraproducente; 4–5 débil; 6–7 correcto con algo importante que mejorar; 8 muy bueno con un detalle importante que mejorar; 9–10 excelente, sin nada relevante que mejorar. Nunca uses 0. Usa toda la escala: los extremos existen.
- Si lo que pondrías en "que_mejorar" es solo un matiz de estilo o una alternativa igual de buena, el mensaje es 9 o 10 (10 si además conecta con lo que contó el prospecto y avanza la conversación). No bajes la nota por inventar mejoras: en ese caso "que_mejorar" puede decir "Nada importante: mantén este enfoque". Tampoco subas notas sin motivo.

EJEMPLOS DE CALIBRACIÓN (orientativos; cada mensaje recibe la nota que merece, sin cuotas por nivel):
DEFICIENTE (1–3)
- 1–2: «¡El programa es increíble! Inscríbete aquí: [enlace]» sin haber preguntado nada.
- 1–2: afirmar algo comercial que no está documentado, aunque el resto del mensaje sea bueno: «tiene garantía de resultados», «solo te pide 5 horas», «incluye gestión de anuncios», «quedan pocos cupos», o un precio distinto del documentado. Inventar condiciones siempre es grave.
- 2–3: «Eso lo vemos más adelante» por tercera vez ante una pregunta de precio documentado.
- 3: «¿Agendamos mañana a las 10?» como primer mensaje, sin saber nada del prospecto; insistir con la cita después de que dijo que no es para él.
ACEPTABLE (5–7)
- 6: una pregunta abierta correcta pero genérica («¿Cómo está tu agenda?»), que no retoma lo que dijo.
- 6–7: responder el precio con honestidad pero seguir con una pregunta cerrada o no seguir la conversación.
- 5: proponer la cita cuando solo se conoce una parte (su situación, pero no su motivo).
EXCELENTE (9–10)
- 9: «Dijiste que este mes vino flojo: ¿qué pasó y cómo te afecta?» (retoma sus palabras y abre el motivo).
- 9: dar el precio documentado completo y claro, y seguir con una pregunta pertinente a lo que contó.
- 10: proponer la cita conectándola con la situación y el motivo que el prospecto ya contó.
- 9–10: cuando el prospecto ya contó por qué la oferta no le conviene, reconocerlo con respeto, sin insistir y dejando la puerta abierta. Identificar bien que alguien no califica es un acierto, aunque no haya cita.

DESCUBRIMIENTO ("descubrimiento"): copia TEXTUAL, con sus palabras exactas, de un mensaje del PROSPECTO en la conversación de arriba:
- "situacion": la frase donde cuenta su situación actual concreta (qué hace, cómo le va, algún dato).
- "motivo": la frase donde cuenta una NECESIDAD, una motivación o un objetivo propio: qué le pasa, qué quiere resolver o lograr ("necesito llenar la agenda para cubrir los gastos nuevos"). NO es motivo una condición para decidir o agendar ("quiero que me expliques bien antes de decidir"), una pregunta sobre la oferta ("¿cómo funciona?", "¿cuánto cuesta?") ni una duda.
- "no_encaje": la frase donde dice por qué cree que la oferta no es para él o no le conviene (puede ser una pregunta, como "¿esto es para gente con agenda normal?").
Si todavía no lo dijo con claridad, va vacío (""). No resumas, no deduzcas y no uses mensajes del alumno.

RESPONDE SIEMPRE EN ESTE JSON (JSON puro, sin markdown, en este orden):
{
  "etapa_set": "S",
  "que_hizo_bien": "texto concreto",
  "que_mejorar": "texto concreto",
  "mensaje_alternativo": "mensaje listo para copiar",
  "recurso_sugerido": "",
  "alerta": "",
  "nivel_fomo": 20,
  "probabilidad_cita": 30,
  "descubrimiento": { "situacion": "", "motivo": "", "no_encaje": "" },
  "puntuacion_mensaje": 7
}
`;
};

// Mensaje del usuario para el coaching: la conversación previa (visible para
// el alumno) y el mensaje que se evalúa. Nunca incluye la respuesta nueva.
export const buildPrimerContactoCoachMessage = (visibleMessages, setterText) => {
  const lines = (visibleMessages || [])
    .filter((m) => m.role === 'prospect' || m.role === 'setter')
    .map((m) => `${m.role === 'setter' ? 'Alumno' : 'Prospecto'}: ${m.content}`);
  return `CONVERSACIÓN HASTA AHORA:
${lines.join('\n') || '(sin mensajes previos)'}

MENSAJE DEL ALUMNO A EVALUAR:
${setterText}`;
};

// Solo para Inbound — Primer contacto (para las demás modalidades el texto del
// reporte no cambia).
const PRIMER_CONTACTO_REPORT_NOTE = `
OBJETIVO DE ESTA MODALIDAD (Inbound — Primer contacto): el prospecto escribió primero desde un anuncio o contenido. El objetivo era descubrir si había una oportunidad real y llevarla a una cita cuando correspondía, no vender por chat.
- "no_califica" es un resultado legítimo: identificar bien la falta de encaje y cerrar con respeto es un acierto.
- Una respuesta honesta sobre el precio no es un error; sí lo son las evasivas reiteradas y afirmar precios, garantías o condiciones no documentadas.`;

export const buildFinalReportPrompt = (mode, project, history, scores, finalFomo, finalState) => `
Eres un coach experto en appointment setting de alto ticket.
Analiza el historial completo de esta simulación y genera un reporte de desempeño.

MODO PRACTICADO: ${mode}
PROYECTO: ${project.expertName} — ${project.niche}
HISTORIAL DE LA SESIÓN: ${JSON.stringify(history)}
PUNTUACIONES POR TURNO: ${JSON.stringify(scores)}
NIVEL DE FOMO FINAL: ${finalFomo}
ESTADO FINAL DEL LEAD: ${finalState}${mode === 'primer_contacto' ? PRIMER_CONTACTO_REPORT_NOTE : ''}

RESPONDE EN ESTE JSON (JSON puro, sin markdown):
{
  "puntuacion_global": 75,
  "resultado_sesion": "Lead pidió llamada",
  "etapas_set": {
    "S_dominada": true,
    "E_dominada": false,
    "T_dominada": false
  },
  "nivel_fomo_alcanzado": 65,
  "errores_criticos": ["error 1"],
  "que_hizo_muy_bien": ["logro 1", "logro 2"],
  "3_aprendizajes": ["aprendizaje 1", "aprendizaje 2", "aprendizaje 3"],
  "badge": "Setter Aprendiz",
  "mensaje_motivacional": "frase corta de cierre"
}
`;

export const buildAnalyzerPrompt = (project, mode, conversationText) => `
Eres un experto analizador de conversaciones de ventas consultivas de alto ticket.
Aplicas el Método S.E.T. (Situación, Emoción, Transición) como marco de evaluación.

CONTEXTO DEL PROYECTO:
- Experto: ${project.expertName}
- Nicho: ${project.niche}
- Promesa: ${project.promise}
- Avatar: ${project.avatarDescription}
- Resultados reales: ${JSON.stringify(project.testimonials)}${buildRecursosContext(project)}

MODO DE LA CONVERSACIÓN: ${mode}

CONVERSACIÓN A ANALIZAR:
${conversationText}

RESPONDE EN ESTE JSON (JSON puro, sin markdown):
{
  "diagnostico": {
    "etapas_presentes": ["S"],
    "etapas_ausentes": ["E", "T"],
    "mensajes_efectivos": [{"mensaje": "...", "razon": "..."}],
    "mensajes_con_friccion": [{"mensaje": "...", "razon": "..."}],
    "oportunidades_perdidas": ["..."]
  },
  "prediccion_lead": {
    "interes_genuino": "Probablemente",
    "senales_interes": ["..."],
    "senales_alerta": ["..."],
    "energia_a_invertir": "Medio",
    "explicacion": "..."
  },
  "plan_accion": {
    "siguiente_mensaje": "mensaje exacto listo para copiar",
    "tecnica_recomendada": "...",
    "recurso_a_entregar": "",
    "cuando_enviar": "...",
    "tipo_seguimiento": "..."
  },
  "puntuacion_setter": {
    "score": 65,
    "nivel_set_aplicado": "...",
    "aprendizajes": ["...", "...", "..."]
  }
}
`;

// ─── LIVE SETTER COPILOT PROMPTS ───────────────────────────────────────────

export const buildSetEngineAnalysisPrompt = (project, lead, historialReciente, mensajeLead) => `
Eres SET Core v1 Beta. Analiza una conversación real de appointment setting.

RAZONA INTERNAMENTE EN ESTE ORDEN:
DETECTAR -> INTERPRETAR -> DECIDIR -> CONSTRUIR.
La decisión ocurre antes de construir una respuesta.

S.E.T. SON DIMENSIONES SIMULTÁNEAS, NO ETAPAS:
- SITUACIÓN: qué ocurre realmente.
- EMOCIÓN: inferencia prudente, confianza, evidencia y condición necesaria para avanzar.
- TRANSICIÓN: siguiente microcompromiso lógico. T nunca significa Transacción.

PROJECT, única fuente permitida para oferta, beneficios, testimonios y recursos:
${JSON.stringify({ id: project?.id, experto: project?.expertName, nicho: project?.niche, promesa: project?.promise, precio: project?.price, avatar: project?.avatarDescription, objeciones_comunes: project?.commonObjections, testimonios: project?.testimonials || [], recursos: project?.resources || [], biblioteca_recursos: project?.recursos || {} }, null, 2)}

LEAD Y ESTADO ACTUAL:
${JSON.stringify({ nombre: lead?.nombre, origen: lead?.origen, canal: lead?.canal, dolor_conocido: lead?.dolor_principal, consciencia: lead?.consciencia, estado_comercial: lead?.estado, temperatura_manual: lead?.temperatura }, null, 2)}

HISTORIAL REAL NORMALIZADO ANTERIOR AL MENSAJE ACTUAL:
${JSON.stringify(historialReciente || [], null, 2)}

MENSAJE ACTUAL:
${JSON.stringify(mensajeLead)}

REGLAS CRÍTICAS:
- Emite UNA decisión priorizada. No generes alternativas.
- Puedes decidir esperar; entonces respuesta debe ser null.
- No preguntes por obligación ni solo porque falten datos.
- Durante exploración, máximo una pregunta en toda la respuesta.
- No preguntes algo respondido ni vuelvas a explorar dolor si el siguiente movimiento ya se consiguió.
- No empujes siempre hacia una cita. Prioriza el siguiente microcompromiso.
- No inventes contexto, recursos, testimonios, beneficios, escasez ni información del Project.
- Una respuesta de tipo recurso solo puede usar el id exacto de un recurso activo del Project.
- No conviertas inferencias emocionales en hechos. Usa lenguaje probable y susténtala en la conversación.
- nivel_compromiso nunca es porcentaje.
- Si accion es esperar o cerrar_conversacion, respuesta puede ser null.
- Para cualquier otra accion, respuesta es obligatoria.
- Si la respuesta es texto, audio_guion o video_guion, su contenido puede contener como máximo una pregunta.
- Devuelve JSON puro completo, sin markdown ni texto adicional.

ENUMS:
- accion: enviar | esperar | preguntar | aportar_valor | aclarar | calificar | agendar | confirmar | reactivar | cerrar_conversacion
- pieza: texto | audio_guion | video_guion | recurso
- nivel_compromiso: no_determinado | incipiente | explicito | comprometido
- temperatura_ia: no_determinada | fria | tibia | caliente

CONTRATO CORE EXACTO:
{
  "version": "set_core_v1_beta",
  "diagnostico": {
    "situacion": { "resumen": "texto" },
    "emocion": { "inferencia": "texto prudente", "condicion_necesaria_para_avanzar": "texto" },
    "transicion": { "microcompromiso": "texto", "razon": "texto" }
  },
  "decision": {
    "accion": "preguntar",
    "objetivo": "texto",
    "estrategia": "texto",
    "respuesta": { "tipo": "texto", "contenido": "mensaje", "recurso_id": null },
    "que_evitar": []
  },
  "estado": { "nivel_compromiso": "no_determinado", "temperatura_ia": "no_determinada" }
}

Para texto/audio_guion/video_guion: contenido no vacío y recurso_id null.
Para recurso: contenido null y recurso_id activo exacto del Project.
`;

export const buildBreakTheIcePrompt = (project, lead) => `
Eres un experto en appointment setting de alto ticket.
El setter necesita el primer mensaje para abrir la conversación
con un lead real. Genera 3 opciones de apertura.

CONTEXTO DEL PROYECTO:
- Experto: ${project.expertName}
- Nicho: ${project.niche}
- Promesa: ${project.promise}
- Recursos disponibles: ${JSON.stringify(project.resources)}

DATOS DEL LEAD:
- Nombre: ${lead.nombre}
- Origen: ${lead.origen}
- Canal: ${lead.canal}
- Dolor principal: ${lead.dolor_principal}
- Nivel de consciencia: ${lead.nivel_consciencia}
- Temperatura: ${lead.temperatura}
- Notas adicionales: ${lead.notas_adicionales || 'ninguna'}

REGLAS:
- Si es OUTBOUND: abrir desde curiosidad genuina, NO desde oferta
- Si es INBOUND: conectar desde que ya mostró interés, pregunta de situación
- Tono: conversacional, genuino, máximo 2-3 líneas
- Cada opción usa un ángulo diferente

RESPONDE EN ESTE JSON (JSON puro, sin markdown):
{
  "aperturas": [
    {
      "opcion": 1,
      "texto": "mensaje completo de apertura",
      "angulo": "descripción del ángulo",
      "por_que": "por qué funciona para este lead"
    },
    { "opcion": 2, "texto": "...", "angulo": "...", "por_que": "..." },
    { "opcion": 3, "texto": "...", "angulo": "...", "por_que": "..." }
  ]
}
`;

export const buildReactivacionRealPrompt = (project, lead, ultimos3) => `
Eres un experto en appointment setting especializado en reactivación de leads fantasma.

CONTEXTO DEL PROYECTO:
- Experto: ${project.expertName}
- Nicho: ${project.niche}
- Promesa: ${project.promise}
- Casos de éxito: ${JSON.stringify(project.testimonials)}${buildRecursosContext(project)}

DATOS DEL LEAD:
- Nombre: ${lead.nombre}
- Canal: ${lead.canal}
- Dolor principal: ${lead.dolor_principal}
- Tiempo sin respuesta: ${lead.tiempo_sin_respuesta || 'desconocido'}

ÚLTIMOS MENSAJES:
${ultimos3}

REGLAS:
- NO retomar desde donde lo dejaste — cambiar el ángulo completamente
- NO mencionar el ghosting ni el silencio
- NO ofrecer descuento
- El mensaje debe ser corto (1-2 líneas)
- Opción 1: Patrón de interrupción
- Opción 2: Reciprocidad (entregar recurso del experto)
- Opción 3: Prueba social (caso de éxito del nicho)

RESPONDE EN ESTE JSON (JSON puro, sin markdown):
{
  "reactivaciones": [
    {
      "opcion": 1,
      "tecnica": "Patrón de interrupción",
      "texto": "mensaje completo",
      "recurso_sugerido": "",
      "por_que": "por qué esta técnica funciona aquí"
    },
    {
      "opcion": 2,
      "tecnica": "Reciprocidad",
      "texto": "...",
      "recurso_sugerido": "nombre y link si aplica",
      "por_que": "..."
    },
    {
      "opcion": 3,
      "tecnica": "Prueba social",
      "texto": "...",
      "recurso_sugerido": "",
      "por_que": "..."
    }
  ]
}
`;

// ─── BRIEFING PARA EL CLOSER ───────────────────────────────────────────────

export const buildBriefingPrompt = ({ project, lead, historial, modo, setterName, nivelFomo, etapaMaxima }) => `
Eres un experto en ventas consultivas de alto ticket especializado
en el traspaso entre el setter y el closer.

Tu tarea es analizar el historial de una conversación de appointment
setting y generar un Briefing profesional para que el closer entre
a la llamada con toda la información que necesita.

CONTEXTO DEL PROYECTO:
- Experto: ${project.expertName}
- Nicho: ${project.niche}
- Promesa del programa: ${project.promise}
- Precio aproximado: ${project.price || 'No especificado'}
- Avatar del cliente ideal: ${project.avatarDescription}
- Objeciones comunes: ${project.commonObjections || 'No especificadas'}${buildRecursosContext(project)}

DATOS DEL LEAD:
- Nombre: ${lead.nombre}
- Canal: ${lead.canal}
- Origen: ${lead.origen}
- Dolor principal registrado: ${lead.dolor_principal}
- Nivel de consciencia inicial: ${lead.nivel_consciencia || 'No especificado'}
- Temperatura final: ${lead.temperatura}

HISTORIAL COMPLETO DE LA CONVERSACIÓN:
${historial}

MÉTRICAS:
- Nivel de FOMO alcanzado: ${nivelFomo || 0}/100
- Etapa S.E.T. más avanzada: ${etapaMaxima || 'S'}
- Modo: ${modo}

INSTRUCCIONES:
1. DOLOR: Usa palabras reales del lead del historial cuando sea posible.
2. URGENCIA: Basa el nivel en el FOMO y señales del historial.
3. OBJECIONES: Máx 3, basadas en objeciones del avatar + lo que insinuó el lead.
4. RECURSOS: Solo los mencionados/enviados en el historial. "Ninguno enviado" si no hay.
5. NOTA ESTRATÉGICA: Específica para ESTE lead, máx 4-5 líneas, directa y accionable.
6. UBICACIÓN: Extrae del historial si se mencionó, sino "No especificado".

RESPONDE EN ESTE JSON (JSON puro, sin markdown):
{
  "briefing": {
    "lead": {
      "nombre": "string",
      "ubicacion": "No especificado",
      "canal_origen": "string",
      "origen": "Inbound",
      "tipo_negocio": "string",
      "situacion_actual": "string",
      "tiempo_en_el_problema": "No mencionado"
    },
    "dolor_principal": "string",
    "urgencia": {
      "nivel": "Medio",
      "explicacion": "string"
    },
    "objeciones_probables": [
      { "objecion": "string", "como_abordarla": "string" }
    ],
    "recursos_entregados": [
      { "nombre": "string", "link": null }
    ],
    "nota_estrategica": "string",
    "setter": "${setterName}",
    "proyecto": "${project.expertName} — ${project.niche}",
    "timestamp": "${new Date().toLocaleString('es')}"
  }
}
`;

// ─── Follow-up message prompt ─────────────────────────────────────────────────

export const buildFollowUpPrompt = ({ project, lead, followUp, ultimos3Mensajes }) => {
  const recursos = project?.recursos;
  const guias = recursos?.guias_pdfs?.filter(r => r.activo).map(r =>
    `- ${r.nombre}: ${r.descripcion} | Link: ${r.link} | Cuándo: ${r.momento_uso}`
  ).join('\n') || 'Ninguna disponible';
  const testimonios = recursos?.videos_testimonios?.filter(r => r.activo).map(r =>
    `- ${r.nombre} (${r.nicho_cliente}): ${r.resultado_logrado} en ${r.tiempo_resultado} | Link: ${r.link}`
  ).join('\n') || 'Ninguno disponible';
  const vsl = recursos?.vsl_presentacion?.activo
    ? `${recursos.vsl_presentacion.nombre} | Link: ${recursos.vsl_presentacion.link}`
    : 'No configurada';

  return `
Eres un experto en appointment setting de alto ticket especializado en follow-ups que reabren conversaciones y avanzan leads hacia la cita.

CONTEXTO DEL PROYECTO:
- Experto: ${project?.expertName || 'N/A'}
- Nicho: ${project?.niche || 'N/A'}
- Promesa: ${project?.promise || 'N/A'}
- Precio: ${project?.price || 'N/A'}

BIBLIOTECA DE RECURSOS:
Guías/PDFs:
${guias}
Videos de testimonios:
${testimonios}
VSL principal: ${vsl}

DATOS DEL LEAD:
- Nombre: ${lead?.nombre}
- Canal: ${lead?.canal}
- Origen: ${lead?.origen}
- Dolor principal: ${lead?.dolor_principal}
- Temperatura actual: ${followUp?.temperatura_actual || lead?.temperatura || 'Tibio'}
- Días sin respuesta: ${followUp?.dias_sin_respuesta || 0}
- Tipo de seguimiento: ${followUp?.tipo_seguimiento}

ÚLTIMOS MENSAJES:
${ultimos3Mensajes || 'Sin historial previo'}

GENERA 3 opciones de mensaje según estas reglas:
OPCIÓN 1 — Cambio de ángulo / Patrón de interrupción: corto (1-2 líneas), diferente al último mensaje, no mencionar silencio ni el programa, generar curiosidad sobre su dolor.
OPCIÓN 2 — Aportar valor: elegir el recurso más relevante de la biblioteca, acompañar con mensaje humano (el link va separado en campo recurso).
OPCIÓN 3 — Variable: si tipo=valor → prueba social con testimonio; si tipo=angulo → pregunta que activa dolor; si tipo=reactivacion → cierre elegante con puerta abierta; si tipo=confirmacion → confirmar asistencia con algo de valor.

REGLAS: Tono WhatsApp natural, máximo 3-4 líneas, nunca mencionar precio, siempre enfocado en conseguir respuesta no cerrar programa.

RESPONDE SOLO EN JSON:
{
  "contexto_analisis": "string",
  "objetivo_del_seguimiento": "string",
  "opciones": [
    {
      "numero": 1,
      "tecnica": "string",
      "texto": "mensaje completo",
      "recurso": null,
      "por_que": "string"
    },
    {
      "numero": 2,
      "tecnica": "Aportar valor",
      "texto": "mensaje con contexto (sin link)",
      "recurso": {
        "tipo": "guia | testimonio | vsl",
        "nombre": "string",
        "link": "string",
        "razon_eleccion": "string"
      },
      "por_que": "string"
    },
    {
      "numero": 3,
      "tecnica": "string",
      "texto": "mensaje completo",
      "recurso": null,
      "por_que": "string"
    }
  ]
}
`;
};
