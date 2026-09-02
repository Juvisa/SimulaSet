import { useEffect, useState } from 'react';
import { BookOpen, CalendarDays, Loader2, Plus } from 'lucide-react';
import Layout from '../components/Layout';
import { getAllAcademyLessons } from '../utils/adminAcademyLessons';

const formatScheduledAt = (scheduledAt) => {
  if (!scheduledAt) return 'Sin fecha programada';
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(scheduledAt)).replace(' a las ', ', ');
};

const getVideoState = (status) => {
  if (status === 'ready') return { label: 'Video listo', className: 'bg-green-500/10 text-green-400' };
  if (status === 'errored') return { label: 'Error', className: 'bg-red-500/10 text-red-400' };
  if (['waiting_for_upload', 'uploading', 'processing'].includes(status)) {
    return { label: 'Procesando', className: 'bg-amber-500/10 text-amber-400' };
  }
  return { label: 'Sin video', className: 'bg-bg-input text-text-secondary' };
};

const AdminAcademy = () => {
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    getAllAcademyLessons()
      .then(({ lessons: rows, error: queryError }) => {
        if (!active) return;
        if (queryError) {
          setError(`No se pudieron cargar las clases: ${queryError}`);
          return;
        }
        setLessons(rows);
      })
      .catch((queryError) => {
        if (active) {
          setError(`No se pudieron cargar las clases: ${queryError instanceof Error ? queryError.message : 'Error inesperado'}`);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const lessonsByModule = lessons.reduce((groups, lesson) => {
    if (!groups[lesson.module_id]) groups[lesson.module_id] = [];
    groups[lesson.module_id].push(lesson);
    return groups;
  }, {});

  return (
    <Layout>
      <div className="mx-auto max-w-5xl animate-fade-in">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-accent-coral">
              <BookOpen size={16} /> Administración
            </div>
            <h1 className="text-2xl font-black text-text-primary sm:text-3xl">Admin · SET Academy</h1>
            <p className="mt-2 text-sm text-text-secondary">Contenido publicado y borradores de la academia.</p>
          </div>
          <button type="button" disabled className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent-coral px-4 text-sm font-bold text-white opacity-50 sm:w-auto">
            <Plus size={17} /> Nueva clase
          </button>
        </div>

        {loading ? (
          <div key="admin-academy-loading" className="flex min-h-40 items-center justify-center gap-2 rounded-2xl border border-border-subtle bg-bg-card text-sm text-text-secondary">
            <Loader2 size={18} className="animate-spin" /> Cargando clases...
          </div>
        ) : error ? (
          <div key="admin-academy-error" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>
        ) : lessons.length === 0 ? (
          <div key="admin-academy-empty" className="rounded-2xl border border-border-subtle bg-bg-card p-8 text-center text-sm text-text-secondary">No hay clases registradas.</div>
        ) : (
          <div key="admin-academy-list" className="space-y-7">
            {Object.entries(lessonsByModule).map(([moduleId, moduleLessons]) => (
              <section key={moduleId}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="break-all text-sm font-black uppercase tracking-wider text-accent-coral">{moduleId}</h2>
                  <span className="text-xs text-text-secondary">{moduleLessons.length} {moduleLessons.length === 1 ? 'clase' : 'clases'}</span>
                </div>

                <div className="space-y-3">
                  {moduleLessons.map((lesson) => {
                    const videoState = getVideoState(lesson.video_status);
                    return (
                      <article key={lesson.id} className="rounded-2xl border border-border-subtle bg-bg-card p-4 sm:p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h3 className="text-base font-bold text-text-primary sm:text-lg">{lesson.title}</h3>
                            <div className="mt-2 space-y-1 text-xs text-text-secondary">
                              <p className="break-all">Módulo: {lesson.module_id}</p>
                              <p className="break-all">Lección: {lesson.lesson_id}</p>
                              <p>Posición: {lesson.position}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${lesson.published ? 'bg-green-500/10 text-green-400' : 'bg-bg-input text-text-secondary'}`}>
                              {lesson.published ? 'Publicada' : 'Borrador'}
                            </span>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${videoState.className}`}>{videoState.label}</span>
                          </div>
                        </div>
                        <div className="mt-4 flex items-start gap-2 border-t border-border-subtle pt-4 text-sm text-text-secondary">
                          <CalendarDays size={15} className="mt-0.5 flex-shrink-0" />
                          <span>{formatScheduledAt(lesson.scheduled_at)}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AdminAcademy;
