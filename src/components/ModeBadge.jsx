import { getMode } from '../utils/simulatorModes';

const ModeBadge = ({ mode, size = 'md' }) => {
  // Un modo desconocido (o una sesión antigua sin modo) se sigue mostrando
  // como Outbound, igual que antes.
  const meta = getMode(mode) || getMode('outbound');
  const cfg = { label: meta.label, color: meta.color, bg: `${meta.color}20` };
  const sizes = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ${sizes[size]}`}
      style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40` }}
    >
      {cfg.label}
    </span>
  );
};

export default ModeBadge;
