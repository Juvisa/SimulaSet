import { useEffect, useState } from 'react';
import { Gift, Sparkles, Loader2, X, Check } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { getUserStreak } from '../utils/xp';
import { REWARDS, redeemReward } from '../utils/rewards';

const ConfirmModal = ({ reward, redeeming, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4" onClick={onCancel}>
    <div className="w-full max-w-sm rounded-2xl border border-border-subtle bg-bg-card p-5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-black text-text-primary">Confirmar canje</h3>
        <button onClick={onCancel} className="text-text-secondary hover:text-text-primary"><X size={18} /></button>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-text-secondary">
        ¿Confirmas canjear <span className="font-bold text-text-primary">{reward.title}</span> por{' '}
        <span className="font-black text-accent-gold">{reward.cost} XP</span>? Este XP se descontará de tu saldo disponible de inmediato.
      </p>
      <div className="mt-5 flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-bold text-text-secondary hover:text-text-primary">Cancelar</button>
        <button onClick={onConfirm} disabled={redeeming} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-coral px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
          {redeeming ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          {redeeming ? 'Canjeando...' : 'Confirmar canje'}
        </button>
      </div>
    </div>
  </div>
);

const RewardCard = ({ reward, availableXp, onRedeem }) => {
  const canAfford = availableXp >= reward.cost;
  const missing = reward.cost - availableXp;

  return (
    <article className="flex flex-col rounded-2xl border border-border-subtle bg-bg-card p-5">
      <span className="inline-block w-fit rounded-full bg-accent-gold/10 px-3 py-1 text-xs font-black text-accent-gold">{reward.cost} XP</span>
      <h3 className="mt-3 text-base font-bold text-text-primary">{reward.title}</h3>
      <p className="mt-1.5 flex-1 text-sm text-text-secondary">{reward.description}</p>
      <button
        onClick={() => canAfford && onRedeem(reward)}
        disabled={!canAfford}
        className={`mt-4 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition-opacity ${
          canAfford ? 'bg-accent-coral text-white hover:opacity-90' : 'cursor-not-allowed bg-bg-input text-text-secondary'
        }`}
      >
        {canAfford ? 'Canjear recompensa' : `Te faltan ${missing} XP`}
      </button>
    </article>
  );
};

const Rewards = () => {
  const { user } = useAuth();
  const [streak, setStreak] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [pendingReward, setPendingReward] = useState(null);
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    let active = true;
    getUserStreak(user.id).then(({ streak: loaded, error: loadError }) => {
      if (!active) return;
      setStreak(loaded);
      if (loadError) setError(`No pudimos cargar tu saldo de XP: ${loadError}`);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [user.id]);

  const availableXp = streak?.total_xp || 0;
  const lifetimeXp = streak?.lifetime_xp || 0;

  const handleConfirmRedeem = async () => {
    setRedeeming(true);
    setError('');
    setSuccessMsg('');
    const { streak: updated, error: redeemError } = await redeemReward({ reward: pendingReward });
    setRedeeming(false);
    setPendingReward(null);
    if (redeemError) { setError(redeemError); return; }
    setStreak(updated);
    setSuccessMsg(`¡Canjeado! "${pendingReward.title}" — nuestro equipo se pondrá en contacto para coordinar la entrega.`);
    setTimeout(() => setSuccessMsg(''), 6000);
  };

  return (
    <Layout>
      <div className="mx-auto max-w-4xl animate-fade-in">
        <header className="mb-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.25em] text-accent-coral"><Gift size={16} /> Comunidad</div>
          <h1 className="mt-2 text-3xl font-black text-text-primary md:text-4xl">Tienda de Recompensas</h1>
          <p className="mt-2 text-sm text-text-secondary">Tu XP no es decorativo: cámbialo por herramientas y criterio que aceleran tus resultados.</p>
        </header>

        {loading ? (
          <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" /> Cargando tu saldo...</div>
        ) : (
          <div className="mb-6 grid grid-cols-2 gap-3 rounded-2xl border border-accent-gold/25 bg-accent-gold/5 p-5">
            <div>
              <div className="text-xs font-bold text-text-secondary">XP Disponible para canjear</div>
              <div className="mt-1 text-2xl font-black text-accent-gold">{availableXp}</div>
            </div>
            <div>
              <div className="text-xs font-bold text-text-secondary">XP Histórico Total</div>
              <div className="mt-1 text-2xl font-black text-text-primary">{lifetimeXp}</div>
            </div>
            <p className="col-span-2 mt-1 flex items-center gap-1.5 text-[11px] text-text-secondary">
              <Sparkles size={12} className="text-accent-gold" /> Canjear recompensas reduce tu XP disponible, pero tu histórico y tu nivel alcanzado no bajan.
            </p>
          </div>
        )}

        {error && <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
        {successMsg && <div className="mb-5 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">{successMsg}</div>}

        {!loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {REWARDS.map((reward) => (
              <RewardCard key={reward.id} reward={reward} availableXp={availableXp} onRedeem={setPendingReward} />
            ))}
          </div>
        )}
      </div>

      {pendingReward && (
        <ConfirmModal
          reward={pendingReward}
          redeeming={redeeming}
          onConfirm={handleConfirmRedeem}
          onCancel={() => setPendingReward(null)}
        />
      )}
    </Layout>
  );
};

export default Rewards;
