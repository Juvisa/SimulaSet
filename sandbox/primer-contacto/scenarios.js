// Escenarios del preview local de Primer contacto. Todo es ficticio.
//
// Cada turno guionado tiene el mensaje SUGERIDO del alumno (el panel lo
// escribe con un botón), la respuesta del prospecto y el coaching tal como los
// devolvería la IA. La aplicación los procesa con su lógica real: si el guion
// acepta una cita que el control no permite, la app la bloquea; si pide un
// reintento, se usa `prospectRetry` (o se repite la respuesta y entra el
// respaldo). Para ver el comportamiento previsto, usa el mensaje sugerido.
import { PROJECTS } from '../../scripts/primer-contacto-eval/matrix.mjs';
import REPLAYS from './replays-ronda3.json';

const coach = (puntuacion_mensaje, que_hizo_bien, que_mejorar = '', extra = {}) => ({
  etapa_set: 'S', que_hizo_bien, que_mejorar, mensaje_alternativo: '', recurso_sugerido: '', alerta: '',
  nivel_fomo: 25, probabilidad_cita: 40, descubrimiento: { situacion: '', motivo: '' }, puntuacion_mensaje, ...extra,
});
const prospect = (respuesta_prospecto, extra = {}) => ({ respuesta_prospecto, revela: [], acepta_cita: 'no', cambio_encaje: '', estado_lead: 'abierto', ...extra });

const LUCIA = {
  nombre: 'Lucía Herrera', origen: 'Un reel sobre agendas vacías', identidad: 'Odontóloga con consultorio propio en Quito',
  situacion: 'Dos sillones, agenda al 55 %, depende de referidos', emocion: 'Frustración', motivacion: 'Quiere abrir un segundo consultorio',
  objeciones: ['Ya probé con una agencia'], hechos_ocultos: ['Perdió 2.300 USD con una agencia'], encaje: 'alto', estilo: 'escribe informal', apertura_inicial: 'Info',
};
const S1 = 'Tengo un consultorio con dos sillones y la agenda va al 55 %. Me llamó la atención lo de no depender de referidos.';
const M1 = 'Quiero abrir un segundo consultorio el año que viene y con esta agenda no me alcanza.';
const DISCOVERY_1 = { situacion: 'Tengo un consultorio con dos sillones y la agenda va al 55 %', motivo: 'Quiero abrir un segundo consultorio el año que viene' };

const dentalTurns = {
  t0: { setter: '¡Hola! Gracias por escribir. ¿Qué te llamó la atención de la publicación?', prospect: prospect(S1, { revela: ['situacion'], estado_lead: 'interesado' }), coach: coach(8, 'Pregunta abierta para conocer su situación.') },
  t1: { setter: 'Entiendo. ¿Y por qué te pusiste a buscar esto justo ahora?', prospect: prospect(M1, { revela: ['motivo'], estado_lead: 'interesado' }), coach: coach(9, 'Retoma lo que dijo y abre el motivo.', '', { descubrimiento: { situacion: DISCOVERY_1.situacion, motivo: '' } }) },
};

