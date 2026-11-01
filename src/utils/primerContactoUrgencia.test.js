// Urgencia del prospecto en el turno de Primer contacto (IA simulada, sin
// llamadas reales): el coaching señala frases del ÚLTIMO mensaje del
// prospecto (C2 intacta), el código las verifica y acumula; al cerrar, solo se
// analiza la última respuesta pendiente. La nota y la probabilidad de cita no
// cambian.
import { describe, expect, it, vi } from 'vitest';
import {
  COACH_TURN_OPTIONS, URGENCY_EXTRACTION_OPTIONS, applyCoachResult, coachingWithUrgency, runCoachTurn, runPendingUrgency, runPrimerContactoTurn, urgencyOf,
} from './primerContactoTurn';
import { PROFILE, PROJECT } from './primerContacto.fixtures';
import { createControlState } from './primerContactoControl';
import { markProcessed, rebuildUrgency } from './prospectUrgency';
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
    expect(urgencyOf(null)).toEqual({ eventos: [], vigente: {}, valor: 0, maximo: 0, procesados: [] });
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

// ─── Cierre (decisión del 01/11/2026 tras la ronda 7) ───────────────────────
// El informe conserva el estado verificado durante la sesión y analiza solo la
// última respuesta del prospecto que ningún coaching vio.
const at = (mensaje, senal, postura, cita, posicion = 0) => ({ senal, postura, cita, mensaje, posicion, origen: 'turno' });
const markProcessedAll = (state, list) => list.reduce((s, i) => markProcessed(s, i), state);
const sessionState = (events, procesados) => markProcessedAll(rebuildUrgency(events), procesados);
const pendingCall = (urgencia) => vi.fn(async () => ({ urgencia }));

// Ronda 7, C10 (garantía inventada), recortada: índices 0–10.
const C10 = [
  { role: 'prospect', content: 'Hola, ¿cómo funciona?' },
  { role: 'setter', content: '¿Cómo va tu agenda estos meses?' },
  { role: 'prospect', content: 'La agenda anda floja últimamente, especialmente este mes. ¿Esto requiere mucho tiempo de mi parte?' },
  { role: 'setter', content: 'El sistema está diseñado para que dediques poco tiempo. ¿Cuánto tiempo podrías destinar?' },
  { role: 'prospect', content: 'Máximo 3 horas por semana. ¿De verdad genera resultados o es otro gasto sin retorno?' },
  { role: 'setter', content: 'El programa tiene garantía: resultados en 30 días o te devolvemos el dinero. ¿Cuántos pacientes necesitarías?' },
  { role: 'prospect', content: 'Mínimo 15 a 20 pacientes nuevos por mes. Ya probé publicidad hace un año y fue dinero perdido.' },
  { role: 'setter', content: '¿Qué no funcionó con la agencia anterior?' },
  { role: 'prospect', content: 'Gastaron mi dinero en Facebook e Instagram sin filtro. No sabía si era culpa mía o de ellos.' },
  { role: 'setter', content: '¿Cuál es tu inversión máxima ahora?' },
  { role: 'prospect', content: 'Depende del precio. Si es similar a lo de antes, no. Dime cuánto cuesta primero.' },
];
const C10_SESSION = sessionState([
  at(2, 'reconoce_problema', 'afirma', 'La agenda anda floja últimamente', 0),
  at(2, 'prioridad_temporal', 'afirma', 'especialmente este mes', 40),
], [0, 2, 4, 6, 8]);

