// Flujo de un turno de Primer contacto con una IA simulada: qué recibe cada
// llamada (C2), reintentos por eco (C5) y por puntuación inválida (C3),
// aceptación de la cita (C4) y mensaje sugerido sin datos inventados (C1).
import { describe, expect, it, vi } from 'vitest';
import {
  COACH_TURN_OPTIONS, PROFILE_OPTIONS, PROSPECT_TURN_OPTIONS,
  generatePrimerContactoProfile, runCoachTurn, runPrimerContactoTurn, runProspectTurn, startPrimerContactoTurn,
} from './primerContactoTurn';
import { PROFILE, PROJECT } from './primerContacto.fixtures';
import { createControlState } from './primerContactoControl';

const HISTORY = [
  { role: 'prospect', content: 'Info' },
  { role: 'setter', content: '¡Hola! ¿Qué te llamó la atención de la publicación?' },
  { role: 'prospect', content: 'Lo de no depender de referidos' },
  { role: 'system', content: 'Error: algo falló' },
];
const SETTER = '¿Y cómo te llegan hoy los pacientes nuevos?';
const NEW_REPLY = 'Casi todo por referidos, y este mes vino flojo.';
const COACH_OK = { etapa_set: 'S', que_hizo_bien: 'Pregunta abierta.', que_mejorar: 'Profundiza en el costo.', mensaje_alternativo: '¿Qué pasa en los meses flojos?', alerta: '', nivel_fomo: 20, probabilidad_cita: 30, puntuacion_mensaje: 8 };

// call() simulado: distingue prospecto y coaching por el prompt de sistema.
const fakeCall = ({ prospect = [], coach = [] } = {}) => {
  const p = [...prospect]; const k = [...coach];
  const call = vi.fn(async (system) => {
    const isCoach = String(system).includes('Eres coach de appointment setting');
    const next = isCoach ? k.shift() : p.shift();
    if (next instanceof Error) throw next;
    return next ?? (isCoach ? COACH_OK : { respuesta_prospecto: NEW_REPLY, acepta_cita: 'no', estado_lead: 'interesado' });
  });
  call.forCoach = () => call.mock.calls.filter(([s]) => String(s).includes('Eres coach'));
  call.forProspect = () => call.mock.calls.filter(([s]) => !String(s).includes('Eres coach'));
  return call;
};

describe('turno completo', () => {
  it('dos llamadas por simulator_turn (Haiku) dentro del tope del servidor', async () => {
    const call = fakeCall();
    const r = await runPrimerContactoTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: SETTER });
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.forProspect()[0][2]).toBe(PROSPECT_TURN_OPTIONS);
    expect(call.forCoach()[0][2]).toBe(COACH_TURN_OPTIONS);
    for (const o of [PROSPECT_TURN_OPTIONS, COACH_TURN_OPTIONS]) expect(o).toMatchObject({ operation: 'simulator_turn', model: 'haiku' });
    expect(PROSPECT_TURN_OPTIONS.maxTokens).toBeLessThanOrEqual(800);
    expect(COACH_TURN_OPTIONS.maxTokens).toBeLessThanOrEqual(800);
    expect(r).toMatchObject({ respuesta_prospecto: NEW_REPLY, estado_lead: 'interesado', coaching: { puntuacion_mensaje: 8, etapa_set: 'S' } });
  });

  it('C2: el coaching no recibe el perfil privado ni la respuesta nueva del prospecto', async () => {
    const call = fakeCall();
    await runPrimerContactoTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: SETTER });
    const [system, messages] = call.forCoach()[0];
    const everything = system + JSON.stringify(messages);
    for (const secret of [...PROFILE.hechos_ocultos, PROFILE.emocion, PROFILE.motivacion, PROFILE.identidad]) expect(everything).not.toContain(secret);
    expect(everything).not.toContain(NEW_REPLY);
    expect(everything).toContain(SETTER);
    expect(everything).toContain('Lo de no depender de referidos');
    expect(everything).not.toContain('Error: algo falló');
  });

  it('el prospecto sí recibe su perfil y el historial en roles alternos', async () => {
    const call = fakeCall();
    await runPrimerContactoTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: SETTER });
    const [system, messages] = call.forProspect()[0];
    expect(system).toContain(PROFILE.hechos_ocultos[0]);
    expect(messages).toEqual([
      { role: 'assistant', content: 'Info' }, { role: 'user', content: '¡Hola! ¿Qué te llamó la atención de la publicación?' },
      { role: 'assistant', content: 'Lo de no depender de referidos' }, { role: 'user', content: SETTER },
    ]);
  });

  it('si falla el coaching, el alumno igual ve al prospecto (sin puntuación)', async () => {
    const call = fakeCall({ coach: [new Error('red'), new Error('red')] });
    const r = await runPrimerContactoTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: SETTER });
    expect(r.respuesta_prospecto).toBe(NEW_REPLY);
    expect(r.coaching).toBeNull();
    expect(r.coachingIssues[0]).toMatch(/^coaching_error/);
  });

  it('si falla el prospecto, el turno falla (como hoy)', async () => {
    const call = fakeCall({ prospect: [new Error('Límite alcanzado')] });
    await expect(runPrimerContactoTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: SETTER })).rejects.toThrow('Límite alcanzado');
  });
});

