// ─── Visualización de clases: rastreador de segmentos (puro, sin I/O) ───────
//
// Convierte los eventos del reproductor en tramos [inicio, fin] (segundos del
// video) REALMENTE reproducidos. Un tramo se extiende solo si el avance del
// video es coherente con el tiempo real transcurrido (× velocidad + margen);
// cualquier salto (seek, avance brusco, retroceso) cierra el tramo y empieza
// otro, así que adelantar no suma. Repetir un tramo tampoco suma dos veces:
// los tramos se unen. El servidor (record_lesson_watch) vuelve a validar todo
// y además limita el avance a 2x del tiempo real.

// Une tramos que se solapan o se tocan. Devuelve una lista nueva y ordenada.
export const mergeSegments = (segments) => {
  const sorted = segments
    .filter(s => Array.isArray(s) && Number.isFinite(s[0]) && Number.isFinite(s[1]) && s[1] > s[0])
    .map(([a, b]) => [a, b])
    .sort((x, y) => x[0] - y[0]);
  const out = [];
  sorted.forEach(([a, b]) => {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  });
  return out;
};

export const totalSeconds = (segments) => mergeSegments(segments).reduce((sum, [a, b]) => sum + (b - a), 0);

// toleranceSec cubre la cadencia de timeupdate (~4 Hz, menos en pestañas en
// segundo plano) y pequeñas variaciones del reloj.
export const createSegmentTracker = ({ duration, toleranceSec = 1 } = {}) => {
  let closed = [];
  let current = null;
  let lastTime = null;
  let lastWall = null;
  let version = 0;

  const clip = (t) => Math.max(0, Number.isFinite(duration) && duration > 0 ? Math.min(t, duration) : t);

  const closeCurrent = () => {
    if (current && current[1] > current[0]) {
      closed = mergeSegments([...closed, current]);
      version += 1;
    }
    current = null;
  };

  const reset = () => {
    closeCurrent();
    lastTime = null;
    lastWall = null;
  };

  const timeUpdate = (time, wallMs, rate = 1) => {
    if (!Number.isFinite(time) || !Number.isFinite(wallMs)) return;
    const t = clip(time);
    if (lastTime === null) {
      current = [t, t];
    } else {
      const delta = t - lastTime;
      const wallDelta = Math.max(0, (wallMs - lastWall) / 1000);
      const maxDelta = wallDelta * Math.max(Number(rate) || 1, 1) + toleranceSec;
      if (current && delta > 0 && delta <= maxDelta) {
        current[1] = t;
        version += 1;
      } else if (delta !== 0) {
        // Salto o retroceso: lo intermedio no se vio.
        closeCurrent();
        current = [t, t];
      }
    }
    lastTime = t;
    lastWall = wallMs;
  };

  return {
    timeUpdate,
    // Antes de saltar: el tramo en curso termina donde estaba.
    seeking: () => reset(),
    // Pausa/fin: registra la posición final y cierra el tramo.
    pause: (time, wallMs) => { timeUpdate(time, wallMs); reset(); },
    ended: (time, wallMs) => { timeUpdate(time, wallMs); reset(); },
    // Tramos vistos en esta sesión (cerrados + el actual), unidos.
    snapshot: () => mergeSegments(current ? [...closed, current] : closed),
    position: () => (lastTime === null ? null : lastTime),
    version: () => version,
  };
};
