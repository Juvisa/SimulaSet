// Control de estados de Inbound — Primer contacto: señales del texto,
// evasivas, paciencia, descubrimiento, encaje y desenlaces. Sin IA: cada
// turno se simula con planTurn + resolveTurn y una respuesta fija del
// prospecto. Varias frases son reales de la segunda ronda con Haiku.
import { describe, expect, it } from 'vitest';
import {
  OUTCOMES, amountsIn, answersPrice, asksPrice, asksToAdvance, checkProspectReply, createControlState,
  fallbackFor, pitchesLink, planTurn, proposesCall, resolveTurn, verifyFitEvidence,
} from './primerContactoControl';
import { PRIMER_CONTACTO_STATES } from './primerContacto';
import { isTerminalState } from './simulatorModes';
import { PROFILE, PROJECT } from './primerContacto.fixtures';

const NO_PRICE_PROJECT = { ...PROJECT, price: '' };
const LOW_DEFINITIVE = { ...PROFILE, encaje: 'bajo', incompatibilidad: 'definitiva', motivo_no_encaje: 'cierra el consultorio en dos años' };
const LOW_SUPERABLE = { ...PROFILE, encaje: 'bajo', incompatibilidad: 'superable', motivo_no_encaje: 'cree que no puede pagarlo de una vez', que_lo_cambiaria: 'las 3 cuotas de 650 USD' };

// Juega una conversación: cada paso es [mensaje previo del prospecto, mensaje
// del alumno, respuesta del prospecto]. Devuelve el resultado de cada turno.
const play = (profile, steps, project = PROJECT) => {
  let control = createControlState(profile);
  return steps.map(([lastProspectText, setterText, raw]) => {
    const plan = planTurn(control, { project, profile, lastProspectText, setterText });
    const issues = checkProspectReply(raw, plan, control, profile);
    const r = resolveTurn(control, plan, raw, profile);
    control = r.control;
    return { plan, ...r, issues: [...issues, ...r.issues] };
  });
};
const reply = (respuesta_prospecto, extra = {}) => ({ respuesta_prospecto, acepta_cita: 'no', estado_lead: 'abierto', revela: [], ...extra });

describe('señales verificables en el texto', () => {
  it('pregunta de precio del prospecto', () => {
    for (const t of ['Precio', '¿Cuánto cuesta exactamente?', 'Y no me has dicho el precio. ¿Es 1.500, 2.000, 3.000?', '¿Cuánto es el rango? Dame un número aproximado', 'Depende. ¿Cuánto tiempo me va a quitar por semana? Y cuánto cuesta.']) expect(asksPrice(t)).toBe(true);
    for (const t of ['Info', 'Tengo dos sillones y la agenda floja', 'Me cuesta comprometer una llamada']) expect(asksPrice(t)).toBe(false);
  });
  it('precio documentado: solo responde quien da la cifra (ronda 2, E02)', () => {
    expect(answersPrice('Son 1.800 USD de una vez, o 3 cuotas de 650 USD.', PROJECT)).toBe(true);
    expect(answersPrice('Ronda los 1800 o tres cuotas.', PROJECT)).toBe(true);
    for (const t of ['Eso lo vemos más adelante. ¿Cuántos pacientes nuevos tienes al mes?', 'Mira, los rangos que mencionas están en la zona. La Dra. Ana te da el precio exacto en la llamada.', 'Es accesible para consultorio con tu perfil.']) expect(answersPrice(t, PROJECT)).toBe(false);
  });
  it('precio documentado escrito en otros formatos (verificación previa a la ronda 3)', () => {
    for (const t of ['Son 1.800 USD.', 'Son 1,800 USD.', 'US$1.800 de contado.', 'Sale 1.8k.', 'Son 1,8 mil dólares.', 'Mil ochocientos dólares.', 'Tres cuotas de seiscientos cincuenta.', '650 al mes durante 3 meses.', 'Ronda los 2 mil.', 'Menos de 2.000 USD.']) expect(answersPrice(t, PROJECT), t).toBe(true);
    for (const t of ['Unos 300 dólares menos que una agencia.', 'Tiene 5 módulos.', 'Más o menos lo que pagabas a la agencia.']) expect(answersPrice(t, PROJECT), t).toBe(false);
    expect(amountsIn('mil ochocientos')).toEqual([1800]);
    expect(amountsIn('1,8 mil y 1.800 y 1.8k')).toEqual([1800, 1800, 1800]);
  });
  it('preguntas de precio en otras formas', () => {
    for (const t of ['¿Qué valor tiene?', '¿Y cuánto me costaría?', '¿Cuánto hay que pagar?', '¿Es caro?', '$?', '¿Me pasas los costos?']) expect(asksPrice(t), t).toBe(true);
    expect(asksPrice('¿Cuánto tiempo me exige por semana?')).toBe(false);
  });
  it('precio NO documentado: decir con honestidad que se ve en la llamada no es evasiva', () => {
    expect(answersPrice('Honestamente, el precio no lo tengo documentado; lo define el equipo en la llamada según tu caso.', NO_PRICE_PROJECT)).toBe(true);
    expect(answersPrice('El tiempo y el costo los detalla Marta en la llamada.', NO_PRICE_PROJECT)).toBe(true);
    expect(answersPrice('¿Y cuántas horas trabajas por día?', NO_PRICE_PROJECT)).toBe(false);
  });
  it('propuesta de cita (y lo que no lo es)', () => {
    for (const t of ['¿Podemos agendar 15 min?', '¿Qué día te viene mejor: jueves o viernes?', '¿Te parece una llamada corta para verlo?', '¿Mañana a las 4 te va bien?']) expect(proposesCall(t)).toBe(true);
    for (const t of ['Eso lo detalla el equipo en la llamada.', '¿Cómo está tu agenda este mes?', '¿Cuándo te diste cuenta de que los referidos no alcanzaban?']) expect(proposesCall(t)).toBe(false);
  });
  it('pitch con enlace y pedido de avanzar', () => {
    expect(pitchesLink('¡El programa es increíble! Inscríbete aquí: [enlace]')).toBe(true);
    expect(pitchesLink('Mira https://ejemplo.invalid/pago')).toBe(true);
    expect(pitchesLink('¿Qué te llamó la atención?')).toBe(false);
    expect(asksToAdvance('Hola, ¿cómo hago para empezar?')).toBe(true);
    expect(asksToAdvance('Precio')).toBe(false);
  });
});

