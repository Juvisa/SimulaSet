import { useEffect, useRef, useState } from 'react';
import MuxPlayer from '@mux/mux-player-react';
import LessonWatchProgress from './LessonWatchProgress';
import { useLessonWatch } from '../hooks/useLessonWatch';
import { PLAYBACK_RATES, readPreferredPlaybackRate, savePreferredPlaybackRate } from '../utils/lessonWatch/playbackRate';

// Video de Mux de la academia con seguimiento de visualización (segmentos
// únicos vistos, reanudación desde la última posición y barra de progreso).
// Si la clase no es medible o el seguimiento falla, el reproductor funciona
// igual que antes.
// Velocidad: selector nativo de MuxPlayer (1x–2x). La última elegida se
// recuerda en este dispositivo y se aplica al abrir cualquier clase.
// onProgressChange recibe el porcentaje verificado por el servidor para
// habilitar el botón de finalización de la clase (fase 3).
const MuxLessonVideo = ({ lesson, onProgressChange }) => {
  const { trackable, progress, startTime, handlers } = useLessonWatch(lesson);
  const onProgressRef = useRef(onProgressChange);
  useEffect(() => { onProgressRef.current = onProgressChange; }, [onProgressChange]);
  useEffect(() => { if (progress) onProgressRef.current?.(progress); }, [progress]);
  // En estado (no solo en el elemento) para que los re-renders no la devuelvan a 1x.
  const [playbackRate, setPlaybackRate] = useState(readPreferredPlaybackRate);
  const handleRateChange = (e) => {
    const rate = Number(e?.target?.playbackRate);
    if (savePreferredPlaybackRate(rate)) setPlaybackRate(rate);
  };

  return (
    <div className="mt-4">
      <div className="overflow-hidden rounded-xl bg-black">
        {startTime === null ? (
          <div className="aspect-video w-full" style={{ aspectRatio: '16 / 9', width: '100%' }} />
        ) : (
          <MuxPlayer
            playbackId={lesson.mux_playback_id}
            metadataVideoTitle={lesson.title}
            streamType="on-demand"
            autoPlay={false}
            playsInline
            startTime={startTime > 0 ? startTime : undefined}
            playbackRates={PLAYBACK_RATES}
            playbackRate={playbackRate}
            className="aspect-video w-full"
            // El tema de Mux oculta el selector de velocidad cuando el
            // reproductor mide menos de ~600 px (todo celular en vertical);
            // esta variable documentada del tema lo mantiene visible.
            style={{ aspectRatio: '16 / 9', width: '100%', '--playback-rate-menu-button': 'inline-flex' }}
            {...handlers}
            onRateChange={handleRateChange}
          />
        )}
      </div>
      {trackable && <LessonWatchProgress progress={progress} />}
    </div>
  );
};

export default MuxLessonVideo;
