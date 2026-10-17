import { describe, it, expect } from 'vitest';
import { REQUIRED_WATCH_PERCENT, describeCompletionResult, getCompletionState, isTrackableLesson } from './lessonCompletion.js';

const muxLesson = { lesson_uuid: 'u1', video_status: 'ready', video_provider: 'mux', mux_playback_id: 'p1', duration_seconds: 1593 };

describe('isTrackableLesson', () => {
  it('solo video de Mux listo con duración y uuid', () => {
    expect(isTrackableLesson(muxLesson)).toBe(true);
    expect(isTrackableLesson({ ...muxLesson, duration_seconds: null })).toBe(false);
    expect(isTrackableLesson({ ...muxLesson, video_status: 'processing' })).toBe(false);
    expect(isTrackableLesson({ ...muxLesson, lesson_uuid: undefined })).toBe(false);
    expect(isTrackableLesson({ video_url: 'https://youtu.be/x' })).toBe(false);
    expect(isTrackableLesson(null)).toBe(false);
  });
});

describe('getCompletionState — clases con video de Mux', () => {
  const s = (patch) => getCompletionState({ trackable: true, ...patch });

  it('cargando el progreso: deshabilitado', () => {
    expect(s({ watchPercent: null })).toMatchObject({ kind: 'loading', enabled: false });
  });

  it('< 85 %: deshabilitado con el porcentaje y el requisito', () => {
    for (const pct of [0, 40, 84, 84.99]) {
      const st = s({ watchPercent: pct });
      expect(st).toMatchObject({ kind: 'locked', enabled: false });
      expect(st.label).toMatch(/85 %/);
      expect(st.message).toMatch(new RegExp(`${Math.floor(pct)} %`));
    }
  });

  it('≥ 85 %: habilitado (+25 XP)', () => {
    for (const pct of [85, 90, 100]) {
      expect(s({ watchPercent: pct })).toMatchObject({ kind: 'ready', enabled: true, label: 'Marcar como completada (+25 XP)' });
    }
    expect(REQUIRED_WATCH_PERCENT).toBe(85);
  });

  it('mientras se guarda, el botón no se puede pulsar dos veces', () => {
    expect(s({ watchPercent: 90, busy: true }).enabled).toBe(false);
  });

  it('completada y verificada: sin acción (no se puede desmarcar)', () => {
    expect(s({ status: 'completed', source: 'verified_watch', watchPercent: 90 })).toMatchObject({ kind: 'completed', enabled: false, label: 'Completada · visualización verificada' });
  });

  it('legacy sin el 85 %: completada sin verificar, con invitación a volver a verla', () => {
    const st = s({ status: 'completed', source: 'legacy_self_reported', watchPercent: 30 });
    expect(st).toMatchObject({ kind: 'completed_unverified', enabled: false });
    expect(st.message).toMatch(/llevas 30 %/);
  });

  it('legacy con el 85 %: puede verificarse (sin anunciar XP)', () => {
    const st = s({ status: 'completed', source: 'legacy_self_reported', watchPercent: 88 });
    expect(st).toMatchObject({ kind: 'can_verify', enabled: true, label: 'Verificar visualización' });
    expect(st.label).not.toMatch(/XP/);
  });

  it('autodeclarada antigua en clase con video: mismo trato que legacy', () => {
    expect(s({ status: 'completed', source: 'self_reported', watchPercent: 10 }).kind).toBe('completed_unverified');
  });
});

describe('getCompletionState — clases sin video medible', () => {
  it('sin video / enlace externo: autodeclarada como siempre', () => {
    expect(getCompletionState({ trackable: false })).toMatchObject({ kind: 'ready', enabled: true });
    expect(getCompletionState({ trackable: false, status: 'completed', source: 'self_reported' })).toMatchObject({ kind: 'completed', enabled: false, label: 'Completada' });
    expect(getCompletionState({ trackable: false, status: 'completed', source: 'legacy_self_reported' })).toMatchObject({ kind: 'completed', enabled: false });
  });

  it('clase aún no disponible (sesión en vivo pendiente)', () => {
    expect(getCompletionState({ available: false, trackable: false })).toMatchObject({ kind: 'unavailable', enabled: false });
  });
});

describe('describeCompletionResult', () => {
  it('mensajes por resultado del servidor', () => {
    expect(describeCompletionResult({ outcome: 'completed', xp_awarded: true })).toEqual({ ok: true, text: '¡Clase completada! +25 XP' });
    expect(describeCompletionResult({ outcome: 'completed', xp_awarded: false })).toEqual({ ok: true, text: '¡Clase completada!' });
    expect(describeCompletionResult({ outcome: 'upgraded', xp_awarded: false }).text).toMatch(/verificada/);
    expect(describeCompletionResult({ outcome: 'already_completed' }).ok).toBe(true);
    const ne = describeCompletionResult({ outcome: 'not_enough_watch', watched_percent: '62.40' });
    expect(ne).toEqual({ ok: false, text: 'Aún no has visto el 85 % de la clase (llevas 62 %).' });
    expect(describeCompletionResult(null).ok).toBe(false);
    expect(describeCompletionResult({ outcome: 'otro' }).ok).toBe(false);
  });
});
