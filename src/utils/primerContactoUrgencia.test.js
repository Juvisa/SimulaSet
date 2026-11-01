// Urgencia del prospecto en el turno de Primer contacto (IA simulada, sin
// llamadas reales): el coaching señala frases del ÚLTIMO mensaje del
// prospecto (C2 intacta), el código las verifica y acumula; al cerrar, una
// extracción revisa toda la conversación. La nota y la probabilidad de cita
// no cambian.
import { describe, expect, it, vi } from 'vitest';
import {
  COACH_TURN_OPTIONS, applyCoachResult, coachingWithUrgency, runCoachTurn, runPrimerContactoTurn, runUrgencyExtraction, urgencyOf,
} from './primerContactoTurn';
import { PROFILE, PROJECT } from './primerContacto.fixtures';
import { createControlState } from './primerContactoControl';
import { PRIMER_CONTACTO_URGENCY_SYSTEM, buildPrimerContactoCoachPrompt } from './prompts';

const LAST = 'Me cuesta un montón conseguir pacientes y esta semana tengo que decidir algo.';
const HISTORY = [
  { role: 'prospect', content: 'Info' },
  { role: 'setter', content: '¡Hola! ¿Qué te llamó la atención?' },
  { role: 'prospect', content: LAST },
];
const SETTER = '¿Qué pasa si sigues así un par de meses más?';
const NEW_REPLY = 'Me quedo sin pacientes nuevos, así de simple.';
const COACH = (urgencia, extra = {}) => ({ etapa_set: 'E', que_hizo_bien: 'Bien.', que_mejorar: 'Profundiza.', mensaje_alternativo: '¿Qué te preocupa más?', alerta: '', probabilidad_cita: 42, puntuacion_mensaje: 7, urgencia, ...extra });
const isCoach = (system) => String(system).includes('Eres coach de appointment setting');

const fakeCall = (coach, prospect = { respuesta_prospecto: NEW_REPLY, acepta_cita: 'no', estado_lead: 'interesado' }) => vi.fn(async (system) => (isCoach(system) ? coach : prospect));

describe('urgencia en el coaching del turno', () => {
  it('el prompt pide la urgencia sin número inventado y el mensaje marca el último del prospecto (no la respuesta nueva: C2)', async () => {
    const call = fakeCall(COACH([]));
    await runCoachTurn({ call, project: PROJECT, history: HISTORY, setterText: SETTER });
    const [system, messages] = call.mock.calls[0];
    expect(system).toContain('URGENCIA DEL PROSPECTO');
    expect(system).not.toMatch(/"nivel_fomo"/);
    expect(system).toContain('"probabilidad_cita": 30');
    expect(messages[0].content).toContain(`ÚLTIMO MENSAJE DEL PROSPECTO (para "urgencia"): ${LAST}`);
    expect(JSON.stringify(messages)).not.toContain(NEW_REPLY);
    expect(call.mock.calls[0][2]).toBe(COACH_TURN_OPTIONS);
    expect(COACH_TURN_OPTIONS.maxTokens).toBeLessThanOrEqual(800);
  });

  it('acepta solo frases literales del último mensaje del prospecto', async () => {
    const call = fakeCall(COACH([
      { senal: 'reconoce_problema', postura: 'afirma', cita: 'me cuesta un montón conseguir pacientes' },
      { senal: 'prioridad_temporal', postura: 'afirma', cita: 'esta semana' },
      { senal: 'costo_de_no_actuar', postura: 'afirma', cita: 'sigues así un par de meses' }, // del alumno
      { senal: 'motivacion', postura: 'afirma', cita: 'quiero crecer' }, // inventada
    ]));
    const r = await runCoachTurn({ call, project: PROJECT, history: HISTORY, setterText: SETTER });
    expect(r.urgencyEvents.map((e) => [e.senal, e.postura, e.mensaje])).toEqual([['reconoce_problema', 'afirma', 2], ['prioridad_temporal', 'afirma', 2]]);
    expect(r.issues).toEqual(expect.arrayContaining(['urgencia_descartada:no_esta_en_el_mensaje:costo_de_no_actuar', 'urgencia_descartada:no_esta_en_el_mensaje:motivacion']));
  });

  it('una frase de un mensaje anterior del prospecto no cuenta en este turno', async () => {
    const r = await runCoachTurn({ call: fakeCall(COACH([{ senal: 'reconoce_problema', postura: 'afirma', cita: 'Info' }])), project: PROJECT, history: HISTORY, setterText: SETTER });
    expect(r.urgencyEvents).toEqual([]);
  });

  it('lo que responde el prospecto a una escasez inventada no suma', async () => {
    const history = [
      { role: 'prospect', content: 'Info' },
      { role: 'setter', content: 'Tenemos pocos espacios disponibles esta semana.' },
      { role: 'prospect', content: 'Uy, entonces me urge entrar ya.' },
    ];
    const r = await runCoachTurn({ call: fakeCall(COACH([{ senal: 'prioridad_temporal', postura: 'afirma', cita: 'me urge entrar ya' }])), project: PROJECT, history, setterText: SETTER });
    expect(r.urgencyEvents).toEqual([]);
    expect(r.issues).toContain('urgencia_descartada:tras_afirmacion_no_documentada:prioridad_temporal');
  });

  it('tampoco tras una característica inventada que el coaching de ese turno señaló', async () => {
    const control = { ...createControlState(), invenciones: [{ tipo: 'oferta', texto: 'característica no documentada «te garantizo 20 pacientes»', turno: 1 }] };
    const history = [
      { role: 'prospect', content: 'Info' },
      { role: 'setter', content: 'Con esto te garantizo 20 pacientes.' },
      { role: 'prospect', content: 'Wow, lo necesito cuanto antes.' },
    ];
    const r = await runCoachTurn({ call: fakeCall(COACH([{ senal: 'prioridad_temporal', postura: 'afirma', cita: 'lo necesito cuanto antes' }])), project: PROJECT, history, setterText: SETTER, control });
    expect(r.urgencyEvents).toEqual([]);
  });

  it('una negación marcada como afirmación no sube la urgencia', async () => {
    const history = [...HISTORY.slice(0, 2), { role: 'prospect', content: 'La verdad no es urgente, lo veo para marzo.' }];
    const r = await runCoachTurn({ call: fakeCall(COACH([{ senal: 'prioridad_temporal', postura: 'afirma', cita: 'es urgente' }])), project: PROJECT, history, setterText: SETTER });
    expect(r.urgencyEvents[0].postura).toBe('niega');
  });

  it('la nota y la probabilidad de cita pasan sin cambios', async () => {
    const r = await runCoachTurn({ call: fakeCall(COACH([{ senal: 'prioridad_temporal', postura: 'afirma', cita: 'esta semana' }])), project: PROJECT, history: HISTORY, setterText: SETTER });
    expect(r.coaching).toMatchObject({ puntuacion_mensaje: 7, probabilidad_cita: 42, etapa_set: 'E' });
  });

  it('sin "urgencia" en la respuesta (o con basura) no pasa nada', async () => {
    for (const urgencia of [undefined, 'alta', 80, [{ senal: 'fomo', postura: 'afirma', cita: 'esta semana' }]]) {
      const r = await runCoachTurn({ call: fakeCall(COACH(urgencia)), project: PROJECT, history: HISTORY, setterText: SETTER });
      expect(r.urgencyEvents).toEqual([]);
      expect(r.coaching.puntuacion_mensaje).toBe(7);
    }
  });
});

