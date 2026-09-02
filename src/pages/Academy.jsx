import { useEffect, useState } from 'react';
import MuxPlayer from '@mux/mux-player-react';
import { BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown, Clock3, Loader2 } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { getPublishedAcademyLessons } from '../utils/academyLessons';
import { getLessonProgress, setLessonProgress } from '../utils/lessonProgress';

const journeySteps = ['START', 'APRENDE', 'ENTRENA', 'DEMUESTRA', 'DESBLOQUEA'];
const START_COURSE_ID = 'set-academy';
const START_MODULE_ID = 'digital-set-start';
const WEEK_ORDER = ['week-01', 'week-02', 'week-03', 'week-04'];
const SPECIAL_MODULE_IDS = new Set([START_MODULE_ID, ...WEEK_ORDER, 'practical-labs']);

const startLessons = [
  {
    id: 'digital-ecosystem',
    module_id: START_MODULE_ID,
    title: 'Entiende el ecosistema digital',
    description: 'Los conceptos esenciales para ubicarte dentro de un negocio digital.',
    topics: ['Negocio digital', 'Infoproducto', 'Oferta', 'Lead', 'Tráfico', 'Embudo', 'CRM', 'Setter', 'Closer', 'Chat closer', 'Lanzamiento', 'Evergreen'],
    resources: [],
    video_status: 'not_uploaded',
  },
  {
    id: 'digital-sales-work',
    module_id: START_MODULE_ID,
    title: 'Cómo funciona el trabajo en ventas digitales',
    description: 'Una vista clara del proceso comercial y del día a día de un setter.',
    topics: ['Origen de leads', 'Roles', 'Pipeline', 'Trabajo en CRM', 'Seguimiento', 'Citas', 'Conversiones', 'Comisiones', 'Métricas básicas', 'Día a día del setter'],
    resources: [],
    video_status: 'not_uploaded',
  },
];

const fallbackWeekGroups = [
  { moduleId: 'week-01', week: 'Semana 1', lessons: [{ id: 'set-method-foundations', title: 'El terreno y el Método S.E.T.', scheduled_at: '2026-09-04T19:30:00-05:00', video_status: 'ready' }] },
  { moduleId: 'week-02', week: 'Semana 2', lessons: [{ id: 'conversations-that-book-and-sell', title: 'Conversaciones que agendan y venden', scheduled_at: '2026-09-11T19:30:00-05:00', video_status: 'not_uploaded' }] },
  { moduleId: 'week-03', week: 'Semana 3', lessons: [{ id: 'objections-and-follow-up', title: 'Objeciones y seguimiento', scheduled_at: '2026-09-18T19:30:00-05:00', video_status: 'not_uploaded' }] },
  { moduleId: 'week-04', week: 'Semana 4', lessons: [{ id: 'opportunities-and-interviews', title: 'Oportunidades y entrevistas', scheduled_at: '2026-09-25T19:30:00-05:00', video_status: 'not_uploaded' }] },
];

const formatScheduledAt = (scheduledAt) => {
  if (!scheduledAt) return 'Fecha por confirmar';
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(scheduledAt)).replace(' a las ', ', ');
};

const LessonResources = ({ lesson }) => {
  if (!Array.isArray(lesson.resources) || lesson.resources.length === 0) return null;
  return (
    <div className="mt-4 border-t border-border-subtle pt-4">
      <h3 className="mb-3 text-sm font-bold text-text-primary">Recursos de la clase</h3>
      <div className="space-y-2">
        {lesson.resources.map((resource, resourceIndex) => (
          <a key={resource.id || `${lesson.id}-resource-${resourceIndex}`} href={resource.url} target="_blank" rel="noreferrer" className="flex min-h-11 w-full items-center rounded-xl border border-border-subtle bg-bg-input px-4 py-2.5 text-sm font-semibold text-text-primary">
            {resource.title || 'Abrir recurso'}
          </a>
        ))}
      </div>
    </div>
  );
};

const LessonVideo = ({ lesson }) => {
  if (lesson.video_status !== 'ready' || !lesson.mux_playback_id) return null;
  return (
    <div className="mt-4 overflow-hidden rounded-xl bg-black">
      <MuxPlayer
        playbackId={lesson.mux_playback_id}
        metadataVideoTitle={lesson.title}
        streamType="on-demand"
        autoPlay={false}
        playsInline
        className="aspect-video w-full"
        style={{ aspectRatio: '16 / 9', width: '100%' }}
      />
    </div>
  );
};