export const SCENARIOS = [
  {
    id: 'cita-aceptada',
    title: 'Cita aceptada con descubrimiento confirmado',
    check: [
      'el prospecto aparece primero (≈1,5 s) y el coaching se agrega después (≈3,4 s) con «Analizando tu mensaje…»',
      'mientras falta el coaching, «Enviar» y «Terminar» quedan bloqueados',
      'en el turno 4 la cita se registra sin esperas (el descubrimiento ya estaba confirmado) y la sesión se cierra con «cita aceptada»',
    ],
    project: PROJECTS.dental,
    config: { temperatura: 'tibio', resistencia: 'baja', canal: 'WhatsApp' },
    profile: LUCIA,
    turns: [
      dentalTurns.t0,
      dentalTurns.t1,
      { setter: '¿Y qué pasa hoy en los meses flojos?', prospect: prospect('Casi no llegan pacientes nuevos y me cuesta cubrir los gastos fijos.', { estado_lead: 'interesado' }), coach: coach(8, 'Profundiza en el costo del problema.', '', { descubrimiento: DISCOVERY_1 }) },
      { setter: 'Tiene todo el sentido. Para ver cómo llegar a ese segundo consultorio, ¿te parece una llamada corta con la Dra. Ana el jueves?', prospect: prospect('Dale, el jueves me va bien.', { acepta_cita: 'si', estado_lead: 'interesado' }), coach: coach(10, 'Propone la cita conectándola con su motivo.', '', { descubrimiento: DISCOVERY_1 }) },
    ],
  },
  {
    id: 'cita-espera-coaching',
    title: 'La cita espera al coaching del mismo turno',
    check: [
      'en el turno 3 el prospecto acepta, pero el motivo todavía no estaba confirmado: su respuesta aparece recién cuando llega el coaching (≈3,4 s), que trae la cita textual',
      'después se registra la cita y se cierra la sesión',
    ],
    project: PROJECTS.dental,
    config: { temperatura: 'tibio', resistencia: 'baja', canal: 'WhatsApp' },
    profile: LUCIA,
    turns: [
      dentalTurns.t0,
      dentalTurns.t1,
      { setter: 'Tiene todo el sentido. Para ver cómo llegar a ese segundo consultorio, ¿te parece una llamada corta con la Dra. Ana el jueves?', prospect: prospect('Dale, el jueves me va bien.', { acepta_cita: 'si', estado_lead: 'interesado' }), coach: coach(10, 'Propone la cita conectándola con su motivo.', '', { descubrimiento: DISCOVERY_1 }) },
    ],
  },
  {
    id: 'cita-condicionada',
    title: 'Cita condicionada (la conversación sigue abierta)',
    check: [
      'en el turno 3 el estado muestra «cita condicionada» y la sesión NO se cierra',
      'en el turno 4 sigue condicionada; al pulsar «Terminar» se guardaría final_state = interesado',
    ],
    project: PROJECTS.bienestar,
    config: { temperatura: 'caliente', resistencia: 'media', canal: 'WhatsApp' },
    profile: {
      nombre: 'Gabriela Solís', origen: 'Un post sobre energía', identidad: 'Abogada con dos hijos en Lima', situacion: 'Trabaja diez horas y duerme mal',
      emocion: 'Cansancio', motivacion: 'Recuperar energía antes de fin de año', objeciones: ['No tengo tiempo'], hechos_ocultos: ['Dejó tres dietas'], encaje: 'alto', estilo: 'escribe formal', apertura_inicial: 'Hola, quiero más información',
    },
    turns: [
      { setter: '¡Hola! Gracias por escribir. ¿Qué te llevó a buscar algo así ahora?', prospect: prospect('Trabajo diez horas por día y duermo mal. Quiero volver a tener energía antes de fin de año.', { revela: ['situacion', 'motivo'], estado_lead: 'interesado' }), coach: coach(8, 'Pregunta abierta sobre el motivo.') },
      { setter: 'Eso pesa mucho. ¿Qué intentaste hasta ahora para cambiarlo?', prospect: prospect('Empecé tres dietas y las dejé a las dos semanas. No tengo tiempo.', { estado_lead: 'interesado' }), coach: coach(9, 'Construye sobre lo que contó.', '', { descubrimiento: { situacion: 'Trabajo diez horas por día y duermo mal', motivo: 'Quiero volver a tener energía antes de fin de año' } }) },
      { setter: 'Por lo que me cuentas, vale la pena verlo con Marta. ¿Te parece una llamada corta el martes?', prospect: prospect('Sí, pero antes quiero saber cuánto tiempo por semana me va a pedir.', { acepta_cita: 'condicionada', estado_lead: 'interesado' }), coach: coach(9, 'Propone la cita con una razón concreta.') },
      { setter: 'Es justo. El tiempo exacto lo define Marta según tu agenda; en la llamada lo ves con ella.', prospect: prospect('Ok, lo pienso y te aviso.', { estado_lead: 'interesado' }), coach: coach(8, 'Respuesta honesta sobre lo no documentado.') },
    ],
  },
  {
    id: 'despedida-evasivas',
    title: 'Despedida por evasivas de precio (límite 3)',
    check: [
      'el coaching marca cada evasiva con nota baja y alerta',
      'a la tercera evasiva el turno es una despedida: «Conversación terminada: el prospecto se despidió» y luego el reporte',
    ],
    project: PROJECTS.dental,
    config: { temperatura: 'frio', resistencia: 'media', canal: 'WhatsApp' },
    profile: { ...LUCIA, nombre: 'Andrés Molina', apertura_inicial: 'Precio' },
    turns: [
      { setter: 'Eso lo vemos más adelante. ¿Qué te llamó la atención?', prospect: prospect('Ya, pero ¿más o menos cuánto?'), coach: coach(3, '', 'Responde el precio documentado.', { alerta: 'Evasiva al precio documentado.' }) },
      { setter: 'Depende de tu caso. ¿Cuántos sillones tienes?', prospect: prospect('Necesito saber el precio antes de seguir.', { estado_lead: 'resistente' }), coach: coach(3, '', 'Segunda evasiva: da el precio.', { alerta: 'Evasiva reiterada de precio.' }) },
      { setter: 'Eso lo vemos en la llamada. ¿Cómo está tu agenda?', prospect: prospect('Mira, sin un precio claro no sigo. Gracias igual.', { estado_lead: 'cerrado' }), coach: coach(2, '', 'Tercera evasiva.', { alerta: 'Evasiva reiterada de precio.' }) },
    ],
  },
  {
    id: 'no-califica',
    title: 'No califica, identificado y cerrado con respeto',
    check: [
      'el prospecto cuenta por qué no le conviene; el alumno lo reconoce y el cierre recibe 10',
      'la sesión termina en «no califica» (no es éxito ni abandono)',
    ],
    project: PROJECTS.dental,
    config: { temperatura: 'tibio', resistencia: 'media', canal: 'WhatsApp' },
    profile: { ...LUCIA, nombre: 'Raúl Benítez', encaje: 'bajo', incompatibilidad: 'definitiva', motivo_no_encaje: 'cierra el consultorio en dos años para mudarse' },
    turns: [
      { setter: '¡Hola! ¿Qué te llamó la atención de la publicación?', prospect: prospect('Vi lo de llenar la agenda. Tengo un consultorio chico, aunque en dos años lo cierro para mudarme.', { revela: ['situacion', 'no_encaje'] }), coach: coach(8, 'Pregunta abierta.') },
      { setter: 'Gracias por contarlo. Si en dos años cierras, ¿qué te gustaría resolver mientras tanto?', prospect: prospect('Solo tener algo más de movimiento estos meses, nada grande.', { revela: ['motivo'] }), coach: coach(9, 'Explora con respeto lo que contó.') },
      { setter: 'Te soy honesta: este programa está pensado para crecer y abrir más espacio, así que hoy no creo que sea para ti. Si tus planes cambian, aquí estoy.', prospect: prospect('Gracias por la honestidad, tiene sentido.', { estado_lead: 'no_califica' }), coach: coach(10, 'Reconoce que no califica, sin insistir y con la puerta abierta.') },
    ],
  },
  {
    id: 'coaching-falla',
    title: 'El coaching falla en un turno',
    check: [
      'en el turno 1 el prospecto responde igual, pero el turno queda sin coaching ni puntuación (no entra al promedio)',
      'en el turno 2 todo vuelve a la normalidad',
    ],
    project: PROJECTS.dental,
    config: { temperatura: 'tibio', resistencia: 'baja', canal: 'WhatsApp' },
    profile: LUCIA,
    turns: [{ ...dentalTurns.t0, coachFails: true }, dentalTurns.t1],
  },
  replay('R12', {
    title: 'Reproducción real R12 (ronda 3): pitch, precio vago y teléfono',
    check: [
      'en la ronda 3 este prospecto terminó aceptando; ahora el control lo impide: el motivo nunca se confirmó y quedó una evasiva de precio',
      'turno 4: «depende del plan» ante la segunda pregunta de precio cuenta como evasiva',
      'turno 5: el guion trae un teléfono y una aceptación; la app pide la respuesta de nuevo y no se muestra ningún teléfono',
    ],
    project: PROJECTS.bienestar,
    overrides: {
      0: { coach: { descubrimiento: { situacion: '', motivo: '' } } },
      1: { coach: { descubrimiento: { situacion: 'ando muy cansado con el trabajo', motivo: '' } } },
      4: { prospectRetry: prospect('Prefiero seguir por este chat. Pero antes de agendar quiero saber el rango de precio.', { acepta_cita: 'condicionada', estado_lead: 'interesado' }) },
    },
  }),
  replay('R09', {
    title: 'Reproducción real R09 (ronda 3): cambio de opinión justificado',
    check: [
      'turno 5: el guion usa «dieciocho mil pesos» (cifra que nadie dijo); la app pide la respuesta de nuevo',
      'turno 6: el alumno da el precio con las cuotas',
      'turno 7: el prospecto acepta con su paráfrasis real («Las 3 cuotas de 650 USD hicieron la inversión accesible»); en la ronda 3 se bloqueó y terminó en «sigo sin ver que sea para mí»; ahora se registra la cita',
    ],
    project: PROJECTS.dental,
    truncate: 7,
    // El perfil de la ronda 3 traía la conversión inventada entre sus
    // objeciones (se generó viendo el precio; ya no). Se quita para que la
    // reproducción refleje el perfil que se genera ahora.
    profileEdit: (p) => ({ ...p, objeciones: p.objeciones.filter((o) => !/dieciocho mil/i.test(o)) }),
    overrides: {
      // El coaching del turno 2 ya ve la primera respuesta del prospecto.
      1: { coach: { descubrimiento: { situacion: 'Tengo alrededor del 55%. Algunos meses baja más.', motivo: 'Por eso escribí después de que un colega mencionó que mejoró sus pacientes nuevos.' } } },
      4: { prospectRetry: prospect('Me interesa, pero primero necesito saber cuánto cuesta. No sé si puedo pagarlo de una sola vez.', { revela: ['no_encaje'], acepta_cita: 'condicionada', estado_lead: 'interesado' }) },
      // Texto de aceptación reconstruido; la explicación es la real del intento original.
      6: { prospect: prospect('Dale, el jueves a las 6 podemos los dos.', { acepta_cita: 'si', cambio_encaje: 'Las 3 cuotas de 650 USD hicieron la inversión accesible', estado_lead: 'interesado' }) },
    },
  }),
];

function replay(id, { title, check, project, overrides = {}, truncate, profileEdit = (p) => p }) {
  const r = REPLAYS[id];
  const turns = r.turns.slice(0, truncate ?? r.turns.length).map((t, i) => {
    const o = overrides[i] || {};
    return {
      setter: t.s,
      prospect: o.prospect || prospect(t.p.respuesta_prospecto, t.p),
      prospectRetry: o.prospectRetry,
      coach: { ...coach(t.k.puntuacion_mensaje, t.k.que_hizo_bien, t.k.que_mejorar, { ...t.k }), ...(o.coach || {}) },
    };
  });
  return {
    id: `reproduccion-${id.toLowerCase()}`, title, check, project, turns,
    config: { temperatura: r.cfg.temperatura, resistencia: r.cfg.resistencia, canal: r.cfg.canal },
    profile: profileEdit(r.profile),
  };
}
