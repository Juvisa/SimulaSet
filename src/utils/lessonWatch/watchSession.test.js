import { describe, it, expect } from 'vitest';
import { createWatchSession } from './watchSession.js';

// Reloj y red simulados: permiten reproducir horas de video en milisegundos.
const setup = (overrides = {}) => {
  const duration = overrides.duration ?? 600;
  const clock = { t: 0 };
  const calls = [];
  const keepalive = [];
  let respond = () => ({ data: { watched_seconds: 0, duration_seconds: 600 } });
  const transport = {
    record: async (p) => { calls.push(structuredClone(p)); return respond(p); },
    recordKeepalive: (p) => keepalive.push(structuredClone(p)),
  };
  const progress = [];
  const session = createWatchSession({
    lessonId: 'L1', duration, transport, now: () => clock.t, onProgress: (d) => progress.push(d), ...overrides,
  });
  // Avanza el video `seconds` a `rate`, con timeupdate cada 250 ms y tick cada 5 s.
  const playFor = async (seconds, { rate = 1, from } = {}) => {
    let pos = from ?? session.stats().position ?? 0;
    const end = Math.min(duration, pos + seconds);
    session.play(pos);
    session.timeUpdate(pos, rate);
    let sinceTick = 0;
    while (pos < end) {
      clock.t += 250;
      sinceTick += 250;
      pos = Math.min(end, pos + 0.25 * rate);
      session.timeUpdate(pos, rate);
      if (sinceTick >= 5000) { sinceTick = 0; await session.tick(); }
    }
    return pos;
  };
  return { clock, calls, keepalive, session, playFor, progress, setRespond: (fn) => { respond = fn; } };
};

describe('envíos periódicos', () => {
  it('reproducción normal: un envío cada ~15 s con los tramos de toda la sesión', async () => {
    const { calls, playFor } = setup();
    await playFor(60);
    // Primer envío en el primer tick (5 s, aprovecha el crédito inicial) y luego cada 15 s: 5, 20, 35, 50.
    expect(calls.map(c => c.segments.at(-1)[1])).toEqual([5, 20, 35, 50]);
    expect(Object.keys(calls[0]).sort()).toEqual(['lessonId', 'position', 'segments']);
  });

  it('volumen: 1 hora de reproducción → como mucho ~4 solicitudes por minuto', async () => {
    const { calls, playFor } = setup({ duration: 7200 });
    await playFor(3600);
    expect(calls.length).toBeLessThanOrEqual(241);
    expect(calls.length).toBeGreaterThanOrEqual(230);
  });

  it('en pausa sin nada nuevo no hay solicitudes', async () => {
    const { calls, clock, session, playFor } = setup();
    const pos = await playFor(20);
    await session.pause(pos);
    const after = calls.length;
    for (let i = 0; i < 60; i += 1) { clock.t += 5000; await session.tick(); }
    expect(calls.length).toBe(after);
  });

  it('pausa: envía lo visto (o en el siguiente tick si el último envío fue hace < 3,5 s)', async () => {
    const { calls, clock, session, playFor } = setup();
    let pos = await playFor(21); // envíos a los 5 y 20 s
    expect(calls.at(-1).segments).toEqual([[0, 20]]);
    const n = calls.length;
    await session.pause(pos); // 1 s después del último envío (< 3,5 s) → queda pendiente
    expect(calls.length).toBe(n);
    clock.t += 5000;
    await session.tick(); // en pausa, lo pendiente se envía en cuanto se puede
    expect(calls.length).toBe(n + 1);
    expect(calls.at(-1).segments).toEqual([[0, 21]]);
    pos = await playFor(10, { from: pos });
    clock.t += 4000;
    await session.pause(pos);
    expect(calls.at(-1).segments).toEqual([[0, 31]]);
  });

  it('al terminar el video se envía el final', async () => {
    const { calls, clock, session, playFor } = setup();
    const pos = await playFor(600);
    clock.t += 4000;
    await session.ended(pos);
    expect(calls.at(-1).segments).toEqual([[0, 600]]);
    expect(calls.at(-1).position).toBe(600);
  });

  it('saltos no cuentan; reanudación usa la posición', async () => {
    const { calls, clock, session, playFor } = setup();
    await playFor(30);
    session.seeking(400);
    await playFor(20, { from: 400 });
    clock.t += 4000;
    await session.pause(420);
    expect(calls.at(-1).segments).toEqual([[0, 30], [400, 420]]);
    expect(calls.at(-1).position).toBe(420);
  });

  it('velocidad 2x: envía el contenido visto (el servidor aplica su límite)', async () => {
    const { calls, clock, session, playFor } = setup();
    const pos = await playFor(120, { rate: 2 });
    clock.t += 4000;
    await session.pause(pos);
    expect(calls.at(-1).segments).toEqual([[0, 120]]);
  });

  it('como mucho 60 tramos por envío (los más recientes)', async () => {
    const { calls, clock, session } = setup();
    for (let i = 0; i < 80; i += 1) {
      session.seeking(i * 7);
      session.play(i * 7);
      session.timeUpdate(i * 7, 1);
      clock.t += 250;
      session.timeUpdate(i * 7 + 0.25, 1);
    }
    clock.t += 20_000;
    await session.flush({ force: true });
    expect(calls.at(-1).segments).toHaveLength(60);
    expect(calls.at(-1).segments.at(-1)[0]).toBe(79 * 7);
  });
});