describe('evasivas de precio: conteo verificable y despedida', () => {
  const EVADE = 'Eso lo vemos más adelante. ¿Qué te llamó la atención?';
  it('resistencia media: a la tercera evasiva el turno es una despedida (cerrado), diga lo que diga la IA', () => {
    const turns = play({ ...PROFILE, resistencia: 'media' }, [
      ['Precio', EVADE, reply('Ya, pero ¿más o menos cuánto?')],
      ['Ya, pero ¿más o menos cuánto?', EVADE, reply('Necesito saber el precio.')],
      ['Necesito saber el precio.', EVADE, reply('Dale, agendemos', { acepta_cita: 'si', estado_lead: 'pidio_llamada' })],
    ]);
    expect(turns.map((t) => t.plan.evasivas)).toEqual([1, 2, 3]);
    expect(turns.map((t) => t.plan.despedida)).toEqual([null, null, 'evasivas']);
    expect(turns[2].issues).toContain('aceptacion_no_permitida:despedida_evasivas');
    expect(turns[2]).toMatchObject({ estado_lead: 'cerrado', acepta_cita: 'no', desenlace: 'despedida' });
  });
  it('resistencia alta: se va a la segunda', () => {
    const turns = play({ ...PROFILE, resistencia: 'alta' }, [
      ['Precio', EVADE, reply('¿Cuánto?')],
      ['¿Cuánto?', EVADE, reply('Me voy, gracias.', { estado_lead: 'cerrado' })],
    ]);
    expect(turns[1]).toMatchObject({ desenlace: 'despedida', estado_lead: 'cerrado' });
  });
  it('una respuesta honesta reinicia el conteo y el prospecto sigue (cambio de opinión justificado)', () => {
    const turns = play({ ...PROFILE, resistencia: 'media' }, [
      ['Precio', EVADE, reply('¿Cuánto?')],
      ['¿Cuánto?', EVADE, reply('¿Pero cuánto cuesta?', { estado_lead: 'resistente' })],
      ['¿Pero cuánto cuesta?', 'Tienes razón: son 1.800 USD o 3 cuotas de 650. ¿Te cuento qué incluye?', reply('Ok, eso es más claro.', { estado_lead: 'interesado' })],
    ]);
    expect(turns.map((t) => t.plan.evasivas)).toEqual([1, 2, 0]);
    expect(turns[2]).toMatchObject({ desenlace: 'abierta', estado_lead: 'interesado' });
  });
  it('precio no documentado: «lo vemos en la llamada» no suma evasivas', () => {
    const turns = play(PROFILE, [['¿Cuánto cuesta?', 'No hay un número fijo documentado; lo define el equipo en la llamada.', reply('Ok.')]], NO_PRICE_PROJECT);
    expect(turns[0].plan).toMatchObject({ evasion: false, evasivas: 0 });
  });
  it('mientras el precio está pendiente no puede aceptar la cita, sí condicionarla', () => {
    const control = { ...createControlState(PROFILE), revelado: ['situacion', 'motivo'] };
    const plan = planTurn(control, { project: PROJECT, profile: PROFILE, lastProspectText: '¿Cuánto cuesta?', setterText: '¿Te parece una llamada el jueves?' });
    expect(plan.bloqueos).toEqual(['precio_pendiente']);
    expect(checkProspectReply(reply('Sí, pero antes dime el precio', { acepta_cita: 'condicionada' }), plan, control, PROFILE)).toEqual([]);
    expect(checkProspectReply(reply('Dale', { acepta_cita: 'si' }), plan, control, PROFILE)).toEqual(['aceptacion_no_permitida:precio_pendiente']);
  });
});

