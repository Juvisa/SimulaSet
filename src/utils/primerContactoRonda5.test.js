// Regresión de las correcciones posteriores a la ronda 5 (Haiku real,
// 30/10/2026) con los mensajes REALES de C02, C10, C08, C07, C06, C04 y C03,
// según las decisiones de Digital SET del 30/10/2026:
//   1. cita conseguida con información inventada: queda registrada, pero no es
//      un éxito comercial válido salvo que el alumno la rectifique antes;
//   2. aceptación con día y hora: es una cita aceptada si no hay una condición previa;
//   3. una objeción no es un motivo;
//   4. promesas repetidas con otras palabras y características inventadas sin cifras;
//   5. notas coherentes con el precio aproximado y sin castigar dos veces un error.
// La IA está simulada (sin costo).
import { describe, expect, it, vi } from 'vitest';
import {
  INVALID_APPOINTMENT_STATE, citaValidity, createControlState, explicitScheduledAcceptance, hasPriorCondition,
  isMotiveQuote, normalizeAcceptance, pendingClaimsAfter, primerContactoFinalState, setterClaimsOf, verifyCoachInvention,
} from './primerContactoControl';
import { buildPrimerContactoCoachMessage, buildPrimerContactoCoachPrompt } from './prompts';
import { applyCoachResult, priceNoteFor, runCoachTurn, runPrimerContactoTurn, runProspectTurn } from './primerContactoTurn';
import { MODE_IDS, SUCCESS_STATES } from './simulatorModes';

const DENTAL = {
  expertName: 'Dra. Ana Torres (ficticia)', niche: 'Odontólogos con consultorio propio',
  promise: 'Llenar la agenda con pacientes nuevos sin depender solo de referidos, en 90 días', price: '1.800 USD o 3 cuotas de 650 USD',
  avatarBusiness: 'Consultorio dental independiente de 1 a 3 sillones', avatarCurrentSituation: 'Depende de referidos; la agenda va entre el 50 y el 70 %',
  avatarPain: 'Meses flojos sin pacientes nuevos y miedo a no cubrir los gastos fijos', avatarDesire: 'Agenda estable y poder abrir un segundo consultorio',
  avatarDescription: 'Odontólogo independiente de 30 a 50 años en Latinoamérica', commonObjections: 'Ya probé con una agencia de anuncios; no tengo tiempo; es caro',
  testimonials: [{ nombre: 'Caso ficticio: Dr. Luis', resultado: '+40 pacientes nuevos en 3 meses' }],
  recursos: { guias_pdfs: [], videos_testimonios: [], vsl_presentacion: { activo: false }, scripts_apertura: {} },
};
const PROFILE = { nombre: 'Prospecto', identidad: 'x', situacion: 'x', motivacion: 'x', objeciones: [], hechos_ocultos: [], estilo: '', canal: 'WhatsApp', encaje: 'alto', temperatura: 'tibio', resistencia: 'media' };

const say = (respuesta_prospecto, extra = {}) => ({ respuesta_prospecto, acepta_cita: 'no', estado_lead: 'abierto', revela: [], ...extra });
const coachSays = (puntuacion_mensaje, descubrimiento = {}, extra = {}) => ({
  etapa_set: 'S', que_hizo_bien: 'Bien.', que_mejorar: 'Algo.', mensaje_alternativo: '', recurso_sugerido: '', alerta: '',
  nivel_fomo: 20, probabilidad_cita: 30, descubrimiento: { situacion: '', motivo: '', no_encaje: '', ...descubrimiento },
  afirmacion_no_documentada: '', puntuacion_mensaje, ...extra,
});
// Conversación con el flujo completo (prospecto + coaching), como en la app.
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
const finalOf = (turns) => primerContactoFinalState(turns.at(-1).estado_lead, turns.at(-1).control);

