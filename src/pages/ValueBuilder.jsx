import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, FileText, Copy, Check, Loader2, AlertTriangle, FlaskConical, MessageSquare, RefreshCw,
} from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { getProjects } from '../utils/projects';
import { generateValueAsset } from '../utils/anthropic';
import { MOCK_VALUE_BUILDER_PROJECT } from '../data/mockValueBuilderProject';

const BANNED_PHRASES = ['¿pudiste ver mi mensaje?', '¿sigues interesado?', '¿cómo va todo?'];

const containsBannedPhrase = (text) => BANNED_PHRASES.some((phrase) => (text || '').toLowerCase().includes(phrase));

const REQUIRED_FIELDS = [
  { key: 'expertName', label: 'Nombre del experto' },
  { key: 'niche', label: 'Nicho' },
];
const RECOMMENDED_FIELDS = [
  { key: 'promise', label: 'Oferta / Promesa' },
  { key: 'avatarDescription', label: 'Descripción del avatar' },
];

const getMissingFields = (project) => {
  if (!project) return [];
  const missingRequired = REQUIRED_FIELDS.filter((f) => !project[f.key]?.trim()).map((f) => f.label);
  const hasAnyContext = [project.promise, project.avatarDescription, project.avatarPain].some((v) => v?.trim());
  const missingRecommended = hasAnyContext ? [] : RECOMMENDED_FIELDS.map((f) => f.label);
  return [...missingRequired, ...missingRecommended];
};

const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard no disponible, se ignora */
    }
  };
  return (
    <button onClick={handleCopy} className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-2.5 py-1.5 text-xs font-bold text-text-secondary hover:text-text-primary">
      {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  );
};

const ValueBuilder = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getProjects(user.id).then(({ projects: loaded }) => {
      if (!active) return;
      setProjects(loaded);
      setSelectedId(loaded.length > 0 ? loaded[0].id : MOCK_VALUE_BUILDER_PROJECT.id);
    }).finally(() => {
      if (active) setLoadingProjects(false);
    });
    return () => { active = false; };
  }, [user.id]);

  const allOptions = [...projects, MOCK_VALUE_BUILDER_PROJECT];
  const selectedProject = allOptions.find((p) => p.id === selectedId) || null;
  const missingFields = getMissingFields(selectedProject);
  const canGenerate = selectedProject && missingFields.length === 0;

  const handleGenerate = async () => {
    if (!selectedProject) return;
    setGenerating(true);
    setError('');
    setResult(null);
    try {
      const asset = await generateValueAsset(selectedProject);
      setResult(asset);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos generar el microactivo.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-3xl animate-fade-in">
        <header className="mb-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.25em] text-accent-coral"><Sparkles size={16} /> SET Value Builder</div>
          <h1 className="mt-2 text-3xl font-black text-text-primary md:text-4xl">Microactivos de Reactivación</h1>
          <p className="mt-2 text-sm text-text-secondary">Convierte el conocimiento de tu proyecto en una pieza de valor de menos de 3 minutos, lista para reactivar una conversación.</p>
        </header>

        {loadingProjects ? (
          <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" /> Cargando tus proyectos...</div>
        ) : (
          <>
            {projects.length === 0 && (
              <div className="mb-5 rounded-2xl border border-accent-gold/30 bg-accent-gold/5 p-5">
                <p className="text-sm text-text-primary">Aún no tienes un proyecto con base de conocimiento cargada. Ve a "Mis Proyectos" para configurar tu nicho y oferta antes de generar microactivos.</p>
                <button onClick={() => navigate('/projects')} className="mt-3 rounded-xl bg-accent-gold px-4 py-2 text-xs font-black text-black">Ir a Mis Proyectos →</button>
              </div>
            )}

            <div className="rounded-2xl border border-border-subtle bg-bg-card p-5">
              <label className="block">
                <span className="text-xs font-bold text-text-primary">Proyecto / base de conocimiento</span>
                <select
                  value={selectedId}
                  onChange={(e) => { setSelectedId(e.target.value); setResult(null); setError(''); }}
                  className="mt-1.5 w-full rounded-xl border border-border-subtle bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-coral"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} · {p.expertName || 'Sin experto'}</option>
                  ))}
                  <option value={MOCK_VALUE_BUILDER_PROJECT.id}>🧪 Demo: {MOCK_VALUE_BUILDER_PROJECT.expertName} — {MOCK_VALUE_BUILDER_PROJECT.niche}</option>
                </select>
              </label>

              {selectedProject?.isMock && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-accent-gold/30 bg-accent-gold/5 px-3 py-2 text-xs text-accent-gold">
                  <FlaskConical size={14} /> Este es un proyecto de demostración, no pertenece a tu cuenta.
                </div>
              )}

              {missingFields.length > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-300">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  A este proyecto le falta información clave para generar un microactivo sin inventar datos: {missingFields.join(', ')}. Complétalo en Mis Proyectos.
                </div>
              )}

              {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

              <button
                onClick={handleGenerate}
                disabled={!canGenerate || generating}
                className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-accent-coral px-5 py-3 text-sm font-black text-white disabled:opacity-40"
              >
                {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {generating ? 'Generando...' : result ? 'Regenerar Microactivo' : 'Generar Microactivo de Reactivación'}
              </button>
            </div>

            {result && (
              <div className="mt-6 space-y-5">
                <article className="rounded-2xl border border-accent-coral/30 bg-bg-card p-5 md:p-6">
                  <div className="flex items-center gap-2 text-xs font-black tracking-[0.16em] text-accent-coral"><FileText size={14} /> MICROACTIVO</div>
                  <h2 className="mt-2 text-xl font-black text-text-primary">{result.titulo}</h2>
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-text-primary">{result.microactivo}</p>
                </article>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs font-black tracking-[0.16em] text-text-secondary"><MessageSquare size={14} /> MENSAJES DE ENTREGA</div>
                  <div className="space-y-3">
                    {result.mensajes.map((msg, index) => {
                      const flagged = containsBannedPhrase(msg.texto);
                      return (
                        <div key={index} className="rounded-2xl border border-border-subtle bg-bg-card p-4">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-accent-gold">Variante {index + 1} · {msg.variante}</span>
                            <CopyButton text={msg.texto} />
                          </div>
                          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text-primary">{msg.texto}</p>
                          {flagged && (
                            <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
                              <AlertTriangle size={12} /> Este mensaje podría sonar a seguimiento desesperado. Te recomendamos regenerar.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button onClick={handleGenerate} disabled={generating} className="flex items-center gap-2 text-xs font-bold text-text-secondary hover:text-text-primary disabled:opacity-40">
                  <RefreshCw size={13} /> Generar otra versión
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default ValueBuilder;
