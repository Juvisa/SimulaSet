import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getRealLeadById, saveRealLead } from '../utils/storage';
import { getProjectById } from '../utils/projects';
import { callClaude, callSetEngine } from '../utils/anthropic';
import { findProjectResource } from '../utils/setEngine';
import {
  buildSetEngineAnalysisPrompt,
  buildBreakTheIcePrompt,
  buildReactivacionRealPrompt,
} from '../utils/prompts';
import { ChevronLeft, Zap, Copy, Check, AlertTriangle, Loader2, ChevronUp, Clock, Edit3, X, FileText } from 'lucide-react';
import BriefingModal from '../components/BriefingModal';
import ScheduleFollowUpModal from '../components/ScheduleFollowUpModal';
import FollowUpMessagePanel from '../components/FollowUpMessagePanel';
import { getPendingFollowUpsForLead } from '../utils/followUps';

// ─── Helpers ───────────────────────────────────────────────────────────────

const ESTADO_CONFIG = {
  activo:          { label: 'Activo',          color: '#E0605E' },
  agendado:        { label: 'Agendado',         color: '#1D9E75' },
  no_show:         { label: 'No-show',          color: '#DC2626' },
  cancelado:       { label: 'Cancelado',        color: '#D97706' },
  cerrado_ganado:  { label: 'Cerrado ✓',        color: '#065F46' },
  cerrado_perdido: { label: 'Cerrado ✗',        color: '#6B7280' },
  fantasma:        { label: '👻 Fantasma',      color: '#DC2626' },
};

const TEMP_ICON = { 'Frío': '❄️', 'Tibio': '🌤️', 'Caliente': '🔥' };

const timeAgo = (ts) => {
  if (!ts) return null;
  const diff = Date.now() - new Date(ts).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'Hace menos de 1h';
  if (h < 24) return `Hace ${h}h`;
  return `Hace ${Math.floor(h / 24)}d`;
};

const formatTime = (ts) => ts ? new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '';

// ─── Copy Button ───────────────────────────────────────────────────────────

const CopyBtn = ({ text, label = 'Copiar' }) => {
  const [done, setDone] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    if (navigator.vibrate) navigator.vibrate(40);
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  };
  return (
    <button onClick={copy}
      className="flex items-center gap-1 text-xs bg-bg-input hover:bg-bg-card px-3 py-1.5 rounded-lg text-text-secondary hover:text-text-primary transition-all border border-border-subtle">
      {done ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      {done ? '¡Copiado!' : label}
    </button>
  );
};

const COMMITMENT_LABELS = {
  no_determinado: 'No determinado',
  incipiente: 'Incipiente',
  explicito: 'Explícito',
  comprometido: 'Comprometido',
};

const AI_TEMPERATURE_LABELS = {
  no_determinada: 'No determinada',
  fria: 'Fría',
  tibia: 'Tibia',
  caliente: 'Caliente',
};

const PIECE_LABELS = {
  texto: 'Texto',
  audio_guion: 'Guion para audio',
  video_guion: 'Guion para video',
  recurso: 'Recurso del Project',
};