// ─── 3 · Descubrimiento (C02 real) ───────────────────────────────────────
const C02 = [
  { setter: '¡Hola! 👋 Gracias por escribir. ¿Viste nuestro anuncio o algún contenido de la Dra. Ana? Me gustaría ayudarte, ¿de qué se trata tu consulta?',
    prospect: [say('Vi un anuncio en redes hace unos días sobre llenar agenda dental. ¿Cuánto cuesta?', { revela: ['motivo'] })], coach: coachSays(6) },
  { setter: 'Perfecto. El programa es de $1.800 USD o 3 cuotas de $650. Pero antes, me gustaría conocer tu situación. ¿Podemos agendar una llamada rápida con la Dra. Ana para ver si es para ti?',
    prospect: [say('Espera, ¿eso incluye publicidad o es solo estrategia? No quiero otro curso más.', { estado_lead: 'resistente' })], coach: coachSays(5) },
  // El coaching real citó como motivo la objeción del turno anterior.
  { setter: 'Buena pregunta. Es un programa completo de 90 días, no solo un curso. ¿Cuánto está llena tu agenda ahora?',
    prospect: [say('Agenda entre 55 y 65%. Tengo 2 sillones. ¿Pero ustedes qué hacen exactamente para traer pacientes?', { revela: ['situacion'] })],
    coach: coachSays(6, { motivo: 'No quiero otro curso más' }) },
  { setter: 'Esa es exactamente la conversación que necesitas tener con la Dra. Ana. Ella diseña la estrategia según tu consultorio. ¿Te viene bien una llamada mañana o pasado para que te lo explique directo?',
    prospect: [say('Dale, pero antes necesito saber si mi esposo puede estar. Él maneja las decisiones financieras.', { revela: ['motivo'], acepta_cita: 'condicionada', estado_lead: 'interesado' })],
    coach: coachSays(5, { situacion: 'Agenda entre 55 y 65%. Tengo 2 sillones.' }, { que_mejorar: 'Propone cita sin haber descubierto el motivo: por qué busca llenar agenda ahora.' }) },
  { setter: 'Perfecto, pasado a las 3 PM. Sí, sin costo. ¿Me pasas tu nombre para confirmarte el link?',
    prospect: [say('Camila Duarte. Prefiero que me envíes todo por este chat.', { revela: ['situacion', 'motivo'], acepta_cita: 'si', estado_lead: 'pidio_llamada' })],
    coach: coachSays(8, { situacion: 'Agenda entre 55 y 65%. Tengo 2 sillones.' }) },
];

describe('3 · una objeción no es un motivo (C02 real de la ronda 5)', () => {
  it('objeciones, condiciones y la descripción del anuncio no son motivos; los motivos reales sí', () => {
    for (const q of ['No quiero otro curso más', 'Espera, ¿eso incluye publicidad o es solo estrategia? No quiero otro curso más.', 'Vi un anuncio en redes hace unos días sobre llenar agenda dental.', 'Gasté sin ver resultados claros. Por eso desconfío un poco.', 'quiero que me explique bien cómo funciona antes de decidir'])
      expect(isMotiveQuote(q), q).toBe(false);
    for (const q of [
      'cuando hay un mes flojo me preocupa no cubrir los gastos. Hace poco invertí en equipamiento nuevo y necesito justificar eso.', // C01
      'Unos 15 a 20 pacientes nuevos en el mes. Con eso cubro gastos y respiro.', // C10
      'Necesito más pacientes nuevos sin depender solo de referidos', // C13
      'sueño con abrir un segundo consultorio. Pero la agenda actual no me lo permite todavía', // C03
      'Los gastos fijos me asustan. Alquiler alto, empleados fijos. Y mi socio insiste en que busque soluciones ya.', // C06
      'La energía durante el día. Me cuesta concentrarme en el trabajo y eso me afecta como líder.', // C14
      'Por eso escribí después de que un colega mencionó que mejoró sus pacientes nuevos.', // R09, ronda 3
    ]) expect(isMotiveQuote(q), q).toBe(true);
  });
  it('C02: la cita del último turno ya no se registra; el motivo «No quiero otro curso más» no se confirma', async () => {
    const turns = await playFull(DENTAL, { ...PROFILE, temperatura: 'frio' }, 'Info', C02);
    expect(turns[2].control.confirmado).not.toContain('motivo');
    const last = turns.at(-1);
    expect(last.awaitedCoach).toBe(true);
    expect(last.fallback).toBe('sin_descubrimiento');
    expect(last.estado_lead).not.toBe('pidio_llamada');
  });
  it('si el coaching cita un motivo en el mismo turno en que dice que falta, la cita de motivo no vale', async () => {
    const coach = coachSays(5, { motivo: 'Necesito más pacientes nuevos sin depender solo de referidos' }, { que_mejorar: 'Propone cita sin haber descubierto el motivo.' });
    const r = await runCoachTurn({ call: vi.fn(async () => coach), project: DENTAL, history: [{ role: 'prospect', content: 'Necesito más pacientes nuevos sin depender solo de referidos' }], setterText: '¿Agendamos?' });
    expect(r.discovery.motivo).toBeUndefined();
    expect(r.issues).toContain('motivo_descartado:el_coaching_dice_que_falta');
  });
});

