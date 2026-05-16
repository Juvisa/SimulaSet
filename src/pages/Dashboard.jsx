import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getProjects, getSessions, getAnalyses, getPendingFeedback, markFeedbackSeen, getRealLeads
} from '../utils/storage';
import Layout from '../components/Layout';
import LevelBadge from '../components/LevelBadge';
import ModeBadge from '../components/ModeBadge';
import { getLevelInfo, getProgressToNext } from '../utils/levels';
import { Play, BarChart2, Plus, MessageSquare, TrendingUp, Award, X, Users, AlertTriangle, Zap, Bell, Clock } from 'lucide-react';
import { verificarSeguimientosPendientes } from '../utils/followUpChecker';
import FollowUpMessagePanel from '../components/FollowUpMessagePanel';
import { getProjects as getAllProjs } from '../utils/storage';

const StatCard = ({ label, value, icon: Icon, color = '#E0605E' }) => (
  <div className="bg-bg-card border border-border-subtle rounded-2xl p-5">
    <div className="flex items-center justify-between mb-2">
      <span className="text-text-secondary text-xs font-medium uppercase tracking-wider">{label}</span>
      <Icon size={16} style={{ color }} />
    </div>
    <div className="text-2xl font-black text-text-primary">{value}</div>
  </div>
);

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [pendingFeedback, setPendingFeedback] = useState([]);
  const [realLeads, setRealLeads] = useState([]);
  const [followUps, setFollowUps] = useState({ vencidos: [], hoy: [], proximos: [], total_activos: 0 });
  const [openFollowUp, setOpenFollowUp] = useState(null);

  const refreshFollowUps = () => setFollowUps(verificarSeguimientosPendientes(user.id));

  useEffect(() => {
    setProjects(getProjects(user.id));
    setSessions(getSessions(user.id));
    setAnalyses(getAnalyses(user.id));
    setPendingFeedback(getPendingFeedback(user.id));
    setRealLeads(getRealLeads(user.id));
    refreshFollowUps();
    const interval = setInterval(refreshFollowUps, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user.id]);

  const levelInfo = getLevelInfo(user.level || 1);
  const progress = getProgressToNext(user);
  const avgScore = sessions.length > 0
    ? Math.round(sessions.reduce((sum, s) => {
        const avg = s.scores?.length > 0 ? s.scores.reduce((a, b) => a + b, 0) / s.scores.length * 10 : 0;
        return sum + avg;
      }, 0) / sessions.length)
    : 0;

  const leadsClosed = sessions.filter(s =>
    ['pidio_llamada', 'confirmado_con_entusiasmo', 'quiere_reagendar'].includes(s.finalState)
  ).length;

  const modeCounts = sessions.reduce((acc, s) => {
    acc[s.mode] = (acc[s.mode] || 0) + 1;
    return acc;
  }, {});
  const topMode = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  const dismissFeedback = (id) => {
    markFeedbackSeen(id);
    setPendingFeedback(prev => prev.filter(f => f.id !== id));
  };

  const allLeadsForFollowUp = realLeads;
  const allProjectsForFollowUp = getAllProjs(user.id);

  const FollowUpCard = ({ fu, urgencia }) => {
    const lead = allLeadsForFollowUp.find(l => l.id === fu.lead_id);
    const project = allProjectsForFollowUp.find(p => p.id === fu.project_id);
    const borderColor = urgencia === 'vencido' ? '#DC2626' : urgencia === 'hoy' ? '#D97706' : '#1D9E75';
    const tiempoLabel = urgencia === 'vencido'
      ? `Hace ${Math.round((Date.now() - new Date(fu.programado_para)) / 3600000)}h`
      : new Date(fu.programado_para).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    return (
      <div className="bg-bg-card border rounded-xl p-3 flex items-center justify-between gap-3" style={{ borderColor: borderColor + '40' }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {urgencia === 'vencido' && <Bell size={12} className="text-red-400 animate-bounce flex-shrink-0" />}
            <span className="text-text-primary text-sm font-medium truncate">{fu.lead_nombre}</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: borderColor + '20', color: borderColor }}>{tiempoLabel}</span>
          </div>
          {fu.nota && <p className="text-text-secondary text-xs mt-0.5 truncate">{fu.nota}</p>}
        </div>
        <button onClick={() => setOpenFollowUp({ fu, lead, project })}
          className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-black transition-all"
          style={{ backgroundColor: '#C9920A' }}>
          Generar →
        </button>
      </div>
    );
  };

  return (
    <Layout>
      {/* Seguimientos pendientes */}
      {followUps.total_activos > 0 ? (
        <div className="mb-6 bg-bg-card border border-border-subtle rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <Clock size={15} style={{ color: '#C9920A' }} />
              <span className="font-bold text-text-primary text-sm">Seguimientos Pendientes</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: '#C9920A20', color: '#C9920A' }}>{followUps.total_activos}</span>
            </div>
          </div>
          <div className="p-3 space-y-2">
            {followUps.vencidos.length > 0 && (
              <>
                <p className="text-red-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1"><Bell size={10} /> Vencidos ({followUps.vencidos.length})</p>
                {followUps.vencidos.map(fu => <FollowUpCard key={fu.id} fu={fu} urgencia="vencido" />)}
              </>
            )}
            {followUps.hoy.length > 0 && (
              <>
                <p className="text-amber-400 text-xs font-semibold uppercase tracking-wider mt-2">Hoy ({followUps.hoy.length})</p>
                {followUps.hoy.map(fu => <FollowUpCard key={fu.id} fu={fu} urgencia="hoy" />)}
              </>
            )}
            {followUps.proximos.length > 0 && (
              <p className="text-green-400 text-xs font-medium mt-1">+ {followUps.proximos.length} próximos esta semana</p>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-6 bg-bg-card border border-border-subtle rounded-2xl px-4 py-3 flex items-center gap-2 text-text-secondary text-sm">
          <Clock size={14} />
          <span>✅ Todo al día — sin seguimientos pendientes</span>
        </div>
      )}

      {/* Pending feedback */}
      {pendingFeedback.length > 0 && (
        <div className="mb-6 space-y-3">
          {pendingFeedback.map(fb => (
            <div key={fb.id} className="bg-accent-gold/10 border border-accent-gold/30 rounded-2xl p-4 flex items-start gap-3">
              <MessageSquare size={18} className="text-accent-gold flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-accent-gold text-sm font-semibold mb-1">Feedback de Jul</div>
                <div className="text-text-primary text-sm">{fb.comment}</div>
              </div>
              <button onClick={() => dismissFeedback(fb.id)} className="text-text-secondary hover:text-text-primary">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Level banner */}
      <div className="bg-bg-card border border-border-subtle rounded-2xl p-6 mb-6"
        style={{ borderColor: levelInfo.color + '30', backgroundColor: levelInfo.color + '08' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-text-secondary text-xs mb-1">Bienvenido de vuelta</div>
            <div className="text-xl font-bold text-text-primary">{user.name} 👋</div>
          </div>
          <LevelBadge level={user.level || 1} size="lg" />
        </div>

        {/* Main CTA */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => navigate('/simulate')}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: '#E0605E' }}
          >
            <Play size={18} /> INICIAR SIMULACIÓN
          </button>
          <button
            onClick={() => navigate('/leads-reales/nuevo')}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: '#C9920A20', color: '#C9920A', border: '1px solid #C9920A40' }}
          >
            <Zap size={16} /> Nuevo Lead
          </button>
        </div>
        {user.level < 5 && (
          <div>
            <div className="flex justify-between text-xs text-text-secondary mb-1.5">
              <span>Progreso al siguiente nivel</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="h-2 bg-bg-input rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${progress.percent}%`, backgroundColor: levelInfo.color }}
              />
            </div>
            <div className="text-text-secondary text-xs mt-1.5">{progress.label}</div>
          </div>
        )}
        {user.level === 5 && (
          <div className="text-center mt-2">
            <span className="text-accent-gold font-bold">🏆 Certificación S.E.T. Desbloqueada</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Simulaciones" value={sessions.length} icon={Play} color="#E0605E" />
        <StatCard label="Promedio" value={`${avgScore}/100`} icon={TrendingUp} color="#C9920A" />
        <StatCard label="Leads convertidos" value={`${leadsClosed}/${sessions.length || 0}`} icon={Award} color="#1D9E75" />
        <StatCard label="Análisis" value={analyses.length} icon={BarChart2} color="#2563EB" />
      </div>

      {/* Projects quick access */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-text-primary">Mis proyectos</h2>
          <button onClick={() => navigate('/projects')} className="text-text-secondary hover:text-accent-coral text-sm transition-colors">Ver todos</button>
        </div>
        {projects.length === 0 ? (
          <div className="bg-bg-card border border-dashed border-border-subtle rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3">📁</div>
            <div className="text-text-secondary text-sm mb-4">Crea tu primer proyecto para empezar a practicar</div>
            <button onClick={() => navigate('/projects/new')}
              className="flex items-center gap-2 bg-accent-coral text-white px-4 py-2 rounded-xl text-sm font-medium mx-auto hover:bg-accent-coral/90 transition-all">
              <Plus size={16} /> Crear proyecto
            </button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {projects.slice(0, 4).map(p => (
              <div key={p.id} className="bg-bg-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between hover:border-accent-coral/30 transition-all">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-text-primary text-sm truncate">{p.name}</div>
                  <div className="text-text-secondary text-xs mt-0.5">{p.expertName}</div>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <button
                    onClick={() => navigate('/simulate', { state: { projectId: p.id } })}
                    className="flex items-center gap-1 bg-accent-coral/10 text-accent-coral border border-accent-coral/20 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent-coral/20 transition-all"
                  >
                    <Play size={12} /> Simular
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Real Leads summary */}
      <div className="mb-6">
        <div className="h-0.5 w-full rounded-full mb-4" style={{ background: 'linear-gradient(90deg, #C9920A40, transparent)' }} />
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-text-primary">Mis Leads Reales</h2>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#C9920A20', color: '#C9920A', border: '1px solid #C9920A30' }}>
              MODO REAL
            </span>
          </div>
          <button onClick={() => navigate('/leads-reales')} className="text-text-secondary hover:text-accent-gold text-sm transition-colors">
            Ver todos
          </button>
        </div>
        {realLeads.length === 0 ? (
          <div className="bg-bg-card border border-dashed rounded-2xl p-6 text-center" style={{ borderColor: '#C9920A30' }}>
            <div className="text-3xl mb-2">👤</div>
            <div className="text-text-secondary text-sm mb-3">Registra leads reales y opera con asistencia de IA</div>
            <button onClick={() => navigate('/leads-reales/nuevo')}
              className="inline-flex items-center gap-2 text-black px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={{ backgroundColor: '#C9920A' }}>
              <Plus size={14} /> Registrar Lead Real
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {realLeads.slice(0, 3).map(lead => {
              const isFantasma = lead.estado === 'fantasma' || lead.alerta_fantasma;
              return (
                <button key={lead.id} onClick={() => navigate(`/leads-reales/${lead.id}`)}
                  className={`w-full bg-bg-card border rounded-xl p-3 flex items-center justify-between hover:border-accent-gold/30 transition-all text-left ${isFantasma ? 'border-red-500/30' : 'border-border-subtle'}`}>
                  <div className="flex items-center gap-3">
                    {isFantasma && <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />}
                    <div>
                      <div className="text-text-primary text-sm font-medium">{lead.nombre}</div>
                      <div className="text-text-secondary text-xs">{lead.canal} · {lead.origen}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ color: isFantasma ? '#DC2626' : '#C9920A', backgroundColor: isFantasma ? '#DC262615' : '#C9920A15' }}>
                      {isFantasma ? '👻 Fantasma' : lead.estado}
                    </span>
                  </div>
                </button>
              );
            })}
            <button onClick={() => navigate('/leads-reales')}
              className="w-full flex items-center justify-center gap-2 text-accent-gold border border-accent-gold/20 py-2.5 rounded-xl text-sm font-medium hover:bg-accent-gold/10 transition-all">
              <Users size={14} />
              Ver todos los leads ({realLeads.length})
            </button>
          </div>
        )}
      </div>

      {/* Recent sessions */}
      {sessions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-text-primary">Últimas sesiones</h2>
          </div>
          <div className="space-y-2">
            {sessions.slice(-5).reverse().map(s => {
              const sessionScore = s.scores?.length > 0
                ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length * 10)
                : 0;
              const scoreColor = sessionScore >= 80 ? '#1D9E75' : sessionScore >= 60 ? '#C9920A' : '#DC2626';
              return (
                <div key={s.id} className="bg-bg-card border border-border-subtle rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ModeBadge mode={s.mode} size="sm" />
                    <div>
                      <div className="text-text-primary text-sm font-medium">{s.projectName}</div>
                      <div className="text-text-secondary text-xs">{new Date(s.createdAt).toLocaleDateString('es')}</div>
                    </div>
                  </div>
                  <div className="text-sm font-bold" style={{ color: scoreColor }}>{sessionScore}/100</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CTA if no sessions */}
      {sessions.length === 0 && projects.length > 0 && (
        <div className="bg-bg-card border border-accent-coral/20 rounded-2xl p-8 text-center mt-6"
          style={{ backgroundColor: '#E0605E08' }}>
          <div className="text-4xl mb-3">🎯</div>
          <div className="text-text-primary font-semibold mb-2">¡Listo para practicar!</div>
          <div className="text-text-secondary text-sm mb-4">Inicia tu primera simulación y empieza a construir tu skill</div>
          <button onClick={() => navigate('/simulate')}
            className="flex items-center gap-2 bg-accent-coral text-white px-6 py-3 rounded-xl font-bold mx-auto hover:bg-accent-coral/90 transition-all">
            <Play size={18} /> Iniciar simulación
          </button>
        </div>
      )}

      {/* Analyzer CTA — always visible */}
      <div className="mt-6 bg-bg-card border border-border-subtle rounded-2xl p-5 flex items-center gap-4 cursor-pointer hover:border-blue-500/40 transition-all"
        onClick={() => navigate('/analyzer')}>
        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
          <MessageSquare size={22} className="text-blue-400" />
        </div>
        <div className="flex-1">
          <div className="font-bold text-text-primary text-sm">Analizar conversación real</div>
          <div className="text-text-secondary text-xs mt-0.5">Pega una conversación de tu CRM y recibe sugerencias exactas de qué decir</div>
        </div>
        <div className="text-text-secondary text-xs border border-border-subtle rounded-lg px-3 py-1.5 flex-shrink-0">
          Abrir →
        </div>
      </div>

      {openFollowUp && (
        <FollowUpMessagePanel
          isOpen={!!openFollowUp}
          onClose={() => setOpenFollowUp(null)}
          followUp={openFollowUp.fu}
          lead={openFollowUp.lead}
          project={openFollowUp.project}
          onSent={() => { setOpenFollowUp(null); refreshFollowUps(); }}
        />
      )}
    </Layout>
  );
};

export default Dashboard;
