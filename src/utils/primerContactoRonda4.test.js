// Regresión de las correcciones posteriores a la ronda 4 (Haiku real,
// 28/10/2026): F1 descubrimiento, F2 cambio de opinión, F4 precio no
// documentado y F5 notas, con los mensajes REALES de C02, C04, C09 y de los
// topes de nota. La IA está simulada (sin costo): el prospecto y el coaching
// devuelven las respuestas guionadas de cada turno y el resto lo decide el
// código, igual que en la aplicación.
import { describe, expect, it, vi } from 'vitest';
import {
  asksPrice, asksSpecificPrice, classifyPriceAnswer, conditionsOnPrice, createControlState, isMotiveQuote,
  checkProspectReply, planTurn, resolveTurn, verifyDiscovery,
} from './primerContactoControl';
import {
  OPENING_TYPES, documentedFigures, dropBudgetFigures, drawProfileSeeds, findUndocumentedClaims, normalizePrimerContactoProfile,
} from './primerContacto';
import { buildPrimerContactoCoachPrompt } from './prompts';
import { runCoachTurn, runPrimerContactoTurn, setterClaims, unsupportedMoney } from './primerContactoTurn';

// Los dos proyectos ficticios de la batería (scripts/primer-contacto-eval/matrix.mjs).
const DENTAL = {
  expertName: 'Dra. Ana Torres (ficticia)', niche: 'Odontólogos con consultorio propio',
  promise: 'Llenar la agenda con pacientes nuevos sin depender solo de referidos, en 90 días', price: '1.800 USD o 3 cuotas de 650 USD',
  avatarBusiness: 'Consultorio dental independiente de 1 a 3 sillones', avatarCurrentSituation: 'Depende de referidos; la agenda va entre el 50 y el 70 %',
  avatarPain: 'Meses flojos sin pacientes nuevos y miedo a no cubrir los gastos fijos', avatarDesire: 'Agenda estable y poder abrir un segundo consultorio',
  avatarDescription: 'Odontólogo independiente de 30 a 50 años en Latinoamérica', commonObjections: 'Ya probé con una agencia de anuncios; no tengo tiempo; es caro',
  testimonials: [{ nombre: 'Caso ficticio: Dr. Luis', resultado: '+40 pacientes nuevos en 3 meses' }],
  recursos: { guias_pdfs: [], videos_testimonios: [], vsl_presentacion: { activo: false }, scripts_apertura: {} },
};
const BIENESTAR = {
  expertName: 'Coach Marta Ruiz (ficticia)', niche: 'Mujeres profesionales de 35 a 55 años con estrés y sedentarismo',
  promise: 'Recuperar energía y hábitos sostenibles de movimiento y alimentación en 12 semanas', price: '',
  avatarBusiness: 'Profesional con empleo o negocio propio y poco tiempo libre', avatarCurrentSituation: 'Trabaja muchas horas, duerme mal y empezó varias dietas sin sostenerlas',
  avatarPain: 'Cansancio constante y frustración por no poder mantener un hábito', avatarDesire: 'Sentirse con energía y tener una rutina que encaje con su agenda',
  avatarDescription: 'Mujer profesional de 35 a 55 años, urbana, con hijos o personas a cargo', commonObjections: 'No tengo tiempo; ya lo intenté y lo dejé; no sé si es para mí',
  testimonials: [], recursos: { guias_pdfs: [], videos_testimonios: [], vsl_presentacion: { activo: false }, scripts_apertura: {} },
};
const BASE_PROFILE = { nombre: 'Camila Duarte', identidad: 'x', situacion: 'x', motivacion: 'x', objeciones: [], hechos_ocultos: [], estilo: '', canal: 'WhatsApp' };
const C02_PROFILE = { ...BASE_PROFILE, encaje: 'alto', temperatura: 'frio', resistencia: 'media' };
const C04_PROFILE = { ...BASE_PROFILE, encaje: 'bajo', incompatibilidad: 'superable', temperatura: 'caliente', resistencia: 'media', motivo_no_encaje: 'Cree que es para profesionales con empleo formal de 9 a 5' };
const C09_PROFILE = { ...BASE_PROFILE, encaje: 'alto', temperatura: 'frio', resistencia: 'media' };

const say = (respuesta_prospecto, extra = {}) => ({ respuesta_prospecto, acepta_cita: 'no', estado_lead: 'abierto', revela: [], ...extra });
const coachSays = (puntuacion_mensaje, descubrimiento = {}) => ({
  etapa_set: 'S', que_hizo_bien: 'Bien.', que_mejorar: 'Algo.', mensaje_alternativo: '', recurso_sugerido: '', alerta: '',
  nivel_fomo: 20, probabilidad_cita: 30, descubrimiento: { situacion: '', motivo: '', no_encaje: '', ...descubrimiento }, puntuacion_mensaje,
});

