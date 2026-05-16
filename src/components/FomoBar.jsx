const FomoBar = ({ value = 0, label = 'FOMO' }) => {
  const getColor = (v) => {
    if (v < 35) return 'fomo-bar-low';
    if (v < 70) return 'fomo-bar-mid';
    return 'fomo-bar-high';
  };

  const getTextColor = (v) => {
    if (v < 35) return '#EF4444';
    if (v < 70) return '#F59E0B';
    return '#10B981';
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-text-secondary">{label}</span>
        <span className="text-xs font-bold" style={{ color: getTextColor(value) }}>{value}%</span>
      </div>
      <div className="h-2 bg-bg-input rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${getColor(value)}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
};

export default FomoBar;
