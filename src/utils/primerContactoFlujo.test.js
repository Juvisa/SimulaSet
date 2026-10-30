// Integración de punta a punta, sin IA real: cada conversación pasa por el
// mismo recorrido que la pantalla (Simulator.jsx → startPrimerContactoTurn:
// prospecto, coaching, control y aplicación del coaching), se calcula el
// estado final que se guardaría (primerContactoFinalState) y la sesión entra
// a las métricas reales del alumno (analytics.js). Cubre las cuatro
// situaciones que pidió Digital SET (30/10/2026):
//   1. una cita legítima que termina registrada como éxito;
//   2. una cita aceptada después de promesas inventadas → cita_no_valida;
//   3. una cita recuperada con una rectificación explícita;
//   4. una cita condicionada que no cuenta como éxito.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { INVALID_APPOINTMENT_STATE, createControlState, finalStateLabel, primerContactoFinalState } from './primerContactoControl';
import { applyCoachResult, startPrimerContactoTurn } from './primerContactoTurn';
import { construirMetricasSetter } from './analytics';
import { isTerminalState } from './simulatorModes';

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

// Igual que Simulator.jsx: el prospecto primero; al llegar el coaching se
// aplica al control y, si el turno cerró la sesión, se guarda el estado final
// con la validez de la cita. Si la conversación no cierra sola, el alumno
// pulsa «Terminar» y se guarda el estado del lead (endSession).
const simulate = async (turns, opening = 'Info') => {
  const history = [{ role: 'prospect', content: opening }];
  let control = createControlState(PROFILE);
  let leadState = 'abierto';
  const scores = [];
  const shown = [];
  for (const t of turns) {
    const p = [...t.prospect];
    const call = vi.fn(async (system) => (String(system).includes('Eres coach') ? t.coach : (p.length > 1 ? p.shift() : p[0])));
    const { prospect, coach } = startPrimerContactoTurn({ call, project: DENTAL, profile: PROFILE, history, setterText: t.setter, control });
    const response = await prospect;
    leadState = response.estado_lead;
    const coachResult = await coach;
    control = applyCoachResult(response.control, coachResult);
    if (coachResult.coaching?.puntuacion_mensaje) scores.push(coachResult.coaching.puntuacion_mensaje);
    history.push({ role: 'setter', content: t.setter }, { role: 'prospect', content: response.respuesta_prospecto });
    shown.push(response.respuesta_prospecto);
    if (isTerminalState('primer_contacto', leadState)) {
      return { finalState: primerContactoFinalState(leadState, control), leadState, control, scores, shown, closedBy: 'conversación' };
    }
  }
  return { finalState: leadState, leadState, control, scores, shown, closedBy: 'alumno' };
};
// Fila de simulator_sessions tal como la ve analytics.js.
const asSession = (r) => ({ mode: 'primer_contacto', finalState: r.finalState, scores: r.scores, averageScore: Math.round((r.scores.reduce((a, b) => a + b, 0) / r.scores.length) * 10), createdAt: new Date().toISOString() });
const successRate = (sessions) => construirMetricasSetter({ allSessions: sessions, setScore: 0 }).simulador.por_modo.primer_contacto.tasaExito;

// Descubrimiento real y propuesta conectada (base de las cuatro).
const SITUACION = 'Tengo dos sillones y la agenda va al 55 %, casi todo por referidos.';
const MOTIVO = 'Necesito llenar la agenda para cubrir el equipo nuevo que compré.';
const opening = [
  { setter: '¡Hola! Gracias por escribir. ¿Qué te llamó la atención de la publicación?', prospect: [say(SITUACION, { revela: ['situacion'], estado_lead: 'interesado' })], coach: coachSays(8) },
  { setter: 'Entiendo. ¿Y por qué te pusiste a buscar esto justo ahora?', prospect: [say(MOTIVO, { revela: ['motivo'], estado_lead: 'interesado' })], coach: coachSays(9, { situacion: SITUACION }) },
];
const propose = (setter, prospectText, extra = {}) => ({
  setter, prospect: [say(prospectText, { acepta_cita: 'si', estado_lead: 'pidio_llamada', ...extra })], coach: coachSays(9, { situacion: SITUACION, motivo: MOTIVO }),
});