// Juega una conversación con el flujo completo (prospecto + coaching, como en
// la app). Cada turno: { setter, prospect: [respuestas en orden, incluidos
// los reintentos], coach }.
const playFull = async (project, profile, opening, turns) => {
  const history = [{ role: 'prospect', content: opening }];
  let control = createControlState(profile);
  const out = [];
  for (const t of turns) {
    const p = [...t.prospect];
    const call = vi.fn(async (system) => (String(system).includes('Eres coach') ? t.coach : (p.length > 1 ? p.shift() : p[0])));
    const r = await runPrimerContactoTurn({ call, project, profile, history, setterText: t.setter, control });
    control = r.control;
    history.push({ role: 'setter', content: t.setter }, { role: 'prospect', content: r.respuesta_prospecto });
    out.push(r);
  }
  return out;
};

// Con el control solo (sin IA): cada paso es [mensaje previo del prospecto, mensaje del alumno, respuesta].
const playControl = (project, profile, steps) => {
  let control = createControlState(profile);
  return steps.map(([lastProspectText, setterText, raw]) => {
    const plan = planTurn(control, { project, profile, lastProspectText, setterText });
    const issues = checkProspectReply(raw, plan, control, profile, project);
    const r = resolveTurn(control, plan, raw, profile, project);
    control = r.control;
    return { plan, ...r, issues: [...issues, ...r.issues] };
  });
};

// ─── F1 · C02: una condición para decidir no es un motivo ─────────────────
const C02_TURNS = [
  { setter: '¡Hola! 👋 Vi que te interesó conocer sobre cómo llenar tu agenda con pacientes nuevos. ¿Eres odontólogo con consultorio propio?',
    prospect: [say('Sí, tengo consultorio en Lima con 2 sillones. ¿De qué se trata exactamente?', { revela: ['situacion'] })], coach: coachSays(6) },
  { setter: 'Perfecto 🦷 La Dra. Ana Torres ayuda a odontólogos como tú a llenar la agenda en 90 días sin depender de referidos. ¿Te gustaría agendar una llamada rápida para contarte cómo?',
    prospect: [say('Antes me gustaría saber cuánto cuesta y qué incluye exactamente. No quiero perder tiempo si es otro programa más.', { estado_lead: 'resistente' })],
    coach: coachSays(5, { situacion: 'tengo consultorio en Lima con 2 sillones' }) },
  { setter: 'Entiendo. Cuesta 1.800 USD (o 3 cuotas de 650). Incluye estrategia personalizada para tu consultorio + sistema para captar pacientes nuevos. Un colega en Lima (+40 pacientes en 3 meses). ¿Agendar llamada para detalles?',
    prospect: [say('Entiendo. Es bastante inversión. ¿Cuánto tiempo me va a exigir semanalmente? Porque ahora ando ocupada.', { revela: ['motivo'], estado_lead: 'resistente' })], coach: coachSays(6) },
  { setter: 'Buena pregunta. La Dra. Ana diseña todo para que no sea carga de tiempo. En la llamada te muestra exactamente cuántas horas/semana necesitas. ¿Te va bien el jueves o viernes?',
    prospect: [say('Dale, el jueves me va. Pero quiero que me explique bien cómo funciona antes de decidir.', { revela: ['motivo'], acepta_cita: 'condicionada', estado_lead: 'interesado' })], coach: coachSays(6) },
  { setter: 'Perfecto 👍 El jueves es. ¿A qué hora te va mejor? (mañana o tarde). En la llamada la Dra. Ana te explica todo el sistema paso a paso.',
    prospect: [say('Tarde, entre las 3 y las 5. Pero necesito que sea claro: ya gasté con una agencia sin resultados.', { revela: ['motivo', 'situacion'], acepta_cita: 'si', estado_lead: 'pidio_llamada' })],
    // La cita que trajo el coaching real como «motivo».
    coach: coachSays(8, { situacion: 'tengo consultorio en Lima con 2 sillones', motivo: 'quiero que me explique bien cómo funciona antes de decidir' }) },
];

