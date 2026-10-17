// ─── Finalización de clases: estado del botón y mensajes (puro) ─────────────
//
// La decisión final la toma SIEMPRE el servidor (complete_lesson vuelve a
// validar el 85 % con los datos de Supabase). Aquí solo se calcula qué ve el
// alumno a partir del porcentaje que devolvió el servidor.

export const REQUIRED_WATCH_PERCENT = 85;
export const LESSON_XP = 25;

// Clases medibles: video de Mux listo con duración conocida (webhook de Mux).
// Los enlaces externos y las clases sin video no se miden.
export const isTrackableLesson = (lesson) => Boolean(
  lesson?.lesson_uuid
  && lesson.video_status === 'ready'
  && lesson.video_provider === 'mux'
  && lesson.mux_playback_id
  && Number(lesson.duration_seconds) > 0,
);

// Devuelve { kind, enabled, label, message, tone } para el botón de la clase.
//   status/source: lo guardado en lesson_progress (completion_source).
//   watchPercent:  porcentaje verificado por el servidor (null = cargando).
export const getCompletionState = ({ available = true, trackable = false, watchPercent = null, status = null, source = null, busy = false }) => {
  const pct = Number.isFinite(watchPercent) ? Math.floor(watchPercent) : null;
  const reached = pct !== null && pct >= REQUIRED_WATCH_PERCENT;

  if (!available) {
    return { kind: 'unavailable', enabled: false, label: 'Marcar como completada', message: null, tone: 'muted' };
  }

  if (status === 'completed') {
    // Clase con video completada antes del control (o autodeclarada): se
    // conserva; verlo al 85 % la deja verificada, sin XP adicionales.
    if (trackable && source !== 'verified_watch') {
      if (reached) {
        return {
          kind: 'can_verify', enabled: !busy, label: 'Verificar visualización', tone: 'action',
          message: 'Ya viste el 85 % de esta clase. Confírmalo para registrar tu visualización como verificada.',
        };
      }
      return {
        kind: 'completed_unverified', enabled: false, label: 'Completada', tone: 'done',
        message: `Completada antes del registro de visualización. Si la vuelves a ver hasta el ${REQUIRED_WATCH_PERCENT} %, quedará verificada${pct !== null ? ` (llevas ${pct} %)` : ''}.`,
      };
    }
    return {
      kind: 'completed', enabled: false, tone: 'done',
      label: trackable ? 'Completada · visualización verificada' : 'Completada',
      message: null,
    };
  }

  if (trackable) {
    if (pct === null) {
      return { kind: 'loading', enabled: false, label: 'Marcar como completada', message: 'Cargando tu progreso…', tone: 'muted' };
    }
    if (!reached) {
      return {
        kind: 'locked', enabled: false, label: `Disponible al ver el ${REQUIRED_WATCH_PERCENT} %`, tone: 'muted',
        message: `Has visto el ${pct} %. Ve al menos el ${REQUIRED_WATCH_PERCENT} % del video para completar la clase.`,
      };
    }
    return {
      kind: 'ready', enabled: !busy, label: `Marcar como completada (+${LESSON_XP} XP)`, tone: 'action',
      message: `¡Ya viste el ${REQUIRED_WATCH_PERCENT} %! Puedes completar la clase.`,
    };
  }

  // Sin video medible (sin video o enlace externo): autodeclarada, como siempre.
  return { kind: 'ready', enabled: !busy, label: `Marcar como completada (+${LESSON_XP} XP)`, message: null, tone: 'action' };
};

// Mensaje tras llamar a complete_lesson. { ok, text } para mostrar al alumno.
export const describeCompletionResult = (result) => {
  if (!result) return { ok: false, text: 'No pudimos completar la clase. Inténtalo de nuevo.' };
  switch (result.outcome) {
    case 'completed':
      return { ok: true, text: result.xp_awarded ? `¡Clase completada! +${LESSON_XP} XP` : '¡Clase completada!' };
    case 'upgraded':
      return { ok: true, text: 'Visualización verificada. Esta clase ya contaba como completada.' };
    case 'already_completed':
      return { ok: true, text: 'Esta clase ya estaba completada.' };
    case 'not_enough_watch':
      return {
        ok: false,
        text: `Aún no has visto el ${REQUIRED_WATCH_PERCENT} % de la clase${Number.isFinite(Number(result.watched_percent)) ? ` (llevas ${Math.floor(Number(result.watched_percent))} %)` : ''}.`,
      };
    default:
      return { ok: false, text: 'No pudimos completar la clase. Inténtalo de nuevo.' };
  }
};