describe('C5 · eco', () => {
  it('si el prospecto repite el mensaje del alumno, se pide una vez más', async () => {
    const call = fakeCall({ prospect: [{ respuesta_prospecto: SETTER, estado_lead: 'abierto' }, { respuesta_prospecto: NEW_REPLY, estado_lead: 'abierto' }] });
    const r = await runProspectTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: SETTER });
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[1][0]).toContain('repetía el mensaje del setter');
    expect(r).toMatchObject({ respuesta_prospecto: NEW_REPLY, echo: false, echoRetried: true });
  });
  it('sin eco no hay reintento', async () => {
    const call = fakeCall();
    const r = await runProspectTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: SETTER });
    expect(call).toHaveBeenCalledTimes(1);
    expect(r.echoRetried).toBe(false);
  });
});

describe('C4 · aceptación de la cita', () => {
  // El alumno ya conoce la situación y el motivo: la cita está permitida.
  const discovered = { ...createControlState(PROFILE), revelado: ['situacion', 'motivo'], confirmado: ['situacion', 'motivo'] };
  const turn = (raw, profile = PROFILE, control = discovered) => runProspectTurn({ call: fakeCall({ prospect: [raw] }), project: PROJECT, profile, history: HISTORY, setterText: '¿Te parece una llamada el jueves?', control });
  it('«Dale, el jueves» con acepta_cita "si" registra pidio_llamada aunque el modelo diga interesado (ronda 1: C07)', async () => {
    expect((await turn({ respuesta_prospecto: 'Dale, dale. Pero quiero que me expliquen paso a paso.', acepta_cita: 'si', estado_lead: 'interesado' })).estado_lead).toBe('pidio_llamada');
  });
  it('«Sí, pero antes dime cuánto cuesta» no es una cita aceptada', async () => {
    expect((await turn({ respuesta_prospecto: 'Sí, pero antes dime cuánto cuesta.', acepta_cita: 'condicionada', estado_lead: 'pidio_llamada' })).estado_lead).toBe('interesado');
  });
  it('pedir información no es aceptar', async () => {
    expect((await turn({ respuesta_prospecto: '¿Qué incluye exactamente?', acepta_cita: 'no', estado_lead: 'interesado' })).estado_lead).toBe('interesado');
  });
  it('no_califica se respeta cuando el encaje es bajo y el motivo ya salió', async () => {
    const low = { ...PROFILE, encaje: 'bajo', incompatibilidad: 'definitiva', motivo_no_encaje: 'Cierra el consultorio' };
    const r = await turn({ respuesta_prospecto: 'Gracias, no es para mí ahora.', acepta_cita: 'no', estado_lead: 'no_califica', revela: ['no_encaje'] }, low, createControlState(low));
    expect(r).toMatchObject({ estado_lead: 'no_califica', desenlace: 'no_califica' });
  });
  it('con encaje alto, no_califica no se registra (queda resistente)', async () => {
    const r = await turn({ respuesta_prospecto: 'Gracias, no es para mí ahora.', acepta_cita: 'no', estado_lead: 'no_califica' });
    expect(r.estado_lead).toBe('resistente');
    expect(r.prospectIssues).toContain('no_califica_no_permitido');
  });
});

