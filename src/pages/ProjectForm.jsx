import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getProjects, saveProject, getAllProjects } from '../utils/storage';
import Layout from '../components/Layout';
import { Plus, Trash2, ChevronLeft, Save } from 'lucide-react';

const emptyTestimonial = () => ({ id: crypto.randomUUID(), clientName: '', niche: '', result: '', time: '', text: '' });
const emptyResource = () => ({ id: crypto.randomUUID(), name: '', type: 'guia', link: '', when: 'inbound' });
const emptyGuia = () => ({ id: crypto.randomUUID(), nombre: '', descripcion: '', link: '', momento_uso: 'inbound', activo: true });
const emptyTestimonio = () => ({ id: crypto.randomUUID(), nombre: '', nicho_cliente: '', resultado_logrado: '', tiempo_resultado: '', link: '', activo: true });

const emptyRecursos = () => ({
  guias_pdfs: [emptyGuia()],
  videos_testimonios: [emptyTestimonio()],
  vsl_presentacion: { nombre: '', link: '', activo: true },
  scripts_apertura: { outbound: '', inbound: '', reactivacion: '' },
});

const INPUT = "w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder-text-secondary text-sm focus:border-accent-coral transition-colors";
const LABEL = "block text-sm font-medium text-text-secondary mb-1.5";
const SELECT = "w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-text-primary text-sm focus:border-accent-coral transition-colors";

const Section = ({ title, children }) => (
  <div className="bg-bg-card border border-border-subtle rounded-2xl p-6">
    <h3 className="text-base font-bold text-text-primary mb-5">{title}</h3>
    <div className="space-y-4">{children}</div>
  </div>
);

