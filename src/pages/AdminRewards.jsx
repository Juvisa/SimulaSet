import { useEffect, useMemo, useState } from 'react';
import { Gift, Loader2, CheckCircle2, Clock } from 'lucide-react';
import Layout from '../components/Layout';
import { getRewardRedemptions, markRedemptionDelivered } from '../utils/adminRewards';

const FILTERS = [
  { key: 'pending', label: 'Pendientes' },
  { key: 'delivered', label: 'Entregados' },
  { key: 'all', label: 'Todos' },
];

const STATUS_CONFIG = {
  pending: { label: 'Pendiente', color: '#C9920A', icon: Clock },
  delivered: { label: 'Entregado', color: '#1D9E75', icon: CheckCircle2 },
};

const formatDate = (isoString) =>
  new Date(isoString).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });

const RedemptionRow = ({ redemption, onMarkDelivered, marking }) => {
  const { label: statusLabel, color: statusColor, icon: StatusIcon } = STATUS_CONFIG[redemption.status];

  return (
    <tr className="border-b border-border-subtle">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-accent-coral/20 flex items-center justify-center text-accent-coral font-bold text-sm flex-shrink-0">
            {redemption.student_name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <p className="text-text-primary text-sm font-medium truncate">{redemption.student_name}</p>
            {redemption.student_email && (
              <p className="text-text-secondary text-xs truncate">{redemption.student_email}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-text-primary text-sm">{redemption.reward_title}</td>
      <td className="px-4 py-3 text-center">
        <span className="font-bold text-sm text-accent-gold">{redemption.xp_spent} XP</span>
      </td>
      <td className="px-4 py-3 text-text-secondary text-sm">{formatDate(redemption.created_at)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: statusColor }}>
          <StatusIcon size={12} />
          {statusLabel}
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        {redemption.status === 'pending' && (
          <button
            onClick={() => onMarkDelivered(redemption.id)}
            disabled={marking}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-coral px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {marking ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            Marcar entregado
          </button>
        )}
      </td>
    </tr>
  );
};

const AdminRewards = () => {
  const [redemptions, setRedemptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('pending');
  const [markingId, setMarkingId] = useState(null);

  useEffect(() => {
    let active = true;
    getRewardRedemptions().then(({ redemptions: data, error: loadError }) => {
      if (!active) return;
      setRedemptions(data);
      setError(loadError);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const counts = useMemo(() => ({
    pending: redemptions.filter((r) => r.status === 'pending').length,
    delivered: redemptions.filter((r) => r.status === 'delivered').length,
    all: redemptions.length,
  }), [redemptions]);

  const filtered = filter === 'all' ? redemptions : redemptions.filter((r) => r.status === filter);

  const handleMarkDelivered = async (redemptionId) => {
    setMarkingId(redemptionId);
    const { redemption: updated, error: markError } = await markRedemptionDelivered(redemptionId);
    setMarkingId(null);
    if (markError) { setError(markError); return; }
    setRedemptions((prev) => prev.map((r) => (r.id === redemptionId ? { ...r, status: updated.status } : r)));
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6 pb-10">
        <div>
          <h1 className="text-2xl font-black text-text-primary flex items-center gap-2">
            <Gift size={22} className="text-accent-coral" />
            Canjes de Recompensas
          </h1>
          <p className="text-text-secondary text-sm mt-0.5">
            Gestiona las solicitudes de canje de la Tienda de Recompensas
          </p>
        </div>

        <div className="flex items-center gap-1 bg-bg-input rounded-lg p-1 w-fit">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                filter === key ? 'bg-accent-coral text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {label} <span className="opacity-70">({counts[key]})</span>
            </button>
          ))}
        </div>

        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

        <div className="bg-bg-card border border-border-subtle rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-text-secondary">
              <Loader2 size={18} className="animate-spin" /> Cargando canjes...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-text-secondary text-sm">
              No hay canjes {filter === 'pending' ? 'pendientes' : filter === 'delivered' ? 'entregados' : 'registrados'} aún
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border-subtle">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">Alumno</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">Recompensa</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-text-secondary">Costo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">Estado</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((redemption) => (
                    <RedemptionRow
                      key={redemption.id}
                      redemption={redemption}
                      onMarkDelivered={handleMarkDelivered}
                      marking={markingId === redemption.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default AdminRewards;