describe('descubrimiento mínimo y paciencia', () => {
  it('sin situación y motivo no se acepta la cita; con ambos, decide el prospecto', () => {
    const before = play(PROFILE, [['Info', '¿Te parece una llamada el jueves?', reply('Dale', { acepta_cita: 'si' })]]);
    expect(before[0].plan.bloqueos).toContain('sin_descubrimiento');
    expect(before[0].issues).toContain('aceptacion_no_permitida:sin_descubrimiento');

    const turns = play(PROFILE, [
      ['Info', '¡Hola! ¿Qué te llamó la atención?', reply('Tengo consultorio y la agenda está al 50 %.', { revela: ['situacion'] })],
      ['Tengo consultorio y la agenda está al 50 %.', '¿Y por qué justo ahora?', reply('Quiero abrir otro consultorio este año.', { revela: ['motivo'], estado_lead: 'interesado' })],
      ['Quiero abrir otro consultorio este año.', 'Tiene sentido. ¿Te parece una llamada el jueves para ver tu caso?', reply('Dale, el jueves.', { acepta_cita: 'si', estado_lead: 'interesado' })],
    ]);
    expect(turns[2].plan.puedeAceptar).toBe(true);
    expect(turns[2]).toMatchObject({ issues: [], estado_lead: 'pidio_llamada', desenlace: 'cita_aceptada' });
    expect(isTerminalState('primer_contacto', turns[2].estado_lead)).toBe(true);
  });
  it('si el prospecto cuenta todo en un mensaje, una sola pregunta basta (no hay un número fijo)', () => {
    const turns = play(PROFILE, [
      ['Info', '¿Qué te trajo por aquí?', reply('Tengo un consultorio con la agenda floja y quiero llenarla antes de fin de año.', { revela: ['situacion', 'motivo'] })],
      ['Tengo un consultorio…', '¿Te parece una llamada el jueves?', reply('Sí, dale.', { acepta_cita: 'si' })],
    ]);
    expect(turns[1].desenlace).toBe('cita_aceptada');
  });
  it('aceptar no es obligatorio: con todo cumplido, el prospecto puede decir que no y la conversación sigue', () => {
    const control = { ...createControlState(PROFILE), revelado: ['situacion', 'motivo'] };
    const plan = planTurn(control, { project: PROJECT, profile: PROFILE, lastProspectText: 'Ok', setterText: '¿Agendamos el jueves?' });
    const r = resolveTurn(control, plan, reply('Prefiero pensarlo un poco.', { estado_lead: 'interesado' }), PROFILE);
    expect(r).toMatchObject({ estado_lead: 'interesado', desenlace: 'abierta' });
  });
  it('cita forzada sin descubrimiento (ronda 2, E08): resistencia alta se despide a la segunda insistencia', () => {
    const turns = play({ ...PROFILE, resistencia: 'alta' }, [
      ['Info', 'Hola, ¿agendamos una llamada mañana a las 4?', reply('¿De qué se trata?')],
      ['¿De qué se trata?', 'Te explico en la llamada, ¿jueves a las 4?', reply('Dale, jueves a las 4 está bien', { acepta_cita: 'si', estado_lead: 'pidio_llamada' })],
    ]);
    expect(turns.map((t) => t.plan.presiones)).toEqual([1, 2]);
    expect(turns[1]).toMatchObject({ desenlace: 'despedida', estado_lead: 'cerrado', acepta_cita: 'no' });
  });
  it('si el prospecto pide avanzar, proponer la llamada no es presión', () => {
    const plan = planTurn(createControlState(PROFILE), { project: PROJECT, profile: PROFILE, lastProspectText: 'Hola, ¿cómo hago para empezar?', setterText: '¿Te parece una llamada corta?' });
    expect(plan).toMatchObject({ propone: true, presion: false });
  });
  it('pitch con enlace cuenta como presión aunque haya descubrimiento', () => {
    const control = { ...createControlState(PROFILE), revelado: ['situacion', 'motivo'] };
    const plan = planTurn(control, { project: PROJECT, profile: PROFILE, lastProspectText: 'Ok', setterText: 'Inscríbete aquí: [enlace]' });
    expect(plan).toMatchObject({ pitch: true, presion: true, presiones: 1 });
  });
});

