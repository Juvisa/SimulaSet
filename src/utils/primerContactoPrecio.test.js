// Primer contacto, metodología SET (decisión de Digital SET, 02/11/2026): el
// setter no revela precios, rangos, descuentos ni condiciones comerciales por
// chat; la propuesta comercial la presenta el especialista. Cuatro
// comportamientos: (1) revelar el precio documentado tiene tope de 5 en ese
// turno; (2) explicar el rol no es evasiva ni bloquea la cita, pero tampoco la
// garantiza; (3) ignorar, vaguedades, razones inventadas o repetir la misma
// frase siguen siendo evasivas; (4) lo copiable nunca trae cifras ni condiciones.
import { describe, expect, it, vi } from 'vitest';
import { PRICE_REVEAL_MAX_SCORE, runCoachTurn } from './primerContactoTurn';
import { classifyPriceAnswer, createControlState, mentionsCommercialTerms, planTurn } from './primerContactoControl';
import { buildPrimerContactoCoachPrompt, buildPrimerContactoTurnDirective } from './prompts';
import { PROJECT } from './primerContacto.fixtures';

const ROLE = 'Entiendo que quieras saberlo. La propuesta comercial y la inversión las presenta la especialista en la llamada, según tu caso. ¿Cómo está hoy tu agenda?';
const HISTORY = [
  { role: 'prospect', content: 'Info' },
  { role: 'setter', content: '¿Qué te llamó la atención?' },
  { role: 'prospect', content: '¿Cuánto cuesta el programa?' },
];
const COACH = (extra = {}) => ({ etapa_set: 'S', que_hizo_bien: 'Bien.', que_mejorar: 'Profundiza.', mensaje_alternativo: '', recurso_sugerido: '', alerta: '', probabilidad_cita: 40, puntuacion_mensaje: 9, urgencia: [], ...extra });
const coachCall = (coach) => vi.fn(async () => coach);
const plan = (setterText, lastProspectText, { state = createControlState({ resistencia: 'media' }), project = PROJECT, conversationText = '' } = {}) => planTurn(state, { project, profile: { encaje: 'alto', resistencia: 'media' }, lastProspectText, setterText, conversationText });

describe('1 · revelar el precio documentado: máximo 5 en ese turno', () => {
  it('precio exacto: tope 5 y alerta explicativa', async () => {
    const r = await runCoachTurn({ call: coachCall(COACH()), project: PROJECT, history: HISTORY, setterText: 'Son 1.800 USD o 3 cuotas de 650 USD. ¿Te acomoda?' });
    expect(PRICE_REVEAL_MAX_SCORE).toBe(5);
    expect(r.coaching.puntuacion_mensaje).toBe(5);
    expect(r.issues).toContain('tope_5:9');
    expect(r.coaching.alerta).toMatch(/lo[s]? presenta el especialista/);
  });

  it('un rango aproximado también es revelar («ronda los 2 mil»)', async () => {
    const r = await runCoachTurn({ call: coachCall(COACH()), project: PROJECT, history: HISTORY, setterText: 'Ronda los 2 mil dólares, más o menos.' });
    expect(r.coaching.puntuacion_mensaje).toBe(5);
  });

  it('una nota ya menor que 5 no se toca', async () => {
    const r = await runCoachTurn({ call: coachCall(COACH({ puntuacion_mensaje: 4 })), project: PROJECT, history: HISTORY, setterText: 'Son 1.800 USD.' });
    expect(r.coaching.puntuacion_mensaje).toBe(4);
  });

  it('precio incorrecto o inventado: se conserva el tope de 3', async () => {
    const wrong = await runCoachTurn({ call: coachCall(COACH()), project: PROJECT, history: HISTORY, setterText: 'Son 1.500 USD.' });
    expect(wrong.coaching.puntuacion_mensaje).toBe(3);
    const invented = await runCoachTurn({ call: coachCall(COACH()), project: { ...PROJECT, price: '' }, history: HISTORY, setterText: 'Son 900 dólares.' });
    expect(invented.coaching.puntuacion_mensaje).toBe(3);
  });

  it('solo ese turno: el mensaje siguiente sin precio conserva su nota (la nota global no se limita)', async () => {
    const r = await runCoachTurn({ call: coachCall(COACH()), project: PROJECT, history: [...HISTORY, { role: 'setter', content: 'Son 1.800 USD.' }, { role: 'prospect', content: 'Ok.' }], setterText: ROLE });
    expect(r.coaching.puntuacion_mensaje).toBe(9);
    expect(r.issues.some((i) => i.startsWith('tope_'))).toBe(false);
  });

  it('el coaching recibe la regla: no penalizar por no dar la cifra; revelar, máximo 5', () => {
    const prompt = buildPrimerContactoCoachPrompt(PROJECT);
    expect(prompt).toContain('el setter NO revela precios, rangos, descuentos ni condiciones comerciales por chat');
    expect(prompt).toContain('NO lo penalices por no dar la cifra');
    expect(prompt).toContain('Revelar el precio documentado (o un rango) tiene como máximo 5');
    expect(prompt).toContain('reconocer la inquietud, explicar que la propuesta comercial la presenta el especialista');
  });
});

