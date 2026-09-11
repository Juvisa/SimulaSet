import { useEffect, useRef, useState } from 'react';
import { GraduationCap, X, Send, Loader2, ShieldCheck, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getMentorshipTranscripts } from '../utils/mentorship';
import { askMentorshipAssistant } from '../utils/anthropic';

const QUICK_QUESTIONS = [
  '¿Qué acuerdos hice en mi última sesión?',
  '¿Qué debo mejorar según mis mentores?',
  'Recuérdame la metodología S.E.T.',
];

const MentorshipWidget = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  const handleToggle = () => {
    if (!open && !loadedOnce) {
      setLoadedOnce(true);
      setLoadingSessions(true);
      getMentorshipTranscripts(user.id).then(({ transcripts, error: loadError }) => {
        setSessions(transcripts);
        if (loadError) setError(`No pudimos cargar tu historial de mentoría: ${loadError}`);
      }).finally(() => setLoadingSessions(false));
    }
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, asking]);

  const handleAsk = async (query) => {
    const trimmed = query.trim();
    if (!trimmed || asking) return;
    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
    setInput('');
    setAsking(true);
    setError('');
    try {
      const answer = await askMentorshipAssistant(user.id, trimmed, sessions);
      setMessages((prev) => [...prev, { role: 'assistant', text: answer }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos responder tu pregunta. Inténtalo de nuevo.');
    } finally {
      setAsking(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleAsk(input);
  };

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {open && (
        <div className="mb-3 flex h-[520px] w-[340px] max-w-[90vw] flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-card shadow-2xl">
          {/* Header */}
          <div className="shrink-0 border-b border-border-subtle p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-black text-text-primary"><GraduationCap size={16} className="text-accent-coral" /> Tu asistente</div>
                <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-black text-green-400">
                  <ShieldCheck size={10} /> Metodología del programa + tus sesiones
                </span>
              </div>
              <button onClick={() => setOpen(false)} className="text-text-secondary hover:text-text-primary"><X size={18} /></button>
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-text-secondary">
              <Info size={12} className="mt-0.5 shrink-0" />
              Solo tú puedes ver tus transcripciones de mentoría. Esta conversación no se comparte con otros alumnos.
            </p>
          </div>

          {/* Body */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {loadingSessions ? (
              <div className="flex items-center gap-2 text-xs text-text-secondary"><Loader2 size={14} className="animate-spin" /> Cargando tu historial de mentoría...</div>
            ) : (
              <>
                {sessions.length === 0 && (
                  <div className="rounded-xl border border-accent-gold/30 bg-accent-gold/5 px-3 py-2.5 text-xs leading-relaxed text-text-secondary">
                    Todavía no tienes sesiones de mentoría cargadas. Asiste a tu próxima sesión en vivo para ver aquí tu historial y acuerdos personalizados — mientras tanto puedo ayudarte con la metodología general del programa.
                  </div>
                )}

                {messages.length === 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-text-secondary">Preguntas rápidas:</p>
                    {QUICK_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => handleAsk(q)}
                        disabled={asking}
                        className="block w-full rounded-xl border border-border-subtle bg-bg-input px-3 py-2 text-left text-xs font-semibold text-text-primary hover:border-accent-coral/40 disabled:opacity-50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {messages.map((msg, index) => (
                  <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                      msg.role === 'user' ? 'bg-accent-coral text-white' : 'border border-border-subtle bg-bg-input text-text-primary'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}

                {asking && (
                  <div className="flex items-center gap-2 text-xs text-text-secondary"><Loader2 size={13} className="animate-spin" /> Pensando...</div>
                )}

                {error && <p className="text-xs text-red-400">{error}</p>}
              </>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex shrink-0 items-center gap-2 border-t border-border-subtle p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pregúntale algo a tu asistente..."
              disabled={asking}
              className="flex-1 rounded-xl border border-border-subtle bg-bg-input px-3 py-2 text-xs text-text-primary outline-none placeholder:text-text-secondary focus:border-accent-coral disabled:opacity-60"
            />
            <button type="submit" disabled={asking || !input.trim()} className="flex items-center justify-center rounded-xl bg-accent-coral p-2.5 text-white disabled:opacity-40">
              {asking ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </form>
        </div>
      )}

      <button
        onClick={handleToggle}
        className={`flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-colors ${
          open ? 'bg-bg-card border border-border-subtle text-text-primary' : 'bg-accent-coral text-white'
        }`}
        aria-label="Tu asistente de mentoría"
      >
        {open ? <X size={22} /> : <GraduationCap size={22} />}
      </button>
    </div>
  );
};

export default MentorshipWidget;
