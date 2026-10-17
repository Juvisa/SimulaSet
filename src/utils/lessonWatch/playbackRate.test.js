import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PLAYBACK_RATE, PLAYBACK_RATES, normalizePlaybackRate, readPreferredPlaybackRate, savePreferredPlaybackRate,
} from './playbackRate.js';

const memoryStorage = () => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
};
const brokenStorage = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); } };

describe('velocidades de reproducción', () => {
  it('opciones: 1x, 1.25x, 1.5x, 1.75x y 2x; nunca más de 2x (lo que cuenta el servidor)', () => {
    expect(PLAYBACK_RATES).toEqual([1, 1.25, 1.5, 1.75, 2]);
    expect(Math.max(...PLAYBACK_RATES)).toBe(2);
    expect(DEFAULT_PLAYBACK_RATE).toBe(1);
  });

  it('normaliza: valores fuera de la lista → 1x', () => {
    expect(normalizePlaybackRate('1.5')).toBe(1.5);
    for (const bad of [null, undefined, '', 'abc', 0.5, 3, 16, -1, NaN]) expect(normalizePlaybackRate(bad)).toBe(1);
  });

  it('sin preferencia guardada → 1x', () => {
    expect(readPreferredPlaybackRate(memoryStorage())).toBe(1);
  });

  it('guarda y recuerda la última velocidad elegida', () => {
    const storage = memoryStorage();
    expect(savePreferredPlaybackRate(1.75, storage)).toBe(true);
    expect(readPreferredPlaybackRate(storage)).toBe(1.75);
    expect(savePreferredPlaybackRate(1, storage)).toBe(true);
    expect(readPreferredPlaybackRate(storage)).toBe(1);
  });

  it('no guarda velocidades ajenas al selector (p. ej. 0.5x del menú nativo de iOS)', () => {
    const storage = memoryStorage();
    savePreferredPlaybackRate(1.5, storage);
    expect(savePreferredPlaybackRate(0.5, storage)).toBe(false);
    expect(savePreferredPlaybackRate(4, storage)).toBe(false);
    expect(readPreferredPlaybackRate(storage)).toBe(1.5);
  });

  it('un valor manipulado en el almacenamiento → 1x', () => {
    const storage = memoryStorage();
    storage.setItem('simulaset.academy.playbackRate', '10');
    expect(readPreferredPlaybackRate(storage)).toBe(1);
  });

  it('almacenamiento bloqueado o lleno (modo privado): no rompe y usa 1x', () => {
    expect(readPreferredPlaybackRate(brokenStorage)).toBe(1);
    expect(savePreferredPlaybackRate(1.5, brokenStorage)).toBe(false);
    expect(readPreferredPlaybackRate(undefined)).toBe(1);
  });
});
