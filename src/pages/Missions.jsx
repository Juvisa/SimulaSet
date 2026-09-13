import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Brain, CheckCircle2, Flame, Loader2, Target, XCircle } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { getDailyMissionByIsoWeekday } from '../data/dailyMissions';
import { getCriterionChallengeByMissionId } from '../data/criterionChallenges';
import {
  getWeekDays,
  getBestSimulatorScoreForDate,
  getWeekMissionProgress,
  markMissionInProgress,
  completeDailyMission,
  submitCriterionAnswer,
  getUserStreak,
} from '../utils/dailyMissions';

const MODE_COLORS = { outbound: '#2563EB', inbound: '#1D9E75', reactivacion: '#DC2626' };

const STATUS_META = {
  pending: { label: 'Pendiente', className: 'bg-bg-input text-text-secondary' },
  in_progress: { label: 'En Curso', className: 'bg-accent-gold/10 text-accent-gold' },
  in_review: { label: 'En Revisión', className: 'bg-blue-500/10 text-blue-400' },
  completed: { label: 'Completada', className: 'bg-green-500/10 text-green-400' },
};

const CriterionChallenge = ({ challenge, missionId, canAct, initialAnswer, initialCorrect, userId, isoDate, onAnswered }) => {
  const [selected, setSelected] = useState(initialAnswer || null);
  const [correct, setCorrect] = useState(initialCorrect ?? null);
  const [revealed, setRevealed] = useState(Boolean(initialAnswer));
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    setLocalError('');
    const isCorrect = selected === challenge.correctId;
    const { progress, error } = await submitCriterionAnswer({ userId, isoDate, missionId, answerId: selected, correct: isCorrect });
    setSubmitting(false);
    if (error) { setLocalError(error); return; }
    setCorrect(isCorrect);
    setRevealed(true);
    onAnswered(progress);
  };

  const handleRetry = () => {
    setSelected(null);
    setCorrect(null);
    setRevealed(false);
  };

  return (
    <section className="mb-6 rounded-2xl border border-border-subtle bg-bg-input/30 p-4 md:p-5">
      <div className="flex items-center gap-2 text-xs font-black tracking-[0.16em] text-text-primary">
        <Brain size={15} className="text-accent-coral" /> RETO DE CRITERIO S.E.T. · {challenge.label.toUpperCase()}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-text-primary">{challenge.prompt}</p>

      <div className="mt-4 space-y-2">
        {challenge.options.map((option) => {
          const isSelected = selected === option.id;
          const showResult = revealed;
          const isCorrectOption = option.id === challenge.correctId;
          let optionClass = 'border-border-subtle bg-bg-input text-text-primary hover:border-accent-coral/40';
          if (showResult && isCorrectOption) optionClass = 'border-green-500/50 bg-green-500/10 text-green-400';
          else if (showResult && isSelected && !isCorrectOption) optionClass = 'border-red-500/50 bg-red-500/10 text-red-400';
          else if (isSelected) optionClass = 'border-accent-coral bg-accent-coral/10 text-text-primary';

          return (
            <button
              key={option.id}
              onClick={() => !revealed && canAct && setSelected(option.id)}
              disabled={revealed || !canAct}
              className={`flex w-full items-start gap-2 rounded-xl border px-4 py-3 text-left text-sm transition-colors disabled:cursor-default ${optionClass}`}
            >
              {showResult && isCorrectOption && <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-400" />}
              {showResult && isSelected && !isCorrectOption && <XCircle size={16} className="mt-0.5 shrink-0 text-red-400" />}
              <span>{option.text}</span>
            </button>
          );
        })}
      </div>

      {localError && <p className="mt-3 text-xs text-red-400">{localError}</p>}

      {revealed ? (
        <div className="mt-3 rounded-xl border border-border-subtle bg-bg-card/70 p-3">
          <p className="text-xs font-bold text-text-primary">{correct ? '✓ ¡Correcto!' : '✗ No era esa. La respuesta correcta era otra.'}</p>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">{challenge.explanation}</p>
          {!correct && canAct && (
            <button onClick={handleRetry} className="mt-2 text-xs font-bold text-accent-coral hover:underline">Intentar de nuevo</button>
          )}
        </div>
      ) : canAct ? (
        <button
          onClick={handleSubmit}
          disabled={submitting || !selected}
          className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-accent-coral px-5 py-3 text-xs font-black text-white disabled:opacity-40"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
          {submitting ? 'Enviando...' : 'Responder'}
        </button>
      ) : null}
    </section>
  );
};

