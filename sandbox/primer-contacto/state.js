// Estado del preview local: escenario activo, demoras simuladas, registro de
// llamadas y de lo que se habría guardado. La IA simulada responde con el
// guion del escenario; la lógica real de Primer contacto (plan del turno,
// reintentos, respaldos, coaching, topes) corre igual que en la aplicación.
import { SCENARIOS } from './scenarios.js';

const listeners = new Set();
let snapshot = null;
const state = {
  scenarioId: null,
  prospectMs: 1500, // ronda 3: ≈1,5 s hasta ver al prospecto
  coachMs: 3400,    // ronda 3: ≈3,4 s hasta el coaching
  nextTurn: 0,
  log: [],
  saved: null,
  blocked: [],
  run: 0,
};
const emit = () => { snapshot = { ...state, log: [...state.log], blocked: [...state.blocked] }; listeners.forEach((l) => l()); };
emit();

export const sandbox = {
  subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
  get: () => snapshot,
  scenario: () => SCENARIOS.find((s) => s.id === state.scenarioId) || null,
  start(id) {
    Object.assign(state, { scenarioId: id, nextTurn: 0, log: [], saved: null, run: state.run + 1 });
    emit();
  },
  setDelays({ prospectMs = state.prospectMs, coachMs = state.coachMs }) {
    Object.assign(state, { prospectMs, coachMs });
    emit();
  },
  note(entry) {
    state.log.push({ at: new Date().toLocaleTimeString(), ...entry });
    if (state.log.length > 60) state.log.shift();
    emit();
  },
  blockedRequest(url) {
    state.blocked.push(String(url).slice(0, 120));
    emit();
  },
  recordSave(data) {
    state.saved = data;
    emit();
  },

  // ─── IA simulada ─────────────────────────────────────────────────────────
  async fakeProfile(project, mode, config) {
    const s = this.scenario();
    await wait(600);
    this.note({ rol: 'perfil', detalle: 'perfil ficticio del escenario' });
    return { ...s.profile, temperatura: config.temperatura, canal: config.canal, resistencia: config.resistencia, attempts: 1 };
  },
  async fakeCall(system, messages) {
    const s = this.scenario();
    const sys = String(system || '');
    // Un reintento de la aplicación agrega instrucciones «IMPORTANTE: …» al final.
    const retry = /\nIMPORTANTE: /.test(sys);
    if (sys.includes('Eres coach')) {
      const conversation = String(messages?.[0]?.content || '').split('MENSAJE DEL ALUMNO A EVALUAR:')[0];
      const index = (conversation.match(/^Alumno: /gm) || []).length;
      const turn = s.turns[index];
      await wait(state.coachMs);
      if (turn?.coachFails) {
        this.note({ rol: 'coaching', turno: index + 1, detalle: 'fallo simulado (sin coaching ni puntuación)' });
        throw new Error('Fallo simulado del coaching');
      }
      this.note({ rol: 'coaching', turno: index + 1, detalle: `nota del guion: ${turn?.coach?.puntuacion_mensaje ?? '—'}` });
      return turn?.coach || DEFAULT_COACH;
    }
    const index = (messages || []).filter((m) => m.role === 'user').length - 1;
    const turn = s.turns[index];
    await wait(state.prospectMs);
    const raw = retry && turn?.prospectRetry ? turn.prospectRetry : turn?.prospect;
    this.note({ rol: 'prospecto', turno: index + 1, detalle: retry ? `REINTENTO pedido por la app${turn?.prospectRetry ? ' (respuesta corregida del guion)' : ' (el guion repite la respuesta)'}` : 'respuesta del guion' });
    if (!retry) { state.nextTurn = index + 1; emit(); }
    return raw || END_OF_SCRIPT;
  },
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DEFAULT_COACH = {
  etapa_set: 'S', que_hizo_bien: 'Fuera del guion de este escenario.', que_mejorar: '', mensaje_alternativo: '', recurso_sugerido: '',
  alerta: '', nivel_fomo: 20, probabilidad_cita: 30, descubrimiento: { situacion: '', motivo: '' }, puntuacion_mensaje: 6,
};
const END_OF_SCRIPT = { respuesta_prospecto: '(Fin del guion de este escenario. Puedes pulsar «Terminar».)', revela: [], acepta_cita: 'no', cambio_encaje: '', estado_lead: 'abierto' };