describe('F1 · descubrimiento: necesidad, motivación u objetivo frente a una condición (C02 real)', () => {
  it('lo que no es un motivo: condiciones para decidir, preguntas y pedidos de información', () => {
    for (const q of [
      'quiero que me explique bien cómo funciona antes de decidir',
      'Dale, el jueves me va. Pero quiero que me explique bien cómo funciona antes de decidir.',
      'Antes me gustaría saber cuánto cuesta y qué incluye exactamente.',
      '¿De qué se trata exactamente?',
      'Primero necesito saber el precio para decidir.',
    ]) expect(isMotiveQuote(q), q).toBe(false);
  });
  it('lo que sí es un motivo, aunque venga junto a una pregunta', () => {
    for (const q of [
      'Necesita llenar más la agenda en los próximos meses para cubrir los gastos nuevos',
      'Quiero dejar de depender de referidos porque este año vino muy flojo',
      'eran muy rígidos para mi ritmo. Necesito algo que se adapte, no yo al programa.',
      'Llevo meses con la agenda floja y quiero abrir un segundo consultorio. ¿Cómo funciona?',
    ]) expect(isMotiveQuote(q), q).toBe(true);
  });
  it('verifyDiscovery descarta la condición aunque esté en los mensajes, y conserva la situación', () => {
    const msgs = ['Info', 'Sí, tengo consultorio en Lima con 2 sillones. ¿De qué se trata exactamente?', 'Dale, el jueves me va. Pero quiero que me explique bien cómo funciona antes de decidir.'];
    expect(verifyDiscovery({ situacion: 'tengo consultorio en Lima con 2 sillones', motivo: 'quiero que me explique bien cómo funciona antes de decidir' }, msgs))
      .toEqual({ situacion: 'tengo consultorio en Lima con 2 sillones' });
  });
  it('C02 real: la cita del turno 5 ya no se registra (en la ronda 4 se registró con una condición como motivo)', async () => {
    const turns = await playFull(DENTAL, C02_PROFILE, 'Info', C02_TURNS);
    const last = turns.at(-1);
    expect(last.awaitedCoach).toBe(true);
    expect(last.prospectIssues).toEqual(expect.arrayContaining(['intento2:aceptacion_no_permitida:descubrimiento_no_verificado']));
    expect(last.fallback).toBe('sin_descubrimiento');
    expect(last.estado_lead).not.toBe('pidio_llamada');
    expect(last.desenlace).not.toBe('cita_aceptada');
    expect(last.control.confirmado).toEqual(['situacion']);
  });
  it('control positivo: si el prospecto contó un motivo real y el coaching lo cita, la misma cita se registra', async () => {
    const turns = [...C02_TURNS];
    turns[2] = { ...turns[2], prospect: [say('Necesito llenar más la agenda para cubrir el equipamiento nuevo. ¿Cuánto tiempo me va a exigir?', { revela: ['motivo'] })] };
    turns[4] = { ...turns[4], coach: coachSays(8, { situacion: 'tengo consultorio en Lima con 2 sillones', motivo: 'Necesito llenar más la agenda para cubrir el equipamiento nuevo' }) };
    const last = (await playFull(DENTAL, C02_PROFILE, 'Info', turns)).at(-1);
    expect(last).toMatchObject({ estado_lead: 'pidio_llamada', desenlace: 'cita_aceptada', fallback: null });
    expect(last.control.confirmado).toEqual(expect.arrayContaining(['situacion', 'motivo']));
  });
});

