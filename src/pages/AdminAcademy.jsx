import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, CalendarDays, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import Layout from '../components/Layout';
import { createAcademyLesson, deleteAcademyLesson, getAllAcademyLessons, updateAcademyLesson } from '../utils/adminAcademyLessons';

const EMPTY_FORM = {
  title: '', description: '', module_id: '', lesson_id: '', position: 1,
  scheduled_at: '', topics: '', published: false,
};

const inputClass = 'min-h-12 w-full rounded-xl border border-border-subtle bg-bg-input px-4 py-3 text-sm text-text-primary outline-none focus:border-accent-coral disabled:cursor-not-allowed disabled:opacity-60';

const formatScheduledAt = (scheduledAt) => {
  if (!scheduledAt) return 'Sin fecha programada';
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(scheduledAt)).replace(' a las ', ', ');
};

const toColombiaDateTimeInput = (scheduledAt) => {
  if (!scheduledAt) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(scheduledAt));
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
};

const toTimestamptz = (localDateTime) => localDateTime
  ? new Date(`${localDateTime}:00-05:00`).toISOString()
  : null;

const sortLessons = (rows) => [...rows].sort((a, b) => (
  a.module_id.localeCompare(b.module_id)
  || a.position - b.position
  || a.lesson_id.localeCompare(b.lesson_id)
));

const getVideoState = (status) => {
  if (status === 'ready') return { label: 'Video listo', className: 'bg-green-500/10 text-green-400' };
  if (status === 'errored') return { label: 'Error', className: 'bg-red-500/10 text-red-400' };
  if (['waiting_for_upload', 'uploading', 'processing'].includes(status)) return { label: 'Procesando', className: 'bg-amber-500/10 text-amber-400' };
  return { label: 'Sin video', className: 'bg-bg-input text-text-secondary' };
};