const Missions = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const weekDays = useMemo(() => getWeekDays(), []);
  const todayIndex = weekDays.findIndex((d) => d.isToday);
  const [selectedIndex, setSelectedIndex] = useState(todayIndex === -1 ? 0 : todayIndex);
  const selectedDay = weekDays[selectedIndex];
  const mission = getDailyMissionByIsoWeekday(selectedDay.isoWeekday);

  const [progressByDate, setProgressByDate] = useState({});
  const [streak, setStreak] = useState(null);
  const [bestScoreToday, setBestScoreToday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    const isoDates = weekDays.map((d) => d.isoDate);
    Promise.all([
      getWeekMissionProgress({ userId: user.id, isoDates }),
      getUserStreak(user.id),
    ]).then(([progressResult, streakResult]) => {
      if (!active) return;
      setProgressByDate(progressResult.progressByDate);
      setStreak(streakResult.streak);
      if (progressResult.error) setError(`No pudimos cargar tu progreso: ${progressResult.error}`);
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : 'Error inesperado');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  useEffect(() => {
    let active = true;
    const eligible = selectedDay.isToday || selectedDay.isPast;
    const scorePromise = eligible ? getBestSimulatorScoreForDate(user.id, selectedDay.isoDate) : Promise.resolve(null);
    scorePromise.then((score) => { if (active) setBestScoreToday(score); });
    return () => { active = false; };
  }, [user.id, selectedDay.isoDate, selectedDay.isToday, selectedDay.isPast]);

  const progress = progressByDate[selectedDay.isoDate] || null;
  const status = progress?.status || 'pending';
  const completed = status === 'completed';
  const scoreQualifies = Number.isFinite(bestScoreToday) && bestScoreToday >= mission.minSetScore;
  const canAct = selectedDay.isToday && !completed;
  // El Reto de Criterio es un quiz de conocimiento, no requiere el SET Score del
  // día ni bloquear días pasados como "Ir a Simular"/evidencia (que sí exigen
  // hoy): se puede responder hoy o en cualquier día ya transcurrido de la
  // semana, igual que bestScoreToday ya permite consultar el score de días
  // pasados. Si no fuera así, un alumno que abre la app en fin de semana (sin
  // ningún día marcado "hoy" en el selector lunes-viernes) nunca podría
  // interactuar con el reto de un día pendiente.
  const canAnswerCriterion = (selectedDay.isToday || selectedDay.isPast) && !completed;
  const modeColor = MODE_COLORS[mission.mode] || '#E0605E';
  const challenge = getCriterionChallengeByMissionId(mission.id);
  const criterionCorrect = progress?.criterion_correct === true;

  const handleCriterionAnswered = (savedProgress) => {
    if (savedProgress) setProgressByDate((prev) => ({ ...prev, [selectedDay.isoDate]: savedProgress }));
  };

  const selectDay = (index) => {
    setSelectedIndex(index);
    setError('');
    setSuccessMsg('');
  };

  const handleGoSimulate = async () => {
    if (!progress) {
      const { progress: started } = await markMissionInProgress({ userId: user.id, isoDate: selectedDay.isoDate, missionId: mission.id });
      if (started) setProgressByDate((prev) => ({ ...prev, [selectedDay.isoDate]: started }));
    }
    navigate('/simulate');
  };

  const handleCompleteMission = async () => {
    setSubmitting(true);
    setError('');
    setSuccessMsg('');
    const { progress: saved, streak: newStreak, error: submitError } = await completeDailyMission({
      userId: user.id,
      isoDate: selectedDay.isoDate,
      missionId: mission.id,
      setScoreAchieved: bestScoreToday,
      minSetScore: mission.minSetScore,
      xpReward: mission.xpReward,
    });
    setSubmitting(false);
    if (saved) setProgressByDate((prev) => ({ ...prev, [selectedDay.isoDate]: saved }));
    if (newStreak) {
      setStreak(newStreak);
      setSuccessMsg(`¡Misión completada! 🔥 Racha: ${newStreak.current_streak} día(s) · +${mission.xpReward} XP`);
    } else if (submitError) {
      setError(submitError);
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-3xl animate-fade-in">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.25em] text-accent-coral">Entrenamiento diario</div>
            <h1 className="mt-2 text-3xl font-black text-text-primary md:text-4xl">Misiones Diarias</h1>
            <p className="mt-2 text-sm text-text-secondary">Una misión por día, lunes a viernes. Responde el Reto de Criterio, practica en el simulador y mantén tu racha.</p>
          </div>
          {streak && (
            <div className="flex items-center gap-2 rounded-2xl border border-accent-gold/30 bg-accent-gold/5 px-4 py-2.5">
              <Flame size={18} className="text-accent-gold" />
              <div className="text-sm">
                <div className="font-black text-accent-gold">{streak.current_streak} día{streak.current_streak === 1 ? '' : 's'}</div>
                <div className="text-[11px] text-text-secondary">{streak.total_xp} XP total</div>
              </div>
            </div>
          )}
        </header>

        {/* Selector semanal */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
          {weekDays.map((day, index) => {
            const dayMission = getDailyMissionByIsoWeekday(day.isoWeekday);
            const dayStatus = progressByDate[day.isoDate]?.status || 'pending';
            const isSelected = index === selectedIndex;
            return (
              <button
                key={day.isoDate}
                onClick={() => selectDay(index)}
                className={`flex min-w-[80px] flex-col items-center gap-1 rounded-2xl px-4 py-2.5 text-xs font-bold transition-colors ${
                  isSelected
                    ? 'bg-accent-coral text-white'
                    : day.isToday
                      ? 'border border-accent-coral/40 bg-bg-input text-text-primary'
                      : 'bg-bg-input text-text-secondary hover:text-text-primary'
                }`}
              >
                <span>{dayMission.dayLabel.slice(0, 3).toUpperCase()}</span>
                <span className="text-[10px] opacity-80">{day.date.getDate()}</span>
                <span
                  className="mt-0.5 h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: dayStatus === 'completed' ? '#1D9E75' : dayStatus === 'in_review' ? '#3B82F6' : dayStatus === 'in_progress' ? '#C9920A' : 'transparent' }}
                />
              </button>
            );
          })}
        </div>

        {error && <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
        {successMsg && <div className="mb-5 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">{successMsg}</div>}

        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" /> Cargando misiones...</div>
        ) : (
          <article className="relative overflow-hidden rounded-3xl border border-border-subtle bg-bg-card p-5 md:p-8">
            <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: modeColor }} />
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black tracking-[0.2em]" style={{ color: modeColor }}>{mission.dayLabel.toUpperCase()} · MISIÓN DEL DÍA</div>
                <h2 className="mt-2 text-2xl font-black text-text-primary">{mission.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{mission.objective}</p>
              </div>
              <div className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${STATUS_META[status].className}`}>
                {STATUS_META[status].label}
              </div>
            </div>

            <div className="my-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-bg-input/50 p-4">
              <Target size={18} className="text-accent-coral" />
              <span className="text-sm font-bold text-text-primary">Requisito: SET Score ≥ {mission.minSetScore}</span>
              <span className="text-sm text-text-secondary">
                · Tu mejor score {selectedDay.isToday ? 'de hoy' : 'de ese día'}: {Number.isFinite(bestScoreToday) ? bestScoreToday : '—'}
              </span>
              {scoreQualifies && <span className="text-xs font-bold text-green-400">✓ Requisito cumplido</span>}
            </div>

            {canAct && (
              <button
                onClick={handleGoSimulate}
                className="mb-6 flex w-full items-center justify-center gap-2 rounded-xl bg-accent-coral px-5 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 sm:w-auto"
              >
                Ir a Simular <ArrowRight size={16} />
              </button>
            )}

            {mission.tip && (
              <p className="mb-6 rounded-xl border border-accent-gold/20 bg-accent-gold/5 px-4 py-3 text-xs leading-relaxed text-text-secondary">
                💡 {mission.tip}
              </p>
            )}

            {challenge && (
              <CriterionChallenge
                key={`challenge-${selectedDay.isoDate}`}
                challenge={challenge}
                missionId={mission.id}
                canAct={canAnswerCriterion}
                initialAnswer={progress?.criterion_answer || null}
                initialCorrect={progress?.criterion_correct ?? null}
                userId={user.id}
                isoDate={selectedDay.isoDate}
                onAnswered={handleCriterionAnswered}
              />
            )}

            {canAct && (
              <section className="rounded-2xl border border-border-subtle bg-bg-input/30 p-4 md:p-5">
                <h3 className="text-xs font-black tracking-[0.16em] text-text-primary">CIERRE DE LA MISIÓN</h3>
                {!criterionCorrect && (
                  <p className="mt-2 text-xs text-text-secondary">Responde correctamente el Reto de Criterio de arriba para poder completar la misión.</p>
                )}
                {criterionCorrect && !scoreQualifies && (
                  <p className="mt-2 text-xs text-text-secondary">Practica en el simulador hasta alcanzar el SET Score mínimo de hoy para completar la misión.</p>
                )}
                {criterionCorrect && scoreQualifies && (
                  <p className="mt-2 text-xs font-bold text-green-400">✓ Cumples los dos requisitos. ¡Completa tu misión!</p>
                )}
                <button
                  onClick={handleCompleteMission}
                  disabled={submitting || !scoreQualifies || !criterionCorrect}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent-coral px-5 py-3 text-sm font-black text-white transition-opacity disabled:opacity-40 sm:w-auto"
                >
                  {submitting ? <><Loader2 size={16} className="animate-spin" /> Completando...</> : 'Marcar misión como completada'}
                </button>
              </section>
            )}
          </article>
        )}

        <button
          onClick={() => navigate('/missions/mission_01_conversation_hunt')}
          className="mt-6 text-xs font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
        >
          Ejercicio de práctica adicional: Caza Conversaciones →
        </button>
      </div>
    </Layout>
  );
};

export default Missions;