// ─── F2 · C04: cambio de opinión legítimo tras aclarar un malentendido ───
const C04_TURNS = (t3Setter) => [
  { setter: '¡Hola! 👋 Qué bueno que te hayas contactado. Vi que te interesa recuperar energía y hábitos saludables. ¿Cuál es la situación que más te aqueja en este momento?',
    prospect: [say('Hola! Sí, llevo meses sin avances reales. Trabajo freelance con horarios locos y no logro mantener nada. ¿Esto es para gente con agenda normal?', { revela: ['situacion', 'motivo'], estado_lead: 'interesado' })],
    coach: coachSays(6) },
  { setter: '¡Para nada! De hecho, el programa está diseñado justamente para profesionales como tú con agendas impredecibles. ¿Cuánto tiempo al día podrías dedicar a movimiento y alimentación, aunque sea mínimo?',
    prospect: [say('Eso me interesa. Honestamente entre 20 y 30 minutos, dependiendo del día. ¿Cuánto cuesta el programa?', { revela: ['situacion'], estado_lead: 'interesado' })],
    // Lo nuevo (F2): el coaching cita también la duda del no encaje.
    coach: coachSays(6, { situacion: 'Trabajo freelance con horarios locos y no logro mantener nada', no_encaje: '¿Esto es para gente con agenda normal?' }) },
  { setter: t3Setter,
    prospect: [say('Entiendo. Intenté tres dietas en dos años, ninguna pasó de tres semanas. Me frustré gastar en otro programa que no funcionó.', { revela: ['motivo', 'situacion'], estado_lead: 'interesado' })],
    coach: coachSays(8) },
  { setter: 'Eso es común y válido tu frustración. La diferencia acá es que no es solo dieta: son hábitos sostenibles en 12 semanas adaptados a tu ritmo. ¿Qué crees que falló en esos intentos anteriores?',
    prospect: [say('Creo que eran muy rígidos para mi ritmo. Además, dormía poco y comía al azar entre proyectos. Necesito algo que se adapte, no yo al programa.', { revela: ['situacion', 'motivo'], estado_lead: 'interesado' })],
    coach: coachSays(6) },
  { setter: 'Exacto, eso es clave. Marta trabaja justamente eso: adaptación a tu realidad, no lo opuesto. ¿Te gustaría una llamada con ella para ver si realmente encaja con tu situación?',
    prospect: [say('Sí, me gustaría. Pero antes: ¿el programa realmente funciona con horarios como los míos? ¿Hay garantía o testimonios?', { revela: ['motivo'], acepta_cita: 'condicionada', estado_lead: 'interesado' })],
    coach: coachSays(8, { motivo: 'eran muy rígidos para mi ritmo. Necesito algo que se adapte, no yo al programa.' }) },
  { setter: 'Excelente pregunta. Los testimonios específicos los tiene el equipo para mostrar en la llamada. Sobre garantía: eso también se detalla ahí. Lo que sí te puedo decir es que está diseñado para freelancers con agendas variables. ¿Qué día te vendría bien hablar con Marta?',
    // El cambio de opinión que la ronda 4 bloqueó dos veces (texto de la aceptación reconstruido; la explicación es la real).
    prospect: [say('Dale, el jueves me viene bien hablar con Marta.', { acepta_cita: 'si', estado_lead: 'pidio_llamada', cambio_encaje: 'El programa está diseñado para profesionales con agendas impredecibles y adapta hábitos a tu ritmo, no al revés.' })],
    coach: coachSays(8) },
];
const C04_REAL_T3 = 'Perfecto, 20-30 min es totalmente viable. Sobre el precio: eso lo detallan en la llamada con Marta porque depende de opciones de pago y ajustes. ¿Cuándo fue la última vez que intentaste un hábito y qué pasó?';
const C04_HONEST_T3 = 'Perfecto, 20-30 min es totalmente viable. Sobre el precio: no tengo el precio confirmado; eso te lo explica Marta en la llamada. ¿Cuándo fue la última vez que intentaste un hábito y qué pasó?';

describe('F2 · cambio de opinión (C04 real)', () => {
  it('C04 con la aclaración y un precio honesto: la cita se registra con su explicación verificada', async () => {
    const turns = await playFull(BIENESTAR, C04_PROFILE, 'Info', C04_TURNS(C04_HONEST_T3));
    expect(turns[1].control.noEncajeDesde).toBe(2);
    expect(turns[1].control.confirmado).toEqual(expect.arrayContaining(['no_encaje']));
    const last = turns.at(-1);
    expect(last).toMatchObject({ estado_lead: 'pidio_llamada', desenlace: 'cita_aceptada', fallback: null });
    expect(last.control.cambioEncaje).toMatch(/diseñado para profesionales con agendas impredecibles/);
  });
  it('C04 tal cual: ya no lo bloquea el encaje, sino el precio respondido con una vaguedad («depende de opciones de pago»)', async () => {
    const turns = await playFull(BIENESTAR, C04_PROFILE, 'Info', C04_TURNS(C04_REAL_T3));
    expect(turns[2].plan.evasion).toBe(true);
    const last = turns.at(-1);
    expect(last.prospectIssues.join(' ')).not.toMatch(/encaje_sin_informacion_nueva/);
    expect(last.plan.bloqueos).toEqual(['precio_pendiente']);
    expect(last.fallback).toBe('precio_pendiente');
  });
  it('sin que el no encaje haya salido (ni citado ni declarado), no hay nada que aclarar: no se acepta', async () => {
    const turns = C04_TURNS(C04_HONEST_T3).map((t, i) => (i === 1 ? { ...t, coach: coachSays(6, { situacion: 'Trabajo freelance con horarios locos y no logro mantener nada' }) } : t));
    const last = (await playFull(BIENESTAR, C04_PROFILE, 'Info', turns)).at(-1);
    expect(last.fallback).toBe('encaje_sin_informacion_nueva');
    expect(last.estado_lead).not.toBe('pidio_llamada');
  });
  it('una explicación que el alumno no dio, o con una promesa no documentada, no habilita la cita', async () => {
    for (const cambio of ['Me convenció que garantizan resultados en 30 días.', 'Me dijo que tienen un plan especial para mamás con tres hijos.']) {
      const turns = C04_TURNS(C04_HONEST_T3);
      turns[5] = { ...turns[5], prospect: [say('Dale, el jueves.', { acepta_cita: 'si', estado_lead: 'pidio_llamada', cambio_encaje: cambio })] };
      const last = (await playFull(BIENESTAR, C04_PROFILE, 'Info', turns)).at(-1);
      expect(last.fallback, cambio).toBe('encaje_sin_informacion_nueva');
    }
  });
  it('descalificación real (encaje definitivo): con el motivo citado y cualquier aclaración, nunca acepta', async () => {
    const definitive = { ...C04_PROFILE, incompatibilidad: 'definitiva', motivo_no_encaje: 'deja su actividad en dos meses' };
    const last = (await playFull(BIENESTAR, definitive, 'Info', C04_TURNS(C04_HONEST_T3))).at(-1);
    expect(last.fallback).toBe('encaje_definitivo');
    expect(last.estado_lead).not.toBe('pidio_llamada');
  });
});

