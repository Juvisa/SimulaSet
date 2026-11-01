// Urgencia del prospecto (Primer contacto, opción A del 01/11/2026): solo
// cuenta lo que el prospecto expresa, con su frase literal; puede subir, bajar
// o mantenerse; las negaciones y lo dicho bajo presión no suman.
import { describe, expect, it } from 'vitest';
import {
  URGENCY_POSTURES, URGENCY_SIGNALS, applyUrgencyEvents, createUrgencyState, deniesUrgency, literalPosition,
  rebuildUrgency, sanitizeUrgencyEvents, urgencyValue, verifyUrgencyEvents,
} from './prospectUrgency';

const verify = (events, message, index = 1, extra = {}) => verifyUrgencyEvents(events, { message, index, ...extra });
const ev = (senal, postura, cita) => ({ senal, postura, cita });

describe('pesos y posturas', () => {
  it('pesos 15/20/25/25/15 (suman 100) y matiza = 0,5', () => {
    expect(URGENCY_SIGNALS).toEqual({ reconoce_problema: 15, consecuencias: 20, costo_de_no_actuar: 25, prioridad_temporal: 25, motivacion: 15 });
    expect(Object.values(URGENCY_SIGNALS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(URGENCY_POSTURES).toEqual({ afirma: 1, matiza: 0.5, niega: 0 });
  });

  it('el valor es la suma de las posturas vigentes', () => {
    expect(urgencyValue({})).toBe(0);
    expect(urgencyValue({ reconoce_problema: { postura: 'afirma' }, prioridad_temporal: { postura: 'matiza' } })).toBe(28);
    expect(urgencyValue(Object.fromEntries(Object.keys(URGENCY_SIGNALS).map((s) => [s, { postura: 'afirma' }])))).toBe(100);
  });

  it('el estado inicial es 0 y sin historial (puede quedarse bajo toda la sesión)', () => {
    expect(createUrgencyState()).toEqual({ eventos: [], vigente: {}, valor: 0, maximo: 0 });
    expect(rebuildUrgency([])).toEqual(createUrgencyState());
  });
});

describe('cita literal', () => {
  const msg = 'Uf, me urge. Esta semana tengo que resolverlo, ya no doy más con los referidos.';

  it('frases cortas valen si están en el mensaje («me urge», «esta semana», «ya no»)', () => {
    for (const q of ['me urge', 'Esta semana', 'ya no', 'ME URGE.']) expect(literalPosition(q, msg)).toBeGreaterThanOrEqual(0);
  });

  it('ignora mayúsculas, tildes y puntuación', () => {
    expect(literalPosition('mas rapido', 'Necesito ir más rápido.')).toBeGreaterThanOrEqual(0);
  });

  it('no acepta trozos de palabra ni frases que no están', () => {
    expect(literalPosition('urge', 'Me urgencia')).toBe(-1);
    expect(literalPosition('me urge muchísimo', msg)).toBe(-1);
    expect(literalPosition('', msg)).toBe(-1);
  });

  it('una frase del alumno (o inventada) se descarta', () => {
    const { accepted, rejected } = verify([ev('prioridad_temporal', 'afirma', '¿lo resolvemos este mes?')], 'Sí, puede ser.');
    expect(accepted).toEqual([]);
    expect(rejected[0].motivo).toBe('no_esta_en_el_mensaje');
  });
});

describe('negaciones', () => {
  it('detecta negaciones y esperas explícitas', () => {
    for (const t of ['No es urgente', 'no me urge', 'no tengo apuro', 'Puedo esperar', 'más adelante lo veo', 'no es para ya', 'ya no me preocupa', 'no es mi prioridad', 'después lo veo', 'tampoco es para tanto']) {
      expect(deniesUrgency(t)).toBe(true);
    }
  });

  it('«no puedo esperar» y «no sé si puedo esperar» son urgencia, no negación', () => {
    expect(deniesUrgency('no puedo esperar más')).toBe(false);
    expect(deniesUrgency('no sé si puedo esperar')).toBe(false);
    expect(deniesUrgency('no creo que pueda esperar')).toBe(false);
  });

  it('una negación marcada como «afirma» no suma: pasa a «niega»', () => {
    const { accepted } = verify([ev('prioridad_temporal', 'afirma', 'no me urge')], 'La verdad no me urge.');
    expect(accepted[0]).toMatchObject({ postura: 'niega', ajuste: 'afirma→niega:negacion' });
  });

  it('una cita corta no esconde la negación que la antecede («no es urgente» citado como «es urgente»)', () => {
    const { accepted } = verify([ev('prioridad_temporal', 'afirma', 'es urgente')], 'Mira, no es urgente.');
    expect(accepted[0].postura).toBe('niega');
  });

  it('negación con algo de urgencia en la misma frase queda en «matiza»', () => {
    const { accepted } = verify([ev('consecuencias', 'afirma', 'no es urgente pero me preocupa')], 'No es urgente pero me preocupa.');
    expect(accepted[0]).toMatchObject({ postura: 'matiza', ajuste: 'afirma→matiza:negacion' });
  });

  it('«niega» se respeta tal cual', () => {
    const { accepted } = verify([ev('prioridad_temporal', 'niega', 'puedo esperar')], 'Puedo esperar unos meses.');
    expect(accepted[0]).toMatchObject({ postura: 'niega' });
    expect(accepted[0].ajuste).toBeUndefined();
  });

  it('una afirmación genuina se acepta sin ajuste', () => {
    const { accepted } = verify([ev('costo_de_no_actuar', 'afirma', 'cada mes que pasa pierdo pacientes')], 'Cada mes que pasa pierdo pacientes.', 3);
    expect(accepted).toEqual([{ senal: 'costo_de_no_actuar', postura: 'afirma', cita: 'cada mes que pasa pierdo pacientes', mensaje: 3, posicion: 0, origen: 'turno' }]);
  });
});

describe('presión del setter', () => {
  it('lo que el prospecto dice justo después de una afirmación no documentada no suma', () => {
    const { accepted, rejected } = verify([ev('prioridad_temporal', 'afirma', 'quiero entrar ya')], 'Ok, quiero entrar ya.', 3, { afterPressure: true });
    expect(accepted).toEqual([]);
    expect(rejected[0].motivo).toBe('tras_afirmacion_no_documentada');
  });

  it('pero una negación tras la presión sí se registra (puede bajar, nunca subir)', () => {
    const { accepted } = verify([ev('prioridad_temporal', 'niega', 'no tengo apuro')], 'No tengo apuro.', 3, { afterPressure: true });
    expect(accepted[0].postura).toBe('niega');
  });
});

describe('historial y postura vigente', () => {
  const at = (mensaje, senal, postura, cita, posicion = 0) => ({ senal, postura, cita, mensaje, posicion, origen: 'turno' });

  it('sube, baja y se mantiene; el máximo se conserva aparte', () => {
    let s = createUrgencyState();
    s = applyUrgencyEvents(s, [at(1, 'reconoce_problema', 'afirma', 'me cuesta conseguir pacientes')]);
    expect(s).toMatchObject({ valor: 15, maximo: 15 });
    s = applyUrgencyEvents(s, [at(3, 'prioridad_temporal', 'afirma', 'esta semana')]);
    expect(s).toMatchObject({ valor: 40, maximo: 40 });
    s = applyUrgencyEvents(s, [at(5, 'prioridad_temporal', 'niega', 'puedo esperar')]);
    expect(s).toMatchObject({ valor: 15, maximo: 40 });
    s = applyUrgencyEvents(s, []);
    expect(s).toMatchObject({ valor: 15, maximo: 40 });
    expect(s.eventos).toHaveLength(3);
    expect(s.vigente.prioridad_temporal).toEqual({ postura: 'niega', cita: 'puedo esperar', mensaje: 5 });
  });

  it('contradicción entre mensajes: gana el más reciente aunque llegue antes', () => {
    const s = applyUrgencyEvents(createUrgencyState(), [
      at(5, 'prioridad_temporal', 'afirma', 'ya mismo'),
      at(3, 'prioridad_temporal', 'niega', 'más adelante'),
    ]);
    expect(s.vigente.prioridad_temporal.postura).toBe('afirma');
    expect(s.valor).toBe(25);
  });

  it('contradicción dentro de un mismo mensaje: gana la frase posterior', () => {
    const msg = 'Me urge resolverlo, aunque bueno, puedo esperar a enero.';
    const { accepted } = verify([ev('prioridad_temporal', 'niega', 'puedo esperar a enero'), ev('prioridad_temporal', 'afirma', 'me urge')], msg, 1);
    const s = rebuildUrgency(accepted);
    expect(s.vigente.prioridad_temporal.postura).toBe('niega');
    expect(s).toMatchObject({ valor: 0, maximo: 25 });
  });

  it('una relativización ambigua sin señal identificable no cambia nada', () => {
    // La IA no la incluye (instrucción del prompt) y el código no aplica nada genérico.
    const before = applyUrgencyEvents(createUrgencyState(), [at(1, 'costo_de_no_actuar', 'afirma', 'pierdo dinero')]);
    const after = applyUrgencyEvents(before, sanitizeUrgencyEvents([{ senal: 'general', postura: 'niega', cita: 'bueno, tampoco es para tanto' }]));
    expect(after).toEqual(before);
  });

  it('la relativización solo afecta a la señal que nombra', () => {
    const s = applyUrgencyEvents(createUrgencyState(), [
      at(1, 'costo_de_no_actuar', 'afirma', 'pierdo dinero'),
      at(1, 'prioridad_temporal', 'afirma', 'este mes', 10),
      at(3, 'prioridad_temporal', 'matiza', 'quizás el otro mes'),
    ]);
    expect(s.vigente.costo_de_no_actuar.postura).toBe('afirma');
    expect(s.valor).toBe(25 + 13);
  });

  it('el mismo evento repetido (turno y cierre) no se cuenta dos veces', () => {
    const e = at(3, 'motivacion', 'afirma', 'quiero crecer');
    const s = applyUrgencyEvents(applyUrgencyEvents(createUrgencyState(), [e]), [{ ...e, cita: 'Quiero crecer', origen: 'cierre' }]);
    expect(s.eventos).toHaveLength(1);
    expect(s.valor).toBe(15);
  });
});

describe('lo que devuelve la IA', () => {
  it('solo señales, posturas y frases válidas; como máximo 10', () => {
    const raw = [
      { senal: 'motivacion', postura: 'afirma', cita: ' quiero crecer ' },
      { senal: 'fomo', postura: 'afirma', cita: 'x' },
      { senal: 'motivacion', postura: 'muy alta', cita: 'x' },
      { senal: 'motivacion', postura: 'afirma', cita: '' },
      null, 'texto',
      ...Array.from({ length: 12 }, () => ({ senal: 'consecuencias', postura: 'matiza', cita: 'algo', mensaje: 2 })),
    ];
    const out = sanitizeUrgencyEvents(raw);
    expect(out).toHaveLength(10);
    expect(out[0]).toEqual({ senal: 'motivacion', postura: 'afirma', cita: 'quiero crecer', mensaje: undefined });
    expect(out[1].mensaje).toBe(2);
    expect(sanitizeUrgencyEvents(undefined)).toEqual([]);
  });
});
