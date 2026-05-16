const MODE_CONFIG = {
  outbound: { label: 'Outbound', color: '#2563EB', bg: '#2563EB20' },
  inbound: { label: 'Inbound', color: '#1D9E75', bg: '#1D9E7520' },
  reactivacion: { label: 'Reactivación', color: '#DC2626', bg: '#DC262620' },
};

const ModeBadge = ({ mode, size = 'md' }) => {
  const cfg = MODE_CONFIG[mode] || MODE_CONFIG.outbound;
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
