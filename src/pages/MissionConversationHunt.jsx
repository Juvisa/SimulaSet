import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { MISSION_01, MISSION_FIELDS, isMissionCaseComplete, isMissionComplete } from '../data/missions';
import { getMissionProgress, saveMissionProgress, startMissionProgress } from '../utils/missionProgress';

const EMPTY_RESPONSE = Object.fromEntries(MISSION_FIELDS.map(field => [field.key, '']));

const MissionConversationHunt = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [responses, setResponses] = useState({});
  const [currentCaseIndex, setCurrentCaseIndex] = useState(0);
  const [status, setStatus] = useState('in_progress');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadProgress = async () => {
      const existing = await getMissionProgress({ userId: user.id, missionId: MISSION_01.id });
      if (existing.error) throw new Error(existing.error);
      const started = existing.progress ? null : await startMissionProgress({ userId: user.id, missionId: MISSION_01.id });
      if (started?.error) throw new Error(started.error);
      const result = existing.progress || started?.progress;
      if (!result) throw new Error('No se pudo iniciar la misión.');
      if (!active) return;

      const savedResponses = result.responses || {};
      setResponses(savedResponses);
      setStatus(result.status);
      const firstIncomplete = MISSION_01.cases.findIndex(missionCase => !isMissionCaseComplete(savedResponses[missionCase.id]));
      setCurrentCaseIndex(firstIncomplete === -1 ? MISSION_01.cases.length - 1 : firstIncomplete);
    };

    loadProgress()
      .catch(caught => {
        if (active) setError(`No pudimos cargar la misión: ${caught instanceof Error ? caught.message : 'Error inesperado'}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [user.id]);

  const missionCase = MISSION_01.cases[currentCaseIndex];
  const currentResponse = useMemo(() => ({
    ...EMPTY_RESPONSE,
    ...(responses[missionCase?.id] || {}),
  }), [missionCase?.id, responses]);

  const updateField = (field, value) => {
    setResponses(current => ({
      ...current,
      [missionCase.id]: { ...EMPTY_RESPONSE, ...(current[missionCase.id] || {}), [field]: value },
    }));
    setError('');
  };

  const saveAndContinue = async () => {
    if (!isMissionCaseComplete(currentResponse)) {
      setError('Completa los cuatro campos de este caso antes de continuar.');
      return;
    }

    const updatedResponses = { ...responses, [missionCase.id]: currentResponse };
    const completed = isMissionComplete(updatedResponses);
    setSaving(true);
    setError('');

    const { progress, error: saveError } = await saveMissionProgress({
      userId: user.id,
      missionId: MISSION_01.id,
      responses: updatedResponses,
      status: completed ? 'completed' : 'in_progress',
    });

    setSaving(false);
    if (saveError || !progress) {
      setError(`No pudimos guardar tu progreso: ${saveError || 'Error inesperado'}`);
      return;
    }

    setResponses(progress.responses || updatedResponses);
    setStatus(progress.status);
    if (!completed) setCurrentCaseIndex(index => Math.min(index + 1, MISSION_01.cases.length - 1));
  };

  if (loading) {
    return <Layout><div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" /> Preparando misión...</div></Layout>;
  }

  if (status === 'completed') {
    return (
      <Layout>
        <div className="mx-auto flex min-h-[65vh] max-w-2xl items-center justify-center animate-fade-in">
          <section className="w-full rounded-3xl border border-green-500/30 bg-bg-card p-6 text-center md:p-10">
            <CheckCircle2 size={52} className="mx-auto text-green-400" />
            <div className="mt-6 text-xs font-black tracking-[0.25em] text-green-400">MISIÓN COMPLETADA</div>
            <h1 className="mt-3 text-2xl font-black text-text-primary md:text-4xl">Primera evidencia S.E.T. registrada.</h1>
            <p className="mx-auto mt-5 max-w-lg text-sm leading-relaxed text-text-secondary">Acabas de hacer algo que muchos vendedores no hacen: pensar antes de responder.</p>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-text-secondary">Cada conversación tiene una Situación, una Emoción y una Transición posible. Tu trabajo es aprender a detectarlas.</p>
            <button onClick={() => navigate('/missions')} className="mt-8 w-full rounded-xl bg-accent-coral px-5 py-3 text-sm font-bold text-white sm:w-auto">Ver mi progreso</button>
          </section>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-3xl animate-fade-in">
        <button onClick={() => navigate('/missions')} className="mb-5 flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"><ArrowLeft size={15} /> Todas las misiones</button>

        <header className="mb-6">
          <div className="text-xs font-black tracking-[0.2em] text-accent-coral">MISIÓN {MISSION_01.number} · CASO {currentCaseIndex + 1} DE {MISSION_01.cases.length}</div>
          <h1 className="mt-2 text-2xl font-black text-text-primary md:text-3xl">{MISSION_01.title}</h1>
          <p className="mt-1 text-sm text-text-secondary">{MISSION_01.subtitle}</p>
          <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-text-secondary">{MISSION_01.introduction}</p>
        </header>

        <div className="mb-6 flex gap-2" aria-label={`Caso ${currentCaseIndex + 1} de ${MISSION_01.cases.length}`}>
          {MISSION_01.cases.map((item, index) => (
            <div key={item.id} className={`h-1.5 flex-1 rounded-full ${index <= currentCaseIndex ? 'bg-accent-coral' : 'bg-bg-input'}`} />
          ))}
        </div>

        <section className="rounded-2xl border border-border-subtle bg-bg-card p-4 md:p-6">
          <div className="text-xs font-black uppercase tracking-wider text-accent-gold">{missionCase.industry}</div>
          <div className="mt-4 rounded-2xl rounded-tl-sm border border-border-subtle bg-bg-input px-4 py-3 text-sm leading-relaxed text-text-primary">
            {missionCase.leadMessage}
          </div>

          <div className="mt-7 space-y-6">
            {MISSION_FIELDS.map(field => (
              <label key={field.key} className="block">
                <span className="block text-xs font-black tracking-wide text-accent-coral">{field.label}</span>
                <span className="mt-1 block text-sm text-text-secondary">{field.prompt}</span>
                <textarea
                  value={currentResponse[field.key]}
                  onChange={event => updateField(field.key, event.target.value)}
                  rows={field.key === 'movimiento' ? 4 : 3}
                  className="mt-3 w-full resize-y rounded-xl border border-border-subtle bg-bg-primary px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-secondary/60 focus:border-accent-coral"
                  placeholder="Escribe tu respuesta..."
                />
              </label>
            ))}
          </div>

          {error && <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

          <div className="mt-7 flex flex-col-reverse gap-3 border-t border-border-subtle pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button onClick={() => setCurrentCaseIndex(index => Math.max(0, index - 1))} disabled={currentCaseIndex === 0 || saving} className="flex items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 py-3 text-sm font-bold text-text-secondary disabled:opacity-40"><ArrowLeft size={15} /> Caso anterior</button>
            <button onClick={saveAndContinue} disabled={saving} className="flex items-center justify-center gap-2 rounded-xl bg-accent-coral px-5 py-3 text-sm font-bold text-white disabled:opacity-60">
              {saving ? <Loader2 size={16} className="animate-spin" /> : currentCaseIndex === MISSION_01.cases.length - 1 ? <CheckCircle2 size={16} /> : <ArrowRight size={16} />}
              {currentCaseIndex === MISSION_01.cases.length - 1 ? 'Completar misión' : 'Guardar y continuar'}
            </button>
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default MissionConversationHunt;