describe('flujo completo: cita aceptada frente a cita pedagógicamente válida', () => {
  it('1 · cita legítima: se registra como éxito (pidio_llamada)', async () => {
    const r = await simulate([...opening,
      propose('Para cubrir ese equipo nuevo con pacientes nuevos, ¿te parece una llamada con la Dra. Ana el jueves a las 5?', 'Dale, el jueves a las 5 me va bien. ¿Es por videollamada?'),
      { setter: 'Sí, por videollamada; la Dra. te escribe por aquí un rato antes con el enlace.', prospect: [say('Perfecto, gracias.')], coach: coachSays(9) },
    ]);
    expect(r.closedBy).toBe('conversación');
    expect(r.finalState).toBe('pidio_llamada');
    expect(r.control.invenciones).toEqual([]);
    expect(successRate([asSession(r)])).toBe(100);
  });

  it('2 · cita aceptada tras promesas inventadas sin corregir: queda la cita, pero se guarda como cita_no_valida y no suma éxito', async () => {
    const r = await simulate([...opening,
      { setter: 'Tranquilo: tiene garantía, si en 30 días no ves resultados te devolvemos el dinero. ¿Cómo te llegan hoy los pacientes?', prospect: [say('Casi todo por referidos.')], coach: coachSays(7, { situacion: SITUACION, motivo: MOTIVO }) },
      propose('Con 2 sillones, 15 pacientes nuevos al mes es el piso. ¿Agendamos con la Dra. Ana el jueves a las 5?', 'Dale, el jueves a las 5. Me convenció la garantía.'),
    ]);
    expect(r.leadState).toBe('pidio_llamada'); // lo que pasó en la conversación
    expect(r.finalState).toBe(INVALID_APPOINTMENT_STATE); // lo que se guarda
    expect(r.scores).toEqual([8, 9, 3, 3]); // los turnos con invención llevan tope de 3
    expect(successRate([asSession(r)])).toBe(0);
    expect(finalStateLabel('primer_contacto', r.finalState)).toMatch(/no válida/);
  });

  it('3 · cita recuperada con una rectificación explícita antes de aceptar: es válida', async () => {
    const r = await simulate([...opening,
      { setter: 'Tranquilo: tiene garantía, si en 30 días no ves resultados te devolvemos el dinero. ¿Cómo te llegan hoy los pacientes?', prospect: [say('Casi todo por referidos.')], coach: coachSays(7, { situacion: SITUACION, motivo: MOTIVO }) },
      { setter: 'Perdón, me equivoqué antes: no hay garantía de devolución, eso no está documentado. ¿Qué te gustaría resolver primero?', prospect: [say('Gracias por aclararlo. Llenar los martes, que están vacíos.')], coach: coachSays(8, { situacion: SITUACION, motivo: MOTIVO }) },
      propose('Para llenar esos martes, ¿te parece una llamada con la Dra. Ana el jueves a las 5?', 'Dale, el jueves a las 5 me va bien.'),
    ]);
    expect(r.finalState).toBe('pidio_llamada');
    expect(r.scores).toEqual([8, 9, 3, 8, 9]); // la rectificación no recibe tope
    expect(successRate([asSession(r)])).toBe(100);
  });

  it('4 · cita condicionada: el alumno termina la sesión y no cuenta como éxito', async () => {
    const r = await simulate([...opening,
      { setter: 'Para cubrir ese equipo nuevo, ¿te parece una llamada con la Dra. Ana esta semana?', prospect: [say('Sí, pero antes dime cuánto cuesta.', { acepta_cita: 'condicionada', estado_lead: 'interesado' })], coach: coachSays(9, { situacion: SITUACION, motivo: MOTIVO }) },
    ]);
    expect(r.closedBy).toBe('alumno');
    expect(r.finalState).toBe('interesado');
    expect(successRate([asSession(r)])).toBe(0);
  });

  it('las cuatro juntas: 2 de 4 son éxitos (la legítima y la rectificada)', async () => {
    const base = [...opening];
    const legit = await simulate([...base, propose('¿Te parece una llamada con la Dra. Ana el jueves a las 5 para ver cómo cubrir ese equipo?', 'Dale, el jueves a las 5 me va bien.')]);
    const invalid = await simulate([...base, propose('Tiene garantía de resultados o te devolvemos el dinero. ¿Agendamos el jueves a las 5?', 'Dale, el jueves a las 5.')]);
    const fixed = await simulate([...base,
      { setter: 'Tiene garantía de resultados. ¿Cómo te llegan los pacientes?', prospect: [say('Por referidos.')], coach: coachSays(6, { situacion: SITUACION, motivo: MOTIVO }) },
      { setter: 'Me equivoqué: no hay garantía, eso no está documentado. ¿Qué querés resolver primero?', prospect: [say('Llenar los martes.')], coach: coachSays(8, { situacion: SITUACION, motivo: MOTIVO }) },
      propose('¿Te parece una llamada con la Dra. Ana el jueves a las 5 para eso?', 'Dale, el jueves a las 5 me va bien.')]);
    const conditioned = await simulate([...base, { setter: '¿Una llamada esta semana?', prospect: [say('Sí, pero antes dime el precio.', { acepta_cita: 'condicionada', estado_lead: 'interesado' })], coach: coachSays(8, { situacion: SITUACION, motivo: MOTIVO }) }]);
    expect([legit, invalid, fixed, conditioned].map((x) => x.finalState)).toEqual(['pidio_llamada', INVALID_APPOINTMENT_STATE, 'pidio_llamada', 'interesado']);
    expect(successRate([legit, invalid, fixed, conditioned].map(asSession))).toBe(50);
  });

  it('el texto del prospecto no puede mostrar una aceptación con horario cuando la cita no se registra (ronda 6, C02 #6)', async () => {
    // Sin motivo confirmado: el guion insiste en «A las 3 está bien» → se pide de nuevo y entra el respaldo.
    const r = await simulate([
      { setter: '¿Qué te llamó la atención?', prospect: [say(SITUACION, { revela: ['situacion'] })], coach: coachSays(7) },
      { setter: '¿Te va bien una llamada el jueves a las 3?', prospect: [say('A las 3 está bien. Pero que sea por aquí, no quiero dar mi número.', { revela: ['motivo'] })], coach: coachSays(5, { situacion: SITUACION }) },
    ]);
    expect(r.shown.at(-1)).not.toMatch(/A las 3 está bien/);
    expect(r.leadState).not.toBe('pidio_llamada');
  });
});

