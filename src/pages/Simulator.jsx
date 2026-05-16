import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAllProjects, saveSession, updateUserStats } from '../utils/storage';
import { callClaude, generateProspectProfile } from '../utils/anthropic';
import {
  buildOutboundSystemPrompt,
  buildInboundSystemPrompt,
  buildReactivacionSystemPrompt,
} from '../utils/prompts';
import FomoBar from '../components/FomoBar';
import ModeBadge from '../components/ModeBadge';
import { Send, ChevronDown, ChevronUp, Copy, Check, AlertTriangle, X, Loader2, Flag } from 'lucide-react';

const MODE_COLORS = { outbound: '#2563EB', inbound: '#1D9E75', reactivacion: '#DC2626' };

const buildSystemPrompt = (mode, project, prospectProfile) => {
  if (mode === 'outbound') return buildOutboundSystemPrompt(project, prospectProfile);
  if (mode === 'inbound') return buildInboundSystemPrompt(project, prospectProfile);
  return buildReactivacionSystemPrompt(project, prospectProfile);
};

const formatTime = () => {
  const d = new Date();
  return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
};

const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    if (navigator.vibrate) navigator.vibrate(50);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="flex items-center gap-1 text-xs text-text-secondary hover:text-accent-coral transition-colors mt-2 bg-bg-input px-3 py-1.5 rounded-lg">
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      {copied ? 'Copiado!' : 'Copiar mensaje'}
    </button>
  );
};

const ScoreBadge = ({ score }) => {
  const color = score >= 8 ? '#1D9E75' : score >= 5 ? '#C9920A' : '#DC2626';
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full animate-score" style={{ backgroundColor: color + '20', color }}>
      {score}/10
    </span>
  );
};

