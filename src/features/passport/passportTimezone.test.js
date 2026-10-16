import { describe, it, expect } from 'vitest';
import { TIMEZONE_OPTIONS, describeTimezone, getIanaOffsetLabel, isListedTimezone } from './passportTimezone';

// Fechas fijas: enero (invierno en el hemisferio norte) y julio (verano).
const JAN = new Date('2026-01-15T12:00:00Z');
const JUL = new Date('2026-07-15T12:00:00Z');

describe('describeTimezone — interpreta sin modificar', () => {
  it('vacío o solo espacios', () => {
    expect(describeTimezone('')).toEqual({ kind: 'empty', display: '' });
    expect(describeTimezone('   ')).toEqual({ kind: 'empty', display: '' });
    expect(describeTimezone(null)).toEqual({ kind: 'empty', display: '' });
  });

  it('zona de la lista: nombre legible + desfase actual', () => {
    expect(describeTimezone('America/Bogota', JAN)).toEqual({ kind: 'known', display: 'Colombia (Bogotá) · UTC−5' });
    expect(describeTimezone('America/Argentina/Buenos_Aires', JAN).display).toBe('Argentina (Buenos Aires) · UTC−3');
  });

  it('respeta el horario de verano', () => {
    expect(describeTimezone('Europe/Madrid', JAN).display).toBe('España (Madrid) · UTC+1');
    expect(describeTimezone('Europe/Madrid', JUL).display).toBe('España (Madrid) · UTC+2');
    expect(describeTimezone('America/New_York', JUL).display).toMatch(/UTC−4$/);
  });

  it('desfases escritos a mano (formato del bloque 1)', () => {
    expect(describeTimezone('GMT-5')).toEqual({ kind: 'offset', display: 'UTC−5' });
    expect(describeTimezone('GMT-5 (Bogotá)')).toEqual({ kind: 'offset', display: 'UTC−5' });
    expect(describeTimezone('utc +01:00').display).toBe('UTC+1');
    expect(describeTimezone('UTC−3').display).toBe('UTC−3');
    expect(describeTimezone('GMT+5:30').display).toBe('UTC+5:30');
    expect(describeTimezone('UTC').display).toBe('UTC');
  });

  it('zona IANA válida fuera de la lista', () => {
    const info = describeTimezone('Asia/Tokyo', JAN);
    expect(info.kind).toBe('iana');
    expect(info.display).toBe('Asia/Tokyo · UTC+9');
  });

  it('valores no reconocibles → unknown (el editor avisa; nunca se reescriben)', () => {
    for (const value of ['hora colombia', 'Bogotá', 'GMT-25', 'America/Ciudad_Inventada', '-5', 'GMT-5:99']) {
      expect(describeTimezone(value).kind).toBe('unknown');
    }
  });

  it('no modifica el valor recibido', () => {
    const value = '  GMT-5  ';
    describeTimezone(value);
    expect(value).toBe('  GMT-5  ');
  });
});

describe('lista de zonas', () => {
  it('todas las zonas de la lista son IANA válidas y caben en el límite de la base (64)', () => {
    for (const { value } of TIMEZONE_OPTIONS) {
      expect(getIanaOffsetLabel(value, JAN)).toMatch(/^UTC/);
      expect(value.length).toBeLessThanOrEqual(64);
    }
    expect(new Set(TIMEZONE_OPTIONS.map(o => o.value)).size).toBe(TIMEZONE_OPTIONS.length);
  });

  it('isListedTimezone', () => {
    expect(isListedTimezone('America/Bogota')).toBe(true);
    expect(isListedTimezone(' America/Bogota ')).toBe(true);
    expect(isListedTimezone('GMT-5')).toBe(false);
    expect(isListedTimezone(undefined)).toBe(false);
  });
});
