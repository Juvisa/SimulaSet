import { getLevelInfo } from '../utils/levels';

const LevelBadge = ({ level, size = 'md', showName = true }) => {
  const info = getLevelInfo(level);
  const sizes = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${sizes[size]}`}
      style={{ backgroundColor: info.color + '20', color: info.color, border: `1px solid ${info.color}40` }}
    >
      <span>{info.icon}</span>
      {showName && <span>{info.name}</span>}
    </span>
  );
};

export default LevelBadge;
