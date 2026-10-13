import { useState } from 'react';
import { X, Plus, Lock } from 'lucide-react';
import PracticeLevelBadge from '../../components/PracticeLevelBadge';
import ModeBadge from '../../components/ModeBadge';
import { LANGUAGE_LEVELS, PASSPORT_LIMITS, parseTagInput } from './passportModel';
import { INPUT, LABEL, LAYERS } from './passportStyles';

export const LayerTag = ({ layer }) => {
  const { label, color, icon: Icon } = LAYERS[layer];
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap"
      style={{ color, backgroundColor: color + '18', border: `1px solid ${color}40` }}>
      <Icon size={11} /> {label}
    </span>
  );
};

// Editor de etiquetas: Enter o coma para añadir, × para quitar.
export const TagInput = ({ id, label, values, onChange, max, placeholder, error }) => {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const incoming = parseTagInput(draft);
    if (!incoming.length) return;
    const existing = new Set(values.map(v => v.toLowerCase()));
    const merged = [...values];
    incoming.forEach((tag) => {
      if (merged.length < max && !existing.has(tag.toLowerCase())) {
        merged.push(tag.slice(0, PASSPORT_LIMITS.tag));
        existing.add(tag.toLowerCase());
      }
    });
    onChange(merged);
    setDraft('');
  };
  const full = values.length >= max;

  return (
    <div>
      <label htmlFor={id} className={LABEL}>{label} <span className="text-xs text-text-secondary/70">({values.length}/{max})</span></label>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {values.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-bg-input border border-border-subtle px-2.5 py-1 text-xs text-text-primary">
              {tag}
              <button type="button" aria-label={`Quitar ${tag}`} onClick={() => onChange(values.filter(v => v !== tag))}
                className="text-text-secondary hover:text-accent-coral"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <input
        id={id}
        className={INPUT}
        value={draft}
        disabled={full}
        placeholder={full ? 'Llegaste al máximo' : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
        }}
        onBlur={commit}
      />
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
};

export const LanguagesEditor = ({ values, onChange, error }) => {
  const update = (index, patch) => onChange(values.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <div>
      <span className={LABEL}>Idiomas <span className="text-xs text-text-secondary/70">({values.length}/{PASSPORT_LIMITS.languages})</span></span>
      <div className="space-y-2">
        {values.map((item, index) => (
          <div key={index} className="flex gap-2">
            <input
              aria-label={`Idioma ${index + 1}`}
              className={INPUT}
              value={item.language}
              maxLength={PASSPORT_LIMITS.languageName}
              placeholder="Ej. Español"
              onChange={(e) => update(index, { language: e.target.value })}
            />
            <select
              aria-label={`Nivel de idioma ${index + 1}`}
              className={`${INPUT} max-w-[150px]`}
              value={item.level}
              onChange={(e) => update(index, { level: e.target.value })}
            >
              <option value="">Nivel…</option>
              {LANGUAGE_LEVELS.map(level => <option key={level.value} value={level.value}>{level.label}</option>)}
            </select>
            <button type="button" aria-label="Quitar idioma" onClick={() => onChange(values.filter((_, i) => i !== index))}
              className="px-3 rounded-xl border border-border-subtle text-text-secondary hover:text-accent-coral"><X size={14} /></button>
          </div>
        ))}
      </div>
      {values.length < PASSPORT_LIMITS.languages && (
        <button type="button" onClick={() => onChange([...values, { language: '', level: '' }])}
          className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-accent-coral hover:underline">
          <Plus size={13} /> Añadir idioma
        </button>
      )}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
};

// Entrenamiento registrado en SimulaSET — solo lectura. Todo viene de
// buildPassportEvidence (profiles.set_score + practiceLevel.js).
export const EvidencePanel = ({ evidence }) => (
  <section className="card-tactical rounded-2xl p-5 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
      <h2 className="font-display text-lg font-bold text-text-primary">Entrenamiento en SimulaSET</h2>
      <LayerTag layer="registered" />
    </div>
    <p className="text-xs text-text-secondary mb-5">
      Práctica en simulador de conversaciones de venta. Se actualiza sola con tus simulaciones puntuadas y no se puede editar.
      Es entrenamiento, no experiencia laboral.
    </p>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
      <div className="rounded-xl bg-bg-input/60 border border-border-subtle p-3">
        <div className="font-mono text-[10px] uppercase tracking-wider text-text-secondary">SET Score</div>
        <div className="mt-1 text-2xl font-black text-accent-coral tabular-nums">{evidence.setScore}<span className="text-sm text-text-secondary">/100</span></div>
      </div>
      <div className="rounded-xl bg-bg-input/60 border border-border-subtle p-3">
        <div className="font-mono text-[10px] uppercase tracking-wider text-text-secondary">Simulaciones</div>
        <div className="mt-1 text-2xl font-black text-text-primary tabular-nums">{evidence.validSimulations}</div>
      </div>
      <div className="rounded-xl bg-bg-input/60 border border-border-subtle p-3 col-span-2">
        <div className="font-mono text-[10px] uppercase tracking-wider text-text-secondary mb-1.5">Nivel de práctica</div>
        <PracticeLevelBadge validSimulations={evidence.validSimulations} size="md" />
        <div className="text-xs mt-1.5" style={{ color: evidence.practiceMinimum.met ? '#1D9E75' : '#9A9A9A' }}>
          {evidence.practiceMinimum.label}
          {!evidence.practiceMinimum.met && ` · ${evidence.practiceMinimum.validSimulations}/${evidence.practiceMinimum.required}`}
        </div>
      </div>
    </div>

    <div className="flex flex-wrap gap-2 mb-3">
      {evidence.byMode.map(({ mode, simulations }) => (
        <span key={mode} className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-input/60 px-3 py-1.5 text-xs text-text-secondary">
          <ModeBadge mode={mode} size="sm" /> {simulations} simulaci{simulations === 1 ? 'ón' : 'ones'}
        </span>
      ))}
    </div>
    <p className="text-[11px] text-text-secondary">
      El nivel mide volumen de práctica; el SET Score mide desempeño. Ninguno de los dos es una certificación.
      {evidence.progress.next && ` Te faltan ${evidence.progress.simulationsToGo} simulación${evidence.progress.simulationsToGo === 1 ? '' : 'es'} para ${evidence.progress.next.name}.`}
    </p>
  </section>
);

export const VerifiedPanel = () => (
  <section className="card-tactical rounded-2xl p-5 md:p-6 opacity-90">
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
      <h2 className="font-display text-lg font-bold text-text-primary">Credenciales verificadas</h2>
      <LayerTag layer="verified" />
    </div>
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-border-subtle p-4">
      <Lock size={18} className="text-text-secondary shrink-0 mt-0.5" />
      <p className="text-sm text-text-secondary">
        Todavía no hay credenciales verificadas. Solo Digital SET podrá emitirlas después de una evaluación formal;
        no se generan automáticamente por tu práctica ni por tu SET Score.
      </p>
    </div>
  </section>
);