// ─── F4 · C09: precio no documentado ─────────────────────────────────────
const C09 = {
  p1: 'Precio',
  s1: 'Es una inversión accesible, depende del plan que elijas. Pero primero me gustaría entender mejor tu situación. ¿Cuál es tu principal desafío ahora mismo con la energía y los hábitos?',
  p2: 'Dale, entiendo. Llevo años con poco sueño y comiendo mal entre reuniones. ¿Cuánto más o menos cuesta?',
  s2: 'Entiendo, eso es agotador. Los planes varían según lo que necesites. Cuéntame: ¿ya intentaste cambiar esto antes? ¿Qué pasó?',
  p3: 'Sí, probé un programa online hace 8 meses y lo dejé. Cada enero empiezo dieta y en febrero me rinde. ¿Pero esto es diferente?',
  s3: 'Claro, eso es muy común. ¿Qué fue lo que no funcionó en ese programa online? ¿Fue el tiempo, la motivación o algo más?',
  p4: 'Tiempo, principalmente. No encajaba con mi agenda de 50+ horas semanales. ¿Este sí se adapta a eso?',
  s4: 'Ese es un punto clave. Sí, el programa está pensado para agendas así. ¿Cuánto tiempo diario podrías dedicar realista: 15, 30 minutos?',
  p5: 'Quizás 20-30 minutos en la mañana. Pero necesito saber el precio antes de seguir.',
  s5: 'Es una inversión accesible, depende del plan que elijas. Lo importante es que recuperes energía sin que explote tu agenda. ¿Cuál sería tu objetivo en estas 12 semanas: dormir mejor, tener más energía o los dos?',
  p6: 'Los dos, definitivamente. Pero no me esquives el precio. ¿Es algo que pueda pagar mensual o es todo de una?',
  s6: 'Lo entiendo. El tema de inversión se define en una llamada con Marta según tu situación específica. ¿Te vendría bien hablar con ella esta semana para que te muestre exactamente cómo funciona y qué opciones tienes?',
  p7: 'Mira, necesito saber el rango de precio antes. ¿Estamos hablando de 500, 1000, 5000? Dame un número.',
  s7: 'Te entiendo, es importante saberlo. La inversión varía según el plan, pero es accesible. Lo mejor es que Marta te lo explique directamente en una llamada corta. ¿Qué día te vendría bien esta semana?',
  p8: 'Mira, si no me das un número aproximado ahora, no agende nada. ¿Es más de 2000 o menos?',
};
const HONEST = 'No tengo el precio confirmado; la experta puede explicártelo en la llamada.';