describe('urgencia en el control y en la pantalla', () => {
  const ev = (mensaje, senal, postura, cita) => ({ senal, postura, cita, mensaje, posicion: 0, origen: 'turno' });

  it('applyCoachResult acumula turno a turno: sube y baja', () => {
    let control = createControlState();
    control = applyCoachResult(control, { urgencyEvents: [ev(2, 'prioridad_temporal', 'afirma', 'esta semana')] });
    expect(urgencyOf(control)).toMatchObject({ valor: 25, maximo: 25 });
    control = applyCoachResult(control, { urgencyEvents: [ev(4, 'prioridad_temporal', 'niega', 'puedo esperar')] });
    expect(urgencyOf(control)).toMatchObject({ valor: 0, maximo: 25 });
    expect(urgencyOf(control).eventos).toHaveLength(2);
  });

  it('si el coaching falla (sin eventos), la urgencia queda como estaba', () => {
    const control = applyCoachResult(createControlState(), { urgencyEvents: [ev(2, 'motivacion', 'afirma', 'quiero crecer')] });
    const after = applyCoachResult(control, { coaching: null, discovery: {}, invencion: null, urgencyEvents: [] });
    expect(after.urgencia).toEqual(control.urgencia);
  });

  it('lo que se muestra como nivel_fomo es el valor calculado, no un número de la IA', () => {
    const control = applyCoachResult(createControlState(), { urgencyEvents: [ev(2, 'consecuencias', 'afirma', 'pierdo pacientes')] });
    expect(coachingWithUrgency({ nivel_fomo: 90, probabilidad_cita: 70, puntuacion_mensaje: 8 }, control)).toEqual({ nivel_fomo: 20, probabilidad_cita: 70, puntuacion_mensaje: 8 });
    expect(coachingWithUrgency(null, control)).toBeNull();
    expect(urgencyOf(null)).toEqual({ eventos: [], vigente: {}, valor: 0, maximo: 0 });
  });

  it('proponer una cita no sube la urgencia (aunque el prospecto acepte)', async () => {
    const control = createControlState();
    const call = fakeCall(COACH([]), { respuesta_prospecto: 'Puede ser, ¿cuándo?', acepta_cita: 'no', estado_lead: 'interesado' });
    const r = await runPrimerContactoTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: '¿Te parece si agendamos una llamada el jueves?', control });
    expect(urgencyOf(r.control).valor).toBe(0);
  });

  it('el turno completo deja la urgencia verificada en el control', async () => {
    const call = fakeCall(COACH([{ senal: 'reconoce_problema', postura: 'afirma', cita: 'me cuesta un montón conseguir pacientes' }]));
    const r = await runPrimerContactoTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: SETTER, control: createControlState() });
    expect(urgencyOf(r.control)).toMatchObject({ valor: 15, maximo: 15 });
    expect(r.coaching.probabilidad_cita).toBe(42);
  });

  it('el prompt del prospecto no habla de urgencia (su comportamiento no cambia)', async () => {
    const call = fakeCall(COACH([]));
    await runPrimerContactoTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: SETTER, control: createControlState() });
    const prospectSystem = call.mock.calls.map(([s]) => String(s)).find((s) => !isCoach(s));
    expect(prospectSystem).not.toMatch(/URGENCIA DEL PROSPECTO|"urgencia"/);
    expect(buildPrimerContactoCoachPrompt(PROJECT)).toMatch(/No influye en la nota ni en la probabilidad de cita/);
  });
});