describe('C · cierre: solo la última respuesta pendiente', () => {
  it('C10: sin señales en la última respuesta, el informe da lo mismo que la barra (antes: 85 en la sesión y 15 en el informe)', async () => {
    const call = pendingCall([]);
    const u = await runPendingUrgency({ call, project: PROJECT, history: C10, urgency: C10_SESSION });
    expect(call).toHaveBeenCalledTimes(1);
    expect(u).toMatchObject({ valor: C10_SESSION.valor, maximo: C10_SESSION.maximo, eventos: C10_SESSION.eventos });
    expect(u.valor).toBe(40);
    expect(u.procesados).toEqual([0, 2, 4, 6, 8, 10]);
    expect(u.cierre).toEqual({ mensaje: 10, aceptadas: [], descartadas: [] });
  });

  it('C06, U01 y C02: lo que la extracción de la ronda 7 reinterpretaba de mensajes anteriores ya no puede sumar', async () => {
    // La extracción anterior reclasificaba frases ya analizadas (C06 «No puedo estar en marketing» como costo
    // de no actuar, U01 «ya lo intenté con dietas y apps», C02 «Sí, tengo consultorio en Lima»…).
    const call = pendingCall([
      { senal: 'costo_de_no_actuar', postura: 'afirma', cita: 'Ya probé publicidad hace un año y fue dinero perdido' },
      { senal: 'consecuencias', postura: 'afirma', cita: 'Gastaron mi dinero en Facebook e Instagram sin filtro' },
      { senal: 'reconoce_problema', postura: 'afirma', cita: 'La agenda anda floja últimamente' },
    ]);
    const u = await runPendingUrgency({ call, project: PROJECT, history: C10, urgency: C10_SESSION });
    expect(u.valor).toBe(40);
    expect(u.eventos).toEqual(C10_SESSION.eventos);
    expect(u.cierre.descartadas.map((e) => e.motivo)).toEqual(['no_esta_en_el_mensaje', 'no_esta_en_el_mensaje', 'no_esta_en_el_mensaje']);
  });

  it('un cambio real en la última respuesta se refleja y conserva la evidencia (y el historial)', async () => {
    const history = [...HISTORY, { role: 'setter', content: SETTER }, { role: 'prospect', content: 'Bueno, pensándolo mejor puedo esperar a marzo.' }];
    const state = sessionState([
      at(2, 'reconoce_problema', 'afirma', 'Me cuesta un montón conseguir pacientes'),
      at(2, 'prioridad_temporal', 'afirma', 'esta semana tengo que decidir algo', 45),
    ], [0, 2]);
    const u = await runPendingUrgency({ call: pendingCall([{ senal: 'prioridad_temporal', postura: 'niega', cita: 'puedo esperar a marzo' }]), project: PROJECT, history, urgency: state });
    expect(state.valor).toBe(40);
    expect(u).toMatchObject({ valor: 15, maximo: 40 });
    expect(u.vigente.prioridad_temporal).toEqual({ postura: 'niega', cita: 'puedo esperar a marzo', mensaje: 4 });
    expect(u.eventos.filter((e) => e.senal === 'prioridad_temporal').map((e) => e.postura)).toEqual(['afirma', 'niega']);
    expect(u.cierre.aceptadas).toMatchObject([{ senal: 'prioridad_temporal', postura: 'niega', cita: 'puedo esperar a marzo', origen: 'cierre' }]);
  });

  it('a la IA le llega el contexto, la urgencia ya verificada y SOLO la última respuesta para analizar', async () => {
    const call = pendingCall([]);
    await runPendingUrgency({ call, project: PROJECT, history: [...C10, { role: 'system', content: 'Error: x' }], urgency: C10_SESSION });
    const [system, messages, options] = call.mock.calls[0];
    expect(system).toBe(PRIMER_CONTACTO_URGENCY_SYSTEM);
    expect(options).toBe(URGENCY_EXTRACTION_OPTIONS);
    expect(options).toMatchObject({ model: 'haiku', operation: 'simulator_turn' });
    expect(options.maxTokens).toBeLessThanOrEqual(800);
    const text = messages[0].content;
    expect(text).toContain('- prioridad_temporal: afirma («especialmente este mes»)');
    expect(text.split('ÚLTIMA RESPUESTA DEL PROSPECTO (analiza solo esta):')[1].trim()).toBe(C10[10].content);
    expect(text.split('ÚLTIMA RESPUESTA')[0]).not.toContain(C10[10].content);
    expect(text).not.toContain('Error: x');
    for (const secret of PROFILE.hechos_ocultos) expect(system + text).not.toContain(secret);
  });

  it('si ningún mensaje queda pendiente (lo vio un coaching), no hay llamada y no cambia nada', async () => {
    const call = pendingCall([{ senal: 'motivacion', postura: 'afirma', cita: 'x' }]);
    const u = await runPendingUrgency({ call, project: PROJECT, history: C10, urgency: markProcessed(C10_SESSION, 10) });
    expect(call).not.toHaveBeenCalled();
    expect(u).toMatchObject({ valor: 40, cierre: null });
  });

  it('si un coaching falló a mitad de la sesión, el cierre igual mira solo la última respuesta', async () => {
    const call = pendingCall([{ senal: 'reconoce_problema', postura: 'afirma', cita: 'La agenda anda floja últimamente' }]);
    const u = await runPendingUrgency({ call, project: PROJECT, history: C10, urgency: sessionState([], [0]) });
    expect(call).toHaveBeenCalledTimes(1);
    expect(u.cierre.mensaje).toBe(10);
    expect(u.valor).toBe(0); // esa frase es del mensaje 2: no se acepta en el cierre
  });

  it('tras una afirmación no documentada del alumno, lo que responde el prospecto no suma (presión)', async () => {
    const history = [...C10.slice(0, 6), { role: 'prospect', content: 'Ah, con garantía sí: lo necesito ya.' }];
    const u = await runPendingUrgency({ call: pendingCall([{ senal: 'prioridad_temporal', postura: 'afirma', cita: 'lo necesito ya' }]), project: PROJECT, history, urgency: sessionState([], [0, 2, 4]) });
    expect(u.valor).toBe(0);
    expect(u.cierre.descartadas).toMatchObject([{ motivo: 'tras_afirmacion_no_documentada' }]);
  });

  it('respuesta inutilizable o error de red: lanza (el informe usa el estado de la sesión, marcado incompleto)', async () => {
    for (const bad of [null, {}, { urgencia: 'alta' }]) {
      await expect(runPendingUrgency({ call: vi.fn(async () => bad), project: PROJECT, history: C10, urgency: C10_SESSION })).rejects.toThrow(/inválido/);
    }
    await expect(runPendingUrgency({ call: vi.fn(async () => { throw new Error('Failed to fetch'); }), project: PROJECT, history: C10, urgency: C10_SESSION })).rejects.toThrow('Failed to fetch');
  });
});