const Academy = () => {
  const { user } = useAuth();
  const isStarter = user.onboarding?.classification === 'starter';
  const [lessons, setLessons] = useState(startLessons);
  const [weekGroups, setWeekGroups] = useState(fallbackWeekGroups);
  const [labLessons, setLabLessons] = useState([]);
  const [additionalModuleGroups, setAdditionalModuleGroups] = useState([]);
  const [progress, setProgress] = useState({});
  const [expandedLesson, setExpandedLesson] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(true);
  const [updatingLesson, setUpdatingLesson] = useState('');
  const [progressError, setProgressError] = useState('');

  useEffect(() => {
    const targetId = window.location.hash.slice(1);
    if (!targetId) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: 'start' });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    let active = true;

    getPublishedAcademyLessons(START_COURSE_ID).then(({ lessons: publishedLessons, error }) => {
      if (!active || error || publishedLessons.length === 0) return;
      const digitalStartLessons = publishedLessons
        .filter(lesson => lesson.module_id === START_MODULE_ID)
        .map(lesson => ({ ...lesson, id: lesson.lesson_id }));
      if (digitalStartLessons.length > 0) setLessons(digitalStartLessons);

      const lessonsByModule = publishedLessons.reduce((groups, lesson) => {
        if (!groups[lesson.module_id]) groups[lesson.module_id] = [];
        groups[lesson.module_id].push({ ...lesson, id: lesson.lesson_id, scheduled_at: lesson.scheduled_at });
        return groups;
      }, {});

      setWeekGroups(fallbackWeekGroups.map((fallbackGroup) => {
        const moduleLessons = lessonsByModule[fallbackGroup.moduleId];
        return moduleLessons?.length > 0
          ? { ...fallbackGroup, lessons: [...moduleLessons].sort((a, b) => a.position - b.position) }
          : fallbackGroup;
      }).sort((a, b) => WEEK_ORDER.indexOf(a.moduleId) - WEEK_ORDER.indexOf(b.moduleId)));

      const practicalLabs = lessonsByModule['practical-labs'];
      if (practicalLabs?.length > 0) {
        setLabLessons([...practicalLabs].sort((a, b) => a.position - b.position));
      }

      setAdditionalModuleGroups(Object.entries(lessonsByModule)
        .filter(([moduleId]) => !SPECIAL_MODULE_IDS.has(moduleId))
        .map(([moduleId, moduleLessons]) => ({
          moduleId,
          lessons: [...moduleLessons].sort((a, b) => a.position - b.position || a.lesson_id.localeCompare(b.lesson_id)),
        }))
        .sort((a, b) => a.moduleId.localeCompare(b.moduleId, 'es', { numeric: true })));
    });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;

    getLessonProgress({ userId: user.id, courseId: START_COURSE_ID, moduleId: START_MODULE_ID })
      .then(({ progress: rows, error }) => {
        if (!active) return;
        if (error) setProgressError(`No pudimos cargar tu progreso: ${error}`);
        setProgress(Object.fromEntries(rows.map(row => [row.lesson_id, row.status])));
      })
      .catch((error) => {
        if (active) setProgressError(`No pudimos cargar tu progreso: ${error instanceof Error ? error.message : 'Error inesperado'}`);
      })
      .finally(() => {
        if (active) setLoadingProgress(false);
      });

    return () => { active = false; };
  }, [user.id]);

  const completedCount = lessons.filter(lesson => progress[lesson.id] === 'completed').length;
  const startProgressPercent = Math.round((completedCount / lessons.length) * 100);
  const startCompleted = completedCount === lessons.length;

  const toggleLessonStatus = async (lessonId) => {
    const status = progress[lessonId] === 'completed' ? 'pending' : 'completed';
    setUpdatingLesson(lessonId);
    setProgressError('');
    const { progress: savedProgress, error } = await setLessonProgress({
      userId: user.id,
      courseId: START_COURSE_ID,
      moduleId: START_MODULE_ID,
      lessonId,
      status,
    });
    setUpdatingLesson('');

    if (error) {
      setProgressError(`No pudimos actualizar la clase: ${error}`);
      return;
    }
    setProgress(current => ({ ...current, [savedProgress.lesson_id]: savedProgress.status }));
  };

  return (
  <Layout>
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-accent-coral text-sm font-bold uppercase tracking-widest mb-2">
          <BookOpen size={16} /> Academia
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-text-primary">Tu ruta DIGITAL SET</h1>
        <p className="text-text-secondary mt-2">Aprende. Entrena. Aplica.</p>
      </div>

      <div className="overflow-x-auto snap-x snap-mandatory mb-6 pb-2">
        <div className="flex min-w-max gap-2 md:grid md:min-w-0 md:grid-cols-5">
          {journeySteps.map((item, index) => {
            const active = isStarter ? index === 0 : index === 1;
            const optional = !isStarter && index === 0;
            return (
              <div key={item} className={`w-24 snap-start rounded-xl border px-2 py-3 text-center md:w-auto ${active ? 'border-accent-coral bg-accent-coral/10' : 'border-border-subtle bg-bg-input/60'}`}>
                <div className={`text-[10px] font-black tracking-wide ${active ? 'text-accent-coral' : 'text-text-secondary'}`}>{item}</div>
                {optional && <div className="text-[9px] text-text-secondary mt-0.5">Opcional</div>}
              </div>
            );
          })}
        </div>
      </div>

      <article id="digital-set-start" className={`scroll-mt-6 rounded-2xl border p-4 sm:p-6 mb-6 ${isStarter ? 'border-accent-coral bg-accent-coral/10' : 'border-border-subtle bg-bg-card'}`}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-accent-coral">Módulo 0 · DIGITAL SET START</div>
            <h2 className="text-xl font-black text-text-primary mt-2">Fundamentos para comenzar con claridad</h2>
            <p className="text-sm text-text-secondary mt-2 max-w-2xl">Comprende el ecosistema digital, el rol del setter, qué es un lead y cómo funciona una conversación comercial por chat.</p>
          </div>
          <span className={`self-start flex-shrink-0 rounded-full px-3 py-1 text-xs font-bold ${startCompleted ? 'bg-green-500/15 text-green-400' : isStarter ? 'bg-accent-coral text-white' : 'bg-bg-input text-text-secondary'}`}>{startCompleted ? 'Completado' : isStarter ? 'Tu primer paso' : 'Opcional'}</span>
        </div>

        <div className="mt-6 rounded-xl border border-border-subtle bg-bg-card/70 p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-text-primary">Progreso del módulo</span>
            <span className="font-black text-accent-coral">{completedCount} de {lessons.length}</span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-bg-input" aria-label={`${startProgressPercent}% completado`}>
            <div className="h-full rounded-full bg-accent-coral transition-all duration-300" style={{ width: `${startProgressPercent}%` }} />
          </div>
        </div>

        {progressError && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{progressError}</div>}

        {loadingProgress ? (
          <div key="progress-loading" className="flex min-h-24 items-center justify-center gap-2 text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" /> Cargando progreso...</div>
        ) : (
          <div key="progress-lessons" className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {lessons.map((lesson, index) => {
              const completed = progress[lesson.id] === 'completed';
              const expanded = expandedLesson === lesson.id;
              const updating = updatingLesson === lesson.id;
              return (
                <section key={lesson.id} className={`overflow-hidden rounded-2xl border bg-bg-card ${completed ? 'border-green-500/30' : 'border-border-subtle'}`}>
                  <button type="button" onClick={() => setExpandedLesson(current => current === lesson.id ? null : lesson.id)} aria-expanded={expanded} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left">
                    <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm font-black ${completed ? 'bg-green-500/15 text-green-400' : 'bg-bg-input text-text-secondary'}`}>{completed ? <Check size={17} /> : index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-text-primary">{lesson.title}</span>
                      <span className={`mt-0.5 block text-xs font-semibold ${completed ? 'text-green-400' : 'text-text-secondary'}`}>{completed ? 'Completada' : 'Pendiente'}</span>
                    </span>
                    <ChevronDown size={18} className={`flex-shrink-0 text-text-secondary transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  </button>

                  {expanded && (
                    <div className="border-t border-border-subtle px-4 pb-4 pt-4">
                      <p className="mt-2 text-sm leading-relaxed text-text-secondary">{lesson.description}</p>
                      <LessonVideo lesson={lesson} />
                      {lesson.video_status !== 'ready' && <div className="mt-4 rounded-xl border border-border-subtle bg-bg-input px-4 py-3 text-sm text-text-secondary">Disponible después de la clase en vivo</div>}
                      {Array.isArray(lesson.topics) && lesson.topics.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{lesson.topics.map(topic => <span key={topic} className="max-w-full rounded-full border border-border-subtle bg-bg-input px-3 py-1.5 text-xs text-text-secondary">{topic}</span>)}</div>}
                      <LessonResources lesson={lesson} />
                      <button type="button" onClick={() => toggleLessonStatus(lesson.id)} disabled={updating} className={`mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold disabled:opacity-50 ${completed ? 'bg-bg-input text-text-primary' : 'bg-accent-coral text-white'}`}>
                        {updating ? <Loader2 size={17} className="animate-spin" /> : completed ? <Clock3 size={17} /> : <Check size={17} />}
                        {updating ? 'Guardando...' : completed ? 'Marcar como pendiente' : 'Marcar como completada'}
                      </button>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </article>

      <div className="bg-bg-card border border-border-subtle rounded-2xl p-5 mb-6">
        <div className="flex justify-between text-sm mb-3">
          <span className="font-semibold text-text-primary">Progreso del programa</span>
          <span className="font-black text-accent-coral">0%</span>
        </div>
        <div className="h-2 bg-bg-input rounded-full overflow-hidden">
          <div className="h-full bg-accent-coral rounded-full" style={{ width: '0%' }} />
        </div>
      </div>

      <div id="set-academy-main" className="scroll-mt-6 grid md:grid-cols-2 gap-4">
        {weekGroups.map((group) => (
          <div key={group.moduleId} className="space-y-4">
            {group.lessons.map((lesson) => {
              const available = lesson.video_status === 'ready';
              return (
                <article key={lesson.id} className="bg-bg-card border border-border-subtle rounded-2xl p-5 hover:border-accent-coral/30 transition-colors">
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <span className="text-xs font-black uppercase tracking-wider text-accent-coral">{group.week}</span>
                    <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${available ? 'text-green-400 bg-green-500/10' : 'text-text-secondary bg-bg-input'}`}>
                      {available ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
                      {available ? 'Disponible' : 'Próximamente'}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-text-primary min-h-14">{lesson.title}</h2>
                  <LessonVideo lesson={lesson} />
                  <div className="flex items-center gap-2 text-text-secondary text-sm mt-4">
                    <CalendarDays size={14} /> {formatScheduledAt(lesson.scheduled_at)}
                  </div>
                  {!available && <p className="mt-3 text-sm text-text-secondary">Disponible después de la clase en vivo</p>}
                  <LessonResources lesson={lesson} />
                </article>
              );
            })}
          </div>
        ))}
      </div>

      {labLessons.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-xl font-black text-text-primary">Labs prácticos</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {labLessons.map((lesson) => {
              const available = lesson.video_status === 'ready';
              return (
                <article key={lesson.id} className="bg-bg-card border border-border-subtle rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <span className="text-xs font-black uppercase tracking-wider text-accent-coral">Clase práctica</span>
                    <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${available ? 'text-green-400 bg-green-500/10' : 'text-text-secondary bg-bg-input'}`}>
                      {available ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
                      {available ? 'Disponible' : 'Próximamente'}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-text-primary">{lesson.title}</h3>
                  <LessonVideo lesson={lesson} />
                  <div className="flex items-center gap-2 text-text-secondary text-sm mt-4">
                    <CalendarDays size={14} /> {formatScheduledAt(lesson.scheduled_at)}
                  </div>
                  {!available && <p className="mt-3 text-sm text-text-secondary">Disponible después de la clase en vivo</p>}
                  <LessonResources lesson={lesson} />
                </article>
              );
            })}
          </div>
        </section>
      )}

      {additionalModuleGroups.map((group) => (
        <section key={group.moduleId} className="mt-8">
          <h2 className="mb-4 text-xl font-black text-text-primary">{group.moduleId}</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {group.lessons.map((lesson) => {
              const available = lesson.video_status === 'ready';
              return (
                <article key={lesson.id} className="bg-bg-card border border-border-subtle rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <span className="text-xs font-black uppercase tracking-wider text-accent-coral">{group.moduleId}</span>
                    <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${available ? 'text-green-400 bg-green-500/10' : 'text-text-secondary bg-bg-input'}`}>
                      {available ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
                      {available ? 'Disponible' : 'Próximamente'}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-text-primary">{lesson.title}</h3>
                  <LessonVideo lesson={lesson} />
                  <div className="flex items-center gap-2 text-text-secondary text-sm mt-4">
                    <CalendarDays size={14} /> {formatScheduledAt(lesson.scheduled_at)}
                  </div>
                  {!available && <p className="mt-3 text-sm text-text-secondary">Disponible después de la clase en vivo</p>}
                  <LessonResources lesson={lesson} />
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  </Layout>
  );
};

export default Academy;
