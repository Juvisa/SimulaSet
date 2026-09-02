import { useEffect, useState } from 'react';
import { BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown, Clock3, Loader2 } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { getLessonProgress, setLessonProgress } from '../utils/lessonProgress';

const journeySteps = ['START', 'APRENDE', 'ENTRENA', 'DEMUESTRA', 'DESBLOQUEA'];
const START_COURSE_ID = 'set-academy';
const START_MODULE_ID = 'digital-set-start';

const startLessons = [
  {
    id: 'digital-ecosystem',
    title: 'Entiende el ecosistema digital',
    description: 'Los conceptos esenciales para ubicarte dentro de un negocio digital.',
    topics: ['Negocio digital', 'Infoproducto', 'Oferta', 'Lead', 'Tráfico', 'Embudo', 'CRM', 'Setter', 'Closer', 'Chat closer', 'Lanzamiento', 'Evergreen'],
  },
  {
    id: 'digital-sales-work',
    title: 'Cómo funciona el trabajo en ventas digitales',
    description: 'Una vista clara del proceso comercial y del día a día de un setter.',
    topics: ['Origen de leads', 'Roles', 'Pipeline', 'Trabajo en CRM', 'Seguimiento', 'Citas', 'Conversiones', 'Comisiones', 'Métricas básicas', 'Día a día del setter'],
  },
];

const modules = [
  { week: 'Semana 1', title: 'El terreno y el Método S.E.T.', date: '3 de septiembre', available: true },
  { week: 'Semana 2', title: 'Conversaciones que agendan y venden', date: '10 de septiembre' },
  { week: 'Semana 3', title: 'Objeciones y seguimiento', date: '17 de septiembre' },
  { week: 'Semana 4', title: 'Oportunidades y entrevistas', date: '24 de septiembre' },
];

const Academy = () => {
  const { user } = useAuth();
  const isStarter = user.onboarding?.classification === 'starter';
  const [progress, setProgress] = useState({});
  const [expandedLesson, setExpandedLesson] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(true);
  const [updatingLesson, setUpdatingLesson] = useState('');
  const [progressError, setProgressError] = useState('');

  useEffect(() => {
    let active = true;

    getLessonProgress({ userId: user.id, courseId: START_COURSE_ID, moduleId: START_MODULE_ID })
      .then(({ progress: rows, error }) => {
        if (!active) return;
        if (error) setProgressError(`No pudimos cargar tu progreso: ${error}`);
        setProgress(Object.fromEntries(rows.map(row => [row.lesson_id, row.status])));
      })
      .finally(() => {
        if (active) setLoadingProgress(false);
      });

    return () => { active = false; };
  }, [user.id]);

  const completedCount = startLessons.filter(lesson => progress[lesson.id] === 'completed').length;
  const startProgressPercent = Math.round((completedCount / startLessons.length) * 100);
  const startCompleted = completedCount === startLessons.length;

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
            <span className="font-black text-accent-coral">{completedCount} de {startLessons.length}</span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-bg-input" aria-label={`${startProgressPercent}% completado`}>
            <div className="h-full rounded-full bg-accent-coral transition-all duration-300" style={{ width: `${startProgressPercent}%` }} />
          </div>
        </div>

        {progressError && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{progressError}</div>}

        {loadingProgress ? (
          <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" /> Cargando progreso...</div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {startLessons.map((lesson, index) => {
              const completed = progress[lesson.id] === 'completed';
              const expanded = expandedLesson === lesson.id;
              const updating = updatingLesson === lesson.id;
              return (
                <section key={lesson.id} className={`overflow-hidden rounded-2xl border bg-bg-card ${completed ? 'border-green-500/30' : 'border-border-subtle'}`}>
                  <button type="button" onClick={() => setExpandedLesson(current => current === lesson.id ? null : lesson.id)} aria-expanded={expanded} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left">
                    <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm font-black ${completed ? 'bg-green-500/15 text-green-400' : 'bg-bg-input text-text-secondary'}`}>{completed ? <Check size={17} /> : index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-text-primary">Clase {index + 1}</span>
                      <span className={`mt-0.5 block text-xs font-semibold ${completed ? 'text-green-400' : 'text-text-secondary'}`}>{completed ? 'Completada' : 'Pendiente'}</span>
                    </span>
                    <ChevronDown size={18} className={`flex-shrink-0 text-text-secondary transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  </button>

                  {expanded && (
                    <div className="border-t border-border-subtle px-4 pb-4 pt-4">
                      <h3 className="text-base font-black text-text-primary">{lesson.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-text-secondary">{lesson.description}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {lesson.topics.map(topic => <span key={topic} className="max-w-full rounded-full border border-border-subtle bg-bg-input px-3 py-1.5 text-xs text-text-secondary">{topic}</span>)}
                      </div>
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

      <div className="grid md:grid-cols-2 gap-4">
        {modules.map((module) => (
          <article key={module.week} className="bg-bg-card border border-border-subtle rounded-2xl p-5 hover:border-accent-coral/30 transition-colors">
            <div className="flex items-start justify-between gap-4 mb-5">
              <span className="text-xs font-black uppercase tracking-wider text-accent-coral">{module.week}</span>
              <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${module.available ? 'text-green-400 bg-green-500/10' : 'text-text-secondary bg-bg-input'}`}>
                {module.available ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
                {module.available ? 'Disponible' : 'Próximamente'}
              </span>
            </div>
            <h2 className="text-lg font-bold text-text-primary min-h-14">{module.title}</h2>
            <div className="flex items-center gap-2 text-text-secondary text-sm mt-4">
              <CalendarDays size={14} /> {module.date}
            </div>
          </article>
        ))}
      </div>
    </div>
  </Layout>
  );
};

export default Academy;