// ─── 1 · Cita aceptada frente a cita válida (C10 real) ───────────────────
const C10_BASE = [
  { setter: 'Entiendo, los anuncios solos no son suficiente. ¿Cuándo fue esa experiencia con anuncios y qué pasó?',
    prospect: [say('Hace años, con Facebook ads. Gasté y casi nada. Ando entre 45 y 65 por ciento. Este mes especialmente flojo.', { revela: ['situacion'] })], coach: coachSays(7) },
  { setter: 'Con nuestro programa, clientes como el Dr. Luis consiguieron +40 pacientes nuevos en 3 meses, con garantía de resultados en 30 días o te devolvemos el dinero. ¿Cuántos sillones tienes?',
    prospect: [say('Tengo 2 sillones. Unos 15 a 20 pacientes nuevos en el mes. Con eso cubro gastos y respiro.', { revela: ['situacion', 'motivo'] })],
    coach: coachSays(5, { situacion: 'Ando entre 45 y 65 por ciento. Este mes especialmente flojo.' }) },
];
const C10_REPEAT = { setter: 'Sí, si en 30 días no ves resultados, te devolvemos todo. Sin complicaciones. ¿Cuál sería un resultado que justifique la inversión?',
  prospect: [say('¿Realmente me lo devuelven en 30 días? Necesitaría 15 a 20 pacientes.', { revela: ['motivo'] })],
  coach: coachSays(4, { motivo: 'Unos 15 a 20 pacientes nuevos en el mes. Con eso cubro gastos y respiro.' }) };
const C10_PROMISE = { setter: 'Con 2 sillones y agenda entre 45-65%, sí es realista. El Dr. Luis logró +40 en 3 meses; 15-20 en 30 es el piso. ¿Te gustaría una llamada con la Dra. Ana para ver tu caso específico?',
  prospect: [say('Dale, mañana a las 4 me va bien. ¿Es por videollamada?', { acepta_cita: 'si', estado_lead: 'pidio_llamada', revela: ['motivo'] })],
  coach: coachSays(7) };
const C10_FIX = { setter: 'Perdón, me equivoqué antes: no hay garantía de devolución, eso no está documentado. Lo que sí es real: el Dr. Luis, un caso documentado, sumó +40 pacientes nuevos en 3 meses. ¿Te gustaría una llamada con la Dra. Ana para ver tu caso?',
  prospect: [say('Gracias por aclararlo. Dale, mañana a las 4 me va bien. ¿Es por videollamada?', { acepta_cita: 'si', estado_lead: 'pidio_llamada', revela: ['motivo'] })],
  coach: coachSays(8, { motivo: 'Unos 15 a 20 pacientes nuevos en el mes. Con eso cubro gastos y respiro.' }) };