const DecisionCard = ({ contract, project, onSend }) => {
  const { diagnostico, decision, anticipacion, estado_inferido: estado } = contract;
  const pieces = decision.respuesta?.piezas || [];
  const branches = [
    ['Si avanza', anticipacion.si_avanza],
    ['Si objeta', anticipacion.si_objeta],
    ['Si no responde', anticipacion.si_no_responde],
  ].filter(([, branch]) => branch !== null);

  const pieceText = piece => {
    if (piece.tipo !== 'recurso') return piece.contenido;
    const resource = findProjectResource(project, piece.recurso_id);
    return [resource?.nombre || resource?.name, resource?.link].filter(Boolean).join('\n');
  };

  return (
    <div className="bg-bg-primary border border-border-subtle rounded-2xl p-4 space-y-4">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-bg-card rounded-lg p-2">
          <div className="text-text-secondary">Nivel de compromiso</div>
          <div className="font-bold text-accent-gold">{COMMITMENT_LABELS[estado.nivel_compromiso]}</div>
        </div>
        <div className="bg-bg-card rounded-lg p-2">
          <div className="text-text-secondary">Temperatura IA</div>
          <div className="font-bold text-text-primary">{AI_TEMPERATURE_LABELS[estado.temperatura_ia]}</div>
        </div>
      </div>

      <section>
        <div className="text-xs font-black text-blue-400 uppercase">Situación</div>
        <p className="text-sm text-text-primary mt-1">{diagnostico.situacion.resumen}</p>
      </section>
      <section>
        <div className="text-xs font-black text-amber-400 uppercase">Emoción</div>
        <p className="text-sm text-text-primary mt-1">{diagnostico.emocion.inferencia}</p>
        <p className="text-xs text-text-secondary mt-1">Necesario para avanzar: {diagnostico.emocion.condicion_necesaria_para_avanzar}</p>
      </section>
      <section>
        <div className="text-xs font-black text-green-400 uppercase">Transición</div>
        <p className="text-sm text-text-primary mt-1">{diagnostico.transicion.microcompromiso}</p>
      </section>

      <section className="border-t border-border-subtle pt-3">
        <div className="text-xs font-black text-accent-gold uppercase">Movimiento recomendado</div>
        <div className="text-sm font-bold text-text-primary mt-1 capitalize">{decision.accion.replaceAll('_', ' ')}</div>
        <p className="text-sm text-text-secondary mt-1">{decision.objetivo}</p>
      </section>
      <section>
        <div className="text-xs font-black text-text-secondary uppercase">Estrategia</div>
        <p className="text-sm text-text-primary mt-1">{decision.estrategia}</p>
      </section>

      <section>
        <div className="text-xs font-black text-text-secondary uppercase mb-2">Qué enviar ahora</div>
        {decision.respuesta === null ? (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm font-semibold text-green-400">
            Ahora no necesitas enviar nada.
          </div>
        ) : (
          <div className="space-y-2">
            {pieces.map((piece, index) => (
              <div key={`${piece.tipo}-${index}`} className="bg-bg-card border border-border-subtle rounded-xl p-3">
                <div className="text-xs font-bold text-accent-gold mb-2">{PIECE_LABELS[piece.tipo]}</div>
                <p className="text-sm text-text-primary whitespace-pre-wrap">{pieceText(piece)}</p>
                <div className="mt-2"><CopyBtn text={pieceText(piece)} /></div>
              </div>
            ))}
            <button onClick={() => onSend(pieces)} className="w-full flex items-center justify-center gap-1 text-xs bg-accent-gold/10 hover:bg-accent-gold/20 text-accent-gold border border-accent-gold/20 px-3 py-2 rounded-lg font-medium transition-all">
              <Check size={12} /> Marcar como enviado
            </button>
          </div>
        )}
      </section>

      {decision.que_evitar.length > 0 && (
        <section>
          <div className="text-xs font-black text-red-400 uppercase mb-1">Evita</div>
          <ul className="space-y-1 text-xs text-text-secondary">
            {decision.que_evitar.map((item, index) => <li key={index}>• {item}</li>)}
          </ul>
        </section>
      )}

      {branches.length > 0 && (
        <section>
          <div className="text-xs font-black text-text-secondary uppercase mb-1">Anticipación</div>
          <div className="space-y-2">
            {branches.map(([label, branch]) => (
              <div key={label} className="text-xs bg-bg-card rounded-lg p-2">
                <span className="font-bold text-text-primary">{label}: </span>
                <span className="text-text-secondary">{branch.objetivo}</span>
                {branch.esperar_horas ? <span className="text-text-secondary"> · esperar {branch.esperar_horas}h</span> : null}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

// ─── Suggestion Card ───────────────────────────────────────────────────────

const SuggestionCard = ({ sug, onSend, disabled }) => {
  const etapaColor = { S: '#2563EB', E: '#C9920A', T: '#1D9E75' };
  const color = etapaColor[sug.etapa_set] || '#9A9A9A';

  return (
    <div className="bg-bg-primary border border-border-subtle rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-accent-gold">OPCIÓN {sug.opcion}</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{ backgroundColor: color + '20', color }}>
            {sug.etapa_set}
          </span>
        </div>
        <span className="text-xs text-text-secondary italic">{sug.tecnica || sug.angulo}</span>
      </div>

      <div className="bg-bg-card rounded-xl p-3 text-text-primary text-sm leading-relaxed border border-border-subtle">
        {sug.texto}
      </div>

      {(sug.por_que) && (
        <p className="text-text-secondary text-xs italic">{sug.por_que}</p>
      )}

      {sug.recurso_sugerido && (
        <div className="flex items-center gap-2 text-purple-400 text-xs">
          <span>📚 Entregar:</span>
          <span>{sug.recurso_sugerido}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <CopyBtn text={sug.texto} />
        <button
          onClick={() => onSend(sug)}
          disabled={disabled}
          className="flex items-center gap-1 text-xs bg-accent-gold/10 hover:bg-accent-gold/20 text-accent-gold border border-accent-gold/20 px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-40"
        >
          <Check size={12} />
          Marcar como enviado
        </button>
      </div>
    </div>
  );
};

// ─── Analysis Mini Panel ───────────────────────────────────────────────────

const AnalysisPanel = ({ analysis }) => {
  if (!analysis) return null;
  const etapaColor = { S: '#2563EB', E: '#C9920A', T: '#1D9E75', fuera_de_etapa: '#DC2626' };
  const color = etapaColor[analysis.etapa_set_detectada] || '#9A9A9A';
  return (
    <div className="bg-bg-card border rounded-xl p-3 space-y-2 mb-3" style={{ borderColor: color + '40' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-text-secondary">Etapa detectada:</span>
        <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: color + '20', color }}>
          {analysis.etapa_set_detectada}
        </span>
        <span className="text-xs text-text-secondary ml-auto">Interés: {analysis.nivel_interes}%</span>
      </div>
      {analysis.señales_detectadas?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {analysis.señales_detectadas.map((s, i) => (
            <span key={i} className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full">{s}</span>
          ))}
        </div>
      )}
      {analysis.nota_tactica && (
        <p className="text-text-secondary text-xs italic">{analysis.nota_tactica}</p>
      )}
      {analysis.alerta && (
        <div className="flex items-start gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <AlertTriangle size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <span className="text-amber-400 text-xs">{analysis.alerta}</span>
        </div>
      )}
    </div>
  );
};

// ─── Metrics Panel ────────────────────────────────────────────────────────

const MetricsPanel = ({ lead }) => {
  const m = lead.metricas || {};
  const latestV1 = [...(lead.conversacion || [])].reverse().find(message => message.analisis_ia?.version === 'set_engine_v1')?.analisis_ia;
  const inferred = latestV1?.estado_inferido;
  return (
    <div className="bg-bg-card border border-border-subtle rounded-2xl p-4 space-y-3">
      <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider">Métricas en tiempo real</h3>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Temperatura manual</span>
          <span className="font-medium text-text-primary">{TEMP_ICON[lead.temperatura]} {lead.temperatura}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Temperatura IA</span>
          <span className="font-medium text-text-primary">{AI_TEMPERATURE_LABELS[inferred?.temperatura_ia] || 'No determinada'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Compromiso</span>
          <span className="font-medium text-accent-gold">{COMMITMENT_LABELS[inferred?.nivel_compromiso] || 'No determinado'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Turnos</span>
          <span className="font-medium text-text-primary">{m.total_turnos || 0}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Último contacto</span>
          <span className="font-medium text-text-primary">{timeAgo(lead.ultimo_contacto) || 'Ninguno'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Reactivaciones</span>
          <span className="font-medium text-text-primary">{m.reactivaciones_enviadas || 0}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Break the Ice</span>
          <span className="font-medium text-text-primary">{m.apertura_generada ? 'Sí ✓' : 'No'}</span>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────

const RealLeadConversation = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { leadId } = useParams();
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);
  const suggestionSentRef = useRef(false);

  const [lead, setLead] = useState(null);
  const [project, setProject] = useState(null);
  const [leadInput, setLeadInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [currentSuggestions, setCurrentSuggestions] = useState(null);
  const [currentAnalysis, setCurrentAnalysis] = useState(null);
  const [currentDecision, setCurrentDecision] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);
  const [mode, setMode] = useState('chat'); // chat | breakice | reactivacion
  const [panelVisible, setPanelVisible] = useState(false);
  const [editingEstado, setEditingEstado] = useState(false);
  const [ghostTime, setGhostTime] = useState('24h');
  const [showGhostMenu, setShowGhostMenu] = useState(false);
  const [loading, setLoading] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [showAgendadoBanner, setShowAgendadoBanner] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [followUpPanelOpen, setFollowUpPanelOpen] = useState(false);
  const [activeFollowUp, setActiveFollowUp] = useState(null);
  const [pendingFollowUps, setPendingFollowUps] = useState([]);

  useEffect(() => {
    let active = true;
    const l = getRealLeadById(leadId);
    if (!l) { navigate('/leads-reales'); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLead(l);
    getProjectById(l.project_id).then(({ project: linkedProject }) => {
      if (active) setProject(linkedProject);
    });
    if (l.estado === 'agendado' && !l.briefing) setShowAgendadoBanner(true);
    setPendingFollowUps(getPendingFollowUpsForLead(leadId));
    return () => { active = false; };
  }, [leadId, navigate]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lead?.conversacion]);

  const persistLead = useCallback((updates) => {
    setLead(prev => {
      const updated = { ...prev, ...updates };
      saveRealLead(updated);
      return updated;
    });
  }, []);

  // ── Analyze message ──────────────────────────────────────────────────────

  const analyzeLeadMessage = async (message, leadSnapshot) => {
    if (!project) return;
    setAnalyzing(true);
    setPanelVisible(true);
    setAnalysisError(null);
    setCurrentDecision(null);
    setCurrentSuggestions(null);
    setCurrentAnalysis(null);

    const messageIndex = (leadSnapshot.conversacion || []).findIndex(entry => entry.id === message.id);
    const historialReciente = (leadSnapshot.conversacion || [])
      .slice(Math.max(0, messageIndex - 6), messageIndex)
      .map(m => ({ id: m.id, tipo: m.tipo, mensaje: m.mensaje }));
    const memoriaAnterior = [...(leadSnapshot.conversacion || [])]
      .slice(0, messageIndex)
      .reverse()
      .find(entry => entry.analisis_ia?.version === 'set_engine_v1')
      ?.analisis_ia?.memoria || null;

    try {
      const prompt = buildSetEngineAnalysisPrompt(project, leadSnapshot, historialReciente, message.mensaje, memoriaAnterior);
      const result = await callSetEngine('Eres SET Conversation Engine v1. Devuelve exclusivamente el contrato JSON solicitado.', [{ role: 'user', content: prompt }], project);

      setLead(prev => {
        const newConversacion = (prev.conversacion || []).map(entry =>
          entry.id === message.id ? { ...entry, analisis_ia: result } : entry
        );
        return saveRealLead({
          ...prev,
          conversacion: newConversacion,
          metricas: {
            ...prev.metricas,
            total_turnos: newConversacion.length,
          },
        });
      });

      setCurrentDecision(result);
      setCurrentAnalysis(null);
      setCurrentSuggestions(null);
      suggestionSentRef.current = false;
      setMode('chat');
    } catch (err) {
      setAnalysisError({ messageId: message.id, message: err.message });
    }
    setAnalyzing(false);
  };

  const handleSendDecision = (pieces) => {
    if (suggestionSentRef.current || !pieces.length) return;
    suggestionSentRef.current = true;
    const timestamp = new Date().toISOString();
    const entries = pieces.map((piece, index) => {
      const resource = piece.tipo === 'recurso' ? findProjectResource(project, piece.recurso_id) : null;
      return {
        id: crypto.randomUUID(),
        timestamp,
        turno: (lead.conversacion?.length || 0) + index + 1,
        tipo: 'setter_enviado',
        mensaje: piece.tipo === 'recurso'
          ? [resource?.nombre || resource?.name, resource?.link].filter(Boolean).join('\n')
          : piece.contenido,
        formato: piece.tipo,
        recurso_id: piece.recurso_id,
      };
    });
    const newConversacion = [...(lead.conversacion || []), ...entries];
    persistLead({
      conversacion: newConversacion,
      ultimo_contacto: timestamp,
      metricas: { ...lead.metricas, total_turnos: newConversacion.length },
    });
    setCurrentDecision(null);
    setPanelVisible(false);
  };

  const handleAnalyze = async () => {
    if (!leadInput.trim() || !project) return;

    const msgEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      turno: (lead.conversacion?.length || 0) + 1,
      tipo: 'lead',
      mensaje: leadInput.trim(),
      analisis_ia: null,
    };
    const newConversacion = [...(lead.conversacion || []), msgEntry];
    const leadWithMessage = saveRealLead({
      ...lead,
      conversacion: newConversacion,
      ultimo_contacto: new Date().toISOString(),
      metricas: { ...lead.metricas, total_turnos: newConversacion.length },
    });

    setLead(leadWithMessage);
    setLeadInput('');
    await analyzeLeadMessage(msgEntry, leadWithMessage);
  };

  // ── Send suggestion ─────────────────────────────────────────────────────

  const handleSendSuggestion = (sug, allSugs) => {
    if (suggestionSentRef.current) return;
    suggestionSentRef.current = true;
    const entries = allSugs.map(s => ({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      turno: (lead.conversacion?.length || 0) + 1,
      tipo: s.opcion === sug.opcion ? 'setter_enviado' : 'setter_sugerido_no_enviado',
      mensaje: s.texto,
      sugerencias: allSugs,
      opcion_elegida: sug.opcion,
    }));

    const newConversacion = [...(lead.conversacion || []), ...entries.filter(e => e.tipo === 'setter_enviado')];
    persistLead({
      conversacion: newConversacion,
      ultimo_contacto: new Date().toISOString(),
      estado: mode === 'reactivacion' ? 'fantasma' : lead.estado,
      alerta_fantasma: mode === 'reactivacion' ? true : lead.alerta_fantasma,
      metricas: {
        ...lead.metricas,
        total_turnos: newConversacion.length,
        reactivaciones_enviadas: mode === 'reactivacion'
          ? (lead.metricas?.reactivaciones_enviadas || 0) + 1
          : (lead.metricas?.reactivaciones_enviadas || 0),
      },
    });

    setCurrentSuggestions(null);
    setCurrentAnalysis(null);
    setPanelVisible(false);
  };

  // ── Break the Ice ───────────────────────────────────────────────────────

  const handleBreakTheIce = async () => {
    if (!project) return;
    setLoading(true);
    setMode('breakice');
    setCurrentDecision(null);
    setPanelVisible(true);
    try {
      const prompt = buildBreakTheIcePrompt(project, lead);
      const result = await callClaude('Eres un experto en appointment setting. Responde SOLO en JSON.', [{ role: 'user', content: prompt }]);
      setCurrentSuggestions(result.aperturas);
      suggestionSentRef.current = false;
      persistLead({ metricas: { ...lead.metricas, apertura_generada: true } });
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setLoading(false);
  };

  // ── Reactivation ────────────────────────────────────────────────────────

  const handleReactivacion = async () => {
    if (!project) return;
    setLoading(true);
    setMode('reactivacion');
    setCurrentDecision(null);
    setPanelVisible(true);
    const ultimos3 = (lead.conversacion || [])
      .slice(-3)
      .map(m => `${m.tipo === 'lead' ? lead.nombre : 'Setter'}: ${m.mensaje}`)
      .join('\n');
    try {
      const prompt = buildReactivacionRealPrompt(project, { ...lead, tiempo_sin_respuesta: ghostTime }, ultimos3);
      const result = await callClaude('Eres experto en reactivación de leads. Responde SOLO en JSON.', [{ role: 'user', content: prompt }]);
      setCurrentSuggestions(result.reactivaciones);
      suggestionSentRef.current = false;
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setLoading(false);
    setShowGhostMenu(false);
  };

  // ── Update estado ───────────────────────────────────────────────────────

  const handleEstadoChange = (newEstado) => {
    persistLead({ estado: newEstado, alerta_fantasma: newEstado === 'fantasma' });
    setEditingEstado(false);
    if (newEstado === 'agendado') setShowAgendadoBanner(true);
    if (newEstado === 'no_show' || newEstado === 'cancelado') {
      setTimeout(() => handleReactivacion(), 300);
    }
  };

  const buildHistorialText = () => (lead?.conversacion || [])
    .map(m => `${m.tipo === 'lead' ? lead.nombre : 'Setter'}: ${m.mensaje}`)
    .join('\n');

  const handleSaveBriefing = (briefingData) => {
    persistLead({ briefing: { generado_en: new Date().toISOString(), contenido: briefingData } });
    setShowAgendadoBanner(false);
  };

  if (!lead) return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center">
      <Loader2 size={28} className="text-accent-gold animate-spin" />
    </div>
  );

  const estadoCfg = ESTADO_CONFIG[lead.estado] || ESTADO_CONFIG.activo;
  const hasMessages = lead.conversacion?.length > 0;
  const panelTitle = mode === 'breakice' ? '🔥 Break the Ice' : mode === 'reactivacion' ? '⚡ Reactivación' : 'SET Copilot · Decisión';

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      {/* Gold top bar */}
      <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #C9920A, #F59E0B)' }} />

      {/* Header */}
      <div className="sticky top-0 z-30 bg-bg-card border-b border-border-subtle px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate('/leads-reales')} className="p-1.5 text-text-secondary hover:text-text-primary transition-colors">
            <ChevronLeft size={20} />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-text-primary">{lead.nombre}</span>
              <span className="text-sm">{TEMP_ICON[lead.temperatura]}</span>
              <span className="text-xs text-text-secondary">{lead.canal}</span>
              <span className="text-xs font-black px-2 py-0.5 rounded-full"
                style={{ backgroundColor: '#C9920A20', color: '#C9920A', border: '1px solid #C9920A40' }}>
                MODO REAL
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {/* Estado badge — editable */}
              <div className="relative">
                <button
                  onClick={() => setEditingEstado(!editingEstado)}
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: estadoCfg.color + '20', color: estadoCfg.color, border: `1px solid ${estadoCfg.color}30` }}
                >
                  {estadoCfg.label}
                  <Edit3 size={10} />
                </button>
                {editingEstado && (
                  <div className="absolute top-7 left-0 bg-bg-card border border-border-subtle rounded-xl shadow-xl z-50 overflow-hidden w-44">
                    {Object.entries(ESTADO_CONFIG).map(([k, v]) => (
                      <button key={k} onClick={() => handleEstadoChange(k)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-bg-input transition-colors"
                        style={{ color: v.color }}>
                        {v.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {lead.ultimo_contacto && (
                <span className="text-xs text-text-secondary flex items-center gap-1">
                  <Clock size={10} /> {timeAgo(lead.ultimo_contacto)}
                </span>
              )}
            </div>
          </div>

          {/* Schedule follow-up button */}
          <button
            onClick={() => setScheduleOpen(true)}
            className="relative flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition-all"
            style={{ backgroundColor: '#C9920A15', borderColor: '#C9920A40', color: '#C9920A' }}
          >
            <Clock size={12} />
            <span className="hidden sm:inline">Seguimiento</span>
            {pendingFollowUps.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-xs flex items-center justify-center font-bold" style={{ backgroundColor: pendingFollowUps.some(f => f.estado === 'vencido') ? '#DC2626' : '#C9920A', fontSize: '9px' }}>
                {pendingFollowUps.length}
              </span>
            )}
          </button>

          {/* Ghost/Reactivation button */}
          <div className="relative">
            <button
              onClick={() => setShowGhostMenu(!showGhostMenu)}
              className="flex items-center gap-1 text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition-all"
            >
              <AlertTriangle size={12} />
              Fantasma
            </button>
            {showGhostMenu && (
              <div className="absolute top-9 right-0 bg-bg-card border border-border-subtle rounded-xl shadow-xl z-50 p-3 w-56">
                <div className="text-xs text-text-secondary mb-2">Sin respuesta hace:</div>
                <div className="grid grid-cols-3 gap-1 mb-3">
                  {['2h', '6h', '24h', '2d', '3d', '1sem'].map(t => (
                    <button key={t} onClick={() => setGhostTime(t)}
                      className={`py-1.5 rounded-lg text-xs font-medium border transition-all ${ghostTime === t ? 'bg-accent-gold/20 border-accent-gold text-accent-gold' : 'bg-bg-input border-border-subtle text-text-secondary'}`}>
                      {t}
                    </button>
                  ))}
                </div>
                <button onClick={handleReactivacion}
                  className="w-full bg-red-500/10 border border-red-500/20 text-red-400 py-2 rounded-lg text-xs font-bold hover:bg-red-500/20 transition-all flex items-center justify-center gap-1">
                  <Zap size={12} /> Generar Reactivación
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex max-w-6xl mx-auto w-full">
        {/* Chat column */}
        <div className="flex-1 flex flex-col">
          {/* Dolor del lead */}
          <div className="px-4 py-2 border-b border-border-subtle">
            <div className="text-xs text-text-secondary">
              <span className="font-semibold text-accent-gold">Dolor:</span> {lead.dolor_principal}
            </div>
          </div>

          {/* Agendado banner */}
          {showAgendadoBanner && (
            <div className="mx-4 mt-3 rounded-2xl p-4 border animate-slide-up" style={{ backgroundColor: '#1A3A2A', borderColor: '#1D9E7540' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="text-green-400 font-bold text-sm mb-1">
                    ✅ ¡Cita agendada con {lead.nombre}!
                  </div>
                  <div className="text-text-secondary text-xs">El closer necesita saber todo sobre este lead.</div>
                </div>
                <button onClick={() => setShowAgendadoBanner(false)} className="text-text-secondary hover:text-text-primary flex-shrink-0">
                  <X size={14} />
                </button>
              </div>
              <button
                onClick={() => setBriefingOpen(true)}
                className="mt-3 w-full flex items-center justify-center gap-2 text-black font-bold py-2.5 rounded-xl text-sm transition-all"
                style={{ backgroundColor: '#C9920A' }}
              >
                <FileText size={15} />
                GENERAR BRIEFING PARA EL CLOSER →
              </button>
            </div>
          )}

          {/* Briefing exists shortcut */}
          {lead.briefing && !showAgendadoBanner && lead.estado === 'agendado' && (
            <div className="px-4 pt-2">
              <button
                onClick={() => setBriefingOpen(true)}
                className="w-full flex items-center justify-center gap-2 text-xs py-2 rounded-xl border transition-all"
                style={{ borderColor: '#C9920A30', color: '#C9920A', backgroundColor: '#C9920A08' }}
              >
                <FileText size={12} />
                Ver Briefing guardado
              </button>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-56 md:pb-40">
            {!hasMessages && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="text-4xl mb-3">🔥</div>
                <div className="text-text-primary font-semibold mb-2">Sin mensajes aún</div>
                <div className="text-text-secondary text-sm mb-5">Genera el primer mensaje o pega lo que te escribió el lead</div>
                <button
                  onClick={handleBreakTheIce}
                  disabled={!project || loading}
                  className="flex items-center gap-2 text-black font-bold px-6 py-3 rounded-xl transition-all disabled:opacity-40"
                  style={{ backgroundColor: '#C9920A' }}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                  Break the Ice — Primer mensaje
                </button>
              </div>
            )}

            {lead.conversacion?.map((msg) => (
              <div key={msg.id} className={`flex ${msg.tipo === 'lead' ? 'justify-start' : 'justify-end'} animate-fade-in`}>
                <div className={`max-w-xs md:max-w-sm flex flex-col ${msg.tipo === 'lead' ? 'items-start' : 'items-end'}`}>
                  <div className={`px-4 py-2.5 text-sm leading-relaxed rounded-2xl ${
                    msg.tipo === 'lead'
                      ? 'bg-[#2A2A2A] text-text-primary rounded-tl-sm border border-border-subtle'
                      : msg.tipo === 'setter_enviado'
                      ? 'text-white rounded-tr-sm'
                      : 'text-text-secondary rounded-tr-sm border-2'
                  }`}
                    style={msg.tipo === 'setter_enviado'
                      ? { backgroundColor: '#8A6200' }
                      : msg.tipo === 'setter_sugerido_no_enviado'
                      ? { borderColor: '#C9920A40', backgroundColor: 'transparent' }
                      : {}
                    }>
                    {msg.mensaje}
                  </div>
                  <div className="flex items-center gap-2 mt-1 px-1">
                    <span className="text-text-secondary text-xs">{formatTime(msg.timestamp)}</span>
                    {msg.tipo === 'setter_enviado' && (
                      <span className="text-xs" style={{ color: '#C9920A' }}>Enviado ✓</span>
                    )}
                    {msg.tipo === 'setter_sugerido_no_enviado' && (
                      <span className="text-xs text-text-secondary">No enviado</span>
                    )}
                  </div>
                  {/* S.E.T. tag below lead message */}
                  {msg.tipo === 'lead' && msg.analisis_ia && (
                    <div className="mt-1 px-1">
                      {msg.analisis_ia.version === 'set_engine_v1' ? (
                        <span className="text-xs text-text-secondary">
                          Compromiso: <span className="font-semibold text-accent-gold">{COMMITMENT_LABELS[msg.analisis_ia.estado_inferido?.nivel_compromiso] || 'No determinado'}</span>
                          {' · '}Temperatura IA: {AI_TEMPERATURE_LABELS[msg.analisis_ia.estado_inferido?.temperatura_ia] || 'No determinada'}
                        </span>
                      ) : (
                        <span className="text-xs text-text-secondary">
                          Etapa: <span className="font-semibold text-accent-gold">{msg.analisis_ia.etapa_set_detectada || '—'}</span>
                          {typeof msg.analisis_ia.nivel_interes === 'number' ? ` · Interés: ${msg.analisis_ia.nivel_interes}%` : ''}
                        </span>
                      )}
                    </div>
                  )}
                  {msg.tipo === 'lead' && analysisError?.messageId === msg.id && (
                    <div className="mt-2 px-1 text-xs text-red-400">
                      <span>No se pudo analizar: {analysisError.message}</span>
                      <button
                        onClick={() => analyzeLeadMessage(msg, lead)}
                        disabled={analyzing || !project}
                        className="ml-2 font-semibold text-accent-gold disabled:opacity-40"
                      >
                        Reintentar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input area */}
          <div className="fixed bottom-0 left-0 right-0 md:relative md:bottom-auto bg-bg-card border-t border-border-subtle px-4 py-3 z-20">
            <div className="max-w-6xl mx-auto">
              {hasMessages && (
                <button
                  onClick={handleBreakTheIce}
                  disabled={!project || loading}
                  className="w-full flex items-center justify-center gap-2 text-xs mb-2 py-2 rounded-xl border transition-all disabled:opacity-40"
                  style={{ borderColor: '#C9920A40', color: '#C9920A', backgroundColor: '#C9920A10' }}
                >
                  <Zap size={12} />
                  Break the Ice — nuevo ángulo de apertura
                </button>
              )}
              <div className="flex items-end gap-3">
                <textarea
                  ref={textareaRef}
                  value={leadInput}
                  onChange={e => setLeadInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !analyzing) { e.preventDefault(); handleAnalyze(); } }}
                  placeholder="Pega aquí lo que te escribió el lead..."
                  rows={2}
                  className="flex-1 bg-bg-input border border-border-subtle rounded-2xl px-4 py-3 text-text-primary placeholder-text-secondary text-sm resize-none transition-colors"
                  style={{ '--tw-ring-color': '#C9920A', borderColor: leadInput ? '#C9920A40' : '' }}
                />
                <button
                  onClick={() => { handleAnalyze(); setPanelVisible(true); }}
                  disabled={!leadInput.trim() || analyzing || !project}
                  className="flex-shrink-0 flex items-center gap-2 text-black font-bold px-4 py-3 rounded-2xl transition-all disabled:opacity-40"
                  style={{ backgroundColor: '#C9920A' }}
                >
                  {analyzing ? <Loader2 size={16} className="animate-spin text-black" /> : <Zap size={16} />}
                  <span className="hidden md:inline text-sm">Analizar</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop side panel */}
        <div className="hidden md:flex flex-col w-80 flex-shrink-0 p-4 gap-4">
          {/* Suggestions */}
          {(currentDecision || currentSuggestions || analyzing || loading) && (
            <div className="bg-bg-card border border-border-subtle rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle"
                style={{ borderTopColor: '#C9920A', borderTopWidth: 2 }}>
                <span className="font-bold text-text-primary text-sm">{panelTitle}</span>
                <button onClick={() => { setCurrentDecision(null); setCurrentSuggestions(null); setCurrentAnalysis(null); }} className="text-text-secondary hover:text-text-primary">
                  <X size={16} />
                </button>
              </div>
              <div className="p-4 space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto">
                {(analyzing || loading) && (
                  <div className="flex items-center gap-3 text-text-secondary text-sm">
                    <Loader2 size={16} className="animate-spin text-accent-gold" />
                    Analizando mensaje...
                  </div>
                )}
                {currentAnalysis && <AnalysisPanel analysis={currentAnalysis} />}
                {currentDecision && <DecisionCard contract={currentDecision} project={project} onSend={handleSendDecision} />}
                {currentSuggestions?.map(sug => (
                  <SuggestionCard
                    key={sug.opcion}
                    sug={sug}
                    disabled={false}
                    onSend={(s) => handleSendSuggestion(s, currentSuggestions)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Metrics */}
          <MetricsPanel lead={lead} />
        </div>
      </div>

      {/* Mobile panel drawer */}
      {panelVisible && (currentDecision || currentSuggestions || analyzing || loading) && (
        <div className="md:hidden fixed inset-x-0 bottom-24 z-40 bg-bg-card border-t-2 border-accent-gold rounded-t-2xl"
          style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          <div className="flex items-center justify-between px-4 py-3 sticky top-0 bg-bg-card border-b border-border-subtle">
            <span className="font-bold text-text-primary text-sm">{panelTitle}</span>
            <button onClick={() => setPanelVisible(false)} className="text-text-secondary">
              <X size={16} />
            </button>
          </div>
          <div className="p-4 space-y-3">
            {(analyzing || loading) && (
              <div className="flex items-center gap-3 text-text-secondary text-sm">
                <Loader2 size={16} className="animate-spin text-accent-gold" />
                Analizando...
              </div>
            )}
            {currentAnalysis && <AnalysisPanel analysis={currentAnalysis} />}
            {currentDecision && <DecisionCard contract={currentDecision} project={project} onSend={handleSendDecision} />}
            {currentSuggestions?.map(sug => (
              <SuggestionCard
                key={sug.opcion}
                sug={sug}
                disabled={false}
                onSend={(s) => handleSendSuggestion(s, currentSuggestions)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Mobile panel toggle */}
      {!panelVisible && (currentDecision || currentSuggestions) && (
        <button
          onClick={() => setPanelVisible(true)}
          className="md:hidden fixed bottom-28 right-4 z-40 w-12 h-12 rounded-full flex items-center justify-center shadow-lg font-bold text-black"
          style={{ backgroundColor: '#C9920A' }}
        >
          <ChevronUp size={18} />
        </button>
      )}

      {/* Schedule Follow-up Modal */}
      <ScheduleFollowUpModal
        isOpen={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        lead={lead}
        project={project}
        setterId={user?.id}
        onScheduled={() => { setScheduleOpen(false); setPendingFollowUps(getPendingFollowUpsForLead(leadId)); }}
      />

      {/* Follow-up Message Panel */}
      {activeFollowUp && (
        <FollowUpMessagePanel
          isOpen={followUpPanelOpen}
          onClose={() => { setFollowUpPanelOpen(false); setActiveFollowUp(null); }}
          followUp={activeFollowUp}
          lead={lead}
          project={project}
          onSent={(updatedLead) => { if (updatedLead) setLead(updatedLead); setFollowUpPanelOpen(false); setActiveFollowUp(null); setPendingFollowUps(getPendingFollowUpsForLead(leadId)); }}
        />
      )}

      {/* Briefing Modal */}
      {project && lead && (
        <BriefingModal
          isOpen={briefingOpen}
          onClose={() => setBriefingOpen(false)}
          project={project}
          lead={lead}
          historial={buildHistorialText()}
          modo="real"
          setterName={user?.name || 'Setter'}
          nivelFomo={lead.metricas?.nivel_interes_actual || 0}
          etapaMaxima={lead.metricas?.etapa_set_actual || 'S'}
          existingBriefing={lead.briefing?.contenido || null}
          onSave={handleSaveBriefing}
        />
      )}
    </div>
  );
};

export default RealLeadConversation;