describe('C3 · puntuación inválida', () => {
  it('ronda 1: un 0 con elogio se vuelve a pedir; si llega válida, se usa', async () => {
    const call = fakeCall({ coach: [{ ...COACH_OK, puntuacion_mensaje: 0, que_hizo_bien: 'Excelente pregunta.' }, { ...COACH_OK, puntuacion_mensaje: 9 }] });
    const r = await runCoachTurn({ call, project: PROJECT, history: HISTORY, setterText: SETTER });
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[1][0]).toContain('Nunca 0');
    expect(r).toMatchObject({ retried: true, coaching: { puntuacion_mensaje: 9 } });
  });
  it('si sigue inválida, el turno queda sin puntuación (null), nunca 0 ni un valor inventado', async () => {
    const call = fakeCall({ coach: [{ ...COACH_OK, puntuacion_mensaje: 0 }, { ...COACH_OK, puntuacion_mensaje: 'excelente' }] });
    const r = await runCoachTurn({ call, project: PROJECT, history: HISTORY, setterText: SETTER });
    expect(r.coaching.puntuacion_mensaje).toBeNull();
    expect(r.coaching.que_hizo_bien).toBe('Pregunta abierta.');
    expect(r.issues).toEqual(['puntuacion_invalida:0', 'reintento:puntuacion_invalida:"excelente"']);
  });
});

describe('C1 · mensaje sugerido', () => {
  it('ronda 1 (C08 turno 6): un mensaje sugerido con horas inventadas se descarta', async () => {
    const call = fakeCall({ coach: [{ ...COACH_OK, mensaje_alternativo: 'El programa tiene 3 pilares y dedicas entre 3 y 5 horas en la primera semana.' }] });
    const r = await runCoachTurn({ call, project: PROJECT, history: HISTORY, setterText: SETTER });
    expect(r.coaching.mensaje_alternativo).toBe('');
    expect(r.issues[0]).toMatch(/^mensaje_alternativo_descartado/);
  });
});