describe('cita_no_valida en el resto de la aplicación', () => {
  it('no es éxito en ninguna modalidad ni en «Leads convertidos» del Dashboard', () => {
    const dashboard = readFileSync(new URL('../pages/Dashboard.jsx', import.meta.url), 'utf8');
    const leadsClosed = dashboard.match(/\[('[a-z_]+'(, )?)+\]\.includes\(s\.finalState\)/)[0];
    expect(leadsClosed).not.toContain(INVALID_APPOINTMENT_STATE);
    const report = readFileSync(new URL('../pages/SimulationReport.jsx', import.meta.url), 'utf8');
    expect(report).toContain("finalStateLabel(session.mode, session.finalState)");
    expect(report.match(/\{\[('[a-z_]+'(, )?)+\]\.includes\(session\?\.finalState\)/)[0]).not.toContain(INVALID_APPOINTMENT_STATE);
  });
  it('el informe de respaldo muestra una etiqueta legible; las demás modalidades, su estado tal cual', () => {
    expect(finalStateLabel('primer_contacto', 'cita_no_valida')).toBe('Cita aceptada, pero no válida: se consiguió con información no documentada que no se corrigió');
    expect(finalStateLabel('primer_contacto', 'pidio_llamada')).toBe('Cita aceptada');
    expect(finalStateLabel('outbound', 'pidio_llamada')).toBe('pidio_llamada');
    expect(finalStateLabel('inbound', 'confirmado_con_entusiasmo')).toBe('confirmado_con_entusiasmo');
  });
});
