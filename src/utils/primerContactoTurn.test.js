// Flujo de un turno de Primer contacto con una IA simulada: qué recibe cada
// llamada (C2), reintentos por eco (C5) y por puntuación inválida (C3),
// aceptación de la cita (C4) y mensaje sugerido sin datos inventados (C1).
import { describe, expect, it, vi } from 'vitest';
import {
  COACH_TURN_OPTIONS, PROFILE_OPTIONS, PROSPECT_TURN_OPTIONS,
  generatePrimerContactoProfile, runCoachTurn, runPrimerContactoTurn, runProspectTurn,
} from './primerContactoTurn';
import { PROFILE, PROJECT } from './primerContacto.fixtures';

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
  const turn = (raw) => runProspectTurn({ call: fakeCall({ prospect: [raw] }), project: PROJECT, profile: PROFILE, history: HISTORY, setterText: '¿Te parece una llamada el jueves?' });
  it('«Dale, el jueves» con acepta_cita "si" registra pidio_llamada aunque el modelo diga interesado (ronda 1: C07)', async () => {
    expect((await turn({ respuesta_prospecto: 'Dale, dale. Pero quiero que me expliquen paso a paso.', acepta_cita: 'si', estado_lead: 'interesado' })).estado_lead).toBe('pidio_llamada');
  });
  it('«Sí, pero antes dime cuánto cuesta» no es una cita aceptada', async () => {
    expect((await turn({ respuesta_prospecto: 'Sí, pero antes dime cuánto cuesta.', acepta_cita: 'condicionada', estado_lead: 'pidio_llamada' })).estado_lead).toBe('interesado');
  });
  it('pedir información no es aceptar', async () => {
    expect((await turn({ respuesta_prospecto: '¿Qué incluye exactamente?', acepta_cita: 'no', estado_lead: 'interesado' })).estado_lead).toBe('interesado');
  });
  it('no_califica y cerrado se respetan', async () => {
    expect((await turn({ respuesta_prospecto: 'Gracias, no es para mí ahora.', acepta_cita: 'no', estado_lead: 'no_califica' })).estado_lead).toBe('no_califica');
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