describe('perfil', () => {
  it('usa simulator_prospect, aplica las semillas y reintenta si falta lo esencial', async () => {
    const call = vi.fn()
      .mockResolvedValueOnce({ nombre: 'X' })
      .mockResolvedValueOnce({ identidad: 'Odontóloga', situacion: 'Agenda floja', motivacion: 'Crecer', encaje: 'alto' });
    const p = await generatePrimerContactoProfile({ call, project: PROJECT, config: { temperatura: 'frio', canal: 'WhatsApp', resistencia: 'alta' }, random: () => 0.99, overrides: { encaje: 'bajo' } });
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[0][2]).toBe(PROFILE_OPTIONS);
    expect(PROFILE_OPTIONS).toMatchObject({ operation: 'simulator_prospect', model: 'haiku', maxTokens: 500 });
    expect(p).toMatchObject({ encaje: 'bajo', nombre: p.seeds.nombre, attempts: 2 });
  });
  it('los errores fatales (servidor) se propagan sin reintento', async () => {
    const fatal = new Error('sesión');
    const call = vi.fn().mockRejectedValue(fatal);
    await expect(generatePrimerContactoProfile({ call, project: PROJECT, config: { temperatura: 'frio' }, isFatal: (e) => e === fatal })).rejects.toBe(fatal);
    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe('control de estados en el turno', () => {
  const PROPOSE = '¿Te parece una llamada el jueves?';
  it('el prompt del prospecto termina con la situación del turno calculada por el código', async () => {
    const call = fakeCall();
    await runProspectTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: PROPOSE });
    const [system] = call.forProspect()[0];
    expect(system.trim().split('SITUACIÓN DE ESTE TURNO').length).toBe(2);
    expect(system).toMatch(/NO aceptas una cita[\s\S]*el setter todavía no sabe tu situación y por qué escribiste[\s\S]*Máximo 22 palabras\. Solo en español\.\s*$/);
  });
  it('aceptar una cita no permitida: se repite una vez y, si insiste, se usa un respaldo (nunca se registra la cita)', async () => {
    const accept = { respuesta_prospecto: 'Dale, el jueves.', acepta_cita: 'si', estado_lead: 'pidio_llamada', revela: [] };
    const call = fakeCall({ prospect: [accept, accept] });
    const r = await runProspectTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: PROPOSE });
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[1][0]).toContain('en este turno NO puedes aceptarla');
    expect(r).toMatchObject({ estado_lead: 'abierto', acepta_cita: 'no', desenlace: 'abierta', fallback: 'sin_descubrimiento', retried: true });
    expect(r.respuesta_prospecto).toBe('Antes de agendar, quiero entender bien de qué se trata.');
  });
  it('si el reintento corrige, se usa la respuesta de la IA', async () => {
    const call = fakeCall({ prospect: [
      { respuesta_prospecto: 'Dale, el jueves.', acepta_cita: 'si', estado_lead: 'pidio_llamada' },
      { respuesta_prospecto: 'Antes cuéntame de qué se trata.', acepta_cita: 'no', estado_lead: 'abierto' },
    ] });
    const r = await runProspectTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: PROPOSE });
    expect(r).toMatchObject({ respuesta_prospecto: 'Antes cuéntame de qué se trata.', fallback: null, estado_lead: 'abierto' });
  });
  it('al llegar al límite de evasivas, el turno cierra la conversación aunque la IA no se despida', async () => {
    const control = { ...createControlState(PROFILE), evasivas: 2 };
    const history = [{ role: 'prospect', content: 'Ya, pero ¿cuánto cuesta?' }];
    const call = fakeCall({ prospect: [
      { respuesta_prospecto: 'Bueno, ¿y qué incluye?', acepta_cita: 'no', estado_lead: 'interesado' },
      { respuesta_prospecto: 'Mira, así no sigo. Gracias.', acepta_cita: 'no', estado_lead: 'cerrado' },
    ] });
    const r = await runProspectTurn({ call, project: PROJECT, profile: PROFILE, history, setterText: 'Eso lo vemos más adelante.', control });
    expect(call.forProspect()[0][0]).toContain('te despides con cortesía y cierras la conversación');
    expect(call.mock.calls[1][0]).toContain('te despides y cierras la conversación');
    expect(r).toMatchObject({ estado_lead: 'cerrado', desenlace: 'despedida', respuesta_prospecto: 'Mira, así no sigo. Gracias.' });
    expect(r.control.evasivas).toBe(3);
  });
  it('un mensaje demasiado largo se pide de nuevo más corto', async () => {
    const long = { respuesta_prospecto: Array.from({ length: 40 }, () => 'palabra').join(' '), acepta_cita: 'no', estado_lead: 'abierto' };
    const call = fakeCall({ prospect: [long, { respuesta_prospecto: 'Corto.', acepta_cita: 'no', estado_lead: 'abierto' }] });
    const r = await runProspectTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: SETTER });
    expect(call.mock.calls[1][0]).toContain('máximo 22 palabras');
    expect(r.respuesta_prospecto).toBe('Corto.');
  });
  it('el estado de control avanza turno a turno; sin confirmación del coaching no hay cita (F1)', async () => {
    const call = fakeCall({ prospect: [{ respuesta_prospecto: 'Agenda al 50 %, quiero otro consultorio.', acepta_cita: 'no', estado_lead: 'interesado', revela: ['situacion', 'motivo'] }] });
    const r = await runProspectTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: SETTER });
    expect(r.control).toMatchObject({ turno: 1, revelado: ['situacion', 'motivo'], confirmado: [] });
    const accept = { respuesta_prospecto: 'Dale, el jueves.', acepta_cita: 'si', estado_lead: 'interesado' };
    const r2 = await runProspectTurn({ call: fakeCall({ prospect: [accept, accept] }), project: PROJECT, profile: PROFILE, history: HISTORY, setterText: PROPOSE, control: r.control });
    expect(r2).toMatchObject({ estado_lead: 'abierto', fallback: 'sin_descubrimiento' });
  });
});

describe('respuesta progresiva', () => {
  it('el prospecto se entrega antes de que termine el coaching', async () => {
    let releaseCoach;
    const coachGate = new Promise((resolve) => { releaseCoach = resolve; });
    const call = vi.fn(async (system) => {
      if (String(system).includes('Eres coach')) { await coachGate; return COACH_OK; }
      return { respuesta_prospecto: NEW_REPLY, acepta_cita: 'no', estado_lead: 'interesado' };
    });
    const { prospect, coach } = startPrimerContactoTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: SETTER });
    let coachDone = false;
    coach.then(() => { coachDone = true; });
    const p = await prospect;
    expect(p.respuesta_prospecto).toBe(NEW_REPLY);
    expect(coachDone).toBe(false);
    releaseCoach();
    expect((await coach).coaching.puntuacion_mensaje).toBe(8);
  });
  it('si el coaching falla, la promesa del coaching no rechaza: entrega coaching null', async () => {
    const call = fakeCall({ coach: [new Error('red')] });
    const { coach } = startPrimerContactoTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: SETTER });
    expect(await coach).toMatchObject({ coaching: null, coachingIssues: ['coaching_error:red'] });
  });
});

