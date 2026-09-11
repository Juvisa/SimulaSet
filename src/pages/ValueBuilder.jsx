import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, FileText, Copy, Check, Loader2, AlertTriangle, FlaskConical, MessageSquare, RefreshCw,
  Save, Trash2, ChevronDown, ChevronUp, BookMarked,
} from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { getProjects } from '../utils/projects';
import { generateValueAsset } from '../utils/anthropic';
import { saveValueAsset, getValueAssets, deleteValueAsset } from '../utils/valueAssets';
import { MOCK_VALUE_BUILDER_PROJECT } from '../data/mockValueBuilderProject';

const BANNED_PHRASES = ['¿pudiste ver mi mensaje?', '¿sigues interesado?', '¿cómo va todo?'];
const DELIVERY_PHRASES = ['te lo comparto por aquí', 'te lo dejo acá', 'te lo dejo aquí', 'te lo comparto aquí', 'aquí tienes', 'aquí te va'];

const containsBannedPhrase = (text) => BANNED_PHRASES.some((phrase) => (text || '').toLowerCase().includes(phrase));
const deliversResourceDirectly = (text) => {
  const normalized = (text || '').toLowerCase();
  return DELIVERY_PHRASES.some((phrase) => normalized.includes(phrase)) || /https?:\/\//.test(normalized);
};
const missingPermissionQuestion = (text) => !(text || '').trim().endsWith('?');

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

const formatDate = (isoString) => new Date(isoString).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

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
      {copied ? 'Copiado' : 'Copiar Guion'}
    </button>
  );
};

const DeliveryMessages = ({ mensajes }) => (
  <div className="space-y-3">
    {mensajes.map((msg, index) => {
      const desperateTone = containsBannedPhrase(msg.texto);
      const deliversDirectly = deliversResourceDirectly(msg.texto);
      const noPermissionQuestion = missingPermissionQuestion(msg.texto);
      return (
        <div key={index} className="rounded-2xl border border-border-subtle bg-bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-accent-gold">Variante {index + 1} · {msg.variante}</span>
            <CopyButton text={msg.texto} />
          </div>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text-primary">{msg.texto}</p>
          {desperateTone && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
              <AlertTriangle size={12} /> Este mensaje podría sonar a seguimiento desesperado. Te recomendamos regenerar.
            </div>
          )}
          {deliversDirectly && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
              <AlertTriangle size={12} /> Este mensaje parece entregar el recurso directamente (o incluye un link). La regla S.E.T. exige pedir permiso primero, sin adjuntar nada. Te recomendamos regenerar.
            </div>
          )}
          {noPermissionQuestion && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
              <AlertTriangle size={12} /> Este mensaje no cierra con una pregunta de permiso. Te recomendamos regenerar.
            </div>
          )}
        </div>
      );
    })}
  </div>
);

