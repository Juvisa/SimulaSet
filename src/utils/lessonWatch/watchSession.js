// ─── Visualización de clases: sesión de envío (pura; reloj y red inyectados) ─
//
// Decide CUÁNDO enviar los tramos al servidor (record_lesson_watch):
//   - cada `intervalMs` mientras se reproduce, solo si hay tramos nuevos;
//   - al pausar, al terminar, al ocultar/cerrar la pestaña y al reconectar;
//   - nunca dos envíos a la vez desde la misma pestaña, y nunca con menos de
//     `minGapMs` entre envíos (el servidor ignora < 3 s);
//   - si un envío falla, los tramos se conservan y se reintenta con espera
//     creciente (los tramos son idempotentes: reenviarlos no duplica nada);
//   - errores permanentes (clase sin seguimiento, sin permiso) detienen la
//     sesión en silencio: el video sigue funcionando igual.
// Envía los tramos de TODA la sesión (unidos); como mucho los `maxSegments`
// más recientes, que es el límite del servidor.

import { createSegmentTracker } from './segmentTracker.js';

const PERMANENT_ERROR_CODES = new Set(['22023', 'P0002', '42501', '42883', 'PGRST202']);

export const createWatchSession = ({
  lessonId,
  duration,
  transport,
  now = () => Date.now(),
  intervalMs = 15_000,
  minGapMs = 5_000,
  // El servidor ignora envíos con < 3 s entre sí: ni siquiera un envío
  // forzado (pausa/fin) se hace antes; queda pendiente para el siguiente tick.
  hardMinGapMs = 3_500,
  maxBackoffMs = 60_000,
  maxSegments = 60,
  onProgress = () => {},
}) => {
  const tracker = createSegmentTracker({ duration });
  let playing = false;
  let position = 0;
  let inFlight = false;
  let disabled = false;
  let lastSentKey = '';
  let lastSentAt = -Infinity;
  let nextAllowedAt = -Infinity;
  let failures = 0;
  let requests = 0;

  const payload = () => {
    const segments = tracker.snapshot().slice(-maxSegments).map(([a, b]) => [Math.round(a * 100) / 100, Math.round(b * 100) / 100]);
    return { lessonId, segments, position: Math.max(0, Math.floor(position)) };
  };
  const keyOf = (p) => JSON.stringify([p.segments, p.position]);

  const flush = async ({ force = false } = {}) => {
    if (disabled || inFlight) return { sent: false, reason: disabled ? 'disabled' : 'in_flight' };
    const t = now();
    const p = payload();
    const key = keyOf(p);
    if (key === lastSentKey) return { sent: false, reason: 'nothing_new' };
    if (p.segments.length === 0 && p.position === 0) return { sent: false, reason: 'empty' };
    if (t < nextAllowedAt) return { sent: false, reason: 'backoff' };
    if (t - lastSentAt < (force ? hardMinGapMs : minGapMs)) return { sent: false, reason: 'too_soon' };

    inFlight = true;
    lastSentAt = t;
    requests += 1;
    try {
      const result = await transport.record(p);
      if (result?.error) throw result.error;
      lastSentKey = key;
      failures = 0;
      nextAllowedAt = -Infinity;
      if (result?.data) onProgress(result.data);
      return { sent: true };
    } catch (error) {
      if (PERMANENT_ERROR_CODES.has(error?.code)) {
        disabled = true;
        return { sent: false, reason: 'disabled' };
      }
      failures += 1;
      nextAllowedAt = now() + Math.min(maxBackoffMs, minGapMs * 2 ** failures);
      return { sent: false, reason: 'failed' };
    } finally {
      inFlight = false;
    }
  };

  // Último envío cuando la pestaña se oculta o se cierra: fetch con keepalive,
  // sin esperar respuesta. No marca como enviado (si la pestaña sigue viva,
  // el siguiente envío normal confirmará los mismos tramos sin duplicarlos).
  const flushOnExit = () => {
    if (disabled) return false;
    const p = payload();
    if (keyOf(p) === lastSentKey || (p.segments.length === 0 && p.position === 0)) return false;
    requests += 1;
    transport.recordKeepalive?.(p);
    return true;
  };

  return {
    // Eventos del reproductor (time = currentTime en segundos).
    play: (time) => { playing = true; position = time; },
    timeUpdate: (time, rate) => { tracker.timeUpdate(time, now(), rate); position = time; },
    seeking: (time) => { tracker.seeking(); if (Number.isFinite(time)) position = time; },
    pause: (time) => { tracker.pause(time, now()); position = time; playing = false; return flush({ force: true }); },
    ended: (time) => { tracker.ended(time, now()); position = time; playing = false; return flush({ force: true }); },
    // Llamar periódicamente (p. ej. cada 5 s): envía si toca. Reproduciendo,
    // cada intervalMs; en pausa, lo que quedó pendiente en cuanto se pueda.
    tick: () => {
      const elapsed = now() - lastSentAt;
      const dirty = keyOf(payload()) !== lastSentKey;
      const due = dirty && (playing ? elapsed >= intervalMs : elapsed >= minGapMs);
      return due ? flush() : Promise.resolve({ sent: false, reason: 'not_due' });
    },
    flush,
    flushOnExit,
    stats: () => ({ requests, failures, disabled, playing, segments: tracker.snapshot(), position }),
  };
};
