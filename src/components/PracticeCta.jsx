import { Check, CheckCircle2, Eye, Loader2, Lock, Rocket, ShieldCheck, Sparkles } from 'lucide-react';

const TONE_TEXT = {
  action: 'text-green-400',
  done: 'text-text-secondary',
  muted: 'text-text-secondary',
};

const KIND_ICON = {
  locked: Lock,
  loading: Loader2,
  completed: CheckCircle2,
  completed_unverified: Eye,
  can_verify: ShieldCheck,
  ready: Check,
  unavailable: Lock,
};

// Bloque "Aplica lo aprendido" de cada clase: acceso al simulador y botón de
// finalización. El estado del botón lo calcula getCompletionState (el
// servidor valida igualmente el 85 % al completar). Una clase completada no
// se puede desmarcar.
const PracticeCta = ({ available = true, completion, marking = false, onGoSimulate, onMarkComplete }) => {
  const { kind, enabled, label, message, tone } = completion;
  const done = kind === 'completed' || kind === 'completed_unverified';
  const Icon = marking ? Loader2 : (done ? CheckCircle2 : (KIND_ICON[kind] || Check));

  return (
    <div className="mt-5 rounded-2xl border border-accent-coral/25 bg-accent-coral/5 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-accent-coral"><Sparkles size={13} /> Aplica lo aprendido</div>
          <p className="mt-1 text-xs text-text-secondary">
            {available ? 'Lleva esta técnica al simulador y consolida tu progreso.' : 'Se desbloquea al finalizar la sesión en vivo.'}
          </p>
        </div>
        <div className="flex flex-col gap-2 lg:flex-row">
          <button
            type="button"
            onClick={onGoSimulate}
            disabled={!available}
            className={`flex items-center justify-center gap-2 rounded-xl border border-accent-coral/40 px-4 py-3 text-xs font-bold text-accent-coral transition-colors ${available ? 'hover:bg-accent-coral/10' : 'cursor-not-allowed opacity-50'}`}
          >
            <Rocket size={14} /> Abrir en el Simulador IA
          </button>
          <button
            type="button"
            onClick={enabled && !marking ? onMarkComplete : undefined}
            disabled={!enabled || marking}
            aria-disabled={!enabled || marking}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black disabled:cursor-not-allowed ${
              done ? 'bg-bg-input text-text-primary'
                : enabled ? 'bg-accent-coral text-white hover:opacity-90'
                  : 'bg-bg-input text-text-secondary'
            }`}
          >
            <Icon size={14} className={marking || kind === 'loading' ? 'animate-spin' : ''} />
            {marking ? 'Guardando…' : label}
          </button>
        </div>
      </div>
      {message && (
        <p role="status" className={`mt-3 text-xs leading-relaxed ${TONE_TEXT[tone] || 'text-text-secondary'}`}>{message}</p>
      )}
    </div>
  );
};

export default PracticeCta;