describe('F1 · descubrimiento confirmado por el coaching', () => {
  const PROPOSE = '¿Te parece una llamada el jueves?';
  const history = [
    { role: 'prospect', content: 'Info' },
    { role: 'setter', content: '¿Qué te llamó la atención?' },
    { role: 'prospect', content: 'Tengo consultorio y la agenda está al 50 %. Quiero abrir otro consultorio este año.' },
  ];
  const control = { ...createControlState(PROFILE), revelado: ['situacion', 'motivo'] };
  const coachWith = (descubrimiento) => ({ ...COACH_OK, descubrimiento });
  const accept = { respuesta_prospecto: 'Dale, el jueves.', acepta_cita: 'si', estado_lead: 'interesado' };
  it('si el prospecto acepta, espera las citas del coaching de este turno y, si se verifican, registra la cita', async () => {
    const call = fakeCall({ prospect: [accept], coach: [coachWith({ situacion: 'Tengo consultorio y la agenda está al 50 %', motivo: 'Quiero abrir otro consultorio este año' })] });
    const r = await runPrimerContactoTurn({ call, project: PROJECT, profile: PROFILE, history, setterText: PROPOSE, control });
    expect(r).toMatchObject({ estado_lead: 'pidio_llamada', desenlace: 'cita_aceptada', awaitedCoach: true, retried: false });
    expect(r.control.confirmado).toEqual(['situacion', 'motivo']);
  });
  it('si el coaching no encuentra el motivo en los mensajes, la cita no se registra', async () => {
    const call = fakeCall({ prospect: [accept, accept], coach: [coachWith({ situacion: 'Tengo consultorio y la agenda está al 50 %', motivo: 'quiere crecer y ganar más dinero' })] });
    const r = await runPrimerContactoTurn({ call, project: PROJECT, profile: PROFILE, history, setterText: PROPOSE, control });
    expect(r).toMatchObject({ estado_lead: 'abierto', fallback: 'sin_descubrimiento' });
    expect(r.control.confirmado).toEqual(['situacion']);
  });
  it('si el coaching falla, no se confirma nada y la cita no se registra', async () => {
    const call = fakeCall({ prospect: [accept, accept], coach: [new Error('red'), new Error('red')] });
    const r = await runPrimerContactoTurn({ call, project: PROJECT, profile: PROFILE, history, setterText: PROPOSE, control });
    expect(r.estado_lead).not.toBe('pidio_llamada');
  });
  it('sin aceptación, el prospecto no espera al coaching (respuesta progresiva)', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const call = vi.fn(async (system) => {
      if (String(system).includes('Eres coach')) { await gate; return COACH_OK; }
      return { respuesta_prospecto: 'Cuéntame más.', acepta_cita: 'no', estado_lead: 'interesado' };
    });
    const { prospect } = startPrimerContactoTurn({ call, project: PROJECT, profile: PROFILE, history, setterText: '¿Qué te preocupa?', control });
    expect((await prospect).awaitedCoach).toBe(false);
    release();
  });
});

describe('F3 · datos de contacto y cifras sin respaldo', () => {
  it('ronda 3, R12: un teléfono se pide de nuevo y, si persiste, se reemplaza', async () => {
    const phone = { respuesta_prospecto: 'Dale, perfecto. Me contactas al +56 9 87654321.', acepta_cita: 'no', estado_lead: 'interesado' };
    const call = fakeCall({ prospect: [phone, phone] });
    const r = await runProspectTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: '¿A qué número te contacto?' });
    expect(call.mock.calls[1][0]).toContain('no escribas teléfonos, correos');
    expect(r.respuesta_prospecto).toBe('Dale, perfecto. Me contactas al [dato omitido].');
    expect(r.prospectIssues).toContain('contacto_reemplazado');
  });
  it('correos y enlaces también', async () => {
    const call = fakeCall({ prospect: [{ respuesta_prospecto: 'Escríbeme a lucia@ejemplo.com', acepta_cita: 'no', estado_lead: 'abierto' }, { respuesta_prospecto: 'Prefiero seguir por acá.', acepta_cita: 'no', estado_lead: 'abierto' }] });
    const r = await runProspectTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: '¿Me pasas tu correo?' });
    expect(r.respuesta_prospecto).toBe('Prefiero seguir por acá.');
  });
  it('ronda 3, R09: una conversión de moneda que nadie dijo se pide de nuevo', async () => {
    const call = fakeCall({ prospect: [
      { respuesta_prospecto: 'No tengo dieciocho mil pesos de golpe disponibles ahora.', acepta_cita: 'no', estado_lead: 'interesado' },
      { respuesta_prospecto: 'Me interesa, pero primero necesito saber cuánto cuesta.', acepta_cita: 'no', estado_lead: 'interesado' },
    ] });
    const r = await runProspectTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: '¿Te gustaría una llamada?' });
    expect(call.mock.calls[1][0]).toContain('No conviertas monedas');
    expect(r.respuesta_prospecto).toBe('Me interesa, pero primero necesito saber cuánto cuesta.');
  });
  it('las cifras propias del perfil no se marcan', async () => {
    const call = fakeCall({ prospect: [{ respuesta_prospecto: 'Ya perdí 2.300 USD con una agencia.', acepta_cita: 'no', estado_lead: 'resistente' }] });
    const r = await runProspectTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: '¿Qué pasó con la agencia?' });
    expect(r.retried).toBe(false);
  });
  it('el prospecto no conoce el precio hasta que el alumno lo dice', async () => {
    const call = fakeCall();
    await runProspectTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: SETTER });
    const [system] = call.forProspect()[0];
    expect(system).not.toContain('1.800');
    expect(system).toContain('Precio: no lo conoces');
  });
});