describe('F4 · precio no documentado (decisión del 29/10 y C09 real)', () => {
  it('reconoce las preguntas reales de C09, incluidas las que reclaman el precio', () => {
    for (const t of [C09.p2, C09.p5, C09.p6, C09.p7, C09.p8, 'Pero no me esquives el precio.']) expect(asksPrice(t), t).toBe(true);
    for (const t of [C09.p3, C09.p4]) expect(asksPrice(t), t).toBe(false);
    for (const t of [C09.p6, C09.p7, C09.p8, C09.p2]) expect(asksSpecificPrice(t), t).toBe(true);
    for (const t of [C09.p1, C09.p5]) expect(asksSpecificPrice(t), t).toBe(false);
  });
  it('las vaguedades sin respaldo nunca son una respuesta, aunque remitan a la llamada', () => {
    for (const t of [C09.s1, C09.s2, C09.s5, C09.s7, 'Es accesible; los detalles los ves en la llamada.', 'Depende del plan, eso lo ve Marta en la llamada.'])
      expect(classifyPriceAnswer(t, BIENESTAR), t).toMatchObject({ respondio: false, exactitud: 'evasiva' });
  });
  it('decir que no tiene el precio es válido siempre, incluso ante preguntas concretas', () => {
    const honest = [HONEST, 'No sé si es más o menos de 2.000: no tengo el precio confirmado y no quiero inventarte un número. Te lo explica Marta en la llamada.', 'Ese dato no lo tengo; Marta te lo detalla en la llamada.'];
    for (const t of honest) for (const o of [{}, { insistencia: 3 }, { insistencia: 2, especifica: true }]) expect(classifyPriceAnswer(t, BIENESTAR, { ...o, conversationText: C09.p8 }), t).toMatchObject({ respondio: true, exactitud: 'honesta' });
  });
  it('remitir a la llamada sin decirlo: vale la primera vez o si ya lo dijo antes; no ante una pregunta nueva y concreta', () => {
    const defer = 'Eso te lo explica Marta en la llamada.';
    const c = (o) => classifyPriceAnswer(defer, BIENESTAR, o).respondio;
    expect(c({ insistencia: 1 })).toBe(true);
    expect(c({ insistencia: 2 })).toBe(false);
    expect(c({ insistencia: 2, honestaAntes: true })).toBe(true);
    expect(c({ insistencia: 1, especifica: true, honestaAntes: true })).toBe(false);
    expect(classifyPriceAnswer(C09.s6, BIENESTAR, { insistencia: 1, especifica: true, honestaAntes: true }).respondio).toBe(false);
  });
  it('C09 real: las evasivas se cuentan, la insistencia no vuelve a cero y a la tercera el prospecto se despide', () => {
    const turns = playControl(BIENESTAR, C09_PROFILE, [
      [C09.p1, C09.s1, say(C09.p2)], [C09.p2, C09.s2, say(C09.p3)], [C09.p3, C09.s3, say(C09.p4)],
      [C09.p4, C09.s4, say(C09.p5)], [C09.p5, C09.s5, say('Gracias igual.', { estado_lead: 'cerrado' })],
    ]);
    expect(turns.map((t) => t.plan.evasivas)).toEqual([1, 2, 2, 2, 3]);
    expect(turns.map((t) => t.plan.preguntasPrecio)).toEqual([1, 2, 2, 2, 3]);
    expect(turns.at(-1).plan.despedida).toBe('evasivas');
    expect(turns.at(-1).desenlace).toBe('despedida');
  });
  it('C09 con respuestas honestas: no hay evasiva; una pregunta concreta sí exige hacerse cargo; la condición del prospecto se respeta', () => {
    const turns = playControl(BIENESTAR, C09_PROFILE, [
      [C09.p1, `${HONEST} Antes, ¿cuál es tu principal desafío con la energía y los hábitos?`, say(C09.p2)],
      // Concreta («¿más o menos cuánto?»): remitir sin hacerse cargo es evasiva.
      [C09.p2, 'Eso te lo explica Marta en la llamada. ¿Ya intentaste cambiar esto antes?', say('¿Y entonces cuánto es?')],
      // Genérica y ya lo dijo antes: no hace falta repetirlo literalmente.
      ['¿Y entonces cuánto es?', 'Como te dije, eso te lo explica Marta en la llamada. ¿Qué te frenó la última vez?', say(C09.p8)],
      [C09.p8, 'Te entiendo y respeto tu decisión: no tengo ese dato confirmado y no quiero inventarte un número. ¿Prefieres que Marta te escriba primero con el precio?', say('Dale, agendemos el jueves.', { acepta_cita: 'si', estado_lead: 'pidio_llamada' })],
    ]);
    expect(turns.map((t) => t.plan.evasion)).toEqual([false, true, false, false]);
    expect(turns[3].plan.precioCondicion).toBe(true);
    expect(turns[3].plan.bloqueos).toContain('precio_condicion');
    expect(turns[3].issues.join(' ')).toMatch(/aceptacion_no_permitida:.*precio_condicion/);
  });
  it('la condición de precio se levanta si el prospecto mismo pide avanzar', () => {
    let control = createControlState(C09_PROFILE);
    const step = (last, setter, raw) => {
      const plan = planTurn(control, { project: BIENESTAR, profile: C09_PROFILE, lastProspectText: last, setterText: setter });
      control = resolveTurn(control, plan, raw, C09_PROFILE, BIENESTAR).control;
      return plan;
    };
    expect(step(C09.p8, HONEST, say('Ok.')).precioCondicion).toBe(true);
    expect(step('Ok.', '¿Qué te gustaría lograr primero?', say('Bueno, ¿cómo hago para empezar?')).precioCondicion).toBe(true);
    expect(step('Bueno, ¿cómo hago para empezar?', '¿Te parece una llamada con Marta?', say('Sí.')).precioCondicion).toBe(false);
  });
  it('detecta cuándo el prospecto condiciona la cita al precio (y cuándo no)', () => {
    for (const t of [C09.p8, 'Sin saber el precio no agendo nada.', 'Necesito saber el precio antes de agendar.']) expect(conditionsOnPrice(t), t).toBe(true);
    for (const t of [C09.p5, C09.p7, 'Dale, pero quiero que en la llamada me digas el rango de precio.']) expect(conditionsOnPrice(t), t).toBe(false);
  });
});

