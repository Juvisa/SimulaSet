// Regresión de los bloqueantes de la ronda 6 (Haiku real, 30/10/2026) con
// las frases REALES de C02, C10 y C15. La causa común: reglas que juzgaban
// una frase aislada sin su contexto (de qué habla, qué está documentado y qué
// ya pasó en la conversación). Sin IA real.
import { describe, expect, it, vi } from 'vitest';
import {
  createControlState, isCallLogistics, isMotiveQuote, isPriceFollowUp, planTurn, resolveTurn, verifyCoachInvention,
} from './primerContactoControl';
import { runCoachTurn } from './primerContactoTurn';

const DENTAL = {
  expertName: 'Dra. Ana Torres (ficticia)', niche: 'Odontólogos con consultorio propio',
  promise: 'Llenar la agenda con pacientes nuevos sin depender solo de referidos, en 90 días', price: '1.800 USD o 3 cuotas de 650 USD',
  avatarBusiness: 'Consultorio dental independiente de 1 a 3 sillones', avatarCurrentSituation: 'Depende de referidos; la agenda va entre el 50 y el 70 %',
  avatarPain: 'Meses flojos sin pacientes nuevos y miedo a no cubrir los gastos fijos', avatarDesire: 'Agenda estable y poder abrir un segundo consultorio',
  avatarDescription: 'Odontólogo independiente de 30 a 50 años en Latinoamérica', commonObjections: 'Ya probé con una agencia de anuncios; no tengo tiempo; es caro',
  testimonials: [{ nombre: 'Caso ficticio: Dr. Luis', resultado: '+40 pacientes nuevos en 3 meses' }],
  recursos: { guias_pdfs: [], videos_testimonios: [], vsl_presentacion: { activo: false }, scripts_apertura: {} },
};
const PROFILE = { nombre: 'P', encaje: 'alto', temperatura: 'tibio', resistencia: 'media' };
const coachSays = (puntuacion_mensaje, extra = {}) => ({
  etapa_set: 'T', que_hizo_bien: 'Bien.', que_mejorar: 'Algo.', mensaje_alternativo: '', recurso_sugerido: '', alerta: '',
  nivel_fomo: 20, probabilidad_cita: 30, descubrimiento: { situacion: '', motivo: '', no_encaje: '' }, afirmacion_no_documentada: '', puntuacion_mensaje, ...extra,
});

describe('B1 · la logística de la llamada no es una característica de la oferta', () => {
  const C02_7 = 'Dale, jueves a las 3 PM por aquí en WhatsApp. La Dra. te envía el link de la llamada una hora antes. ¿Me dejas tu nombre completo para confirmar?';
  it('C02 #7 real: no se acepta como invención, no recibe tope y no invalida la cita', async () => {
    expect(verifyCoachInvention('La Dra. te envía el link de la llamada una hora antes.', C02_7, DENTAL)).toBeNull();
    const r = await runCoachTurn({ call: vi.fn(async () => coachSays(7, { afirmacion_no_documentada: 'La Dra. te envía el link de la llamada una hora antes.' })), project: DENTAL, history: [{ role: 'prospect', content: 'A las 3 está bien.' }], setterText: C02_7 });
    expect(r.coaching.puntuacion_mensaje).toBe(7);
    expect(r.invencion).toBeNull();
    expect(r.claims).toEqual([]);
  });
  it('otras frases de logística tampoco: horario, canal, quién asiste, recordatorio', () => {
    for (const q of ['Claro, pueden ir los dos sin problema.', 'Te escribo por aquí el miércoles para confirmar la hora.', 'La llamada es por Zoom y dura unos 20 minutos.', 'Te mando el enlace por este chat.'])
      expect(isCallLogistics(q), q).toBe(true);
  });
  it('las características inventadas reales de la ronda 6 siguen contando, aunque mencionen la llamada', () => {
    const real = [
      ['Buena pregunta. Tú diriges, nosotros guiamos paso a paso. Con 5-6 horas semanales es factible.', 'Tú diriges, nosotros guiamos paso a paso.'], // C08 #4
      ['Entiendo. Google Ads sin estrategia correcta quema dinero. La diferencia es que nosotros no solo lanzamos anuncios: armamos un sistema completo.', 'armamos un sistema completo'], // C08 #6
      ['Una pregunta: si tuvieras una forma que NO te quitara tiempo (nosotros manejamos gran parte), ¿estarías abierto a probarla?', 'nosotros manejamos gran parte'], // C10 #5
      ['Entiendo. No es un curso, es un sistema implementado: la Dra. te guía paso a paso. ¿Pueden ambos en una llamada el jueves?', 'es un sistema implementado: la Dra. te guía paso a paso'], // C02 #4
      ['En la llamada te muestro el programa, que incluye seguimiento semanal y soporte por chat.', 'que incluye seguimiento semanal y soporte por chat'],
    ];
    for (const [text, quote] of real) expect(verifyCoachInvention(quote, text, DENTAL), quote).toBeTruthy();
  });
});