describe('red: concurrencia, fallos, reconexión y cierre de pestaña', () => {
  it('nunca dos envíos a la vez desde la misma pestaña', async () => {
    const { calls, clock, session, playFor, setRespond } = setup();
    let release;
    await playFor(10);
    const before = calls.length;
    setRespond(() => new Promise((r) => { release = () => r({ data: {} }); }));
    session.timeUpdate(10.25, 1); // algo nuevo que enviar
    clock.t += 10_000;
    const a = session.flush({ force: true });
    const b = await session.flush({ force: true });
    expect(b).toEqual({ sent: false, reason: 'in_flight' });
    release();
    await a;
    expect(calls.length).toBe(before + 1);
  });

  it('fallo de red: conserva los tramos y reintenta con espera creciente; al reconectar los envía', async () => {
    const { calls, clock, session, playFor, setRespond } = setup();
    setRespond(() => { throw new Error('offline'); });
    const pos = await playFor(60);
    const failedCalls = calls.length;
    expect(failedCalls).toBeGreaterThanOrEqual(1);
    expect(session.stats().failures).toBeGreaterThanOrEqual(1);
    setRespond(() => ({ data: { watched_seconds: 60, duration_seconds: 600 } }));
    clock.t += 61_000; // supera el backoff máximo
    await session.flush({ force: true }); // evento 'online'
    expect(calls.at(-1).segments).toEqual([[0, pos]]);
    expect(session.stats().failures).toBe(0);
  });

  it('error permanente (clase sin seguimiento / sin permiso): se detiene en silencio', async () => {
    const { calls, clock, session, playFor, setRespond } = setup();
    setRespond(() => ({ error: { code: '22023', message: 'no admite seguimiento' } }));
    await playFor(30);
    const n = calls.length;
    expect(session.stats().disabled).toBe(true);
    await playFor(60, { from: 30 });
    clock.t += 30_000;
    await session.flush({ force: true });
    expect(calls.length).toBe(n);
    expect(session.flushOnExit()).toBe(false);
  });

  it('cierre de pestaña: envío keepalive de lo pendiente, sin marcarlo como confirmado', async () => {
    const { calls, keepalive, clock, session, playFor } = setup();
    await playFor(22); // último envío a los 20 s; quedan 2 s pendientes
    expect(session.flushOnExit()).toBe(true);
    expect(keepalive.at(-1).segments).toEqual([[0, 22]]);
    // Si la pestaña sigue viva, el siguiente envío normal confirma lo mismo (idempotente).
    clock.t += 10_000;
    await session.flush({ force: true });
    expect(calls.at(-1).segments).toEqual([[0, 22]]);
    // Sin nada nuevo, ni keepalive ni envío.
    expect(session.flushOnExit()).toBe(false);
  });

  it('progreso del servidor se propaga a la interfaz', async () => {
    const { progress, playFor, setRespond } = setup();
    setRespond(() => ({ data: { watched_seconds: 42, duration_seconds: 600 } }));
    await playFor(20);
    expect(progress.at(-1)).toEqual({ watched_seconds: 42, duration_seconds: 600 });
  });
});