describe('C · el control registra qué mensaje analizó cada coaching', () => {
  it('el turno marca como analizado el último mensaje del prospecto que vio el coaching (aunque no tenga señales)', async () => {
    const r = await runPrimerContactoTurn({ call: fakeCall(COACH([])), project: PROJECT, profile: PROFILE, history: HISTORY, setterText: SETTER, control: createControlState() });
    expect(urgencyOf(r.control).procesados).toEqual([2]);
  });

  it('si el coaching falla, ese mensaje queda pendiente', async () => {
    const call = vi.fn(async (system) => { if (isCoach(system)) throw new Error('red'); return { respuesta_prospecto: NEW_REPLY, acepta_cita: 'no', estado_lead: 'interesado' }; });
    const r = await runPrimerContactoTurn({ call, project: PROJECT, profile: PROFILE, history: HISTORY, setterText: SETTER, control: createControlState() });
    expect(urgencyOf(r.control).procesados).toEqual([]);
  });

  it('sesión completa: la barra y el informe coinciden salvo por lo que diga la última respuesta', async () => {
    const r = await runPrimerContactoTurn({ call: fakeCall(COACH([{ senal: 'reconoce_problema', postura: 'afirma', cita: 'Me cuesta un montón conseguir pacientes' }])), project: PROJECT, profile: PROFILE, history: HISTORY, setterText: SETTER, control: createControlState() });
    const bar = urgencyOf(r.control).valor;
    const history = [...HISTORY, { role: 'setter', content: SETTER }, { role: 'prospect', content: r.respuesta_prospecto }];
    const call = pendingCall([]);
    const u = await runPendingUrgency({ call, project: PROJECT, history, urgency: urgencyOf(r.control) });
    expect(bar).toBe(15);
    expect(u.valor).toBe(bar);
    expect(call.mock.calls[0][1][0].content.split('(analiza solo esta):')[1].trim()).toBe(NEW_REPLY);
  });
});

describe('cita con urgencia baja', () => {
  it('un prospecto puede aceptar la cita con urgencia 0: la urgencia no decide la cita', async () => {
    const history = [
      { role: 'prospect', content: 'Info' },
      { role: 'setter', content: '¿Qué te llamó la atención?' },
      { role: 'prospect', content: 'Tengo consultorio y la agenda está al 50 %. Quiero abrir otro consultorio este año.' },
    ];
    const control = { ...createControlState(PROFILE), revelado: ['situacion', 'motivo'] };
    const coach = COACH([], { descubrimiento: { situacion: 'Tengo consultorio y la agenda está al 50 %', motivo: 'Quiero abrir otro consultorio este año' } });
    const call = fakeCall(coach, { respuesta_prospecto: 'Dale, el jueves. Igual no tengo apuro.', acepta_cita: 'si', estado_lead: 'interesado' });
    const r = await runPrimerContactoTurn({ call, project: PROJECT, profile: PROFILE, history, setterText: '¿Te parece una llamada el jueves?', control });
    expect(r).toMatchObject({ estado_lead: 'pidio_llamada', desenlace: 'cita_aceptada' });
    expect(urgencyOf(r.control).valor).toBe(0);
  });
});