const CoachingPanel = ({ coaching, mode, visible, onToggle }) => {
  if (!coaching) return null;
  const probLabel = mode === 'reactivacion' ? 'Probabilidad reagendamiento' : 'Probabilidad asistencia';
  const prob = mode === 'reactivacion' ? coaching.probabilidad_reagendamiento : coaching.probabilidad_asistencia;

  return (
    <>
      {/* Mobile: drawer */}
      <div className={`fixed bottom-16 md:hidden left-0 right-0 z-40 bg-bg-card border-t-2 border-accent-coral rounded-t-2xl transition-transform duration-300 ${visible ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '60vh', overflowY: 'auto' }}
      >
        <button onClick={onToggle} className="w-full flex items-center justify-center gap-2 py-3 text-text-secondary text-sm border-b border-border-subtle">
          {visible ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          Coaching
          {coaching && <ScoreBadge score={coaching.puntuacion_mensaje} />}
        </button>
        <CoachingContent coaching={coaching} mode={mode} probLabel={probLabel} prob={prob} />
      </div>

      {/* Desktop: side panel */}
      <div className="hidden md:block w-80 flex-shrink-0">
        <div className="bg-bg-card border border-border-subtle rounded-2xl p-4 sticky top-4 max-h-[calc(100vh-120px)] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <span className="font-bold text-text-primary text-sm">Coaching en vivo</span>
            {coaching && <ScoreBadge score={coaching.puntuacion_mensaje} />}
          </div>
          <CoachingContent coaching={coaching} mode={mode} probLabel={probLabel} prob={prob} />
        </div>
      </div>
    </>
  );
};

const CoachingContent = ({ coaching, probLabel, prob }) => {
  if (!coaching) return <div className="p-4 text-text-secondary text-sm text-center">Envía tu primer mensaje para recibir coaching</div>;
  return (
    <div className="p-4 space-y-4">
      {coaching.alerta && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
          <span className="text-red-400 text-xs">{coaching.alerta}</span>
        </div>
      )}

      <div>
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Etapa S.E.T.</span>
        <div className="mt-1">
          <span className={`text-sm font-bold px-3 py-1 rounded-full ${
            coaching.etapa_set === 'S' ? 'bg-blue-500/20 text-blue-400' :
            coaching.etapa_set === 'E' ? 'bg-amber-500/20 text-amber-400' :
            coaching.etapa_set === 'T' ? 'bg-green-500/20 text-green-400' :
            'bg-red-500/20 text-red-400'
          }`}>
            {coaching.etapa_set === 'S' ? 'S — Situación' :
             coaching.etapa_set === 'E' ? 'E — Emoción' :
             coaching.etapa_set === 'T' ? 'T — Transacción' :
             'Fuera de etapa'}
          </span>
        </div>
      </div>

      {coaching.que_hizo_bien && (
        <div>
          <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">✅ Bien</span>
          <p className="text-text-primary text-sm mt-1">{coaching.que_hizo_bien}</p>
        </div>
      )}

      {coaching.que_mejorar && (
        <div>
          <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">⚡ Mejorar</span>
          <p className="text-text-primary text-sm mt-1">{coaching.que_mejorar}</p>
        </div>
      )}

      {coaching.mensaje_alternativo && (
        <div>
          <span className="text-xs font-semibold text-accent-coral uppercase tracking-wider">💡 Alternativa sugerida</span>
          <div className="mt-2 bg-bg-input rounded-xl p-3 text-text-primary text-sm leading-relaxed">
            {coaching.mensaje_alternativo}
          </div>
          <CopyButton text={coaching.mensaje_alternativo} />
        </div>
      )}

      {coaching.recurso_sugerido && (
        <div>
          <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">📚 Recurso a entregar</span>
          <p className="text-text-primary text-sm mt-1">{coaching.recurso_sugerido}</p>
        </div>
      )}

      <div className="space-y-3 pt-2">
        <FomoBar value={coaching.nivel_fomo} label="FOMO generado" />
        {prob !== undefined && (
          <FomoBar value={prob} label={probLabel} />
        )}
      </div>
    </div>
  );
};

const Simulator = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, config } = location.state || {};
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  const [project, setProject] = useState(null);
  const [prospectProfile, setProspectProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [lastCoaching, setLastCoaching] = useState(null);
  const [coachingVisible, setCoachingVisible] = useState(false);
  const [leadState, setLeadState] = useState('abierto');
  const [scores, setScores] = useState([]);
  const [lastFomo, setLastFomo] = useState(0);
  const [sessionId] = useState(crypto.randomUUID());
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (!mode || !config) { navigate('/simulate'); return; }
    const allProjects = getAllProjects();
    const proj = allProjects.find(p => p.id === config.projectId);
    if (!proj) { navigate('/simulate'); return; }
    setProject(proj);
    initSession(proj);
  }, []);

  const initSession = async (proj) => {
    setLoading(true);
    try {
      const profile = await generateProspectProfile(proj, mode, config);
      setProspectProfile(profile);
      const systemPrompt = buildSystemPrompt(mode, proj, { ...profile, ...config });
      // Get initial message
      const initMessages = [{ role: 'user', content: 'START_SIMULATION' }];
      const response = await callClaude(systemPrompt, initMessages);
      const prospectMsg = {
        id: crypto.randomUUID(),
        role: 'prospect',
        content: response.respuesta_prospecto,
        time: formatTime(),
      };
      setMessages([prospectMsg]);
      setLeadState(response.estado_lead);
    } catch (err) {
      console.error(err);
      setMessages([{
        id: crypto.randomUUID(),
        role: 'system',
        content: `Error iniciando simulación: ${err.message}. Verifica tu API key.`,
        time: formatTime(),
      }]);
    }
    setLoading(false);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const buildAPIMessages = (currentMessages, newSetterMessage) => {
    const history = [];
    for (const m of currentMessages) {
      if (m.role === 'prospect') {
        history.push({ role: 'assistant', content: m.content });
      } else if (m.role === 'setter') {
        history.push({ role: 'user', content: m.content });
      }
    }
    history.push({ role: 'user', content: newSetterMessage });
    return history;
  };

  const sendMessage = async () => {
    if (!input.trim() || sending || ended) return;
    const text = input.trim();
    setInput('');
    setSending(true);

    const setterMsg = {
      id: crypto.randomUUID(),
      role: 'setter',
      content: text,
      time: formatTime(),
    };
    const updatedMessages = [...messages, setterMsg];
    setMessages(updatedMessages);

    try {
      const systemPrompt = buildSystemPrompt(mode, project, { ...prospectProfile, ...config });
      const apiMessages = buildAPIMessages(messages, text);
      const response = await callClaude(systemPrompt, apiMessages);

      const prospectMsg = {
        id: crypto.randomUUID(),
        role: 'prospect',
        content: response.respuesta_prospecto,
        time: formatTime(),
        coaching: response.coaching,
      };
      setMessages(prev => [...prev, prospectMsg]);
      if (response.coaching) setLastCoaching(response.coaching);
      setLeadState(response.estado_lead);
      setScores(prev => [...prev, response.coaching?.puntuacion_mensaje || 0]);
      setLastFomo(response.coaching?.nivel_fomo || 0);
      setCoachingVisible(true);

      // Check if simulation ended naturally
      const terminalStates = ['pidio_llamada', 'cerrado', 'confirmado_con_entusiasmo', 'quiere_reagendar', 'cancelo'];
      if (terminalStates.includes(response.estado_lead)) {
        setTimeout(() => endSession(response.estado_lead, [...updatedMessages, prospectMsg]), 1500);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: `Error: ${err.message}`,
        time: formatTime(),
      }]);
    }
    setSending(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const endSession = (finalState, finalMessages) => {
    setEnded(true);
    const session = {
      id: sessionId,
      userId: user.id,
      projectId: config.projectId,
      projectName: project?.name,
      mode,
      scores,
      finalState: finalState || leadState,
      finalFomo: lastFomo,
      messages: finalMessages || messages,
      prospectProfile,
      createdAt: new Date().toISOString(),
    };
    saveSession(session);
    const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) : 0;
    updateUserStats(user.id, avg);
    navigate('/simulation-report', { state: { session } });
  };

  const modeColor = MODE_COLORS[mode] || '#E0605E';

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center flex-col gap-4">
        <Loader2 size={32} className="text-accent-coral animate-spin" />
        <div className="text-text-secondary text-sm">Generando perfil del prospecto...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-bg-primary">
      {/* Chat area */}
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-bg-card border-b border-border-subtle px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg" style={{ backgroundColor: modeColor + '20' }}>
              {prospectProfile?.nombre?.[0] || '?'}
            </div>
            <div>
              <div className="font-semibold text-text-primary text-sm">{prospectProfile?.nombre || 'Prospecto'}</div>
              <div className="text-text-secondary text-xs">{prospectProfile?.tipNegocio}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ModeBadge mode={mode} size="sm" />
            <button
              onClick={() => endSession()}
              className="flex items-center gap-1 text-text-secondary hover:text-red-400 text-xs border border-border-subtle rounded-lg px-3 py-1.5 transition-colors"
            >
              <Flag size={12} />
              Terminar
            </button>
          </div>
        </div>

        {/* Lead state indicator */}
        <div className="px-4 py-2 flex items-center gap-2 border-b border-border-subtle bg-bg-primary/50">
          <span className="text-xs text-text-secondary">Estado del lead:</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            ['pidio_llamada', 'confirmado_con_entusiasmo', 'quiere_reagendar'].includes(leadState)
              ? 'bg-green-500/20 text-green-400'
              : ['cerrado', 'cancelo'].includes(leadState)
              ? 'bg-red-500/20 text-red-400'
              : leadState === 'resistente'
              ? 'bg-orange-500/20 text-orange-400'
              : 'bg-blue-500/20 text-blue-400'
          }`}>
            {leadState?.replace('_', ' ')}
          </span>
          {scores.length > 0 && (
            <span className="text-xs text-text-secondary ml-auto">
              Promedio: {Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10}/10
            </span>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-36 md:pb-24">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'setter' ? 'justify-end' : msg.role === 'system' ? 'justify-center' : 'justify-start'} animate-fade-in`}
            >
              {msg.role === 'system' ? (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-4 py-2 rounded-xl max-w-sm text-center">
                  {msg.content}
                </div>
              ) : (
                <div className={`max-w-xs md:max-w-sm lg:max-w-md ${msg.role === 'setter' ? 'items-end' : 'items-start'} flex flex-col`}>
                  <div className={`px-4 py-2.5 text-sm leading-relaxed ${msg.role === 'setter' ? 'bubble-sent text-white' : 'bubble-received text-text-primary'}`}>
                    {msg.content}
                  </div>
                  <div className="flex items-center gap-1 mt-1 px-1">
                    <span className="text-text-secondary text-xs">{msg.time}</span>
                    {msg.role === 'setter' && <span className="text-blue-400 text-xs">✓✓</span>}
                  </div>
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div className="flex justify-start animate-fade-in">
              <div className="bubble-received px-4 py-3 flex gap-1">
                <span className="w-2 h-2 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        {!ended && (
          <div className="fixed bottom-0 left-0 right-0 md:relative md:bottom-auto bg-bg-card border-t border-border-subtle px-4 py-3" style={{ zIndex: 35 }}>
            <div className="max-w-2xl mx-auto flex items-end gap-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                }}
                placeholder="Escribe tu mensaje al prospecto..."
                rows={1}
                className="flex-1 bg-bg-input border border-border-subtle rounded-2xl px-4 py-3 text-text-primary placeholder-text-secondary text-sm resize-none focus:border-accent-coral transition-colors max-h-32 overflow-y-auto"
                style={{ minHeight: '44px' }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || sending}
                className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-full bg-accent-coral text-white disabled:opacity-40 hover:bg-accent-coral/90 transition-all"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        )}
        {ended && (
          <div className="fixed bottom-0 left-0 right-0 md:relative bg-bg-card border-t border-border-subtle px-4 py-4 text-center" style={{ zIndex: 35 }}>
            <p className="text-text-secondary text-sm">Simulación finalizada — redirigiendo al reporte...</p>
          </div>
        )}
      </div>

      {/* Coaching Panel desktop */}
      <div className="hidden md:block w-80 flex-shrink-0 p-4">
        <CoachingPanel coaching={lastCoaching} mode={mode} visible={true} onToggle={() => {}} />
      </div>

      {/* Coaching toggle mobile */}
      {lastCoaching && (
        <button
          onClick={() => setCoachingVisible(!coachingVisible)}
          className="fixed bottom-20 right-4 md:hidden z-50 bg-accent-coral text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg"
        >
          {coachingVisible ? <X size={18} /> : <ChevronUp size={18} />}
        </button>
      )}

      {/* Mobile coaching drawer */}
      <div className="md:hidden">
        <CoachingPanel coaching={lastCoaching} mode={mode} visible={coachingVisible} onToggle={() => setCoachingVisible(!coachingVisible)} />
      </div>
    </div>
  );
};

export default Simulator;