describe('1 · cita aceptada frente a cita pedagógicamente válida (C10 real)', () => {
  it('C10: la cita conseguida con la garantía inventada (y repetida) queda registrada, pero se guarda como cita no válida', async () => {
    const turns = await playFull(DENTAL, PROFILE, 'Hola, ¿cómo funciona?', [...C10_BASE, C10_REPEAT, C10_PROMISE]);
    const last = turns.at(-1);
    expect(last.estado_lead).toBe('pidio_llamada'); // lo que pasó en la conversación
    expect(last.desenlace).toBe('cita_aceptada');
    expect(finalOf(turns)).toBe(INVALID_APPOINTMENT_STATE); // lo que se guarda
    const { valida, pendientes } = citaValidity(last.control);
    expect(valida).toBe(false);
    expect(pendientes.join(' ')).toMatch(/garantia/);
    expect(pendientes.join(' ')).toMatch(/devolucion/);
    expect(pendientes.join(' ')).toMatch(/promesa de resultado/);
    // Cada turno con invención tiene tope de 3, incluida la repetición.
    expect(turns.map((t) => t.coaching.puntuacion_mensaje)).toEqual([7, 3, 3, 3]);
  });
  it('si el alumno rectifica explícitamente antes de la aceptación, la cita es válida', async () => {
    const turns = await playFull(DENTAL, PROFILE, 'Hola, ¿cómo funciona?', [...C10_BASE, C10_FIX]);
    expect(turns.at(-1).estado_lead).toBe('pidio_llamada');
    expect(citaValidity(turns.at(-1).control)).toEqual({ valida: true, pendientes: [] });
    expect(finalOf(turns)).toBe('pidio_llamada');
    expect(turns.at(-1).coaching.puntuacion_mensaje).toBe(8); // la rectificación no recibe tope
  });
  it('el precio incorrecto se corrige dando el precio documentado (C08)', () => {
    const wrong = setterClaimsOf('Hola! La inversión son 1.500 USD, o 3 cuotas de 500 USD. ¿Tienes consultorio dental propio?', DENTAL);
    expect(wrong.map((c) => c.tipo)).toContain('precio');
    expect(pendingClaimsAfter(wrong, 'Te corrijo: son 1.800 USD o 3 cuotas de 650 USD.', DENTAL, [])).toEqual([]);
    expect(pendingClaimsAfter(wrong, '¿Qué día te va bien?', DENTAL, [])).toEqual(wrong);
  });
  it('cita_no_valida no es un estado de éxito: no suma a la tasa de éxito ni a las citas; las demás modalidades no cambian', () => {
    expect(SUCCESS_STATES.primer_contacto).toEqual(['pidio_llamada']);
    for (const m of MODE_IDS) expect(SUCCESS_STATES[m]).not.toContain(INVALID_APPOINTMENT_STATE);
    expect(SUCCESS_STATES.outbound).toEqual(['pidio_llamada']);
    expect(SUCCESS_STATES.inbound).toEqual(['confirmado_con_entusiasmo']);
    expect(SUCCESS_STATES.reactivacion).toEqual(['quiere_reagendar']);
    // Sin invenciones pendientes, la cita es una cita; los demás estados no cambian.
    expect(primerContactoFinalState('pidio_llamada', createControlState(PROFILE))).toBe('pidio_llamada');
    expect(primerContactoFinalState('no_califica', { invenciones: [{ tipo: 'oferta', texto: 'x' }] })).toBe('no_califica');
  });
});

// ─── 2 · Aceptación con día y hora ───────────────────────────────────────
describe('2 · aceptación explícita con día y hora', () => {
  it('frases reales: con día y hora y sin condición previa es aceptada; con condición previa sigue condicionada', () => {
    const accepted = [
      'Dale, el jueves a las 18:30 me va bien. Pero quiero que Ana me explique bien ese tema de la garantía.', // C08 #7
      'Mañana en la tarde me viene bien, entre las 2 y las 4 pm. ¿A qué número me llamas?', // C01 #6
      'Sí, el martes a las 10 me sirve. ¿Cuánto dura la llamada?',
    ];
    for (const t of accepted) expect(normalizeAcceptance({ respuesta_prospecto: t, acepta_cita: 'condicionada' }), t).toBe('si');
    const conditioned = [
      'Dale, el jueves a las 5, pero antes dime cuánto cuesta.',
      'Sí, mañana a las 4, siempre que me confirmes que no hay que pagar nada para la llamada.',
      'Dale, pero antes necesito saber si mi esposo puede estar. Él maneja las decisiones financieras.', // C02 #4 (sin horario)
    ];
    for (const t of conditioned) expect(normalizeAcceptance({ respuesta_prospecto: t, acepta_cita: 'condicionada' }), t).toBe('condicionada');
    // Sin día ni hora («Dale, agendemos», C04 #7) o con una contrapropuesta, queda lo del modelo.
    expect(normalizeAcceptance({ respuesta_prospecto: 'Dale, agendemos. Pero que sea rápido porque trabajo mucho.', acepta_cita: 'condicionada' })).toBe('condicionada');
    expect(normalizeAcceptance({ respuesta_prospecto: 'Mañana no puedo. ¿Pasado a las 3 de la tarde?', acepta_cita: 'condicionada' })).toBe('condicionada');
    // Un «si» del modelo con una condición previa pasa a condicionada.
    expect(normalizeAcceptance({ respuesta_prospecto: 'Sí, el jueves a las 5, pero antes dime el precio.', acepta_cita: 'si' })).toBe('condicionada');
    expect(explicitScheduledAcceptance('Dale, el jueves a las 18:30 me va bien.')).toBe(true);
    expect(hasPriorCondition('Pero quiero que Ana me explique bien ese tema de la garantía.')).toBe(false);
  });
  it('en el turno, la aceptación con horario se registra como cita… solo si el plan la permite', async () => {
    const C08_P7 = 'Dale, el jueves a las 18:30 me va bien. Pero quiero que Ana me explique bien ese tema de la garantía.';
    const history = [{ role: 'prospect', content: 'Info' }, { role: 'setter', content: '¿Cómo está tu agenda?' }, { role: 'prospect', content: 'Al 60 %, con meses flojos que me preocupan.' }];
    const discovered = { ...createControlState(PROFILE), revelado: ['situacion', 'motivo'], confirmado: ['situacion', 'motivo'] };
    const call = vi.fn(async () => say(C08_P7, { acepta_cita: 'condicionada', estado_lead: 'interesado' }));
    const ok = await runProspectTurn({ call, project: DENTAL, profile: PROFILE, history, setterText: '¿Qué día y hora te va bien esta semana?', control: discovered });
    expect(ok).toMatchObject({ acepta_cita: 'si', estado_lead: 'pidio_llamada', desenlace: 'cita_aceptada', retried: false });
    expect(ok.prospectIssues).toContain('aceptacion_normalizada:condicionada->si');
    // Sin descubrimiento confirmado no hay cita, y el texto tampoco puede
    // mostrar una aceptación con horario (coherencia, ronda 6): se pide de
    // nuevo y, si persiste, entra el respaldo.
    const blocked = await runProspectTurn({ call, project: DENTAL, profile: PROFILE, history, setterText: '¿Qué día y hora te va bien esta semana?', control: createControlState(PROFILE) });
    expect(blocked).toMatchObject({ retried: true, fallback: 'sin_descubrimiento' });
    expect(blocked.estado_lead).not.toBe('pidio_llamada');
    expect(blocked.respuesta_prospecto).not.toMatch(/18:30/);
  });
});

