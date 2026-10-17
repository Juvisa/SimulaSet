import { useEffect, useMemo, useRef, useState } from 'react';
import { createWatchSession } from '../utils/lessonWatch/watchSession';
import { getLessonWatchProgress, lessonWatchTransport, refreshCachedToken } from '../utils/lessonWatch/lessonWatchApi';
import { isTrackableLesson } from '../utils/lessonWatch/lessonCompletion';

export { isTrackableLesson };

// No se reanuda en los últimos segundos (mejor empezar de nuevo que caer al final).
const RESUME_TAIL_SECONDS = 10;
const LOAD_TIMEOUT_MS = 1_500;
const TICK_MS = 5_000;

const toView = (watched, duration) => (duration > 0
  ? { watched, duration, percent: Math.min(100, Math.floor((100 * watched) / duration)) }
  : null);

// Seguimiento de visualización de una clase. NO cambia nada del flujo de
// "Marcar como completada" (fase 2: solo mide). Si algo falla, el video se
// reproduce igual y la barra simplemente no aparece.
export const useLessonWatch = (lesson) => {
  const trackable = isTrackableLesson(lesson);
  const lessonUuid = lesson?.lesson_uuid;
  const duration = Number(lesson?.duration_seconds) || 0;
  const [progress, setProgress] = useState(null);
  // null mientras se carga la posición guardada (para no arrancar el video
  // en 0 y saltar después). Si tarda, se arranca en 0.
  const [startTime, setStartTime] = useState(trackable ? null : 0);
  const sessionRef = useRef(null);

  useEffect(() => {
    // Sin seguimiento: el estado inicial ya es startTime = 0.
    if (!trackable) return undefined;
    let active = true;
    const settleStart = (value) => setStartTime(current => (current === null ? value : current));
    const fallback = setTimeout(() => active && settleStart(0), LOAD_TIMEOUT_MS);

    refreshCachedToken();
    getLessonWatchProgress(lessonUuid)
      .then(({ progress: saved }) => {
        if (!active) return;
        // Si el video cambió (otra duración), el progreso anterior no aplica.
        if (saved && saved.duration_seconds === duration) {
          setProgress(toView(saved.watched_seconds, duration));
          const pos = saved.last_position_seconds;
          settleStart(pos > 0 && pos < duration - RESUME_TAIL_SECONDS ? pos : 0);
        } else {
          setProgress(toView(0, duration));
          settleStart(0);
        }
      })
      .catch(() => active && settleStart(0));

    const session = createWatchSession({
      lessonId: lessonUuid,
      duration,
      transport: lessonWatchTransport,
      onProgress: (data) => {
        if (active && data) setProgress(toView(data.watched_seconds, data.duration_seconds));
      },
    });
    sessionRef.current = session;

    const timer = setInterval(() => { session.tick(); }, TICK_MS);
    const onVisibility = () => { if (document.visibilityState === 'hidden') session.flushOnExit(); };
    const onPageHide = () => session.flushOnExit();
    const onOnline = () => { session.flush({ force: true }); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('online', onOnline);

    return () => {
      active = false;
      clearTimeout(fallback);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('online', onOnline);
      // Al cerrar la clase (o cambiar de página dentro de la app) se envía lo pendiente.
      session.flush({ force: true });
      sessionRef.current = null;
    };
  }, [trackable, lessonUuid, duration]);

  const handlers = useMemo(() => {
    if (!trackable) return {};
    const time = (e) => e?.target?.currentTime;
    return {
      onPlay: (e) => sessionRef.current?.play(time(e)),
      onTimeUpdate: (e) => sessionRef.current?.timeUpdate(time(e), e?.target?.playbackRate),
      onSeeking: (e) => sessionRef.current?.seeking(time(e)),
      onPause: (e) => { sessionRef.current?.pause(time(e)); },
      onEnded: (e) => { sessionRef.current?.ended(time(e)); },
    };
  }, [trackable]);

  return { trackable, progress, startTime, handlers };
};
