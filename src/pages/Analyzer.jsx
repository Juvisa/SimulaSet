import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getProjects, saveAnalysis } from '../utils/storage';
import { callClaude } from '../utils/anthropic';
import { buildAnalyzerPrompt } from '../utils/prompts';
import Layout from '../components/Layout';
import ModeBadge from '../components/ModeBadge';
import FomoBar from '../components/FomoBar';
import { BarChart2, Upload, FileText, Loader2, Copy, Check, AlertTriangle, CheckCircle, Target, Lightbulb } from 'lucide-react';

const SELECT = "w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-text-primary text-sm focus:border-accent-coral transition-colors";
const LABEL = "block text-sm font-medium text-text-secondary mb-1.5";

const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 text-xs text-text-secondary hover:text-accent-coral transition-colors bg-bg-input px-3 py-1.5 rounded-lg mt-2">
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      {copied ? 'Copiado!' : 'Copiar'}
    </button>
  );
};

const InterestBadge = ({ level }) => {
  const colors = { 'Sí': '#1D9E75', 'Probablemente': '#2563EB', 'Dudoso': '#C9920A', 'No': '#DC2626' };
  const color = colors[level] || '#9A9A9A';
  return <span className="px-3 py-1 rounded-full text-sm font-bold" style={{ backgroundColor: color + '20', color }}>{level}</span>;
};

const EnergyBadge = ({ level }) => {
  const colors = { 'Alto': '#1D9E75', 'Medio': '#2563EB', 'Bajo': '#C9920A', 'No vale': '#DC2626' };
  const color = colors[level] || '#9A9A9A';
  return <span className="px-3 py-1 rounded-full text-sm font-bold" style={{ backgroundColor: color + '20', color }}>{level}</span>;
};