const ProjectForm = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [activeTab, setActiveTab] = useState('general');
  const [form, setForm] = useState({
    name: '', expertName: '', niche: '', promise: '', price: '',
    avatarBusiness: '', avatarCurrentSituation: '', avatarPain: '',
    avatarDesire: '', avatarDescription: '', commonObjections: '',
    testimonials: [emptyTestimonial()],
    resources: [emptyResource()],
    recursos: emptyRecursos(),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isEdit) {
      const all = getAllProjects();
      const project = all.find(p => p.id === id && p.userId === user.id);
      if (!project) { navigate('/projects'); return; }
      const defaultRecursos = emptyRecursos();
      setForm({
        ...project,
        testimonials: project.testimonials?.length ? project.testimonials : [emptyTestimonial()],
        resources: project.resources?.length ? project.resources : [emptyResource()],
        recursos: {
          guias_pdfs: project.recursos?.guias_pdfs?.length ? project.recursos.guias_pdfs : defaultRecursos.guias_pdfs,
          videos_testimonios: project.recursos?.videos_testimonios?.length ? project.recursos.videos_testimonios : defaultRecursos.videos_testimonios,
          vsl_presentacion: project.recursos?.vsl_presentacion ?? defaultRecursos.vsl_presentacion,
          scripts_apertura: project.recursos?.scripts_apertura ?? defaultRecursos.scripts_apertura,
        },
      });
    }
  }, [id, user.id, isEdit, navigate]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const updateTestimonial = (idx, field, value) => {
    const arr = [...form.testimonials];
    arr[idx] = { ...arr[idx], [field]: value };
    setForm(f => ({ ...f, testimonials: arr }));
  };

  const updateResource = (idx, field, value) => {
    const arr = [...form.resources];
    arr[idx] = { ...arr[idx], [field]: value };
    setForm(f => ({ ...f, resources: arr }));
  };

  const updateGuia = (idx, field, value) => {
    const arr = [...form.recursos.guias_pdfs];
    arr[idx] = { ...arr[idx], [field]: value };
    setForm(f => ({ ...f, recursos: { ...f.recursos, guias_pdfs: arr } }));
  };
  const updateTestimonio = (idx, field, value) => {
    const arr = [...form.recursos.videos_testimonios];
    arr[idx] = { ...arr[idx], [field]: value };
    setForm(f => ({ ...f, recursos: { ...f.recursos, videos_testimonios: arr } }));
  };
  const updateVsl = (field, value) => setForm(f => ({ ...f, recursos: { ...f.recursos, vsl_presentacion: { ...f.recursos.vsl_presentacion, [field]: value } } }));
  const updateScript = (field, value) => setForm(f => ({ ...f, recursos: { ...f.recursos, scripts_apertura: { ...f.recursos.scripts_apertura, [field]: value } } }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.expertName.trim() || !form.promise.trim()) {
      setError('Completa los campos obligatorios: nombre, experto y promesa');
      return;
    }
    setSaving(true);
    const avatarDescription = `
Tipo de negocio: ${form.avatarBusiness}
Situación actual: ${form.avatarCurrentSituation}
Dolor principal: ${form.avatarPain}
Deseo / meta: ${form.avatarDesire}
${form.avatarDescription ? 'Detalles adicionales: ' + form.avatarDescription : ''}
    `.trim();

    const project = {
      ...form,
      id: isEdit ? id : crypto.randomUUID(),
      userId: user.id,
      avatarDescription,
      testimonials: form.testimonials.filter(t => t.clientName || t.result),
      resources: form.resources.filter(r => r.name),
      recursos: {
        guias_pdfs: form.recursos.guias_pdfs.filter(g => g.nombre || g.link),
        videos_testimonios: form.recursos.videos_testimonios.filter(v => v.nombre || v.link),
        vsl_presentacion: form.recursos.vsl_presentacion,
        scripts_apertura: form.recursos.scripts_apertura,
      },
      createdAt: isEdit ? form.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveProject(project);
    setSaving(false);
    navigate('/projects');
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/projects')} className="p-2 hover:bg-bg-card rounded-lg text-text-secondary hover:text-text-primary transition-all">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{isEdit ? 'Editar proyecto' : 'Nuevo proyecto'}</h1>
            <p className="text-text-secondary text-sm">El contexto que alimentará todas tus simulaciones</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-bg-card border border-border-subtle rounded-xl p-1 mb-6">
          {[
            { key: 'general', label: 'Proyecto' },
            { key: 'biblioteca', label: '📚 Biblioteca' },
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.key ? 'bg-accent-coral text-white' : 'text-text-secondary hover:text-text-primary'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {activeTab === 'biblioteca' && (
            <>
              {/* Guías / PDFs */}
              <Section title="📄 Guías & PDFs">
                <p className="text-text-secondary text-xs -mt-2">Materiales escritos que puedes compartir en conversaciones</p>
                {form.recursos.guias_pdfs.map((g, idx) => (
                  <div key={g.id} className="bg-bg-primary border border-border-subtle rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-secondary font-medium">Guía {idx + 1}</span>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input type="checkbox" checked={g.activo} onChange={e => updateGuia(idx, 'activo', e.target.checked)} className="accent-accent-coral" />
                          <span className="text-xs text-text-secondary">Activo</span>
                        </label>
                        {form.recursos.guias_pdfs.length > 1 && (
                          <button type="button" onClick={() => setForm(f => ({ ...f, recursos: { ...f.recursos, guias_pdfs: f.recursos.guias_pdfs.filter((_, i) => i !== idx) } }))} className="text-text-secondary hover:text-red-400 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={LABEL}>Nombre</label>
                        <input value={g.nombre} onChange={e => updateGuia(idx, 'nombre', e.target.value)} className={INPUT} placeholder="Guía 'Del contacto a la cita'" />
                      </div>
                      <div>
                        <label className={LABEL}>¿Cuándo usar?</label>
                        <select value={g.momento_uso} onChange={e => updateGuia(idx, 'momento_uso', e.target.value)} className={SELECT}>
                          <option value="inbound">Inbound</option>
                          <option value="outbound">Outbound</option>
                          <option value="reactivacion">Reactivación</option>
                          <option value="seguimiento">Seguimiento general</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className={LABEL}>Link de descarga o vista previa</label>
                      <input value={g.link} onChange={e => updateGuia(idx, 'link', e.target.value)} className={INPUT} placeholder="https://drive.google.com/..." />
                    </div>
                    <div>
                      <label className={LABEL}>Descripción breve (para que la IA sepa cuándo sugerirla)</label>
                      <input value={g.descripcion} onChange={e => updateGuia(idx, 'descripcion', e.target.value)} className={INPUT} placeholder="Guía de 5 pasos para escalar negocios digitales a $10K/mes" />
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setForm(f => ({ ...f, recursos: { ...f.recursos, guias_pdfs: [...f.recursos.guias_pdfs, emptyGuia()] } }))} className="flex items-center gap-2 text-accent-coral text-sm font-medium hover:text-accent-coral/80 transition-colors">
                  <Plus size={16} />Agregar guía
                </button>
              </Section>

              {/* Videos / Testimonios */}
              <Section title="🎥 Videos & Testimonios">
                <p className="text-text-secondary text-xs -mt-2">Videos de resultados de clientes para generar prueba social</p>
                {form.recursos.videos_testimonios.map((v, idx) => (
                  <div key={v.id} className="bg-bg-primary border border-border-subtle rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-secondary font-medium">Video {idx + 1}</span>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input type="checkbox" checked={v.activo} onChange={e => updateTestimonio(idx, 'activo', e.target.checked)} className="accent-accent-coral" />
                          <span className="text-xs text-text-secondary">Activo</span>
                        </label>
                        {form.recursos.videos_testimonios.length > 1 && (
                          <button type="button" onClick={() => setForm(f => ({ ...f, recursos: { ...f.recursos, videos_testimonios: f.recursos.videos_testimonios.filter((_, i) => i !== idx) } }))} className="text-text-secondary hover:text-red-400 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={LABEL}>Nombre del cliente</label>
                        <input value={v.nombre} onChange={e => updateTestimonio(idx, 'nombre', e.target.value)} className={INPUT} placeholder="María G." />
                      </div>
                      <div>
                        <label className={LABEL}>Nicho / perfil</label>
                        <input value={v.nicho_cliente} onChange={e => updateTestimonio(idx, 'nicho_cliente', e.target.value)} className={INPUT} placeholder="Coach de nutrición" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={LABEL}>Resultado logrado</label>
                        <input value={v.resultado_logrado} onChange={e => updateTestimonio(idx, 'resultado_logrado', e.target.value)} className={INPUT} placeholder="De $0 a $8K/mes" />
                      </div>
                      <div>
                        <label className={LABEL}>En cuánto tiempo</label>
                        <input value={v.tiempo_resultado} onChange={e => updateTestimonio(idx, 'tiempo_resultado', e.target.value)} className={INPUT} placeholder="3 meses" />
                      </div>
                    </div>
                    <div>
                      <label className={LABEL}>Link al video</label>
                      <input value={v.link} onChange={e => updateTestimonio(idx, 'link', e.target.value)} className={INPUT} placeholder="https://youtube.com/... o drive.google.com/..." />
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setForm(f => ({ ...f, recursos: { ...f.recursos, videos_testimonios: [...f.recursos.videos_testimonios, emptyTestimonio()] } }))} className="flex items-center gap-2 text-accent-coral text-sm font-medium hover:text-accent-coral/80 transition-colors">
                  <Plus size={16} />Agregar video
                </button>
              </Section>

              {/* VSL */}
              <Section title="🎬 VSL / Presentación Principal">
                <p className="text-text-secondary text-xs -mt-2">El video de ventas principal que envías antes de la llamada</p>
                <div className="flex items-center gap-2 mb-3">
                  <input type="checkbox" id="vsl-activo" checked={form.recursos.vsl_presentacion.activo} onChange={e => updateVsl('activo', e.target.checked)} className="accent-accent-coral" />
                  <label htmlFor="vsl-activo" className="text-xs text-text-secondary cursor-pointer">Tengo VSL configurada</label>
                </div>
                {form.recursos.vsl_presentacion.activo && (
                  <div className="space-y-3">
                    <div>
                      <label className={LABEL}>Nombre / título de la VSL</label>
                      <input value={form.recursos.vsl_presentacion.nombre} onChange={e => updateVsl('nombre', e.target.value)} className={INPUT} placeholder="'La fórmula del setter de alto ticket'" />
                    </div>
                    <div>
                      <label className={LABEL}>Link de la VSL</label>
                      <input value={form.recursos.vsl_presentacion.link} onChange={e => updateVsl('link', e.target.value)} className={INPUT} placeholder="https://..." />
                    </div>
                  </div>
                )}
              </Section>

              {/* Scripts de apertura */}
              <Section title="💬 Scripts de Apertura">
                <p className="text-text-secondary text-xs -mt-2">Mensajes base que la IA usará como referencia para generar respuestas</p>
                <div>
                  <label className={LABEL}>Script Outbound (primer contacto)</label>
                  <textarea value={form.recursos.scripts_apertura.outbound} onChange={e => updateScript('outbound', e.target.value)} className={INPUT + ' resize-none'} rows={3} placeholder="Hola [nombre], vi tu perfil / tu post sobre [tema]..." />
                </div>
                <div>
                  <label className={LABEL}>Script Inbound (lead que llega interesado)</label>
                  <textarea value={form.recursos.scripts_apertura.inbound} onChange={e => updateScript('inbound', e.target.value)} className={INPUT + ' resize-none'} rows={3} placeholder="Hola [nombre], gracias por tu interés en..." />
                </div>
                <div>
                  <label className={LABEL}>Script Reactivación (lead que dejó de responder)</label>
                  <textarea value={form.recursos.scripts_apertura.reactivacion} onChange={e => updateScript('reactivacion', e.target.value)} className={INPUT + ' resize-none'} rows={3} placeholder="Hola [nombre], hace unos días hablamos sobre..." />
                </div>
              </Section>
            </>
          )}

          {activeTab === 'general' && <>
          <Section title="Información general">
            <div>
              <label className={LABEL}>Nombre del proyecto *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} className={INPUT} placeholder="Ej: Programa de Ángel Rodríguez" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Nombre del experto o marca *</label>
                <input value={form.expertName} onChange={e => set('expertName', e.target.value)} className={INPUT} placeholder="Ángel Rodríguez" required />
              </div>
              <div>
                <label className={LABEL}>Nicho o industria</label>
                <input value={form.niche} onChange={e => set('niche', e.target.value)} className={INPUT} placeholder="Coaches de negocios" />
              </div>
            </div>
            <div>
              <label className={LABEL}>Promesa principal del programa *</label>
              <textarea value={form.promise} onChange={e => set('promise', e.target.value)} className={INPUT + ' resize-none'} rows={3} placeholder="¿Qué resultado concreto entrega el programa?" required />
            </div>
            <div>
              <label className={LABEL}>Precio aproximado del programa</label>
              <input value={form.price} onChange={e => set('price', e.target.value)} className={INPUT} placeholder="$2,000 USD" />
            </div>
          </Section>

          <Section title="Avatar del cliente ideal">
            <div>
              <label className={LABEL}>Tipo de negocio o perfil profesional</label>
              <input value={form.avatarBusiness} onChange={e => set('avatarBusiness', e.target.value)} className={INPUT} placeholder="Coach de vida con infoproductos, consultora freelance..." />
            </div>
            <div>
              <label className={LABEL}>Situación actual (dónde está hoy)</label>
              <textarea value={form.avatarCurrentSituation} onChange={e => set('avatarCurrentSituation', e.target.value)} className={INPUT + ' resize-none'} rows={2} placeholder="Tiene conocimiento pero no logra monetizarlo, lleva 6 meses sin escalar..." />
            </div>
            <div>
              <label className={LABEL}>Dolor principal</label>
              <textarea value={form.avatarPain} onChange={e => set('avatarPain', e.target.value)} className={INPUT + ' resize-none'} rows={2} placeholder="No sabe cómo conseguir clientes consistentemente, trabaja mucho pero gana poco..." />
            </div>
            <div>
              <label className={LABEL}>Deseo / meta</label>
              <textarea value={form.avatarDesire} onChange={e => set('avatarDesire', e.target.value)} className={INPUT + ' resize-none'} rows={2} placeholder="Quiere llegar a $10K/mes, tener libertad de tiempo, vivir de su pasión..." />
            </div>
            <div>
              <label className={LABEL}>Objeciones comunes</label>
              <textarea value={form.commonObjections} onChange={e => set('commonObjections', e.target.value)} className={INPUT + ' resize-none'} rows={2} placeholder="No tengo dinero, ya intenté algo parecido, no tengo tiempo..." />
            </div>
          </Section>

          <Section title="Recursos del experto">
            <p className="text-text-secondary text-xs -mt-2">Guías, audios, videos o clases que puedes usar en las conversaciones</p>
            {form.resources.map((r, idx) => (
              <div key={r.id} className="bg-bg-primary border border-border-subtle rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary font-medium">Recurso {idx + 1}</span>
                  {form.resources.length > 1 && (
                    <button type="button" onClick={() => setForm(f => ({ ...f, resources: f.resources.filter((_, i) => i !== idx) }))} className="text-text-secondary hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Nombre</label>
                    <input value={r.name} onChange={e => updateResource(idx, 'name', e.target.value)} className={INPUT} placeholder="Guía del setter" />
                  </div>
                  <div>
                    <label className={LABEL}>Tipo</label>
                    <select value={r.type} onChange={e => updateResource(idx, 'type', e.target.value)} className={SELECT}>
                      <option value="guia">Guía</option>
                      <option value="audio">Audio</option>
                      <option value="video">Video</option>
                      <option value="clase">Clase</option>
                      <option value="ebook">Ebook</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className={LABEL}>Link o descripción breve</label>
                  <input value={r.link} onChange={e => updateResource(idx, 'link', e.target.value)} className={INPUT} placeholder="https://... o descripción del recurso" />
                </div>
                <div>
                  <label className={LABEL}>¿Para qué momento usarlo?</label>
                  <select value={r.when} onChange={e => updateResource(idx, 'when', e.target.value)} className={SELECT}>
                    <option value="inbound">Inbound (antes de la llamada)</option>
                    <option value="reactivacion">Reactivación</option>
                    <option value="seguimiento">Seguimiento general</option>
                    <option value="outbound">Outbound</option>
                  </select>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, resources: [...f.resources, emptyResource()] }))}
              className="flex items-center gap-2 text-accent-coral text-sm font-medium hover:text-accent-coral/80 transition-colors"
            >
              <Plus size={16} />
              Agregar recurso
            </button>
          </Section>

          <Section title="Resultados y testimonios reales">
            <p className="text-text-secondary text-xs -mt-2">Casos de éxito reales que harán más potente el FOMO</p>
            {form.testimonials.map((t, idx) => (
              <div key={t.id} className="bg-bg-primary border border-border-subtle rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary font-medium">Testimonio {idx + 1}</span>
                  {form.testimonials.length > 1 && (
                    <button type="button" onClick={() => setForm(f => ({ ...f, testimonials: f.testimonials.filter((_, i) => i !== idx) }))} className="text-text-secondary hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Nombre del cliente</label>
                    <input value={t.clientName} onChange={e => updateTestimonial(idx, 'clientName', e.target.value)} className={INPUT} placeholder="María G. (puede ser alias)" />
                  </div>
                  <div>
                    <label className={LABEL}>Nicho / sector</label>
                    <input value={t.niche} onChange={e => updateTestimonial(idx, 'niche', e.target.value)} className={INPUT} placeholder="Coach de nutrición" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Resultado logrado</label>
                    <input value={t.result} onChange={e => updateTestimonial(idx, 'result', e.target.value)} className={INPUT} placeholder="De $0 a $8K/mes" />
                  </div>
                  <div>
                    <label className={LABEL}>Tiempo</label>
                    <input value={t.time} onChange={e => updateTestimonial(idx, 'time', e.target.value)} className={INPUT} placeholder="En 3 meses" />
                  </div>
                </div>
                <div>
                  <label className={LABEL}>Testimonio textual (opcional)</label>
                  <textarea value={t.text} onChange={e => updateTestimonial(idx, 'text', e.target.value)} className={INPUT + ' resize-none'} rows={2} placeholder="'Nunca pensé que lo lograría tan rápido...'" />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, testimonials: [...f.testimonials, emptyTestimonial()] }))}
              className="flex items-center gap-2 text-accent-coral text-sm font-medium hover:text-accent-coral/80 transition-colors"
            >
              <Plus size={16} />
              Agregar testimonio
            </button>
          </Section>

          </> }

          <div className="flex items-center gap-3 pb-6">
            <button
              type="button"
              onClick={() => navigate('/projects')}
              className="flex-1 bg-bg-card border border-border-subtle text-text-secondary py-3 rounded-xl font-medium hover:text-text-primary transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-accent-coral text-white py-3 rounded-xl font-bold hover:bg-accent-coral/90 transition-all disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? 'Guardando...' : 'Guardar proyecto'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default ProjectForm;
