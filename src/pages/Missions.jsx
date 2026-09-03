import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Loader2, Target } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { MISSION_01, getMissionCompletedCaseCount } from '../data/missions';
import { getMissionProgress } from '../utils/missionProgress';

const Missions = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getMissionProgress({ userId: user.id, missionId: MISSION_01.id })
      .then(({ progress: savedProgress, error: loadError }) => {
        if (!active) return;
        setProgress(savedProgress);
        if (loadError) setError(`No pudimos cargar tu progreso: ${loadError}`);
      })
      .catch(caught => {
        if (active) setError(`No pudimos cargar tu progreso: ${caught instanceof Error ? caught.message : 'Error inesperado'}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [user.id]);

  const completedCases = getMissionCompletedCaseCount(progress?.responses || {});
  const completed = progress?.status === 'completed';
  const statusLabel = completed ? 'Completada' : progress ? 'En progreso' : 'No iniciada';
  const ctaLabel = completed ? 'Ver misión completada' : progress ? 'Continuar misión' : 'Comenzar misión';

  return (
    <Layout>
      <div className="mx-auto max-w-3xl animate-fade-in">
        <header className="mb-7">
          <div className="text-xs font-black uppercase tracking-[0.25em] text-accent-coral">Entrenamiento práctico</div>
          <h1 className="mt-2 text-3xl font-black text-text-primary md:text-4xl">Missions</h1>
          <p className="mt-2 text-sm text-text-secondary">Aprende a detectar lo que una conversación necesita antes de responder.</p>
        </header>

        {error && <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" /> Cargando misión...</div>
        ) : (
          <article className="relative overflow-hidden rounded-3xl border border-accent-coral/25 bg-bg-card p-5 md:p-8">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent-coral to-accent-gold" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black tracking-[0.2em] text-accent-coral">MISIÓN {MISSION_01.number}</div>
                <h2 className="mt-2 text-2xl font-black text-text-primary">{MISSION_01.title}</h2>
                <p className="mt-1 text-sm text-text-secondary">{MISSION_01.subtitle}</p>
              </div>
              <div className={`rounded-full px-3 py-1 text-xs font-bold ${completed ? 'bg-green-500/10 text-green-400' : progress ? 'bg-accent-gold/10 text-accent-gold' : 'bg-bg-input text-text-secondary'}`}>
                {statusLabel}
              </div>
            </div>

            <div className="my-7 rounded-2xl border border-border-subtle bg-bg-input/50 p-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-bold text-text-primary">Tu progreso</span>
                <span className="font-black text-accent-gold">{completedCases}/3</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-bg-primary">
                <div className="h-full rounded-full bg-gradient-to-r from-accent-coral to-accent-gold transition-all" style={{ width: `${(completedCases / 3) * 100}%` }} />
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm text-text-secondary">
              {completed ? <CheckCircle2 size={18} className="text-green-400" /> : <Target size={18} className="text-accent-coral" />}
              <span>3 casos · Situación, Emoción, Transición y movimiento</span>
            </div>

            <button onClick={() => navigate(`/missions/${MISSION_01.id}`)} className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-accent-coral px-5 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 sm:w-auto">
              {ctaLabel} <ArrowRight size={16} />
            </button>
          </article>
        )}
      </div>
    </Layout>
  );
};

export default Missions;