// ─── 4 · Promesas e invenciones ──────────────────────────────────────────
describe('4 · promesas repetidas e invenciones sin cifras', () => {
  const conv = 'Ando entre 45 y 65 por ciento. Unos 15 a 20 pacientes nuevos en el mes. ¿Realmente me lo devuelven en 30 días?';
  it('C10: la garantía repetida con otras palabras y la promesa de resultado se detectan', () => {
    expect(setterClaimsOf('Sí, si en 30 días no ves resultados, te devolvemos todo. Sin complicaciones.', DENTAL, conv).map((c) => c.texto)).toContain('devolucion');
    const promise = setterClaimsOf('Con 2 sillones y agenda entre 45-65%, sí es realista. El Dr. Luis logró +40 en 3 meses; 15-20 en 30 es el piso.', DENTAL, conv).map((c) => c.texto).join(' ');
    expect(promise).toMatch(/promesa de resultado «15-20 en 30 es el piso\.»/);
    expect(promise).toMatch(/promesa de resultado «Con 2 sillones/);
    expect(setterClaimsOf('Con eso llegarías a 15-20 pacientes.', DENTAL, conv).length).toBeGreaterThan(0);
  });
  it('C06: «3 horas por semana» es una cifra inventada aunque el precio diga «3 cuotas»', () => {
    expect(setterClaimsOf('La Dra. Ana trabaja con un enfoque que solo requiere 3 horas por semana.', DENTAL).map((c) => c.texto)).toEqual(['cifra «3 horas»']);
  });
  it('no son promesas: preguntas, negaciones, devolver una llamada, citar el caso documentado, repetir la cifra del prospecto', () => {
    for (const t of [
      'Si tuvieras un sistema que trajera 15-20 pacientes, ¿cómo cambiaría tu mes?',
      'No hay garantía escrita; eso lo ves con el equipo.',
      'No ofrecemos devolución.',
      'Te devuelvo la llamada mañana.',
      'El Dr. Luis, un caso documentado, sumó +40 pacientes nuevos en 3 meses.',
      'Me dijiste 15-20 pacientes: ¿qué pasaría si llegaras a eso?',
    ]) expect(setterClaimsOf(t, DENTAL, conv), t).toEqual([]);
  });
  it('características inventadas sin cifras: las señala el coaching y el código verifica la frase y que no sea lo documentado', () => {
    const c03 = 'Entiendo la preocupación. El programa está diseñado para que no agregues tareas, sino que optimices lo que ya haces. ¿De dónde vienen tus pacientes nuevos ahora?';
    expect(verifyCoachInvention('El programa está diseñado para que no agregues tareas, sino que optimices lo que ya haces', c03, DENTAL)).toBeTruthy();
    // La frase tiene que estar en el mensaje del alumno.
    expect(verifyCoachInvention('incluye gestión completa de redes sociales', c03, DENTAL)).toBeNull();
    // Lo documentado (promesa, nicho) no es una invención.
    const doc = 'La Dra. Ana ayuda a odontólogos con consultorio propio a llenar la agenda con pacientes nuevos sin depender solo de referidos.';
    expect(verifyCoachInvention('ayuda a odontólogos con consultorio propio a llenar la agenda con pacientes nuevos sin depender solo de referidos', doc, DENTAL)).toBeNull();
  });
  it('una característica inventada señalada por el coaching recibe tope de 3 e invalida la cita si no se corrige', async () => {
    const c08 = 'Buena pregunta. Tú das la estrategia inicial, nosotros ejecutamos. Son pocas reuniones tuyas. ¿Te gustaría una llamada con la Dra. Ana?';
    const coach = coachSays(6, {}, { afirmacion_no_documentada: 'Tú das la estrategia inicial, nosotros ejecutamos. Son pocas reuniones tuyas.' });
    const r = await runCoachTurn({ call: vi.fn(async () => coach), project: DENTAL, history: [{ role: 'prospect', content: 'Info' }], setterText: c08 });
    expect(r.coaching.puntuacion_mensaje).toBe(3);
    expect(r.invencion).toMatch(/nosotros ejecutamos/);
    const control = applyCoachResult({ ...createControlState(PROFILE), turno: 4 }, r);
    expect(primerContactoFinalState('pidio_llamada', control)).toBe(INVALID_APPOINTMENT_STATE);
    // «Me equivoqué, eso no está confirmado» la corrige.
    expect(pendingClaimsAfter(control.invenciones, 'Me equivoqué: lo de las reuniones no está confirmado, eso lo ves con la Dra. en la llamada.', DENTAL, [])).toEqual([]);
  });
});

