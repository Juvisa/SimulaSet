import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAllProjects } from '../utils/storage';
import { callClaude } from '../utils/anthropic';
import { buildFinalReportPrompt } from '../utils/prompts';
import Layout from '../components/Layout';
import ModeBadge from '../components/ModeBadge';
import FomoBar from '../components/FomoBar';
import LevelBadge from '../components/LevelBadge';
import { Play, BarChart2, Home, Loader2, Trophy, AlertTriangle, CheckCircle, BookOpen, FileText } from 'lucide-react';
import BriefingModal from '../components/BriefingModal';

const SimulationReport = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = location.state || {};

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [project, setProject] = useState(null);

  useEffect(() => {
    if (!session) { navigate('/dashboard'); return; }
    generateReport();
  }, []);

  const generateReport = async () => {
    setLoading(true);
    try {
      const allProjects = getAllProjects();
      const found = allProjects.find(p => p.id === session.projectId) || { expertName: 'N/A', niche: 'N/A', avatarDescription: '', commonObjections: '', resources: [], testimonials: [], promise: '', price: '' };
      setProject(found);
      const project = found;
      const prompt = buildFinalReportPrompt(
        session.mode,
        project,
        session.messages,
        session.scores,
        session.finalFomo,
        session.finalState
      );
      const result = await callClaude(
        'Eres un coach experto. Responde SOLO en JSON.',
        [{ role: 'user', content: prompt }]
      );
      setReport(result);
    } catch (err) {
      setError(err.message);
      // Fallback report
      const avg = session.scores?.length > 0
        ? Math.round(session.scores.reduce((a, b) => a + b, 0) / session.scores.length * 10)
        : 50;
      setReport({
        puntuacion_global: avg,
        resultado_sesion: session.finalState || 'Sesión completada',
        etapas_set: { S_dominada: false, E_dominada: false, T_dominada: false },
        nivel_fomo_alcanzado: session.finalFomo || 0,
        errores_criticos: [],
        que_hizo_muy_bien: ['Completaste la simulación'],
        '3_aprendizajes': ['Continúa practicando', 'Enfócate en el rapport', 'Activa el dolor del prospecto'],
        badge: 'Setter Novato',
        mensaje_motivacional: '¡Cada simulación te hace mejor setter!',
      });
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center flex-col gap-4">
        <Loader2 size={32} className="text-accent-coral animate-spin" />
        <div className="text-text-secondary text-sm">Generando reporte de tu sesión...</div>
      </div>
    );
  }

  const score = report?.puntuacion_global || 0;
  const scoreColor = score >= 80 ? '#1D9E75' : score >= 60 ? '#C9920A' : '#DC2626';

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">

        {/* Top navigation */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border-subtle text-text-secondary hover:text-text-primary hover:bg-bg-card transition-all text-sm font-medium"
          >
            <Home size={15} /> Volver al inicio
          </button>
          <button
            onClick={() => navigate('/simulate', { state: { projectId: session?.projectId } })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold transition-all hover:opacity-90"
            style={{ backgroundColor: '#E0605E' }}
          >
            <Play size={15} /> Nueva simulación
          </button>
        </div>

        <div className="text-center mb-8 animate-slide-up">
          <div className="text-6xl font-black mb-2" style={{ color: scoreColor }}>
            {score}
          </div>
          <div className="text-text-secondary text-sm mb-4">puntos sobre 100</div>
          <ModeBadge mode={session?.mode} size="md" />
          <div className="text-text-secondary text-sm mt-2">{report?.resultado_sesion}</div>
        </div>

        {/* S.E.T. stages */}
        <div className="bg-bg-card border border-border-subtle rounded-2xl p-6 mb-4">
          <h3 className="font-bold text-text-primary mb-4 flex items-center gap-2">
            <Trophy size={18} className="text-accent-gold" /> Etapas S.E.T.
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'S_dominada', label: 'S — Situación', color: '#2563EB' },
              { key: 'E_dominada', label: 'E — Emoción', color: '#C9920A' },
              { key: 'T_dominada', label: 'T — Transacción', color: '#1D9E75' },
            ].map(({ key, label, color }) => {
              const ok = report?.etapas_set?.[key];
              return (
                <div key={key} className={`rounded-xl p-4 text-center border ${ok ? 'border-opacity-50' : 'border-border-subtle opacity-50'}`}
                  style={ok ? { borderColor: color, backgroundColor: color + '10' } : {}}>
                  <div className="text-2xl mb-1">{ok ? '✅' : '⭕'}</div>
                  <div className="text-xs font-medium" style={{ color: ok ? color : '#9A9A9A' }}>{label}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* FOMO */}
        <div className="bg-bg-card border border-border-subtle rounded-2xl p-6 mb-4">
          <h3 className="font-bold text-text-primary mb-4">Nivel de FOMO alcanzado</h3>
          <FomoBar value={report?.nivel_fomo_alcanzado || 0} label="" />
        </div>

        {/* What worked */}
        {report?.que_hizo_muy_bien?.length > 0 && (
          <div className="bg-bg-card border border-border-subtle rounded-2xl p-6 mb-4">
            <h3 className="font-bold text-text-primary mb-4 flex items-center gap-2">
              <CheckCircle size={18} className="text-green-400" /> Qué hiciste muy bien
            </h3>
            <ul className="space-y-2">
              {report.que_hizo_muy_bien.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-text-primary text-sm">
                  <span className="text-green-400 mt-0.5">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Critical errors */}
        {report?.errores_criticos?.length > 0 && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 mb-4">
            <h3 className="font-bold text-red-400 mb-4 flex items-center gap-2">
              <AlertTriangle size={18} /> Errores críticos
            </h3>
            <ul className="space-y-2">
              {report.errores_criticos.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-text-primary text-sm">
                  <span className="text-red-400 mt-0.5">⚠</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 3 learnings */}
        <div className="bg-bg-card border border-border-subtle rounded-2xl p-6 mb-4">
          <h3 className="font-bold text-text-primary mb-4 flex items-center gap-2">
            <BookOpen size={18} className="text-accent-gold" /> 3 aprendizajes para la próxima sesión
          </h3>
          <div className="space-y-3">
            {report?.['3_aprendizajes']?.map((item, i) => (
              <div key={i} className="flex items-start gap-3 bg-bg-input rounded-xl p-3">
                <span className="text-accent-gold font-bold text-sm flex-shrink-0">{i + 1}</span>
                <span className="text-text-primary text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Motivational message */}
        {report?.mensaje_motivacional && (
          <div className="bg-accent-coral/10 border border-accent-coral/20 rounded-2xl p-6 mb-8 text-center">
            <div className="text-accent-coral font-medium italic">"{report.mensaje_motivacional}"</div>
          </div>
        )}

        {/* Level badge */}
        <div className="text-center mb-8">
          <LevelBadge level={user?.level || 1} size="lg" />
        </div>

        {/* Briefing CTA — only when lead reached appointment state */}
        {['pidio_llamada', 'confirmado_con_entusiasmo'].includes(session?.finalState) && project && (
          <div className="border border-dashed rounded-2xl p-5 mb-6 text-center" style={{ borderColor: '#C9920A40', backgroundColor: '#C9920A08' }}>
            <div className="text-sm text-text-secondary mb-1">¿Quieres practicar el traspaso al closer?</div>
            <div className="text-text-primary text-sm font-medium mb-4">Genera el Briefing de práctica y entrena la transición completa</div>
            <button
              onClick={() => setBriefingOpen(true)}
              className="inline-flex items-center gap-2 text-black font-bold px-5 py-2.5 rounded-xl text-sm transition-all"
              style={{ backgroundColor: '#C9920A' }}
            >
              <FileText size={15} />
              GENERAR BRIEFING DE PRÁCTICA →
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-3 gap-3 pb-6">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex flex-col items-center gap-2 bg-bg-card border border-border-subtle py-4 rounded-xl text-text-secondary hover:text-text-primary transition-all"
          >
            <Home size={20} />
            <span className="text-xs">Inicio</span>
          </button>
          <button
            onClick={() => navigate('/simulate', { state: { projectId: session?.projectId } })}
            className="flex flex-col items-center gap-2 bg-accent-coral/10 border border-accent-coral/20 py-4 rounded-xl text-accent-coral hover:bg-accent-coral/20 transition-all"
          >
            <Play size={20} />
            <span className="text-xs">Practicar</span>
          </button>
          <button
            onClick={() => navigate('/analyzer')}
            className="flex flex-col items-center gap-2 bg-bg-card border border-border-subtle py-4 rounded-xl text-text-secondary hover:text-text-primary transition-all"
          >
            <BarChart2 size={20} />
            <span className="text-xs">Analizar</span>
          </button>
        </div>
      </div>

      {/* Briefing Modal — practice mode */}
      {briefingOpen && project && session && (
        <BriefingModal
          isOpen={briefingOpen}
          onClose={() => setBriefingOpen(false)}
          project={project}
          lead={{
            nombre: session.prospectProfile?.nombre || 'Prospecto simulado',
            canal: session.prospectProfile?.canal || 'WhatsApp',
            origen: 'Simulador',
            dolor_principal: session.prospectProfile?.dolor || '',
            nivel_consciencia: 'Simulado',
            temperatura: session.prospectProfile?.temperatura || 'Tibio',
          }}
          historial={(session.messages || [])
            .map(m => `${m.role === 'setter' ? 'Setter' : 'Prospecto'}: ${m.content}`)
            .join('\n')}
          modo="simulador"
          setterName={user?.name || 'Setter'}
          nivelFomo={session.finalFomo || 0}
          etapaMaxima="T"
          existingBriefing={null}
          onSave={() => setBriefingOpen(false)}
        />
      )}
    </Layout>
  );
};

export default SimulationReport;
