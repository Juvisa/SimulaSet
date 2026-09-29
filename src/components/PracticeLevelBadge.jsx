import { getPracticeLevel } from '../utils/practiceLevel';

// Insignia del NIVEL DE PRÁCTICA (volumen de entrenamiento). Recibe el número
// de simulaciones válidas — nunca el SET Score, que se muestra aparte.
const PracticeLevelBadge = ({ validSimulations, size = 'md', showName = true }) => {
  const info = getPracticeLevel(validSimulations);
  const sizes = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5',
  };

  return (
    <span
      title={`Nivel de práctica: ${info.name}`}
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${sizes[size]}`}
      style={{ backgroundColor: info.color + '20', color: info.color, border: `1px solid ${info.color}40` }}
    >
      <span>{info.icon}</span>
      {showName && <span>{info.name}</span>}
    </span>
  );
};

export default PracticeLevelBadge;
