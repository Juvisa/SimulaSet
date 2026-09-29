import { describe, it, expect } from 'vitest';
import {
  PRACTICE_LEVELS,
  PRACTICE_MINIMUM_SIMULATIONS,
  countValidSimulations,
  getPracticeLevel,
  getPracticeMinimumStatus,
  getPracticeProgress,
  getPracticeSummary,
  isValidSimulation,
} from './practiceLevel';

describe('getPracticeLevel — fronteras', () => {
  it.each([
    [0, 'En inicio'],
    [4, 'En inicio'],
    [5, 'En práctica'],
    [9, 'En práctica'],
    [10, 'Entrenado'],
    [19, 'Entrenado'],
    [20, 'Avanzado'],
    [39, 'Avanzado'],
    [40, 'Intensivo'],
    [69, 'Intensivo'],
    [70, 'Dominio de práctica'],
    [100, 'Dominio de práctica'],
  ])('%i simulaciones válidas → %s', (count, expected) => {
    expect(getPracticeLevel(count).name).toBe(expected);
  });

  it('entradas inválidas o negativas caen a En inicio', () => {
    expect(getPracticeLevel(undefined).name).toBe('En inicio');
    expect(getPracticeLevel(null).name).toBe('En inicio');
    expect(getPracticeLevel(-3).name).toBe('En inicio');
    expect(getPracticeLevel(Number.NaN).name).toBe('En inicio');
  });

  it('los niveles tienen los iconos acordados', () => {
    expect(PRACTICE_LEVELS.map(l => `${l.icon} ${l.name}`)).toEqual([
      '🌱 En inicio',
      '🔄 En práctica',
      '⚡ Entrenado',
      '🔥 Avanzado',
      '💎 Intensivo',
      '🏆 Dominio de práctica',
    ]);
  });
});

describe('getPracticeMinimumStatus', () => {
  it('el mínimo es 20 simulaciones válidas', () => {
    expect(PRACTICE_MINIMUM_SIMULATIONS).toBe(20);
  });

  it('19 → En entrenamiento', () => {
    const status = getPracticeMinimumStatus(19);
    expect(status.met).toBe(false);
    expect(status.label).toBe('En entrenamiento');
    expect(status.remaining).toBe(1);
  });

  it('20 → ✓ Mínimo de práctica cumplido', () => {
    const status = getPracticeMinimumStatus(20);
    expect(status.met).toBe(true);
    expect(status.label).toBe('✓ Mínimo de práctica cumplido');
    expect(status.remaining).toBe(0);
  });

  it('nunca usa etiquetas de elegibilidad o certificación', () => {
    const labels = [0, 19, 20, 100].map(n => getPracticeMinimumStatus(n).label).join(' ');
    expect(labels).not.toMatch(/Listo para proyecto|Elegible|SET Match|Verified|Certificad|Profesional/i);
  });
});

describe('getPracticeSummary — casos reales', () => {
  it.each([
    ['Ronald', 25, 80, 'Avanzado', true],
    ['John', 32, 75, 'Avanzado', true],
    ['alto score, poco volumen', 12, 90, 'Entrenado', false],
    ['mucho volumen, score bajo', 75, 58, 'Dominio de práctica', true],
  ])('%s: %i válidas + SET Score %i → %s', (_, sims, score, levelName, minimumMet) => {
    const summary = getPracticeSummary({ validSimulations: sims, setScore: score });
    expect(summary.practiceLevel.name).toBe(levelName);
    expect(summary.setScore).toBe(score);
    expect(summary.validSimulations).toBe(sims);
    expect(summary.practiceMinimum.met).toBe(minimumMet);
  });

  it('Ronald y John comparten nivel: John tiene más práctica, Ronald mejor SET Score', () => {
    const ronald = getPracticeSummary({ validSimulations: 25, setScore: 80 });
    const john = getPracticeSummary({ validSimulations: 32, setScore: 75 });
    expect(ronald.practiceLevel.id).toBe(john.practiceLevel.id);
    expect(john.validSimulations).toBeGreaterThan(ronald.validSimulations);
    expect(ronald.setScore).toBeGreaterThan(john.setScore);
  });
});

describe('independencia entre nivel de práctica y SET Score', () => {
  it('cambiar solo el SET Score no cambia el nivel de práctica', () => {
    const levels = [0, 25, 58, 80, 90, 100].map(
      setScore => getPracticeSummary({ validSimulations: 25, setScore }).practiceLevel.id,
    );
    expect(new Set(levels).size).toBe(1);
  });

  it('cambiar solo el número de simulaciones no modifica el SET Score', () => {
    const scores = [0, 5, 19, 20, 70, 100].map(
      validSimulations => getPracticeSummary({ validSimulations, setScore: 75 }).setScore,
    );
    expect(scores.every(score => score === 75)).toBe(true);
  });
});

describe('simulación válida (misma población que el SET Score)', () => {
  it('solo cuenta sesiones con al menos un score', () => {
    expect(isValidSimulation({ scores: [7] })).toBe(true);
    expect(isValidSimulation({ scores: [] })).toBe(false);
    expect(isValidSimulation({ scores: null })).toBe(false);
    expect(isValidSimulation({})).toBe(false);
    expect(isValidSimulation(null)).toBe(false);
  });

  it('no depende de final_state', () => {
    expect(isValidSimulation({ scores: [5, 6], final_state: null })).toBe(true);
    expect(isValidSimulation({ scores: [], final_state: 'pidio_llamada' })).toBe(false);
  });

  it('countValidSimulations ignora las filas sin scores', () => {
    const sessions = [{ scores: [8] }, { scores: [] }, { scores: [6, 7] }, { scores: [] }];
    expect(countValidSimulations(sessions)).toBe(2);
    expect(countValidSimulations(null)).toBe(0);
  });
});

describe('getPracticeProgress', () => {
  it('progreso dentro del tramo actual y simulaciones faltantes', () => {
    expect(getPracticeProgress(0)).toMatchObject({ percent: 0, simulationsToGo: 5 });
    expect(getPracticeProgress(30)).toMatchObject({ percent: 50, simulationsToGo: 10 });
    expect(getPracticeProgress(30).next.name).toBe('Intensivo');
  });

  it('nivel máximo sin siguiente nivel', () => {
    expect(getPracticeProgress(70)).toMatchObject({ percent: 100, next: null, simulationsToGo: 0 });
  });
});