describe('B2 · evaluar la oferta antes de comprar es una condición, no un motivo', () => {
  it('frases reales de las rondas 5 y 6 que eran condiciones', () => {
    for (const q of [
      'Necesito estar segura de que funciona antes de invertir.', // ronda 6, C10 #6
      'Pero quiero estar seguro de que esto funciona antes de invertir.', // ronda 5, C07
      'Pero necesito saber si realmente funciona antes de meter la plata.', // ronda 5, C05
      'Pero que sea rápido porque trabajo mucho y necesito saber si me conviene.', // ronda 5, C04
      'Quiero ver si esto es para mí antes de comprar.',
    ]) expect(isMotiveQuote(q), q).toBe(false);
  });
  it('los motivos reales de la ronda 6 siguen confirmándose (sin bloquear citas legítimas)', () => {
    for (const q of [
      'Los últimos dos meses fueron más lentos todavía. Por eso me preocupa.', // C01
      'Tengo que cubrir arriendo, servicios, y hace poco invertí en radiografía digital. Sin pacientes nuevos, es difícil justificar esos gastos.', // C01
      'Los gastos fijos me aprietan y tengo presión de crecer rápido. Mi socio inversor quiere ver resultados.', // C07
      'Unos 15 a 20 nuevos por mes estaría bien. Así la agenda se estabiliza y podemos pensar en crecer.', // C15
      'Necesito llenar la agenda antes de fin de año para cubrir el equipo nuevo.', // necesidad con plazo: no es condición
    ]) expect(isMotiveQuote(q), q).toBe(true);
  });
});

describe('B3 · con el precio ya dado, una pregunta de seguimiento no es una evasiva', () => {
  const step = (state, last, setter) => {
    const plan = planTurn(state, { project: DENTAL, profile: PROFILE, lastProspectText: last, setterText: setter });
    return { plan, state: resolveTurn(state, plan, { respuesta_prospecto: 'ok', acepta_cita: 'no', estado_lead: 'interesado', revela: [] }, PROFILE, DENTAL).control };
  };
  it('C15 real: «¿incluye todo o hay costos adicionales?» después del precio no deja el precio pendiente', () => {
    let s = createControlState(PROFILE);
    ({ state: s } = step(s, 'Eso suena bien, pero antes: ¿cuánto cuesta? Y ¿realmente funciona para consultorio chico como el mío?', 'Cuesta 1.800 USD o 3 cuotas de 650. Y sí: está diseñado para consultorios de 1 a 3 sillones como el tuyo.'));
    expect(s.precioDado).toBe(true);
    const t5 = step(s, 'Tengo 2 sillones. El precio es bastante... ¿incluye todo o hay costos adicionales? ¿Y cuánto tiempo me pide dedicar?', 'Buena pregunta. El precio incluye el sistema completo. ¿Cuántas horas por semana podrías dedicar?');
    expect(t5.plan).toMatchObject({ priceFollowUp: true, evasion: false, evasivas: 0 });
    expect(t5.plan.bloqueos).not.toContain('precio_pendiente');
  });
  it('sin haber dado el precio, o si vuelve a pedir el monto, sigue siendo una pregunta de precio', () => {
    const fresh = step(createControlState(PROFILE), '¿Incluye todo o hay costos adicionales? ¿Cuánto cuesta?', 'Eso lo vemos más adelante.');
    expect(fresh.plan.evasion).toBe(true);
    expect(isPriceFollowUp('¿Y cuánto era el precio? No me acuerdo.')).toBe(false);
    expect(isPriceFollowUp('¿Hay algún pago aparte o sorpresas?')).toBe(true);
    let s = createControlState(PROFILE);
    ({ state: s } = step(s, 'Precio', 'Son 1.800 USD o 3 cuotas de 650 USD.'));
    expect(step(s, 'Perdón, ¿cuánto era?', '¿Cómo está tu agenda?').plan.evasion).toBe(true);
  });
});
