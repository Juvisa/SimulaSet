// Los guiones del preview local llevan al desenlace que describen, usando la
// misma lógica que la pantalla (startPrimerContactoTurn, control de estados,
// descubrimiento confirmado por el coaching). Sin red y sin demoras.
import { beforeAll, describe, expect, it } from 'vitest';
import { applyDiscovery, createControlState } from '../../src/utils/primerContactoControl.js';
import { pickOpeningMessage } from '../../src/utils/primerContacto.js';
import { startPrimerContactoTurn } from '../../src/utils/primerContactoTurn.js';
import { isTerminalState } from '../../src/utils/simulatorModes.js';
import { SCENARIOS } from './scenarios.js';
import { sandbox } from './state.js';

// Igual que Simulator.jsx: el prospecto primero, luego el coaching y el
// descubrimiento que confirma; se corta en un estado que cierra la sesión.
const play = async (scenario) => {
  sandbox.start(scenario.id);
  const config = { projectId: 'preview-local', ...scenario.config };
  const profile = { ...(await sandbox.fakeProfile(scenario.project, 'primer_contacto', config)), ...config };
  const messages = [{ role: 'prospect', content: pickOpeningMessage(profile.apertura_inicial, config.temperatura).text }];
  let control = createControlState(profile);
  const turns = [];
  for (const t of scenario.turns) {
    const { prospect, coach } = startPrimerContactoTurn({ call: (s, m) => sandbox.fakeCall(s, m), project: scenario.project, profile, history: messages, setterText: t.setter, control });
    const p = await prospect;
    const c = await coach;
    control = applyDiscovery(p.control, c.discovery);
    messages.push({ role: 'setter', content: t.setter }, { role: 'prospect', content: p.respuesta_prospecto });
    turns.push({ ...p, coaching: c.coaching, control });
    if (isTerminalState('primer_contacto', p.estado_lead)) break;
  }
  return turns;
};

const EXPECTED = {
  'cita-aceptada': { desenlace: 'cita_aceptada', turnos: 4, espera: [] },
  'cita-espera-coaching': { desenlace: 'cita_aceptada', turnos: 3, espera: [3] },
  'cita-no-valida': { desenlace: 'cita_aceptada', turnos: 4 },
  'cita-rectificada': { desenlace: 'cita_aceptada', turnos: 5 },
  'cita-condicionada': { desenlace: 'cita_condicionada', turnos: 4, estado: 'interesado' },
  'despedida-evasivas': { desenlace: 'despedida', turnos: 3 },
  'no-califica': { desenlace: 'no_califica', turnos: 3 },
  'coaching-falla': { desenlace: 'abierta', turnos: 2 },
  'reproduccion-r12': { desenlace: 'cita_condicionada', turnos: 5 },
  'reproduccion-r09': { desenlace: 'cita_aceptada', turnos: 7 },
};

describe('preview local · escenarios', () => {
  beforeAll(() => sandbox.setDelays({ prospectMs: 0, coachMs: 0 }));

  it('hay una expectativa para cada escenario', () => {
    expect(SCENARIOS.map((s) => s.id).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const s of SCENARIOS) {
    it(`${s.id}: ${s.title}`, async () => {
      const turns = await play(s);
      const last = turns.at(-1);
      const e = EXPECTED[s.id];
      expect(last.desenlace).toBe(e.desenlace);
      expect(turns).toHaveLength(e.turnos);
      if (e.estado) expect(last.estado_lead).toBe(e.estado);
      if (e.espera) expect(turns.map((t, i) => (t.awaitedCoach ? i + 1 : null)).filter(Boolean)).toEqual(e.espera);
      // Ninguna respuesta mostrada trae datos de contacto.
      for (const t of turns) expect(t.respuesta_prospecto).not.toMatch(/\+?\d[\d\s()-]{7,}\d/);
    });
  }

  it('coaching-falla: el turno sin coaching queda sin puntuación', async () => {
    const turns = await play(SCENARIOS.find((x) => x.id === 'coaching-falla'));
    expect(turns[0].coaching).toBeNull();
    expect(turns[1].coaching.puntuacion_mensaje).toBe(9);
  });

  it('reproducción R12: la aceptación con teléfono se pide de nuevo; el motivo nunca se confirma', async () => {
    const turns = await play(SCENARIOS.find((x) => x.id === 'reproduccion-r12'));
    expect(turns[3].plan.evasion).toBe(true); // «depende del plan» ante la segunda pregunta
    expect(turns[4]).toMatchObject({ retried: true, acepta_cita: 'condicionada' });
    expect(turns[4].prospectIssues).toEqual(expect.arrayContaining(['intento1:contacto']));
    expect(turns[4].control.confirmado).toEqual(['situacion']);
  });

  it('reproducción R09: la cifra sin respaldo se pide de nuevo y la paráfrasis real habilita la cita', async () => {
    const turns = await play(SCENARIOS.find((x) => x.id === 'reproduccion-r09'));
    expect(turns[4].prospectIssues).toEqual(expect.arrayContaining(['intento1:cifra_sin_respaldo']));
    expect(turns[6]).toMatchObject({ estado_lead: 'pidio_llamada', fallback: null });
    expect(turns[6].control.cambioEncaje).toBe('Las 3 cuotas de 650 USD hicieron la inversión accesible');
  });

  it('el guardado simulado calcula average_score igual que la aplicación', async () => {
    const { saveSimulatorSession } = await import('./stubs/simulatorSessions.js');
    const r = await saveSimulatorSession({ mode: 'primer_contacto', scores: [8, 9, 10], finalState: 'pidio_llamada' });
    expect(r.averageScore).toBe(90);
    expect(sandbox.get().saved).toEqual({ mode: 'primer_contacto', final_state: 'pidio_llamada', scores: [8, 9, 10], average_score: 90 });
  });
});