describe('extracción al cerrar', () => {
  const FULL = [...HISTORY, { role: 'setter', content: SETTER }, { role: 'prospect', content: NEW_REPLY }, { role: 'system', content: 'Error: x' }];

  it('una llamada Haiku (simulator_turn) con la conversación numerada, sin perfil privado', async () => {
    const call = vi.fn(async () => ({ urgencia: [] }));
    await runUrgencyExtraction({ call, project: PROJECT, history: FULL });
    expect(call).toHaveBeenCalledTimes(1);
    const [system, messages, options] = call.mock.calls[0];
    expect(system).toBe(PRIMER_CONTACTO_URGENCY_SYSTEM);
    expect(options).toMatchObject({ model: 'haiku', operation: 'simulator_turn' });
    expect(options.maxTokens).toBeLessThanOrEqual(800);
    expect(messages[0].content).toContain(`3. Prospecto: ${LAST}`);
    expect(messages[0].content).toContain(`5. Prospecto: ${NEW_REPLY}`);
    expect(messages[0].content).not.toContain('Error: x');
    for (const secret of PROFILE.hechos_ocultos) expect(system + messages[0].content).not.toContain(secret);
  });

  it('incluye la última respuesta del prospecto y verifica cada frase en su mensaje', async () => {
    const call = vi.fn(async () => ({ urgencia: [
      { mensaje: 3, senal: 'prioridad_temporal', postura: 'afirma', cita: 'esta semana' },
      { mensaje: 5, senal: 'consecuencias', postura: 'afirma', cita: 'me quedo sin pacientes nuevos' },
      { mensaje: 4, senal: 'costo_de_no_actuar', postura: 'afirma', cita: 'sigues así' }, // mensaje del alumno
      { mensaje: 3, senal: 'motivacion', postura: 'afirma', cita: 'me quedo sin pacientes' }, // está en otro mensaje
      { mensaje: 9, senal: 'motivacion', postura: 'afirma', cita: 'esta semana' }, // no existe
    ] }));
    const u = await runUrgencyExtraction({ call, project: PROJECT, history: FULL });
    expect(u.eventos.map((e) => [e.mensaje, e.senal, e.origen])).toEqual([[2, 'prioridad_temporal', 'cierre'], [4, 'consecuencias', 'cierre']]);
    expect(u).toMatchObject({ valor: 45, maximo: 45 });
  });

  it('final vigente y máximo distintos cuando el prospecto se enfría al final', async () => {
    const history = [...HISTORY, { role: 'setter', content: SETTER }, { role: 'prospect', content: 'Bueno, pensándolo mejor puedo esperar al otro año.' }];
    const call = vi.fn(async () => ({ urgencia: [
      { mensaje: 3, senal: 'prioridad_temporal', postura: 'afirma', cita: 'esta semana tengo que decidir algo' },
      { mensaje: 5, senal: 'prioridad_temporal', postura: 'niega', cita: 'puedo esperar al otro año' },
    ] }));
    expect(await runUrgencyExtraction({ call, project: PROJECT, history })).toMatchObject({ valor: 0, maximo: 25 });
  });

  it('respuesta inutilizable: lanza (el informe usa entonces el estado de los turnos)', async () => {
    for (const bad of [null, {}, { urgencia: 'alta' }]) {
      await expect(runUrgencyExtraction({ call: vi.fn(async () => bad), project: PROJECT, history: FULL })).rejects.toThrow(/inválida/);
    }
    await expect(runUrgencyExtraction({ call: vi.fn(async () => { throw new Error('Failed to fetch'); }), project: PROJECT, history: FULL })).rejects.toThrow('Failed to fetch');
  });
});