describe('2 · el prospecto exige el precio: explicar el rol no es evasiva ni bloquea la cita', () => {
  const DEMANDS = 'Si no me dices cuánto cuesta, no agendo nada.';

  it('cuenta como respuesta, sin evasiva ni bloqueos de precio', () => {
    const p = plan(ROLE, DEMANDS);
    expect(p).toMatchObject({ priceAsked: true, priceAnswered: true, evasion: false, evasivas: 0, precioRol: true });
    expect(p.bloqueos).not.toContain('precio_pendiente');
    expect(p.bloqueos).not.toContain('precio_condicion');
  });

  it('el prospecto decide con naturalidad: puede aceptar, mantener su duda o retirarse (no se garantiza la cita)', () => {
    const p = plan(ROLE, DEMANDS);
    const directive = buildPrimerContactoTurnDirective(p, { temperatura: 'tibio', resistencia: 'media' });
    expect(directive).toContain('no es una evasiva');
    expect(directive).toContain('puedes aceptar una llamada para conocerla, mantener tu duda o retirarte con cortesía');
    expect(directive).not.toContain('Insistes con naturalidad');
  });

  it('frases de rol en otras formas también valen', () => {
    for (const t of [
      'No me corresponde darte el precio por chat: lo ve la Dra. Ana contigo en la llamada.',
      'Mi rol es entender tu caso; el precio te lo explica la especialista en la llamada.',
      'Yo no manejo los precios, la propuesta la presenta el equipo en una llamada corta.',
    ]) expect(classifyPriceAnswer(t, PROJECT)).toMatchObject({ respondio: true, exactitud: 'honesta', rol: true });
  });

  it('caso límite: sin precio documentado, la condición del prospecto se respeta como antes', () => {
    const p = plan('No tengo el precio confirmado; lo explica Marta en la llamada.', DEMANDS, { project: { ...PROJECT, price: '' } });
    expect(p.priceAnswered).toBe(true);
    expect(p.bloqueos).toContain('precio_condicion');
    expect(p.precioRol).toBe(false);
  });
});

describe('3 · no se premia ignorar ni repetir mecánicamente', () => {
  it('ignorar, vaguedades, razones inventadas o confirmar un rango siguen siendo evasivas', () => {
    for (const t of [
      'Eso lo vemos más adelante. ¿Cuántos pacientes nuevos tienes al mes?',
      'Es accesible, vale la pena.',
      'Depende del plan que elijas, la especialista te lo explica en la llamada.',
      'Mira, los rangos que mencionas están en la zona. La Dra. Ana te da el precio exacto en la llamada.',
    ]) expect(classifyPriceAnswer(t, PROJECT).respondio, t).toBe(false);
  });

  it('repetir la misma frase ante una nueva pregunta ya no cuenta como respuesta', () => {
    expect(classifyPriceAnswer(ROLE, PROJECT, { conversationText: '' }).respondio).toBe(true);
    expect(classifyPriceAnswer(ROLE, PROJECT, { conversationText: `¿Cuánto cuesta?\n${ROLE}\nYa, pero ¿más o menos?` }).respondio).toBe(false);
  });

  it('las evasivas reales siguen acumulándose hasta la despedida; explicar el rol las vuelve a cero', () => {
    let state = createControlState({ resistencia: 'media' });
    for (let i = 0; i < 2; i += 1) {
      const p = plan('Eso lo vemos después.', '¿Pero cuánto cuesta?', { state });
      state = { ...state, evasivas: p.evasivas, preguntasPrecio: p.preguntasPrecio };
    }
    expect(state.evasivas).toBe(2);
    expect(plan('Eso lo vemos después.', '¿Pero cuánto cuesta?', { state }).despedida).toBe('evasivas');
    expect(plan(ROLE, '¿Pero cuánto cuesta?', { state })).toMatchObject({ evasivas: 0, despedida: null });
  });
});

