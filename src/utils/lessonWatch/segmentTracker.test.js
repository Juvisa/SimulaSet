import { describe, it, expect } from 'vitest';
import { createSegmentTracker, mergeSegments, totalSeconds } from './segmentTracker.js';

// Reproduce de `from` a `to` (segundos del video) a la velocidad `rate`, con
// eventos timeupdate cada `stepMs` de tiempo real. Devuelve el reloj final.
const play = (tracker, { from, to, rate = 1, stepMs = 250, wall = 0, reportedRate = rate }) => {
  let t = from;
  let w = wall;
  tracker.timeUpdate(t, w, reportedRate);
  while (t < to) {
    w += stepMs;
    t = Math.min(to, t + (stepMs / 1000) * rate);
    tracker.timeUpdate(t, w, reportedRate);
  }
  return w;
};

describe('mergeSegments', () => {
  it('une solapes y tramos contiguos, ordena y descarta inválidos', () => {
    expect(mergeSegments([[10, 20], [0, 5], [5, 8], [15, 30], [40, 40], [50, 45], ['a', 1], null])).toEqual([[0, 8], [10, 30]]);
    expect(totalSeconds([[0, 10], [5, 15]])).toBe(15);
  });
});

describe('createSegmentTracker', () => {
  it('reproducción normal 1x: un solo tramo continuo', () => {
    const tr = createSegmentTracker({ duration: 600 });
    play(tr, { from: 0, to: 60 });
    expect(tr.snapshot()).toEqual([[0, 60]]);
  });

  it('pausa y reanudación: los tramos contiguos se unen', () => {
    const tr = createSegmentTracker({ duration: 600 });
    let w = play(tr, { from: 0, to: 30 });
    tr.pause(30, w);
    w += 60_000; // 1 minuto en pausa: no suma nada
    play(tr, { from: 30, to: 50, wall: w });
    expect(tr.snapshot()).toEqual([[0, 50]]);
  });

  it('salto hacia delante con evento seeking: lo saltado no cuenta', () => {
    const tr = createSegmentTracker({ duration: 600 });
    const w = play(tr, { from: 0, to: 30 });
    tr.seeking();
    play(tr, { from: 300, to: 310, wall: w + 250 });
    expect(tr.snapshot()).toEqual([[0, 30], [300, 310]]);
    expect(totalSeconds(tr.snapshot())).toBe(40);
  });

  it('salto sin evento seeking (avance brusco): tampoco cuenta', () => {
    const tr = createSegmentTracker({ duration: 600 });
    const w = play(tr, { from: 0, to: 20 });
    tr.timeUpdate(500, w + 250, 1);
    play(tr, { from: 500, to: 505, wall: w + 250 });
    expect(totalSeconds(tr.snapshot())).toBe(25);
  });

  it('retroceder y volver a ver: no se cuenta dos veces', () => {
    const tr = createSegmentTracker({ duration: 600 });
    const w = play(tr, { from: 0, to: 60 });
    tr.seeking();
    play(tr, { from: 20, to: 70, wall: w + 250 });
    expect(tr.snapshot()).toEqual([[0, 70]]);
  });

  it('velocidad 2x: cuenta el contenido reproducido', () => {
    const tr = createSegmentTracker({ duration: 600 });
    play(tr, { from: 0, to: 120, rate: 2 });
    expect(tr.snapshot()).toEqual([[0, 120]]);
  });

  it.each([1, 1.25, 1.5, 1.75, 2])('velocidad %sx: cuenta exactamente el contenido reproducido', (rate) => {
    const tr = createSegmentTracker({ duration: 600 });
    play(tr, { from: 0, to: 90, rate });
    expect(tr.snapshot()).toEqual([[0, 90]]);
  });

  it('cambiar de velocidad a mitad de reproducción no corta ni duplica el tramo', () => {
    const tr = createSegmentTracker({ duration: 600 });
    let w = play(tr, { from: 0, to: 30, rate: 1 });
    w = play(tr, { from: 30, to: 60, rate: 1.5, wall: w });
    w = play(tr, { from: 60, to: 100, rate: 2, wall: w });
    play(tr, { from: 100, to: 120, rate: 1.25, wall: w });
    expect(tr.snapshot()).toEqual([[0, 120]]);
  });

  it('repetir a otra velocidad un tramo ya visto no suma dos veces', () => {
    const tr = createSegmentTracker({ duration: 600 });
    const w = play(tr, { from: 0, to: 60, rate: 1 });
    tr.seeking();
    play(tr, { from: 10, to: 50, rate: 2, wall: w + 250 });
    expect(totalSeconds(tr.snapshot())).toBe(60);
  });

  it('avance incoherente con la velocidad informada (p. ej. manipulado) no se acepta como continuo', () => {
    const tr = createSegmentTracker({ duration: 600 });
    play(tr, { from: 0, to: 120, rate: 16, reportedRate: 1 });
    expect(totalSeconds(tr.snapshot())).toBeLessThan(10);
  });

  it('pestaña en segundo plano (eventos cada 1 s): sigue contando', () => {
    const tr = createSegmentTracker({ duration: 600 });
    play(tr, { from: 0, to: 60, stepMs: 1000 });
    expect(tr.snapshot()).toEqual([[0, 60]]);
  });

  it('se recorta a la duración del video', () => {
    const tr = createSegmentTracker({ duration: 100 });
    play(tr, { from: 90, to: 120 });
    expect(tr.snapshot()).toEqual([[90, 100]]);
  });

  it('valores no numéricos se ignoran sin romper', () => {
    const tr = createSegmentTracker({ duration: 100 });
    tr.timeUpdate(NaN, 0);
    tr.timeUpdate(undefined, 0);
    expect(tr.snapshot()).toEqual([]);
  });
});