const Analyzer = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState({
    projectId: location.state?.projectId || '',
    mode: 'outbound',
    inputType: 'text',
    conversationText: '',
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setProjects(getProjects(user.id));
  }, [user.id]);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setF('inputType', 'image');
    // Convert to base64 for API
    const reader = new FileReader();
    reader.onload = (ev) => setF('imageData', ev.target.result);
    reader.readAsDataURL(file);
    setF('imageFile', file.name);
  };

  const handleAnalyze = async () => {
    if (!form.projectId) { setError('Selecciona un proyecto'); return; }
    if (!form.conversationText.trim() && !form.imageData) { setError('Pega el texto de la conversación o sube una imagen'); return; }
    setError('');
    setLoading(true);

    try {
      const project = projects.find(p => p.id === form.projectId);
      if (!project) throw new Error('Proyecto no encontrado');

      let conversationText = form.conversationText;

      // If image, extract text first
      if (form.imageData) {
        const extractResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 2000,
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: form.imageData.split(';')[0].split(':')[1],
                    data: form.imageData.split(',')[1],
                  },
                },
                {
                  type: 'text',
                  text: 'Extrae el texto de esta conversación de WhatsApp o DM. Mantén el formato original con los nombres o indicadores de quién habla. Devuelve solo el texto de la conversación.',
                },
              ],
            }],
          }),
        });
        const extractData = await extractResponse.json();
        conversationText = extractData.content[0]?.text || 'No se pudo extraer el texto';
      }

      const prompt = buildAnalyzerPrompt(project, form.mode, conversationText);
      const analysis = await callClaude('Eres un experto analizador de conversaciones de ventas. Responde SOLO en JSON.', [{ role: 'user', content: prompt }]);

      setResult(analysis);
      saveAnalysis({
        id: crypto.randomUUID(),
        userId: user.id,
        projectId: form.projectId,
        projectName: project.name,
        mode: form.mode,
        conversationText,
        result: analysis,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(`Error: ${err.message}`);
    }
    setLoading(false);
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <BarChart2 className="text-accent-coral" size={24} />
            Analizador de conversaciones
          </h1>
          <p className="text-text-secondary text-sm mt-1">Sube una captura o pega el texto de una conversación real</p>
        </div>

        {!result ? (
          <div className="space-y-5">
            {/* Config */}
            <div className="bg-bg-card border border-border-subtle rounded-2xl p-6 space-y-4">
              <div>
                <label className={LABEL}>Proyecto</label>
                {projects.length === 0 ? (
                  <div className="bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-text-secondary text-sm">
                    Sin proyectos — <button onClick={() => navigate('/projects/new')} className="text-accent-coral hover:underline">crear uno</button>
                  </div>
                ) : (
                  <select value={form.projectId} onChange={e => setF('projectId', e.target.value)} className={SELECT}>
                    <option value="">Selecciona un proyecto...</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className={LABEL}>Modo de la conversación</label>
                <div className="grid grid-cols-3 gap-3">
                  {['outbound', 'inbound', 'reactivacion'].map(m => (
                    <button key={m} type="button" onClick={() => setF('mode', m)}
                      className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${form.mode === m ? 'bg-accent-coral border-accent-coral text-white' : 'bg-bg-input border-border-subtle text-text-secondary hover:text-text-primary'}`}>
                      {m === 'outbound' ? '🔵 Outbound' : m === 'inbound' ? '🟢 Inbound' : '🔴 Reactivación'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Input */}
            <div className="bg-bg-card border border-border-subtle rounded-2xl p-6 space-y-4">
              <div className="flex gap-3">
                <button onClick={() => setF('inputType', 'text')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${form.inputType === 'text' ? 'bg-accent-coral border-accent-coral text-white' : 'bg-bg-input border-border-subtle text-text-secondary'}`}>
                  <FileText size={16} /> Pegar texto
                </button>
                <button onClick={() => setF('inputType', 'image')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${form.inputType === 'image' ? 'bg-accent-coral border-accent-coral text-white' : 'bg-bg-input border-border-subtle text-text-secondary'}`}>
                  <Upload size={16} /> Subir imagen
                </button>
              </div>

              {form.inputType === 'text' ? (
                <div>
                  <label className={LABEL}>Texto de la conversación</label>
                  <textarea
                    value={form.conversationText}
                    onChange={e => setF('conversationText', e.target.value)}
                    className="w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder-text-secondary text-sm resize-none focus:border-accent-coral transition-colors"
                    rows={10}
                    placeholder={`Pega la conversación aquí. Ejemplo:\n\nSetter: Hola! cómo estás?\nLead: Bien gracias, ¿quién eres?\nSetter: ...`}
                  />
                </div>
              ) : (
                <div>
                  <label className={LABEL}>Captura de pantalla</label>
                  <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-border-subtle rounded-xl cursor-pointer hover:border-accent-coral/50 transition-colors bg-bg-input">
                    {form.imageFile ? (
                      <div className="text-center">
                        <div className="text-green-400 text-3xl mb-2">✓</div>
                        <div className="text-text-primary text-sm font-medium">{form.imageFile}</div>
                        <div className="text-text-secondary text-xs mt-1">Imagen cargada</div>
                      </div>
                    ) : (
                      <div className="text-center">
                        <Upload size={32} className="text-text-secondary mx-auto mb-2" />
                        <div className="text-text-secondary text-sm">Haz clic para subir</div>
                        <div className="text-text-secondary text-xs mt-1">PNG, JPG, WebP</div>
                      </div>
                    )}
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  </label>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm flex items-center gap-2">
                <AlertTriangle size={16} />
                {error}
              </div>
            )}

            <button
              onClick={handleAnalyze}
              disabled={loading || !form.projectId}
              className="w-full flex items-center justify-center gap-3 bg-accent-coral text-white py-4 rounded-2xl font-bold hover:bg-accent-coral/90 transition-all disabled:opacity-40"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <BarChart2 size={20} />}
              {loading ? 'Analizando...' : 'Analizar conversación'}
            </button>
          </div>
        ) : (
          <div className="space-y-5 animate-slide-up">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-text-primary">Resultado del análisis</h2>
              <div className="flex items-center gap-2">
                <ModeBadge mode={form.mode} size="sm" />
                <button onClick={() => setResult(null)} className="text-text-secondary hover:text-text-primary text-sm border border-border-subtle px-3 py-1.5 rounded-lg transition-colors">
                  Nuevo análisis
                </button>
              </div>
            </div>

            {/* Score */}
            <div className="bg-bg-card border border-border-subtle rounded-2xl p-6 text-center">
              <div className="text-5xl font-black mb-1" style={{
                color: result.puntuacion_setter?.score >= 80 ? '#1D9E75' : result.puntuacion_setter?.score >= 60 ? '#C9920A' : '#DC2626'
              }}>
                {result.puntuacion_setter?.score || 0}
              </div>
              <div className="text-text-secondary text-sm">puntuación del setter</div>
              {result.puntuacion_setter?.nivel_set_aplicado && (
                <div className="text-text-primary text-sm mt-2">{result.puntuacion_setter.nivel_set_aplicado}</div>
              )}
            </div>

            {/* Diagnostic */}
            <div className="bg-bg-card border border-border-subtle rounded-2xl p-6">
              <h3 className="font-bold text-text-primary mb-4 flex items-center gap-2">
                <BarChart2 size={18} className="text-accent-coral" /> Diagnóstico S.E.T.
              </h3>
              <div className="flex gap-3 mb-4">
                <div className="flex-1">
                  <div className="text-xs text-text-secondary mb-2">Etapas presentes</div>
                  <div className="flex gap-1 flex-wrap">
                    {result.diagnostico?.etapas_presentes?.map(e => (
                      <span key={e} className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full font-bold">{e}</span>
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-xs text-text-secondary mb-2">Etapas ausentes</div>
                  <div className="flex gap-1 flex-wrap">
                    {result.diagnostico?.etapas_ausentes?.map(e => (
                      <span key={e} className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full font-bold">{e}</span>
                    ))}
                  </div>
                </div>
              </div>

              {result.diagnostico?.mensajes_efectivos?.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-green-400 mb-2">✅ Mensajes efectivos</div>
                  {result.diagnostico.mensajes_efectivos.map((m, i) => (
                    <div key={i} className="bg-green-500/5 border border-green-500/20 rounded-xl p-3 mb-2">
                      <div className="text-text-primary text-sm font-medium">"{m.mensaje}"</div>
                      <div className="text-text-secondary text-xs mt-1">{m.razon}</div>
                    </div>
                  ))}
                </div>
              )}

              {result.diagnostico?.mensajes_con_friccion?.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-red-400 mb-2">⚠️ Mensajes con fricción</div>
                  {result.diagnostico.mensajes_con_friccion.map((m, i) => (
                    <div key={i} className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 mb-2">
                      <div className="text-text-primary text-sm font-medium">"{m.mensaje}"</div>
                      <div className="text-text-secondary text-xs mt-1">{m.razon}</div>
                    </div>
                  ))}
                </div>
              )}

              {result.diagnostico?.oportunidades_perdidas?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-amber-400 mb-2">💡 Oportunidades perdidas</div>
                  <ul className="space-y-1">
                    {result.diagnostico.oportunidades_perdidas.map((o, i) => (
                      <li key={i} className="text-text-primary text-sm flex items-start gap-2">
                        <span className="text-amber-400">•</span> {o}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Lead prediction */}
            <div className="bg-bg-card border border-border-subtle rounded-2xl p-6">
              <h3 className="font-bold text-text-primary mb-4 flex items-center gap-2">
                <Target size={18} className="text-accent-gold" /> Predicción del lead
              </h3>
              <div className="flex items-center gap-4 mb-4">
                <div>
                  <div className="text-xs text-text-secondary mb-1">Interés genuino</div>
                  <InterestBadge level={result.prediccion_lead?.interes_genuino} />
                </div>
                <div>
                  <div className="text-xs text-text-secondary mb-1">Energía a invertir</div>
                  <EnergyBadge level={result.prediccion_lead?.energia_a_invertir} />
                </div>
              </div>
              <p className="text-text-primary text-sm mb-4">{result.prediccion_lead?.explicacion}</p>
              {result.prediccion_lead?.senales_interes?.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-green-400 mb-2">Señales de interés</div>
                  <ul className="space-y-1">
                    {result.prediccion_lead.senales_interes.map((s, i) => (
                      <li key={i} className="text-text-primary text-xs flex items-start gap-2"><span className="text-green-400">+</span>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.prediccion_lead?.senales_alerta?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-red-400 mb-2">Señales de alerta</div>
                  <ul className="space-y-1">
                    {result.prediccion_lead.senales_alerta.map((s, i) => (
                      <li key={i} className="text-text-primary text-xs flex items-start gap-2"><span className="text-red-400">!</span>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Action plan */}
            <div className="bg-bg-card border border-border-subtle rounded-2xl p-6">
              <h3 className="font-bold text-text-primary mb-4 flex items-center gap-2">
                <Lightbulb size={18} className="text-accent-coral" /> Plan de acción inmediato
              </h3>
              {result.plan_accion?.siguiente_mensaje && (
                <div className="mb-4">
                  <div className="text-xs font-semibold text-accent-coral mb-2">Siguiente mensaje a enviar</div>
                  <div className="bg-bg-input rounded-xl p-4 text-text-primary text-sm leading-relaxed">
                    {result.plan_accion.siguiente_mensaje}
                  </div>
                  <CopyButton text={result.plan_accion.siguiente_mensaje} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {result.plan_accion?.tecnica_recomendada && (
                  <div><div className="text-xs text-text-secondary mb-1">Técnica recomendada</div><div className="text-text-primary">{result.plan_accion.tecnica_recomendada}</div></div>
                )}
                {result.plan_accion?.cuando_enviar && (
                  <div><div className="text-xs text-text-secondary mb-1">Cuándo enviar</div><div className="text-text-primary">{result.plan_accion.cuando_enviar}</div></div>
                )}
                {result.plan_accion?.tipo_seguimiento && (
                  <div><div className="text-xs text-text-secondary mb-1">Tipo de seguimiento</div><div className="text-text-primary">{result.plan_accion.tipo_seguimiento}</div></div>
                )}
                {result.plan_accion?.recurso_a_entregar && (
                  <div><div className="text-xs text-text-secondary mb-1">Recurso a entregar</div><div className="text-text-primary">{result.plan_accion.recurso_a_entregar}</div></div>
                )}
              </div>
            </div>

            {/* Learnings */}
            {result.puntuacion_setter?.aprendizajes?.length > 0 && (
              <div className="bg-bg-card border border-border-subtle rounded-2xl p-6 mb-4">
                <h3 className="font-bold text-text-primary mb-4 flex items-center gap-2">
                  <CheckCircle size={18} className="text-accent-gold" /> Aprendizajes
                </h3>
                <div className="space-y-3">
                  {result.puntuacion_setter.aprendizajes.map((a, i) => (
                    <div key={i} className="flex items-start gap-3 bg-bg-input rounded-xl p-3">
                      <span className="text-accent-gold font-bold text-sm">{i + 1}</span>
                      <span className="text-text-primary text-sm">{a}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => navigate('/dashboard')}
              className="w-full bg-accent-coral text-white py-3 rounded-xl font-bold hover:bg-accent-coral/90 transition-all mb-6"
            >
              Volver al inicio
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Analyzer;