describe('4 · lo copiable nunca trae cifras ni condiciones comerciales', () => {
  it('un mensaje sugerido con el precio documentado o con condiciones se descarta', async () => {
    for (const alt of ['Son 1.800 USD o 3 cuotas de 650. ¿Te sirve?', 'Se puede pagar en cuotas, ¿te interesa?', 'Hay un descuento si entras esta semana.', 'Cuesta $1997.']) {
      const r = await runCoachTurn({ call: coachCall(COACH({ mensaje_alternativo: alt })), project: PROJECT, history: HISTORY, setterText: ROLE });
      expect(r.coaching.mensaje_alternativo, alt).toBe('');
      // Un descuento no documentado ya lo descarta el filtro de invenciones (C1); lo demás, el de precio.
      expect(r.issues.some((i) => i.startsWith('mensaje_alternativo_descartado:')), alt).toBe(true);
    }
  });

  it('un mensaje sugerido que explica el rol, sin cifras, se conserva', async () => {
    const r = await runCoachTurn({ call: coachCall(COACH({ mensaje_alternativo: ROLE })), project: PROJECT, history: HISTORY, setterText: ROLE });
    expect(r.coaching.mensaje_alternativo).toBe(ROLE);
  });

  it('detección: cifras de dinero y condiciones sí; plazos y datos del prospecto no', () => {
    expect(mentionsCommercialTerms('Son 1.800 USD.', PROJECT)).toBe(true);
    expect(mentionsCommercialTerms('Tres cuotas de seiscientos cincuenta.', PROJECT)).toBe(true);
    expect(mentionsCommercialTerms('¿Qué pasó en esos 90 días?', PROJECT)).toBe(false);
    expect(mentionsCommercialTerms('¿Cómo está tu agenda al 60 %?', PROJECT)).toBe(false);
    expect(mentionsCommercialTerms('', PROJECT)).toBe(false);
  });

  it('condiciones comerciales afirmadas sin cifras se rechazan', () => {
    for (const t of [
      'Hay cuotas, así que no te preocupes.',
      'Ofrecemos financiación para que empieces ya.',
      'Tenemos descuentos este mes.',
      'Puedes pagar en mensualidades.',
      'Se puede pagar en cuotas, ¿te interesa?',
      'Pago en cuotas disponible.',
      'Hay cuotas y la especialista te las explica en la llamada.',
    ]) expect(mentionsCommercialTerms(t, PROJECT), t).toBe(true);
  });

  it('referencias neutrales al proceso no se bloquean', () => {
    for (const t of [
      'El especialista te explicará las condiciones comerciales en la llamada.',
      'Las opciones de financiación te las detalla la Dra. Ana en la llamada.',
      'Puedes preguntarle a la especialista por las cuotas cuando hablen.',
      'La propuesta comercial y la inversión las presenta la especialista. ¿Cómo está tu agenda?',
      '¿Qué te gustaría resolver primero en tu consultorio?',
    ]) expect(mentionsCommercialTerms(t, PROJECT), t).toBe(false);
  });

  it('el prompt lo prohíbe aunque esté documentado', () => {
    expect(buildPrimerContactoCoachPrompt(PROJECT)).toContain('"mensaje_alternativo" nunca incluye cifras, rangos ni condiciones comerciales, aunque estén documentados');
  });
});