describe('B · definiciones y contraejemplos (ronda 7)', () => {
  const COUNTER = {
    C10: ['no sabía si era culpa mía o de ellos', '¿garantizan resultados?', 'depende del precio'],
    C06: ['no puedo estar en marketing', 'ese precio es alto para mí'],
    C01: ['algo que genere pacientes, no solo clicks', 'prefiero algo más directo', 'trabajo 10 horas diarias'],
    U01: ['¿cuánto cuesta esto?', 'ya lo intenté con dietas y apps', 'máximo 3 horas por semana'],
    C02: ['tengo consultorio en Lima con 2 sillones', 'no quiero otro curso que no funcione', 'lo consulto con mi socio'],
  };
  const PROMPTS = { coaching: buildPrimerContactoCoachPrompt(PROJECT), cierre: PRIMER_CONTACTO_URGENCY_SYSTEM };
  for (const [name, prompt] of Object.entries(PROMPTS)) {
    const noSignals = prompt.split('NO son señales')[1].split('Postura ("postura")')[0];
    for (const [caso, phrases] of Object.entries(COUNTER)) {
      it(`${name}: los errores de ${caso} figuran como contraejemplos («NO son señales»)`, () => {
        for (const phrase of phrases) expect(noSignals).toContain(phrase);
      });
    }
    it(`${name}: costo de no actuar exige una pérdida futura dicha por el prospecto; una frase, una señal`, () => {
      expect(prompt).toMatch(/"costo_de_no_actuar": una pérdida o un daño FUTURO que el propio prospecto dice[\s\S]*no lo deduzcas/);
      expect(prompt).toContain('Cada frase cuenta para UNA sola señal');
      expect(prompt).toContain('No influye en la nota ni en la probabilidad de cita');
    });
  }

  it('el cierre no reclasifica la conversación: solo la última respuesta', () => {
    expect(PRIMER_CONTACTO_URGENCY_SYSTEM).toMatch(/ÚLTIMA respuesta del prospecto/);
    expect(PRIMER_CONTACTO_URGENCY_SYSTEM).toContain('No los vuelvas a clasificar');
    expect(PRIMER_CONTACTO_URGENCY_SYSTEM).not.toMatch(/"mensaje":/);
  });

  it('el coaching conserva la escala de la nota y la probabilidad de cita sin cambios', () => {
    const coach = PROMPTS.coaching;
    expect(coach).toContain('"probabilidad_cita": 30');
    expect(coach).toContain('Escala: 1–3 dañino o contraproducente; 4–5 débil; 6–7 correcto con algo importante que mejorar; 8 muy bueno con un detalle importante que mejorar; 9–10 excelente');
    expect(coach).toContain('"puntuacion_mensaje": 7');
    expect(coach).toContain('analiza SOLO el ÚLTIMO MENSAJE DEL PROSPECTO');
  });
});

// ─── Ronda 8: frases reales que Haiku clasificó mal en U01 y U02 ────────────
describe('B · ronda 8 (U01 y U02)', () => {
  const PROMPTS = { coaching: buildPrimerContactoCoachPrompt(PROJECT), cierre: PRIMER_CONTACTO_URGENCY_SYSTEM };
  for (const [name, prompt] of Object.entries(PROMPTS)) {
    const priority = prompt.split('"prioridad_temporal":')[1].split('· "motivacion"')[0];
    const noSignals = prompt.split('NO son señales')[1].split('Postura ("postura")')[0];
    it(`${name}: un aplazamiento («enero próximo idealmente», U01) es niega o matiza, no afirma`, () => {
      expect(priority).toContain('Una fecha futura o un plan lejano no es urgencia por sí solo');
      expect(priority).toMatch(/«enero próximo idealmente»[^.]*\) es "niega", o "matiza"/);
    });
    it(`${name}: «antes de cerrar es crítico» (U02) es prioridad temporal, no costo de no actuar`, () => {
      expect(priority).toContain('«antes de cerrar es crítico»');
      expect(priority).toContain('«Es crítico antes de X» es prioridad temporal, no costo de no actuar');
    });
    it(`${name}: gastos en soluciones anteriores (U01, U02) y condiciones para decidir no son señales`, () => {
      for (const phrase of ['gasté en dos programas que no completé', 'gasté bastante y al final no vi pacientes nuevos reales', 'primero necesito saber el rango de precio']) {
        expect(noSignals).toContain(phrase);
      }
      expect(prompt).toContain('Lo que gastó o perdió en soluciones anteriores no es una consecuencia actual del problema');
      expect(prompt).toContain('No busques llenar las cinco señales');
    });
  }

  it('U01: si la IA marca el aplazamiento como niega, la urgencia no sube', async () => {
    const history = [
      { role: 'prospect', content: 'Es prioritario, pero honesto: gasté en dos programas que no completé.' },
      { role: 'setter', content: '¿Para cuándo necesitarías empezar a sentir cambios?' },
      { role: 'prospect', content: 'Enero próximo idealmente. Pero primero necesito saber el rango de precio. ¿Es accesible o no?' },
    ];
    const state = markProcessed(rebuildUrgency([at(0, 'prioridad_temporal', 'matiza', 'Es prioritario, pero honesto')]), 0);
    const u = await runPendingUrgency({ call: pendingCall([{ senal: 'prioridad_temporal', postura: 'niega', cita: 'Enero próximo idealmente' }]), project: PROJECT, history, urgency: state });
    expect(state.valor).toBe(13);
    expect(u.valor).toBe(0);
  });
});