describe('encaje bajo', () => {
  it('definitivo: no acepta aunque haya descubrimiento; no_califica cuando el motivo ya salió', () => {
    const turns = play(LOW_DEFINITIVE, [
      ['Info', '¿Qué te llamó la atención?', reply('Tengo consultorio, pero lo cierro en dos años.', { revela: ['situacion', 'no_encaje'] })],
      ['…lo cierro en dos años.', '¿Y qué te gustaría resolver mientras tanto?', reply('Nada grande, solo curiosidad.', { revela: ['motivo'] })],
      ['Nada grande…', '¿Te parece una llamada el jueves?', reply('Dale', { acepta_cita: 'si' })],
      ['Dale', 'Entiendo, por lo que me cuentas hoy no sería para ti. Si cambia algo, aquí estoy.', reply('Gracias por la honestidad.', { estado_lead: 'no_califica' })],
    ]);
    expect(turns[2].plan.bloqueos).toEqual(['encaje_definitivo']);
    expect(turns[2].issues).toContain('aceptacion_no_permitida:encaje_definitivo');
    expect(turns[3]).toMatchObject({ estado_lead: 'no_califica', desenlace: 'no_califica' });
    expect(isTerminalState('primer_contacto', 'no_califica')).toBe(true);
  });
  it('no_califica no se registra si el motivo todavía no salió en la conversación', () => {
    const [t] = play(LOW_DEFINITIVE, [['Info', 'Hola, ¿qué te llamó la atención?', reply('No es para mí.', { estado_lead: 'no_califica' })]]);
    expect(t).toMatchObject({ estado_lead: 'resistente', issues: ['no_califica_no_permitido'] });
  });
  it('superable: acepta solo con información nueva del alumno, dicha después de conocer el motivo', () => {
    const steps = [
      ['Info', '¿Qué te llamó la atención?', reply('Tengo consultorio y la agenda floja.', { revela: ['situacion'] })],
      ['…agenda floja.', '¿Por qué ahora?', reply('Quiero llenarla, pero no puedo pagar 1.800 de una.', { revela: ['motivo', 'no_encaje'] })],
    ];
    const accept = (setterText, cambio) => play(LOW_SUPERABLE, [...steps, ['…de una.', setterText, reply('Ah, así sí. Dale el jueves.', { acepta_cita: 'si', cambio_encaje: cambio })]])[2];

    const ok = accept('También puede ser en 3 cuotas de 650 USD. ¿Te parece una llamada el jueves?', '3 cuotas de 650 USD');
    expect(ok).toMatchObject({ issues: [], desenlace: 'cita_aceptada' });
    expect(ok.control.cambioEncaje).toBe('3 cuotas de 650 USD');

    expect(accept('¿Te parece una llamada el jueves?', '').issues).toEqual(['aceptacion_no_permitida:encaje_sin_informacion_nueva']);
    expect(accept('¿Te parece una llamada el jueves?', 'el programa tiene garantía total').issues).toEqual(['aceptacion_no_permitida:encaje_sin_informacion_nueva']);
  });
  it('la evidencia debe estar en lo que dijo el alumno', () => {
    expect(verifyFitEvidence('3 cuotas de 650 USD', ['Puede ser en 3 cuotas de 650 USD.'])).toBe(true);
    expect(verifyFitEvidence('garantía de devolución', ['Puede ser en 3 cuotas de 650 USD.'])).toBe(false);
    expect(verifyFitEvidence('sí', ['sí'])).toBe(false);
  });
});