const AssetCard = ({ asset, onDelete, deleting }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="rounded-2xl border border-border-subtle bg-bg-card p-4">
      <button onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-text-primary">{asset.title || asset.content?.titulo || 'Microactivo sin título'}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-text-secondary">
            <span>{formatDate(asset.created_at)}</span>
            <span className={`rounded-full px-2 py-0.5 font-bold ${asset.status === 'approved' ? 'bg-green-500/10 text-green-400' : 'bg-accent-gold/10 text-accent-gold'}`}>
              {asset.status === 'approved' ? 'Aprobado' : 'Pendiente de aprobación'}
            </span>
          </div>
        </div>
        {expanded ? <ChevronUp size={16} className="shrink-0 text-text-secondary" /> : <ChevronDown size={16} className="shrink-0 text-text-secondary" />}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-border-subtle pt-4">
          <p className="whitespace-pre-line text-sm leading-relaxed text-text-secondary">{asset.content?.microactivo}</p>
          {Array.isArray(asset.delivery_scripts) && asset.delivery_scripts.length > 0 && (
            <DeliveryMessages mensajes={asset.delivery_scripts} />
          )}
          <button
            onClick={() => onDelete(asset.id)}
            disabled={deleting}
            className="flex items-center gap-1.5 text-xs font-bold text-red-400 hover:underline disabled:opacity-50"
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Eliminar activo
          </button>
        </div>
      )}
    </article>
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

  const [savingAsset, setSavingAsset] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [assets, setAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [deletingId, setDeletingId] = useState('');

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

  useEffect(() => {
    if (!selectedProject) return undefined;
    let active = true;
    getValueAssets({ userId: user.id, projectId: selectedProject.isMock ? null : selectedProject.id })
      .then(({ assets: loaded }) => { if (active) setAssets(loaded); })
      .finally(() => { if (active) setLoadingAssets(false); });
    return () => { active = false; };
  }, [selectedProject, user.id]);

  const selectProject = (id) => {
    setSelectedId(id);
    setResult(null);
    setError('');
    setSaveSuccess(false);
    setLoadingAssets(true);
  };

  const handleGenerate = async () => {
    if (!selectedProject) return;
    setGenerating(true);
    setError('');
    setResult(null);
    setSaveSuccess(false);
    try {
      const asset = await generateValueAsset(selectedProject);
      setResult(asset);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos generar el microactivo.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveAsset = async () => {
    if (!result || !selectedProject) return;
    setSavingAsset(true);
    setSaveSuccess(false);
    const { asset, error: saveError } = await saveValueAsset({
      userId: user.id,
      projectId: selectedProject.isMock ? null : selectedProject.id,
      title: result.titulo,
      content: { titulo: result.titulo, microactivo: result.microactivo },
      deliveryScripts: result.mensajes,
    });
    setSavingAsset(false);
    if (saveError || !asset) { setError(saveError || 'No pudimos guardar el activo.'); return; }
    setAssets((prev) => [asset, ...prev]);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 4000);
  };

  const handleDeleteAsset = async (id) => {
    setDeletingId(id);
    const { error: deleteError } = await deleteValueAsset(id);
    setDeletingId('');
    if (deleteError) { setError(deleteError); return; }
    setAssets((prev) => prev.filter((a) => a.id !== id));
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
                  onChange={(e) => selectProject(e.target.value)}
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

            {saveSuccess && (
              <div className="mt-5 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
                Guardado en tu banco de activos.
              </div>
            )}

            {result && (
              <div className="mt-6 space-y-5">
                <article className="rounded-2xl border border-accent-coral/30 bg-bg-card p-5 md:p-6">
                  <div className="flex items-center gap-2 text-xs font-black tracking-[0.16em] text-accent-coral"><FileText size={14} /> MICROACTIVO</div>
                  <h2 className="mt-2 text-xl font-black text-text-primary">{result.titulo}</h2>
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-text-primary">{result.microactivo}</p>
                </article>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs font-black tracking-[0.16em] text-text-secondary"><MessageSquare size={14} /> MENSAJES DE ENTREGA</div>
                  <DeliveryMessages mensajes={result.mensajes} />
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <button
                    onClick={handleSaveAsset}
                    disabled={savingAsset}
                    className="flex items-center justify-center gap-2 rounded-xl bg-accent-coral px-5 py-3 text-sm font-black text-white disabled:opacity-50"
                  >
                    {savingAsset ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {savingAsset ? 'Guardando...' : 'Guardar en Value Bank'}
                  </button>
                  <button onClick={handleGenerate} disabled={generating} className="flex items-center gap-2 text-xs font-bold text-text-secondary hover:text-text-primary disabled:opacity-40">
                    <RefreshCw size={13} /> Generar otra versión
                  </button>
                </div>
              </div>
            )}

            <div className="mt-8">
              <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-text-secondary"><BookMarked size={14} /> Tus Activos Guardados</div>
              {loadingAssets ? (
                <div className="flex items-center gap-2 text-sm text-text-secondary"><Loader2 size={16} className="animate-spin" /> Cargando historial...</div>
              ) : assets.length === 0 ? (
                <p className="rounded-xl border border-border-subtle bg-bg-input/40 px-4 py-3 text-sm text-text-secondary">Aún no has guardado ningún activo para este proyecto.</p>
              ) : (
                <div className="space-y-2">
                  {assets.map((asset) => (
                    <AssetCard key={asset.id} asset={asset} onDelete={handleDeleteAsset} deleting={deletingId === asset.id} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default ValueBuilder;
