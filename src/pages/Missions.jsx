import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Flame, Link as LinkIcon, Loader2, Target, Upload } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { getDailyMissionByIsoWeekday } from '../data/dailyMissions';
import {
  getWeekDays,
  getBestSimulatorScoreForDate,
  getWeekMissionProgress,
  markMissionInProgress,
  submitDailyMissionEvidence,
  uploadMissionEvidenceFile,
  getUserStreak,
} from '../utils/dailyMissions';

const MODE_COLORS = { outbound: '#2563EB', inbound: '#1D9E75', reactivacion: '#DC2626' };

const STATUS_META = {
  pending: { label: 'Pendiente', className: 'bg-bg-input text-text-secondary' },
  in_progress: { label: 'En Curso', className: 'bg-accent-gold/10 text-accent-gold' },
  in_review: { label: 'En Revisión', className: 'bg-blue-500/10 text-blue-400' },
  completed: { label: 'Completada', className: 'bg-green-500/10 text-green-400' },
};

const EvidenceForm = ({ initialUrl, initialNote, canAct, scoreQualifies, submitting, userId, isoDate, onSubmit }) => {
  const [url, setUrl] = useState(initialUrl);
  const [note, setNote] = useState(initialNote);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setLocalError('');
    const { url: uploadedUrl, error: uploadError } = await uploadMissionEvidenceFile({ userId, isoDate, file });
    setUploading(false);
    if (uploadError) { setLocalError(uploadError); return; }
    setUrl(uploadedUrl);
  };

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-input/30 p-4 md:p-5">
      <h3 className="text-xs font-black tracking-[0.16em] text-text-primary">ENTREGA DE EVIDENCIA</h3>
      {!scoreQualifies && canAct && (
        <p className="mt-2 text-xs text-text-secondary">Alcanza el SET Score mínimo en el simulador para poder enviar tu evidencia.</p>
      )}
      {localError && <p className="mt-2 text-xs text-red-400">{localError}</p>}

      <div className="mt-4 space-y-4">
        <div>
          <span className="text-xs font-bold text-text-primary">Captura o link de tu conversación</span>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-border-subtle bg-bg-input px-3 py-2.5">
              <LinkIcon size={14} className="shrink-0 text-text-secondary" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={!canAct}
                placeholder="Pega el link de tu captura o conversación..."
                className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary disabled:opacity-60"
              />
            </div>
            <label className={`flex items-center justify-center gap-2 rounded-xl border border-border-subtle px-3 py-2.5 text-xs font-bold text-text-secondary transition-colors ${canAct ? 'cursor-pointer hover:text-text-primary' : 'cursor-not-allowed opacity-50'}`}>
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Subir captura
              <input type="file" accept="image/*" className="hidden" disabled={!canAct || uploading} onChange={handleFileChange} />
            </label>
          </div>
        </div>

        <div>
          <span className="text-xs font-bold text-text-primary">Nota sobre la objeción enfrentada</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={!canAct}
            rows={3}
            placeholder="¿Qué objeción o situación enfrentaste y cómo la manejaste?"
            className="mt-2 w-full resize-y rounded-xl border border-border-subtle bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-secondary focus:border-accent-coral disabled:opacity-60"
          />
        </div>

        {canAct && (
          <button
            onClick={() => onSubmit(url, note)}
            disabled={submitting || uploading || !scoreQualifies || !url.trim() || !note.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-coral px-5 py-3 text-sm font-black text-white transition-opacity disabled:opacity-40 sm:w-auto"
          >
            {submitting ? <><Loader2 size={16} className="animate-spin" /> Enviando...</> : 'Enviar evidencia y completar misión'}
          </button>
        )}
      </div>
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

  const progress = progressByDate[selectedDay.isoDate] || null;
  const status = progress?.status || 'pending';
  const completed = status === 'completed';
  const bestScoreToday = (selectedDay.isToday || selectedDay.isPast)
    ? getBestSimulatorScoreForDate(user.id, selectedDay.isoDate)
    : null;
  const scoreQualifies = Number.isFinite(bestScoreToday) && bestScoreToday >= mission.minSetScore;
  const canAct = selectedDay.isToday && !completed;
  const modeColor = MODE_COLORS[mission.mode] || '#E0605E';

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

  const handleSubmitEvidence = async (evidenceUrl, evidenceNote) => {
    setSubmitting(true);
    setError('');
    setSuccessMsg('');
    const { progress: saved, streak: newStreak, error: submitError } = await submitDailyMissionEvidence({
      userId: user.id,
      isoDate: selectedDay.isoDate,
      missionId: mission.id,
      evidenceUrl,
      evidenceNote,
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
            <p className="mt-2 text-sm text-text-secondary">Una misión por día, lunes a viernes. Practica, entrega evidencia y mantén tu racha.</p>
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

            <EvidenceForm
              key={selectedDay.isoDate}
              initialUrl={progress?.evidence_url || ''}
              initialNote={progress?.evidence_note || ''}
              canAct={canAct}
              scoreQualifies={scoreQualifies}
              submitting={submitting}
              userId={user.id}
              isoDate={selectedDay.isoDate}
              onSubmit={handleSubmitEvidence}
            />
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
