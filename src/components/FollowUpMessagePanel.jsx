import { useState, useEffect } from 'react';
import { X, Copy, Check, Loader2, RefreshCw, ExternalLink, ChevronRight } from 'lucide-react';
import { callClaude } from '../utils/anthropic';
import { buildFollowUpPrompt } from '../utils/prompts';
import { updateFollowUpEstado } from '../utils/followUps';
import { useNavigate } from 'react-router-dom';

const TIPO_LABELS = {
  valor:        'Aportar valor',
  angulo:       'Cambio de ángulo',
  reactivacion: 'Reactivación',
  confirmacion: 'Confirmar asistencia',
};

const CopyBtn = ({ text, label = 'Copiar' }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
      style={copied ? { backgroundColor: '#1D9E7520', borderColor: '#1D9E7540', color: '#1D9E75' } : { backgroundColor: '#C9920A15', borderColor: '#C9920A30', color: '#C9920A' }}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? '¡Copiado!' : label}
    </button>
  );
};

const FollowUpMessagePanel = ({ isOpen, onClose, followUp, lead, project, onSent }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [markedIdx, setMarkedIdx] = useState(null);

  useEffect(() => {
    if (isOpen && !result) generate();
  }, [isOpen]);

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const ultimos = (lead?.conversacion || [])
        .slice(-6)
        .map(m => `${m.role === 'setter' ? 'Setter' : lead.nombre}: ${m.content}`)
        .join('\n');

      const prompt = buildFollowUpPrompt({ project, lead, followUp, ultimos3Mensajes: ultimos });
      const res = await callClaude(
        'Eres un experto en follow-ups de appointment setting. Responde SOLO en JSON.',
        [{ role: 'user', content: prompt }]
      );
      setResult(res);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleSent = (opcion) => {
    setMarkedIdx(opcion.numero);
    updateFollowUpEstado(followUp.id, 'enviado', {
      mensaje_enviado: opcion.texto,
      opcion_elegida: opcion.numero,
      enviado_en: new Date().toISOString(),
    });
    setTimeout(() => onSent?.(), 1500);
  };

  if (!isOpen) return null;

  const vencidoText = followUp?.estado === 'vencido'
    ? `Vencido hace ${Math.round((Date.now() - new Date(followUp.programado_para)) / 3600000)}h`
    : new Date(followUp?.programado_para).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[92vh] flex flex-col bg-bg-card border border-border-subtle rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden">
        <div className="h-0.5 w-full flex-shrink-0" style={{ background: 'linear-gradient(90deg, #C9920A, #F59E0B)' }} />

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-border-subtle flex-shrink-0">
          <div>
            <h2 className="font-bold text-text-primary">💬 Seguimiento — {lead?.nombre}</h2>
            <p className="text-text-secondary text-xs mt-0.5">
              {TIPO_LABELS[followUp?.tipo_seguimiento]} ·{' '}
              <span style={{ color: followUp?.estado === 'vencido' ? '#DC2626' : '#C9920A' }}>{vencidoText}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-text-secondary hover:text-text-primary rounded-lg flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={28} className="animate-spin" style={{ color: '#C9920A' }} />
              <p className="text-text-secondary text-sm">Analizando la conversación y preparando el seguimiento...</p>
            </div>
          )}

          {error && !loading && (
            <div className="space-y-3">
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm">{error}</div>
              <button onClick={generate} className="flex items-center gap-2 text-sm text-accent-coral hover:underline">
                <RefreshCw size={14} /> Reintentar
              </button>
            </div>
          )}

          {result && !loading && (
            <>
              {/* Análisis */}
              {result.contexto_analisis && (
                <div className="bg-bg-input rounded-xl p-3">
                  <p className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-1">Análisis</p>
                  <p className="text-text-primary text-sm leading-relaxed">{result.contexto_analisis}</p>
                </div>
              )}

              {/* Opciones */}
              {result.opciones?.map(opcion => {
                const isSent = markedIdx === opcion.numero;
                return (
                  <div key={opcion.numero} className={`border rounded-2xl overflow-hidden transition-all ${isSent ? 'border-green-500/40' : 'border-border-subtle'}`}
                    style={isSent ? { backgroundColor: '#1D9E7508' } : {}}>
                    <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                          Opción {opcion.numero} — {opcion.tecnica}
                        </span>
                      </div>
                      {isSent && <span className="text-xs text-green-400 font-medium flex items-center gap-1"><Check size={12} /> Enviado</span>}
                    </div>
                    <div className="p-4 space-y-3">
                      <p className="text-text-primary text-sm leading-relaxed whitespace-pre-wrap">{opcion.texto}</p>

                      {opcion.recurso && (
                        <div className="bg-bg-input rounded-xl p-3 space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#C9920A' }}>
                            📦 {opcion.recurso.tipo === 'guia' ? 'Guía/PDF' : opcion.recurso.tipo === 'testimonio' ? 'Testimonio' : 'VSL'}
                          </p>
                          <p className="text-text-primary text-sm font-medium">{opcion.recurso.nombre}</p>
                          <p className="text-text-secondary text-xs">{opcion.recurso.razon_eleccion}</p>
                          <a href={opcion.recurso.link} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-blue-400 text-xs hover:underline truncate">
                            <ExternalLink size={10} /> {opcion.recurso.link}
                          </a>
                        </div>
                      )}

                      <p className="text-text-secondary text-xs italic">{opcion.por_que}</p>

                      <div className="flex items-center gap-2 flex-wrap">
                        <CopyBtn
                          text={opcion.recurso ? `${opcion.texto}\n\n${opcion.recurso.link}` : opcion.texto}
                          label={opcion.recurso ? 'Copiar mensaje + link' : 'Copiar mensaje'}
                        />
                        {!isSent && (
                          <button onClick={() => handleSent(opcion)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-all">
                            <Check size={12} /> Marcar como enviado
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        {result && !loading && (
          <div className="border-t border-border-subtle px-5 py-4 flex-shrink-0 space-y-2">
            <p className="text-text-secondary text-xs text-center">¿El lead respondió?</p>
            <div className="flex gap-2">
              <button onClick={() => { onClose(); navigate(`/leads-reales/${lead?.id}`); }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-green-500/30 text-green-400 text-sm font-medium hover:bg-green-500/10 transition-all">
                Sí → Abrir conversación <ChevronRight size={14} />
              </button>
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-border-subtle text-text-secondary text-sm font-medium hover:text-text-primary transition-all">
                No → Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FollowUpMessagePanel;
