import { Eye } from 'lucide-react';

// Barra de visualización de una clase (dato del servidor: segmentos únicos
// vistos / duración). Fase 2: solo informa; no condiciona el botón ni
// anuncia ningún requisito.
const LessonWatchProgress = ({ progress }) => {
  if (!progress) return null;
  const { percent } = progress;
  return (
    <div className="mt-3" aria-label={`Has visto el ${percent} % de esta clase`}>
      <div className="flex items-center gap-1.5 text-xs text-text-secondary">
        <Eye size={13} className="shrink-0" />
        <span>Has visto el <b className="text-text-primary">{percent} %</b> de esta clase</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-input" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className="h-full rounded-full bg-accent-coral transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-text-secondary/80">
        Tu progreso se guarda automáticamente: puedes pausar y continuar donde lo dejaste, también desde otro dispositivo.
      </p>
    </div>
  );
};

export default LessonWatchProgress;