describe('F5 · tope por afirmaciones no documentadas', () => {
  it('ronda 3, R13 #5: horas inventadas tienen como máximo 3', async () => {
    const setter = 'Buena pregunta. Incluye estrategia personalizada, gestión de anuncios y seguimiento directo de pacientes. Requiere ~5-8 horas tuyas en 90 días. ¿Martes o jueves te va?';
    const call = fakeCall({ coach: [{ ...COACH_OK, puntuacion_mensaje: 6, alerta: 'Afirmó horas no documentadas.' }] });
    const r = await runCoachTurn({ call, project: PROJECT, history: HISTORY, setterText: setter });
    expect(r.coaching.puntuacion_mensaje).toBe(3);
    expect(r.issues).toContain('tope_3:6');
  });
  it('ronda 3, R06 #2: escasez inventada («pocos espacios»)', async () => {
    const call = fakeCall({ coach: [{ ...COACH_OK, puntuacion_mensaje: 4, alerta: '' }] });
    const r = await runCoachTurn({ call, project: PROJECT, history: HISTORY, setterText: '¿Mañana 10 AM o prefieres otro horario? Tenemos pocos espacios disponibles.' });
    expect(r.coaching.puntuacion_mensaje).toBe(3);
    expect(r.coaching.alerta).toMatch(/no está documentado: escasez/);
  });
  it('un precio incorrecto también', async () => {
    const call = fakeCall({ coach: [{ ...COACH_OK, puntuacion_mensaje: 8 }] });
    const r = await runCoachTurn({ call, project: PROJECT, history: HISTORY, setterText: 'Son 1.500 USD. ¿Te sirve?' });
    expect(r.coaching.puntuacion_mensaje).toBe(3);
    expect(r.claims.some((c) => /precio incorrecto \(1500/.test(c))).toBe(true);
  });
  it('lo honesto no se penaliza: «No hay garantía escrita» y el precio documentado (ronda 3, R07 #2)', async () => {
    const call = fakeCall({ coach: [{ ...COACH_OK, puntuacion_mensaje: 8 }, { ...COACH_OK, puntuacion_mensaje: 9 }] });
    const a = await runCoachTurn({ call, project: PROJECT, history: HISTORY, setterText: 'Entiendo la preocupación. No hay garantía escrita, pero el Dr. Luis logró +40 pacientes nuevos en 3 meses.' });
    expect(a.coaching.puntuacion_mensaje).toBe(8);
    const b = await runCoachTurn({ call, project: PROJECT, history: HISTORY, setterText: 'Son 1.800 USD o 3 cuotas de 650 USD. ¿Cuál te acomoda más?' });
    expect(b.coaching.puntuacion_mensaje).toBe(9);
  });
  it('un mensaje sin afirmaciones conserva la nota del coaching, alta o baja (no se fuerza una distribución)', async () => {
    const call = fakeCall({ coach: [{ ...COACH_OK, puntuacion_mensaje: 10 }, { ...COACH_OK, puntuacion_mensaje: 2 }] });
    expect((await runCoachTurn({ call, project: PROJECT, history: HISTORY, setterText: SETTER })).coaching.puntuacion_mensaje).toBe(10);
    expect((await runCoachTurn({ call, project: PROJECT, history: HISTORY, setterText: '¿Agendamos?' })).coaching.puntuacion_mensaje).toBe(2);
  });
});