// ─── 5 · Coherencia de notas ─────────────────────────────────────────────
describe('5 · coherencia de las notas', () => {
  it('C07: el coaching recibe que el precio aproximado es válido (y que uno incorrecto no lo es)', () => {
    expect(priceNoteFor('Hola 👋 El programa ronda los 2 mil dólares y se puede pagar en 3 cuotas. ¿Cómo está tu agenda?', DENTAL, 'Precio')).toMatch(/aproximación honesta.*no la penalices/);
    expect(priceNoteFor('Son 1.800 USD o 3 cuotas de 650 USD.', DENTAL, 'Precio')).toMatch(/coincide/);
    expect(priceNoteFor('La inversión son 1.500 USD.', DENTAL, 'Precio')).toMatch(/NO coincide/);
    expect(priceNoteFor('¿Cómo está tu agenda?', DENTAL, '')).toBe('');
    expect(priceNoteFor('Es accesible.', { ...DENTAL, price: '' }, '')).toBe('');
    expect(buildPrimerContactoCoachMessage([], 'Ronda los 2 mil.', 'nota de prueba')).toMatch(/PRECIO EN ESTE MENSAJE \(lo verificó el sistema\): nota de prueba/);
  });
  it('el coaching evalúa solo el mensaje actual, puede dar 10 y debe marcar las invenciones sin cifras', () => {
    const prompt = buildPrimerContactoCoachPrompt(DENTAL);
    expect(prompt).toContain('Evalúa SOLO el mensaje del alumno a evaluar');
    expect(prompt).toContain('no bajes esta nota por ellos');
    expect(prompt).toContain('es una invención aunque no tenga números');
    expect(prompt).toContain('"afirmacion_no_documentada": ""');
    expect(prompt).toContain('10 si además conecta con lo que contó el prospecto');
  });
  it('un 10 sin invenciones se mantiene; una nota no se baja por un error de un turno anterior ya corregido', async () => {
    const ten = await runCoachTurn({ call: vi.fn(async () => coachSays(10)), project: DENTAL, history: [{ role: 'prospect', content: 'Necesito más pacientes nuevos.' }], setterText: 'Dijiste que necesitas más pacientes nuevos: ¿te parece una llamada con la Dra. Ana para ver cómo lograrlo en tu consultorio?' });
    expect(ten.coaching.puntuacion_mensaje).toBe(10);
    const history = [{ role: 'prospect', content: 'Precio' }, { role: 'setter', content: 'Son 1.500 USD.' }, { role: 'prospect', content: 'Ok, ¿y cómo funciona?' }];
    const later = await runCoachTurn({ call: vi.fn(async () => coachSays(8)), project: DENTAL, history, setterText: '¿Cómo está hoy tu agenda?' });
    expect(later.coaching.puntuacion_mensaje).toBe(8);
    expect(later.claims).toEqual([]);
  });
});
