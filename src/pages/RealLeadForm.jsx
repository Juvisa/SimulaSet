import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getProjects, createRealLead } from '../utils/storage';
import Layout from '../components/Layout';
import { ChevronLeft, Save, Zap } from 'lucide-react';

const INPUT = "w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder-text-secondary text-sm focus:border-accent-gold transition-colors";
const LABEL = "block text-sm font-medium text-text-secondary mb-1.5";
const SELECT = "w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-text-primary text-sm focus:border-accent-gold transition-colors";

const NIVELES_CONSCIENCIA = [
  'No sabe que tiene un problema',
  'Sabe que tiene el problema',
  'Está buscando una solución',
  'Está evaluando opciones',
  'Listo para tomar acción',
];

const RealLeadForm = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState({
    project_id: location.state?.projectId || '',
    nombre: '',
    origen: 'Inbound',
    canal: 'WhatsApp',
    dolor_principal: '',
    nivel_consciencia: 'Sabe que tiene el problema',
    temperatura: 'Tibio',
    notas_adicionales: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setProjects(getProjects(user.id));
  }, [user.id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.project_id) { setError('Selecciona un proyecto'); return; }
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    if (!form.dolor_principal.trim()) { setError('El dolor principal es obligatorio'); return; }
    setSaving(true);
    const lead = createRealLead({ ...form, setter_id: user.id });
    navigate(`/leads-reales/${lead.id}`);
  };

  return (
    <Layout>
      {/* Gold top bar */}
      <div className="h-1 w-full rounded-full mb-5" style={{ background: 'linear-gradient(90deg, #C9920A, #F59E0B)' }} />

      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/leads-reales')} className="p-2 hover:bg-bg-card rounded-lg text-text-secondary hover:text-text-primary transition-all">
            <ChevronLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-text-primary">Registrar Lead Real</h1>
              <span className="text-xs font-black px-2.5 py-1 rounded-full"
                style={{ backgroundColor: '#C9920A20', color: '#C9920A', border: '1px solid #C9920A40' }}>
                MODO REAL
              </span>
            </div>
            <p className="text-text-secondary text-sm mt-0.5">Completa los datos para que la IA te asista mejor</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="bg-bg-card border border-border-subtle rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-text-primary">Datos del lead</h3>

            <div>
              <label className={LABEL}>Proyecto asociado *</label>
              {projects.length === 0 ? (
                <div className="bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-text-secondary text-sm">
                  Sin proyectos — <button type="button" onClick={() => navigate('/projects/new')} className="text-accent-coral hover:underline">crear uno</button>
                </div>
              ) : (
                <select value={form.project_id} onChange={e => set('project_id', e.target.value)} className={SELECT}>
                  <option value="">Selecciona un proyecto...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name} — {p.expertName}</option>)}
                </select>
              )}
            </div>

            <div>
              <label className={LABEL}>Nombre del Lead *</label>
              <input value={form.nombre} onChange={e => set('nombre', e.target.value)} className={INPUT} placeholder="María García" required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Origen</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Inbound', 'Outbound'].map(o => (
                    <button key={o} type="button" onClick={() => set('origen', o)}
                      className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${form.origen === o ? 'border-accent-gold bg-accent-gold/10 text-accent-gold' : 'border-border-subtle bg-bg-input text-text-secondary'}`}>
                      {o === 'Inbound' ? '🟢' : '🔵'} {o}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={LABEL}>Canal</label>
                <select value={form.canal} onChange={e => set('canal', e.target.value)} className={SELECT}>
                  {['WhatsApp', 'Instagram DM', 'Comentario', 'Email', 'Otro'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-bg-card border border-border-subtle rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-text-primary">Contexto del lead</h3>

            <div>
              <label className={LABEL}>Dolor principal detectado *</label>
              <textarea value={form.dolor_principal} onChange={e => set('dolor_principal', e.target.value)}
                className={INPUT + ' resize-none'} rows={3}
                placeholder="¿Qué problema específico tiene este lead? ¿Qué te dijo o qué señales diste?" required />
            </div>

            <div>
              <label className={LABEL}>Nivel de consciencia</label>
              <div className="space-y-2">
                {NIVELES_CONSCIENCIA.map((n, i) => (
                  <button key={n} type="button" onClick={() => set('nivel_consciencia', n)}
                    className={`w-full text-left px-4 py-2.5 rounded-xl text-sm border transition-all ${form.nivel_consciencia === n ? 'border-accent-gold bg-accent-gold/10 text-accent-gold' : 'border-border-subtle bg-bg-input text-text-secondary hover:text-text-primary'}`}>
                    <span className="text-accent-gold font-bold mr-2">{i + 1}.</span>{n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={LABEL}>Temperatura inicial</label>
              <div className="grid grid-cols-3 gap-2">
                {[['Frío', '❄️'], ['Tibio', '🌤️'], ['Caliente', '🔥']].map(([t, icon]) => (
                  <button key={t} type="button" onClick={() => set('temperatura', t)}
                    className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${form.temperatura === t ? 'border-accent-gold bg-accent-gold/10 text-accent-gold' : 'border-border-subtle bg-bg-input text-text-secondary'}`}>
                    {icon} {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={LABEL}>Notas adicionales (opcional)</label>
              <textarea value={form.notas_adicionales} onChange={e => set('notas_adicionales', e.target.value)}
                className={INPUT + ' resize-none'} rows={2}
                placeholder="Cualquier contexto extra que ayude a la IA a asistirte mejor..." />
            </div>
          </div>

          <div className="flex gap-3 pb-6">
            <button type="button" onClick={() => navigate('/leads-reales')}
              className="flex-1 bg-bg-card border border-border-subtle text-text-secondary py-3 rounded-xl font-medium hover:text-text-primary transition-all">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 text-black py-3 rounded-xl font-bold transition-all disabled:opacity-50"
              style={{ backgroundColor: '#C9920A' }}>
              <Zap size={16} />
              {saving ? 'Guardando...' : 'Registrar y Asistir'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default RealLeadForm;