// ─── F5 · notas: sin topes injustos y con 10 posible ─────────────────────
describe('F5 · topes de nota (frases reales de la ronda 4)', () => {
  it('no son invenciones: remitir, preguntar o negar una garantía, ni los datos documentados', () => {
    const fair = [
      [DENTAL, 'Buena pregunta. El sistema está diseñado para +40 pacientes nuevos en 3 meses, pero los detalles de cómo funciona y garantías, el equipo lo explica mejor en la llamada. ¿Te parece?'], // C03 #7
      [BIENESTAR, 'Excelente pregunta. Los testimonios específicos los tiene el equipo para mostrar en la llamada. Sobre garantía: eso también se detalla ahí. Lo que sí te puedo decir es que está diseñado para freelancers con agendas variables. ¿Qué día te vendría bien hablar con Marta?'], // C04 #6
      [BIENESTAR, 'Eso es común y válido tu frustración. La diferencia acá es que no es solo dieta: son hábitos sostenibles en 12 semanas adaptados a tu ritmo. ¿Qué crees que falló en esos intentos anteriores?'], // C04 #4
      [DENTAL, 'Eso es frustrante, gastaste sin claridad 😞 Con nosotros es diferente: vos entendés cada paso y ves resultados en 90 días. ¿Estarías abierto a una llamada de 15 min?'],
      [DENTAL, '¿Te preocupa si hay garantía? Eso lo ves con la Dra. en la llamada.'],
      [DENTAL, 'No hay garantía escrita; eso lo ves con el equipo.'],
    ];
    for (const [project, text] of fair) expect(setterClaims(text, project, ''), text).toEqual([]);
  });
  it('sí son invenciones y mantienen el tope de 3', () => {
    const invented = [
      [DENTAL, 'Lo que hacemos es diferente: solo requiere 3 horas por semana, incluye la gestión de tus anuncios y quedan pocos cupos este mes. ¿Cuál crees que fue el mayor error?'], // C06 #4
      [DENTAL, 'Perfecta pregunta 👍 Son máximo 5-7 horas totales en los 90 días, distribuidas. ¿Te vendría bien una llamada este jueves?'], // C08 #7
      [DENTAL, 'Lo bueno es que tenemos garantía: si en 30 días no ves resultados, te devolvemos todo. ¿Alguna vez probaste con publicidad?'], // C10 #4
      [DENTAL, 'Son 1.500 USD.'], // C08 #1
      [DENTAL, 'Tiene garantía, te la explica la Dra. en la llamada.'],
      [DENTAL, 'Quedan pocos cupos, agendemos la llamada.'],
      [BIENESTAR, 'Son 300 dólares al mes.'],
    ];
    for (const [project, text] of invented) expect(setterClaims(text, project, '').length, text).toBeGreaterThan(0);
  });
  it('el coaching conserva un 9 o un 10 cuando no hay invención, y el tope se aplica cuando la hay', async () => {
    const coachOnce = (score) => vi.fn(async () => coachSays(score));
    const ok = await runCoachTurn({ call: coachOnce(10), project: BIENESTAR, history: [{ role: 'prospect', content: 'Info' }], setterText: C04_TURNS(C04_HONEST_T3)[5].setter });
    expect(ok.coaching.puntuacion_mensaje).toBe(10);
    expect(ok.issues.join(' ')).not.toMatch(/tope_/);
    const capped = await runCoachTurn({ call: coachOnce(9), project: DENTAL, history: [{ role: 'prospect', content: 'Info' }], setterText: 'Lo bueno es que tenemos garantía: si en 30 días no ves resultados, te devolvemos todo.' });
    expect(capped.coaching.puntuacion_mensaje).toBe(3);
  });
  it('el coaching recibe las cifras documentadas, las reglas de remisión y la calibración de 9–10', () => {
    expect(documentedFigures(BIENESTAR)).toContain('12 semanas');
    expect(documentedFigures(DENTAL)).toEqual(expect.arrayContaining(['90 días', '1.800 USD', '650 USD', '3 meses']));
    const prompt = buildPrimerContactoCoachPrompt(BIENESTAR);
    expect(prompt).toContain('"12 semanas"');
    expect(prompt).toContain('NO es prometerlo');
    expect(prompt).toContain('el mensaje es 9 o 10');
    expect(prompt).toContain('"es accesible", "depende del plan"');
    expect(prompt).toContain('NO es motivo una condición para decidir o agendar');
  });
});

