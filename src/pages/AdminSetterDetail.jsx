import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getAnalyses, getAllRealLeads } from '../utils/storage';
import {
  getFeedbackForSession, getFeedbackForLead, createSessionFeedback, createLeadFeedback,
} from '../utils/adminFeedback';
import Layout from '../components/Layout';
import LevelBadge from '../components/LevelBadge';
import ModeBadge from '../components/ModeBadge';
import BriefingModal from '../components/BriefingModal';
import { ChevronLeft, Send, Play, BarChart2, ChevronDown, ChevronUp, FileText, Calendar, Loader2 } from 'lucide-react';

const AdminSetterDetail = () => {
  const { user: admin } = useAuth();
  const navigate = useNavigate();
  const { setterId } = useParams();
  const [setter, setSetter] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [expandedSession, setExpandedSession] = useState(null);
  const [feedbackMap, setFeedbackMap] = useState({});
  const [feedbackInput, setFeedbackInput] = useState({});
  const [savingFeedback, setSavingFeedback] = useState({});
  const [agendadoLeads, setAgendadoLeads] = useState([]);
  const [openBriefingLead, setOpenBriefingLead] = useState(null);
  const [briefingFeedbackInput, setBriefingFeedbackInput] = useState({});
  const [briefingFeedbackMap, setBriefingFeedbackMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      const [{ data: profile }, { data: sessionRows, error: sessionsError }] = await Promise.all([
        supabase.from('profiles').select('id, name, email, level, set_score, active').eq('id', setterId).maybeSingle(),
        supabase.from('simulator_sessions')
          .select('id, project_name, mode, average_score, final_state, created_at')
          .eq('user_id', setterId)
          .order('created_at', { ascending: false }),
      ]);
      if (!active) return;
      if (!profile) { navigate('/admin'); return; }
      setSetter(profile);
      if (sessionsError) setError(`No pudimos cargar las sesiones: ${sessionsError}`);

      const allSessions = sessionRows || [];
      setSessions(allSessions);

      const userAnalyses = getAnalyses(setterId);
      setAnalyses(userAnalyses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));

      const fbEntries = await Promise.all(allSessions.map(async (s) => {
        const { feedback } = await getFeedbackForSession(s.id);
        return [s.id, feedback];
      }));
      if (!active) return;
      setFeedbackMap(Object.fromEntries(fbEntries));

      // Nota: real_leads todavía vive en localStorage (fase 3 pendiente), por
      // eso solo ve leads si el admin los generó en su propio navegador.
      const leads = getAllRealLeads().filter(l => l.setter_id === setterId && l.estado === 'agendado' && l.briefing);
      const sortedLeads = leads.sort((a, b) => new Date(b.briefing.generado_en) - new Date(a.briefing.generado_en));
      setAgendadoLeads(sortedLeads);

      const bfEntries = await Promise.all(sortedLeads.map(async (l) => {
        const { feedback } = await getFeedbackForLead(l.id);
        return [l.id, feedback];
      }));
      if (!active) return;
      setBriefingFeedbackMap(Object.fromEntries(bfEntries));
      setLoading(false);
    };

    load();
    return () => { active = false; };
  }, [setterId, navigate]);

  const handleSendFeedback = async (sessionId) => {
    const comment = feedbackInput[sessionId]?.trim();
    if (!comment) return;
    setSavingFeedback(prev => ({ ...prev, [sessionId]: true }));
    const { feedback: fb, error: saveError } = await createSessionFeedback({ sessionId, targetUserId: setterId, adminId: admin.id, comment });
    setSavingFeedback(prev => ({ ...prev, [sessionId]: false }));
    if (saveError || !fb) { setError(saveError || 'No pudimos guardar el feedback.'); return; }
    setFeedbackMap(prev => ({ ...prev, [sessionId]: [...(prev[sessionId] || []), fb] }));
    setFeedbackInput(prev => ({ ...prev, [sessionId]: '' }));
  };

  const handleBriefingFeedback = async (leadId) => {
    const comment = briefingFeedbackInput[leadId]?.trim();
    if (!comment) return;
    const { feedback: fb, error: saveError } = await createLeadFeedback({ leadId, targetUserId: setterId, adminId: admin.id, comment });
    if (saveError || !fb) { setError(saveError || 'No pudimos guardar el feedback.'); return; }
    setBriefingFeedbackMap(prev => ({ ...prev, [leadId]: [...(prev[leadId] || []), fb] }));
    setBriefingFeedbackInput(prev => ({ ...prev, [leadId]: '' }));
  };

  if (loading || !setter) {
    return (
      <Layout>
        <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-text-secondary">
          <Loader2 size={18} className="animate-spin" /> Cargando setter...
        </div>
      </Layout>
    );
  }

  const avgScore = sessions.length > 0
    ? Math.round(sessions.reduce((sum, s) => sum + (s.average_score || 0), 0) / sessions.length)
    : 0;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        {error && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/admin')} className="p-2 hover:bg-bg-card rounded-lg text-text-secondary hover:text-text-primary transition-all">
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-accent-coral/20 flex items-center justify-center text-accent-coral font-bold text-lg">
              {setter.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-text-primary">{setter.name}</h1>
                <LevelBadge level={setter.level || 1} size="sm" />
              </div>
              <p className="text-text-secondary text-sm">{setter.email}</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="card-tactical rounded-2xl p-4 text-center">
            <div className="text-2xl font-black text-text-primary">{sessions.length}</div>
            <div className="text-text-secondary text-xs mt-1">Simulaciones</div>
          </div>
          <div className="card-tactical rounded-2xl p-4 text-center">
            <div className="text-2xl font-black" style={{ color: avgScore >= 80 ? '#1D9E75' : avgScore >= 60 ? '#C9920A' : '#DC2626' }}>
              {avgScore}/100
            </div>
            <div className="text-text-secondary text-xs mt-1">Promedio</div>
          </div>
          <div className="card-tactical rounded-2xl p-4 text-center">
            <div className="text-2xl font-black text-text-primary">{analyses.length}</div>
            <div className="text-text-secondary text-xs mt-1">Análisis</div>
          </div>
          <div className="card-tactical rounded-2xl p-4 text-center border-accent-gold/40">
            <div className="text-2xl font-black" style={{ color: '#C9920A' }}>{agendadoLeads.length}</div>
            <div className="text-text-secondary text-xs mt-1">Briefings</div>
          </div>
        </div>

        {/* Sessions */}
        <div className="mb-6">
          <h2 className="font-bold text-text-primary mb-3 flex items-center gap-2">
            <Play size={16} className="text-accent-coral" /> Simulaciones ({sessions.length})
          </h2>
          {sessions.length === 0 ? (
            <div className="card-tactical rounded-2xl p-8 text-center text-text-secondary text-sm">
              Sin simulaciones aún
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map(s => {
                const sessionScore = Math.round(s.average_score || 0);
                const isExpanded = expandedSession === s.id;
                const feedback = feedbackMap[s.id] || [];

                return (
                  <div key={s.id} className="card-tactical rounded-2xl overflow-hidden">
                    <button
                      className="w-full p-4 flex items-center justify-between hover:bg-bg-input/30 transition-colors"
                      onClick={() => setExpandedSession(isExpanded ? null : s.id)}
                    >
                      <div className="flex items-center gap-3">
                        <ModeBadge mode={s.mode} size="sm" />
                        <div className="text-left">
                          <div className="text-text-primary text-sm font-medium">{s.project_name || 'Proyecto sin nombre'}</div>
                          <div className="text-text-secondary text-xs">{new Date(s.created_at).toLocaleDateString('es')}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-bold" style={{ color: sessionScore >= 80 ? '#1D9E75' : sessionScore >= 60 ? '#C9920A' : '#DC2626' }}>
                          {sessionScore}/100
                        </div>
                        {isExpanded ? <ChevronUp size={16} className="text-text-secondary" /> : <ChevronDown size={16} className="text-text-secondary" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border-subtle p-4 space-y-4">
                        {/* Existing feedback */}
                        {feedback.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Feedback enviado</div>
                            <div className="space-y-2">
                              {feedback.map(fb => (
                                <div key={fb.id} className="bg-accent-gold/10 border border-accent-gold/20 rounded-xl p-3 text-sm text-text-primary">
                                  {fb.comment}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Leave feedback */}
                        <div>
                          <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Dejar comentario</div>
                          <div className="flex gap-2">
                            <textarea
                              value={feedbackInput[s.id] || ''}
                              onChange={e => setFeedbackInput(prev => ({ ...prev, [s.id]: e.target.value }))}
                              className="flex-1 bg-bg-input border border-border-subtle rounded-xl px-3 py-2 text-text-primary placeholder-text-secondary text-sm resize-none focus:border-accent-coral transition-colors"
                              rows={2}
                              placeholder="Escribe tu feedback para el setter..."
                            />
                            <button
                              onClick={() => handleSendFeedback(s.id)}
                              disabled={!feedbackInput[s.id]?.trim() || savingFeedback[s.id]}
                              className="flex-shrink-0 w-10 h-10 bg-accent-coral text-white rounded-xl flex items-center justify-center disabled:opacity-40 hover:bg-accent-coral/90 transition-all self-end"
                            >
                              {savingFeedback[s.id] ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Agendado leads with Briefings */}
        {agendadoLeads.length > 0 && (
          <div className="mb-6">
            <h2 className="font-bold text-text-primary mb-3 flex items-center gap-2">
              <FileText size={16} style={{ color: '#C9920A' }} />
              <span>Leads Agendados con Briefing</span>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#C9920A20', color: '#C9920A' }}>
                {agendadoLeads.length}
              </span>
            </h2>
            <div className="space-y-3">
              {agendadoLeads.map(lead => {
                const b = lead.briefing?.contenido;
                const bfFeedback = briefingFeedbackMap[lead.id] || [];
                return (
                  <div key={lead.id} className="card-tactical rounded-2xl overflow-hidden border-accent-gold/30">
                    {/* Gold top strip */}
                    <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg, #C9920A, #F59E0B)' }} />
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-text-primary font-semibold text-sm">{lead.nombre}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                              Agendado
                            </span>
                          </div>
                          <div className="text-text-secondary text-xs mt-1 flex items-center gap-2">
                            <Calendar size={10} />
                            Briefing: {new Date(lead.briefing.generado_en).toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </div>
                          {b && (
                            <div className="mt-2 text-xs text-text-secondary italic line-clamp-2">
                              🔥 {b.dolor_principal}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => setOpenBriefingLead(lead)}
                          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
                          style={{ backgroundColor: '#C9920A20', color: '#C9920A', border: '1px solid #C9920A40' }}
                        >
                          <FileText size={12} />
                          Ver Briefing
                        </button>
                      </div>

                      {/* Admin briefing feedback */}
                      {bfFeedback.length > 0 && (
                        <div className="space-y-1.5 mb-3">
                          {bfFeedback.map(fb => (
                            <div key={fb.id} className="flex items-start gap-2 bg-accent-gold/10 border border-accent-gold/20 rounded-xl px-3 py-2">
                              <span className="text-amber-400 text-xs flex-shrink-0 mt-0.5">Feedback admin:</span>
                              <span className="text-text-primary text-xs">{fb.comment}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <textarea
                          value={briefingFeedbackInput[lead.id] || ''}
                          onChange={e => setBriefingFeedbackInput(prev => ({ ...prev, [lead.id]: e.target.value }))}
                          className="flex-1 bg-bg-input border border-border-subtle rounded-xl px-3 py-2 text-text-primary placeholder-text-secondary text-xs resize-none focus:border-accent-gold transition-colors"
                          rows={2}
                          placeholder="Feedback sobre la calidad del traspaso..."
                        />
                        <button
                          onClick={() => handleBriefingFeedback(lead.id)}
                          disabled={!briefingFeedbackInput[lead.id]?.trim()}
                          className="flex-shrink-0 w-9 h-9 text-white rounded-xl flex items-center justify-center disabled:opacity-40 transition-all self-end"
                          style={{ backgroundColor: '#C9920A' }}
                        >
                          <Send size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Analyses */}
        {analyses.length > 0 && (
          <div>
            <h2 className="font-bold text-text-primary mb-3 flex items-center gap-2">
              <BarChart2 size={16} className="text-accent-coral" /> Análisis ({analyses.length})
            </h2>
            <div className="space-y-2">
              {analyses.map(a => (
                <div key={a.id} className="card-tactical rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ModeBadge mode={a.mode} size="sm" />
                    <div>
                      <div className="text-text-primary text-sm">{a.projectName}</div>
                      <div className="text-text-secondary text-xs">{new Date(a.createdAt).toLocaleDateString('es')}</div>
                    </div>
                  </div>
                  <div className="text-sm font-bold" style={{ color: '#C9920A' }}>
                    {a.result?.puntuacion_setter?.score || '—'}/100
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Briefing Modal — read-only for admin */}
      {openBriefingLead && (
        <BriefingModal
          isOpen={!!openBriefingLead}
          onClose={() => setOpenBriefingLead(null)}
          project={null}
          lead={null}
          historial=""
          modo="real"
          setterName={setter?.name}
          existingBriefing={openBriefingLead.briefing?.contenido || null}
          onSave={() => setOpenBriefingLead(null)}
        />
      )}
    </Layout>
  );
};

export default AdminSetterDetail;