describe('cita condicionada', () => {
  it('«sí, pero antes…» queda como condicionada (estado interesado) hasta resolverse', () => {
    const profile = PROFILE;
    let control = { ...createControlState(profile), revelado: ['situacion', 'motivo'] };
    const step = (lastProspectText, setterText, raw) => {
      const plan = planTurn(control, { project: PROJECT, profile, lastProspectText, setterText });
      const r = resolveTurn(control, plan, raw, profile);
      control = r.control;
      return r;
    };
    expect(step('Ok', '¿Te parece una llamada el jueves?', reply('Sí, pero antes quiero saber si incluye algo para el equipo.', { acepta_cita: 'condicionada', estado_lead: 'interesado' })))
      .toMatchObject({ estado_lead: 'interesado', desenlace: 'cita_condicionada' });
    expect(step('…para el equipo.', 'Eso lo detalla la Dra. Ana en la llamada.', reply('Ok, entiendo.', { estado_lead: 'interesado' })).desenlace).toBe('cita_condicionada');
    expect(step('Ok, entiendo.', '¿Entonces agendamos el jueves?', reply('Dale, el jueves.', { acepta_cita: 'si' })).desenlace).toBe('cita_aceptada');
  });
  it('si vuelve a proponerse y el prospecto dice que no, deja de estar condicionada', () => {
    const control = { ...createControlState(PROFILE), revelado: ['situacion', 'motivo'], citaPendiente: true, desenlace: 'cita_condicionada' };
    const plan = planTurn(control, { project: PROJECT, profile: PROFILE, lastProspectText: 'Ok', setterText: '¿Agendamos el jueves?' });
    expect(resolveTurn(control, plan, reply('Mejor no por ahora.', { estado_lead: 'resistente' }), PROFILE).desenlace).toBe('abierta');
  });
});

describe('desenlaces y estados existentes', () => {
  it('cada desenlace se representa con un estado que ya existe (no hay valores nuevos de final_state)', () => {
    const representations = {
      cita_aceptada: 'pidio_llamada', cita_condicionada: 'interesado', abierta: 'abierto', despedida: 'cerrado', no_califica: 'no_califica',
    };
    expect(Object.keys(representations).sort()).toEqual([...OUTCOMES].sort());
    for (const state of Object.values(representations)) expect(PRIMER_CONTACTO_STATES).toContain(state);
    expect(['cita_aceptada', 'despedida', 'no_califica'].every((o) => isTerminalState('primer_contacto', representations[o]))).toBe(true);
    expect(['cita_condicionada', 'abierta'].some((o) => isTerminalState('primer_contacto', representations[o]))).toBe(false);
  });
  it('un cierre espontáneo de la IA se respeta pero queda registrado', () => {
    const [t] = play(PROFILE, [['Info', '¿Qué te llamó la atención?', reply('Bueno, gracias, chau.', { estado_lead: 'cerrado' })]]);
    expect(t).toMatchObject({ desenlace: 'despedida', issues: ['cierre_espontaneo'] });
  });
  it('mensajes largos se marcan para reintento (1,5 veces el límite de su resistencia)', () => {
    const control = createControlState({ ...PROFILE, resistencia: 'alta' });
    const plan = planTurn(control, { project: PROJECT, profile: { ...PROFILE, resistencia: 'alta' }, lastProspectText: 'Info', setterText: '¿Qué te llamó la atención?' });
    const long = reply(Array.from({ length: 22 }, (_, i) => `palabra${i}`).join(' '));
    expect(checkProspectReply(long, plan, control, { ...PROFILE, resistencia: 'alta' })).toEqual(['largo:22']);
    expect(checkProspectReply(reply('Corto y al grano.'), plan, control, { ...PROFILE, resistencia: 'alta' })).toEqual([]);
  });
  it('respaldo acorde al motivo del bloqueo', () => {
    const control = createControlState(PROFILE);
    const plan = planTurn(control, { project: PROJECT, profile: PROFILE, lastProspectText: 'Info', setterText: '¿Agendamos?' });
    expect(fallbackFor(plan, ['aceptacion_no_permitida:sin_descubrimiento'])).toMatchObject({ key: 'sin_descubrimiento', reply: { acepta_cita: 'no' } });
    const farewell = planTurn({ ...control, evasivas: 2 }, { project: PROJECT, profile: PROFILE, lastProspectText: '¿Cuánto cuesta?', setterText: 'Lo vemos luego.' });
    expect(fallbackFor(farewell, [])).toMatchObject({ key: 'despedida_evasivas', reply: { estado_lead: 'cerrado' } });
  });
});