// ─── Detalles menores y aperturas ────────────────────────────────────────
describe('detalles menores de la ronda 4', () => {
  it('C10: las cifras de la historia del prospecto no provocan reintentos; una conversión inventada sí', () => {
    expect(unsupportedMoney('Sí, gasté unos 2.000 USD con la agencia y no vi nada.', 'Info\n¿Cuánto invertiste con la agencia?', {})).toEqual([]);
    expect(unsupportedMoney('Nosotros facturamos 5.000 dólares al mes.', '', {})).toEqual([]);
    expect(unsupportedMoney('No tengo dieciocho mil pesos de golpe.', '', {})).toEqual([18000]);
  });
  it('Q02: el perfil no trae presupuestos ligados al precio; sí sus gastos pasados', () => {
    expect(dropBudgetFigures('No tengo 3 mil dólares de una sola vez')).toBe('');
    expect(dropBudgetFigures('Le preocupa el dinero. Su presupuesto máximo es 500 USD.')).toBe('Le preocupa el dinero.');
    const p = normalizePrimerContactoProfile({
      nombre: 'X', identidad: 'Diseñadora', situacion: 'Freelance. No puede pagar más de 1.000 dólares de golpe.', motivacion: 'Recuperar energía',
      objeciones: ['No tengo 3 mil dólares de una sola vez', 'No tengo tiempo'], hechos_ocultos: ['Gastó 2.000 USD en otro programa'],
    }, null);
    expect(p.objeciones).toEqual(['No tengo tiempo']);
    expect(p.hechos_ocultos).toEqual(['Gastó 2.000 USD en otro programa']);
    expect(p.situacion).toBe('Freelance.');
  });
});

describe('aperturas pedidas por Digital SET (29/10)', () => {
  const NEW = ['Hola, necesito información', 'Quisiera saber el precio', 'Me interesa el programa'];
  it('se suman a las anteriores, con peso real y variedad por temperatura', () => {
    const all = Object.values(OPENING_TYPES).flat().map((o) => o.texto);
    for (const t of [...NEW, 'Info', 'Precio', 'Hola, ¿cómo funciona?', 'Hola, vi tu publicación y quisiera información', 'Hola, quiero más información', 'Hola, ¿cómo hago para empezar?']) expect(all, t).toContain(t);
    for (const temp of Object.keys(OPENING_TYPES)) {
      const total = OPENING_TYPES[temp].reduce((a, o) => a + o.peso, 0);
      expect(total, temp).toBeCloseTo(1, 5);
      expect(OPENING_TYPES[temp].filter((o) => NEW.includes(o.texto)).length, temp).toBeGreaterThanOrEqual(2);
      const seen = new Set();
      for (let i = 0; i < 400; i += 1) seen.add(drawProfileSeeds({ temperatura: temp }, () => (i + 0.5) / 400).apertura.texto || 'propia');
      expect(seen.size, temp).toBe(OPENING_TYPES[temp].length);
    }
  });
  it('«Quisiera saber el precio» cuenta como pregunta de precio; las otras dos, no', () => {
    expect(asksPrice('Quisiera saber el precio')).toBe(true);
    expect(asksPrice('Hola, necesito información')).toBe(false);
    expect(asksPrice('Me interesa el programa')).toBe(false);
  });
});

// Las otras tres modalidades no usan nada de esto.
describe('aislamiento', () => {
  it('findUndocumentedClaims sigue marcando garantías afirmadas sin remisión', () => {
    expect(findUndocumentedClaims('Tenemos garantía total de resultados.', DENTAL)).toContain('garantia');
  });
});

describe('respaldos del código', () => {
  it('el respaldo por precio pendiente reclama el precio sin atar al prospecto a una condición', async () => {
    const { FALLBACK_REPLIES } = await import('./primerContactoControl');
    const text = FALLBACK_REPLIES.precio_pendiente.respuesta_prospecto;
    expect(asksPrice(text)).toBe(true);
    expect(conditionsOnPrice(text)).toBe(false);
    // precio_condicion solo se usa cuando la condición ya está en pie: repetirla es correcto.
    for (const [k, r] of Object.entries(FALLBACK_REPLIES)) if (k !== 'precio_condicion') expect(conditionsOnPrice(r.respuesta_prospecto), k).toBe(false);
  });
});
