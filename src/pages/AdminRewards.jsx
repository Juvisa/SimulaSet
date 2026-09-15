import { useEffect, useMemo, useRef, useState } from 'react';
import { Gift, Loader2, CheckCircle2, Clock, Upload, FileWarning } from 'lucide-react';
import Layout from '../components/Layout';
import { getRewardRedemptions, markRedemptionDelivered, uploadRewardFile, getUploadedRewardIds } from '../utils/adminRewards';
import { REWARDS } from '../utils/rewards';

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

// Sección aparte, aditiva, para que el admin suba (una sola vez) los 7
// archivos maestros de la Tienda XP al bucket privado 'reward-files'. El
// alumno nunca sube ni ve estos archivos directamente — solo obtiene una URL
// firmada de corta duración cuando ya canjeó (ver getRewardDownloadUrl en
// utils/rewards.js).
const RewardFileRow = ({ reward, uploaded, onUpload, uploading }) => {
  const inputRef = useRef(null);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{reward.title}</p>
        <p className="text-text-secondary text-xs truncate">{reward.cost} XP · {reward.fileName}</p>
      </div>
      <div className="flex items-center gap-3">
        {uploaded ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
            <CheckCircle2 size={13} /> Subido
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-medium text-accent-gold">
            <FileWarning size={13} /> Falta subir
          </span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onUpload(reward, file);
          }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-bold text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {uploaded ? 'Reemplazar' : 'Subir archivo'}
        </button>
      </div>
    </div>
  );
};

const AdminRewards = () => {
  const [redemptions, setRedemptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('pending');
  const [markingId, setMarkingId] = useState(null);
  const [uploadedIds, setUploadedIds] = useState(new Set());
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [uploadingId, setUploadingId] = useState(null);
  const [fileError, setFileError] = useState('');

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

  useEffect(() => {
    let active = true;
    getUploadedRewardIds(REWARDS).then(({ rewardIds, error: loadError }) => {
      if (!active) return;
      setUploadedIds(rewardIds);
      if (loadError) setFileError(loadError);
    }).finally(() => {
      if (active) setLoadingFiles(false);
    });
    return () => { active = false; };
  }, []);

  const handleUploadFile = async (reward, file) => {
    setUploadingId(reward.id);
    setFileError('');
    const { error: uploadError } = await uploadRewardFile(reward, file);
    setUploadingId(null);
    if (uploadError) { setFileError(`${reward.title}: ${uploadError}`); return; }
    setUploadedIds((prev) => new Set(prev).add(reward.id));
  };

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

        <div className="bg-bg-card border border-border-subtle rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border-subtle">
            <h2 className="text-sm font-bold text-text-primary">Archivos de la Tienda XP</h2>
            <p className="text-text-secondary text-xs mt-0.5">Sube una vez el archivo de cada recompensa digital — se entrega automáticamente al alumno apenas canjea.</p>
          </div>
          {fileError && <div className="mx-4 mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">{fileError}</div>}
          {loadingFiles ? (
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-text-secondary">
              <Loader2 size={16} className="animate-spin" /> Cargando archivos...
            </div>
          ) : (
            <div>
              {REWARDS.map((reward) => (
                <RewardFileRow
                  key={reward.id}
                  reward={reward}
                  uploaded={uploadedIds.has(reward.id)}
                  uploading={uploadingId === reward.id}
                  onUpload={handleUploadFile}
                />
              ))}
            </div>
          )}
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