const AdminAcademy = () => {
  const navigate = useNavigate();
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingLesson, setEditingLesson] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deletingLessonId, setDeletingLessonId] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    let active = true;
    getAllAcademyLessons()
      .then(({ lessons: rows, error: queryError }) => {
        if (!active) return;
        if (queryError) setError(`No se pudieron cargar las clases: ${queryError}`);
        else setLessons(rows);
      })
      .catch((queryError) => {
        if (active) setError(`No se pudieron cargar las clases: ${queryError instanceof Error ? queryError.message : 'Error inesperado'}`);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const openCreate = () => {
    setEditingLesson(null);
    setForm(EMPTY_FORM);
    setSaveError('');
  };

  const openEdit = (lesson) => {
    setEditingLesson(lesson);
    setForm({
      title: lesson.title,
      description: lesson.description || '',
      module_id: lesson.module_id,
      lesson_id: lesson.lesson_id,
      position: lesson.position,
      scheduled_at: toColombiaDateTimeInput(lesson.scheduled_at),
      topics: Array.isArray(lesson.topics) ? lesson.topics.join('\n') : '',
      published: lesson.published,
    });
    setSaveError('');
  };

  const closeForm = () => {
    if (saving) return;
    setForm(null);
    setEditingLesson(null);
    setSaveError('');
  };

  const updateField = (field, value) => setForm(current => ({ ...current, [field]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaveError('');

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      position: Number(form.position),
      scheduled_at: toTimestamptz(form.scheduled_at),
      topics: [...new Set(form.topics.split('\n').map(topic => topic.trim()).filter(Boolean))],
      published: form.published,
    };

    const result = editingLesson
      ? await updateAcademyLesson(editingLesson.id, payload)
      : await createAcademyLesson({
        ...payload,
        module_id: form.module_id.trim(),
        lesson_id: form.lesson_id.trim(),
      });

    setSaving(false);
    if (result.error || !result.lesson) {
      setSaveError(`No se pudo guardar la clase: ${result.error || 'Respuesta inesperada'}`);
      return;
    }

    setLessons(current => sortLessons(editingLesson
      ? current.map(lesson => lesson.id === result.lesson.id ? result.lesson : lesson)
      : [...current, result.lesson]));
    setForm(null);
    setEditingLesson(null);
  };

  const handleDelete = async (lesson) => {
    if (editingLesson?.id === lesson.id) return;
    const confirmed = window.confirm(`¿Eliminar la clase “${lesson.title}”? Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    setDeletingLessonId(lesson.id);
    setDeleteError('');
    const { deletedId, error: queryError } = await deleteAcademyLesson(lesson.id);
    setDeletingLessonId(null);

    if (queryError || deletedId !== lesson.id) {
      setDeleteError(`No se pudo eliminar “${lesson.title}”: ${queryError || 'Respuesta inesperada'}`);
      return;
    }

    setLessons(current => current.filter(currentLesson => currentLesson.id !== deletedId));
  };

  const lessonsByModule = lessons.reduce((groups, lesson) => {
    if (!groups[lesson.module_id]) groups[lesson.module_id] = [];
    groups[lesson.module_id].push(lesson);
    return groups;
  }, {});

  const editingLessonId = editingLesson?.id;

  const renderLessonForm = (inline = false) => (
    <form key={inline ? editingLessonId : 'new-lesson'} onSubmit={handleSubmit} className={`${inline ? '' : 'mb-7'} rounded-2xl border border-accent-coral/30 bg-bg-card p-4 sm:p-6`}>
      <div className="mb-5">
        <h2 className="text-xl font-black text-text-primary">{editingLesson ? 'Editar clase' : 'Nueva clase'}</h2>
        <p className="mt-1 text-xs text-text-secondary">Curso: set-academy</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="md:col-span-2 text-sm font-semibold text-text-primary">Título
          <input required value={form.title} onChange={event => updateField('title', event.target.value)} className={`${inputClass} mt-2`} />
        </label>
        <label className="md:col-span-2 text-sm font-semibold text-text-primary">Descripción
          <textarea value={form.description} onChange={event => updateField('description', event.target.value)} rows={3} className={`${inputClass} mt-2 resize-y`} />
        </label>
        <label className="text-sm font-semibold text-text-primary">Módulo
          <input required disabled={Boolean(editingLesson)} value={form.module_id} onChange={event => updateField('module_id', event.target.value)} className={`${inputClass} mt-2`} />
        </label>
        <label className="text-sm font-semibold text-text-primary">Lesson ID
          <input required disabled={Boolean(editingLesson)} value={form.lesson_id} onChange={event => updateField('lesson_id', event.target.value)} className={`${inputClass} mt-2`} />
        </label>
        <label className="text-sm font-semibold text-text-primary">Posición
          <input required min="0" type="number" value={form.position} onChange={event => updateField('position', event.target.value)} className={`${inputClass} mt-2`} />
        </label>
        <label className="text-sm font-semibold text-text-primary">Fecha y hora programada
          <input type="datetime-local" value={form.scheduled_at} onChange={event => updateField('scheduled_at', event.target.value)} className={`${inputClass} mt-2`} />
          <span className="mt-1 block text-xs font-normal text-text-secondary">Hora Colombia</span>
        </label>
        <label className="md:col-span-2 text-sm font-semibold text-text-primary">Topics
          <textarea value={form.topics} onChange={event => updateField('topics', event.target.value)} rows={5} placeholder={'Un tema por línea\nEjemplo: Pipeline'} className={`${inputClass} mt-2 resize-y`} />
          <span className="mt-1 block text-xs font-normal text-text-secondary">Escribe un tema por línea.</span>
        </label>
        <label className="md:col-span-2 flex min-h-12 items-center gap-3 rounded-xl border border-border-subtle bg-bg-input px-4 text-sm font-semibold text-text-primary">
          <input type="checkbox" checked={form.published} onChange={event => updateField('published', event.target.checked)} className="h-5 w-5 accent-accent-coral" /> Publicada
        </label>
      </div>
      {saveError && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{saveError}</div>}
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={closeForm} disabled={saving} className="min-h-12 w-full rounded-xl bg-bg-input px-5 text-sm font-bold text-text-primary disabled:opacity-50 sm:w-auto">Cancelar</button>
        <button type="submit" disabled={saving} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent-coral px-5 text-sm font-bold text-white disabled:opacity-50 sm:w-auto">
          {saving && <Loader2 size={17} className="animate-spin" />}{saving ? 'Guardando...' : 'Guardar clase'}
        </button>
      </div>
    </form>
  );

  return (
    <Layout>
      <div className="mx-auto max-w-5xl animate-fade-in">
        <button type="button" onClick={() => navigate('/admin')} className="mb-5 flex min-h-11 items-center gap-2 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary">
          <ArrowLeft size={16} /> Volver al panel Admin
        </button>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-accent-coral"><BookOpen size={16} /> Administración</div>
            <h1 className="text-2xl font-black text-text-primary sm:text-3xl">Admin · SET Academy</h1>
            <p className="mt-2 text-sm text-text-secondary">Contenido publicado y borradores de la academia.</p>
          </div>
          <button type="button" onClick={openCreate} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent-coral px-4 text-sm font-bold text-white sm:w-auto"><Plus size={17} /> Nueva clase</button>
        </div>

        {form && !editingLesson && renderLessonForm()}

        {deleteError && <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{deleteError}</div>}

        {loading ? (
          <div key="admin-academy-loading" className="flex min-h-40 items-center justify-center gap-2 rounded-2xl border border-border-subtle bg-bg-card text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" /> Cargando clases...</div>
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
                    if (editingLessonId === lesson.id) return renderLessonForm(true);
                    const videoState = getVideoState(lesson.video_status);
                    return (
                      <article key={lesson.id} className="rounded-2xl border border-border-subtle bg-bg-card p-4 sm:p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h3 className="text-base font-bold text-text-primary sm:text-lg">{lesson.title}</h3>
                            <div className="mt-2 space-y-1 text-xs text-text-secondary">
                              <p className="break-all">Módulo: {lesson.module_id}</p><p className="break-all">Lección: {lesson.lesson_id}</p><p>Posición: {lesson.position}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${lesson.published ? 'bg-green-500/10 text-green-400' : 'bg-bg-input text-text-secondary'}`}>{lesson.published ? 'Publicada' : 'Borrador'}</span>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${videoState.className}`}>{videoState.label}</span>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-col gap-3 border-t border-border-subtle pt-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-start gap-2 text-sm text-text-secondary"><CalendarDays size={15} className="mt-0.5 flex-shrink-0" /><span>{formatScheduledAt(lesson.scheduled_at)}</span></div>
                          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                            <button type="button" onClick={() => openEdit(lesson)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-bg-input px-4 text-sm font-bold text-text-primary sm:w-auto"><Pencil size={15} /> Editar</button>
                            <button type="button" onClick={() => handleDelete(lesson)} disabled={deletingLessonId === lesson.id || editingLessonId === lesson.id} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-500/10 px-4 text-sm font-bold text-red-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                              {deletingLessonId === lesson.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                              {deletingLessonId === lesson.id ? 'Eliminando...' : 'Eliminar'}
                            </button>
                          </div>
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
