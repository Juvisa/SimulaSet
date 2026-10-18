import { useState } from 'react';
import { X, Plus, AlertTriangle, Info, Trash2 } from 'lucide-react';
import PracticeLevelBadge from '../../components/PracticeLevelBadge';
import ModeBadge from '../../components/ModeBadge';
import {
  EXPERIENCE_KINDS,
  EXPERIENCE_TRACKS,
  FUNCTION_SUGGESTIONS,
  LANGUAGE_LEVELS,
  PASSPORT_LIMITS,
  PREFERRED_ROLE_OPTIONS,
  WORK_MODE_OPTIONS,
  emptyExperience,
  parseTagInput,
} from './passportModel';
import { TIMEZONE_OPTIONS, describeTimezone, isListedTimezone } from './passportTimezone';
import { INPUT, LABEL, LAYERS } from './passportStyles';

const SUBTITLE = 'font-display text-base font-bold text-text-primary';
const HINT = 'text-xs text-text-secondary';

export const LayerTag = ({ layer }) => {
  const { label, color, icon: Icon } = LAYERS[layer];
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap"
      style={{ color, backgroundColor: color + '18', border: `1px solid ${color}40` }}>
      <Icon size={11} /> {label}
    </span>
  );
};

// Añade etiquetas sin duplicar (sin distinguir mayúsculas) y sin pasar del máximo.
const mergeTags = (values, incoming, max, maxLength) => {
  const existing = new Set(values.map(v => v.toLowerCase()));
  const merged = [...values];
  incoming.forEach((tag) => {
    const clean = tag.slice(0, maxLength);
    if (merged.length < max && !existing.has(clean.toLowerCase())) {
      merged.push(clean);
      existing.add(clean.toLowerCase());
    }
  });
  return merged;
};

// Editor de etiquetas: Enter o coma para añadir, × para quitar.
export const TagInput = ({ id, label, values, onChange, max, placeholder, error, maxLength = PASSPORT_LIMITS.tag, suggestions = [] }) => {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const incoming = parseTagInput(draft);
    if (!incoming.length) return;
    onChange(mergeTags(values, incoming, max, maxLength));
    setDraft('');
  };
  const full = values.length >= max;
  const chosen = new Set(values.map(v => v.toLowerCase()));
  const pending = suggestions.filter(s => !chosen.has(s.toLowerCase()));

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
      {!full && pending.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {pending.map(s => (
            <button key={s} type="button" onClick={() => onChange(mergeTags(values, [s], max, maxLength))}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:border-accent-coral/60 hover:text-text-primary">
              <Plus size={11} /> {s}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
};

// Selección múltiple de una lista cerrada (roles, modalidad).
const ChoiceChips = ({ legend, options, values, onChange }) => {
  const selected = new Set(values);
  const toggle = (value) => onChange(selected.has(value) ? values.filter(v => v !== value) : [...values, value]);
  return (
    <fieldset>
      <legend className={LABEL}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(o => {
          const on = selected.has(o.value);
          return (
            <button key={o.value} type="button" aria-pressed={on} onClick={() => toggle(o.value)}
              className={`rounded-xl border px-3 py-2 text-sm transition-colors ${on
                ? 'border-accent-coral bg-accent-coral/15 font-semibold text-text-primary'
                : 'border-border-subtle bg-bg-input text-text-secondary hover:text-text-primary'}`}>
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
};

const Notice = ({ tone = 'info', children }) => {
  const warn = tone === 'warn';
  const Icon = warn ? AlertTriangle : Info;
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${warn
      ? 'border-accent-gold/40 bg-accent-gold/10 text-accent-gold'
      : 'border-border-subtle bg-bg-input/60 text-text-secondary'}`}>
      <Icon size={14} className="mt-0.5 shrink-0" /> <span>{children}</span>
    </div>
  );
};

// ─── Trayectoria y experiencia (declarado) ───────────────────────────────────
export const ExperienceEditor = ({ track, experiences, onTrackChange, onExperiencesChange, errors, warnings, suggestedTrack, onboardingExperience }) => {
  const update = (index, patch) => onExperiencesChange(experiences.map((exp, i) => (i === index ? { ...exp, ...patch } : exp)));
  const remove = (index) => onExperiencesChange(experiences.filter((_, i) => i !== index));
  const canAdd = experiences.length < PASSPORT_LIMITS.experiences;
  const suggestion = !track && suggestedTrack ? EXPERIENCE_TRACKS.find(t => t.value === suggestedTrack) : null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className={SUBTITLE}>Trayectoria y experiencia</h3>
        <p className={`${HINT} mt-1`}>
          Describe solo lo que realmente hiciste. No incluyas cifras de ventas, porcentajes ni resultados que no puedas demostrar.
          Puedes actualizar tu trayectoria cuando ganes experiencia.
        </p>
      </div>

      {onboardingExperience.length > 0 && (
        <div>
          <span className={HINT}>En tu diagnóstico inicial declaraste:</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {onboardingExperience.map(item => (
              <span key={item} className="rounded-full border border-border-subtle bg-bg-input px-2.5 py-1 text-xs text-text-secondary">{item}</span>
            ))}
          </div>
        </div>
      )}

      <fieldset>
        <legend className={LABEL}>¿Qué describe mejor tu situación actual?</legend>
        <div className="grid gap-2">
          {EXPERIENCE_TRACKS.map(t => (
            <label key={t.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${track === t.value
              ? 'border-accent-coral bg-accent-coral/10 text-text-primary'
              : 'border-border-subtle bg-bg-input/60 text-text-secondary hover:text-text-primary'}`}>
              <input type="radio" name="pp-track" value={t.value} checked={track === t.value}
                onChange={() => onTrackChange(t.value)} className="mt-0.5 accent-[#E0605E]" />
              {t.label}
            </label>
          ))}
        </div>
        {suggestion && (
          <button type="button" onClick={() => onTrackChange(suggestion.value)}
            className="mt-2 text-xs font-bold text-accent-coral hover:underline">
            Según tu diagnóstico inicial: «{suggestion.label}». Usar esta opción
          </button>
        )}
        {track && (
          <button type="button" onClick={() => onTrackChange('')} className="mt-2 ml-3 text-xs text-text-secondary hover:text-text-primary">
            Quitar selección
          </button>
        )}
        {errors.experienceTrack && <p className="text-xs text-red-400 mt-1">{errors.experienceTrack}</p>}
      </fieldset>

      {track === 'en_formacion' && experiences.length === 0 && (
        <Notice>No necesitas agregar experiencias: tu entrenamiento en SimulaSET ya aparece en tu perfil como práctica registrada.</Notice>
      )}
      {warnings.map(w => <Notice key={w} tone="warn">{w}</Notice>)}

      <div className="space-y-3">
        {experiences.map((exp, index) => (
          <div key={index} className="rounded-xl border border-border-subtle bg-bg-input/40 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-text-secondary">Experiencia {index + 1}</span>
              <button type="button" onClick={() => remove(index)} aria-label={`Eliminar experiencia ${index + 1}`}
                className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-accent-coral">
                <Trash2 size={13} /> Eliminar
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label htmlFor={`pp-exp-kind-${index}`} className={LABEL}>Tipo de rol</label>
                <select id={`pp-exp-kind-${index}`} className={INPUT} value={exp.kind} onChange={(e) => update(index, { kind: e.target.value })}>
                  <option value="">Selecciona…</option>
                  {EXPERIENCE_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={`pp-exp-role-${index}`} className={LABEL}>Rol o cargo</label>
                <input id={`pp-exp-role-${index}`} className={INPUT} value={exp.role} maxLength={PASSPORT_LIMITS.experienceRole}
                  placeholder="Ej. Asesora comercial" onChange={(e) => update(index, { role: e.target.value })} />
              </div>
              <div>
                <label htmlFor={`pp-exp-context-${index}`} className={LABEL}>Contexto <span className="text-xs text-text-secondary/70">(opcional)</span></label>
                <input id={`pp-exp-context-${index}`} className={INPUT} value={exp.context} maxLength={PASSPORT_LIMITS.experienceContext}
                  placeholder="Ej. Tienda online de ropa" onChange={(e) => update(index, { context: e.target.value })} />
              </div>
              <div>
                <label htmlFor={`pp-exp-period-${index}`} className={LABEL}>Periodo <span className="text-xs text-text-secondary/70">(opcional)</span></label>
                <input id={`pp-exp-period-${index}`} className={INPUT} value={exp.period} maxLength={PASSPORT_LIMITS.experiencePeriod}
                  placeholder="Ej. 2024 · 6 meses" onChange={(e) => update(index, { period: e.target.value })} />
              </div>
            </div>
            <TagInput id={`pp-exp-functions-${index}`} label="Funciones que realizabas" values={exp.functions}
              max={PASSPORT_LIMITS.experienceFunctions} maxLength={PASSPORT_LIMITS.experienceFunction}
              placeholder="Escribe una función y pulsa Enter" suggestions={FUNCTION_SUGGESTIONS}
              onChange={(v) => update(index, { functions: v })} />
            {errors[`experience_${index}`] && <p className="text-xs text-red-400">{errors[`experience_${index}`]}</p>}
          </div>
        ))}
      </div>
      {canAdd ? (
        <button type="button" onClick={() => onExperiencesChange([...experiences, emptyExperience()])}
          className="inline-flex items-center gap-1 text-xs font-bold text-accent-coral hover:underline">
          <Plus size={13} /> Añadir experiencia
        </button>
      ) : (
        <p className={HINT}>Llegaste al máximo de {PASSPORT_LIMITS.experiences} experiencias.</p>
      )}
      {errors.experiences && <p className="text-xs text-red-400">{errors.experiences}</p>}
    </div>
  );
};

// ─── Qué oportunidad busca (declarado) ───────────────────────────────────────
export const OpportunityPreferences = ({ preferredRoles, workModes, notes, onChange, error }) => (
  <div className="space-y-4">
    <ChoiceChips legend="Roles que te interesan" options={PREFERRED_ROLE_OPTIONS} values={preferredRoles}
      onChange={(v) => onChange('preferredRoles', v)} />
    <ChoiceChips legend="Modalidad" options={WORK_MODE_OPTIONS} values={workModes}
      onChange={(v) => onChange('workModes', v)} />
    <div>
      <label htmlFor="pp-opp-notes" className={LABEL}>
        Notas sobre lo que buscas <span className="text-xs text-text-secondary/70">(opcional · {notes.length}/{PASSPORT_LIMITS.opportunityNotes})</span>
      </label>
      <textarea id="pp-opp-notes" rows={2} className={INPUT} value={notes} maxLength={PASSPORT_LIMITS.opportunityNotes}
        placeholder="Ej. Prefiero lanzamientos de infoproductos y horario de tarde."
        onChange={(e) => onChange('opportunityNotes', e.target.value)} />
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  </div>
);

// ─── Zona horaria ────────────────────────────────────────────────────────────
// Lista de zonas + "Otra". Un valor guardado que no está en la lista se
// conserva tal cual en el campo "Otra"; si no se reconoce, se avisa, pero
// nunca se cambia sin que el alumno lo haga.
const OTHER = '__other__';
export const TimezoneField = ({ value, onChange, error }) => {
  const listed = isListedTimezone(value);
  const [otherMode, setOtherMode] = useState(() => Boolean(value.trim()) && !listed);
  const showOther = otherMode || (Boolean(value.trim()) && !listed);
  const info = describeTimezone(value);

  return (
    <div>
      <label htmlFor="pp-timezone" className={LABEL}>Zona horaria</label>
      <select id="pp-timezone" className={INPUT} value={showOther ? OTHER : value}
        onChange={(e) => {
          if (e.target.value === OTHER) { setOtherMode(true); return; }
          setOtherMode(false);
          onChange(e.target.value);
        }}>
        <option value="">Selecciona…</option>
        {TIMEZONE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        <option value={OTHER}>Otra (escribirla)</option>
      </select>
      {showOther && (
        <input aria-label="Zona horaria (otra)" className={`${INPUT} mt-2`} value={value} maxLength={PASSPORT_LIMITS.timezone}
          placeholder="Ej. UTC-5 o America/Bogota" onChange={(e) => onChange(e.target.value)} />
      )}
      {info.kind === 'known' && <p className={`${HINT} mt-1`}>{info.display}</p>}
      {(info.kind === 'offset' || info.kind === 'iana') && <p className={`${HINT} mt-1`}>Se mostrará como «{info.display}».</p>}
      {info.kind === 'unknown' && (
        <div className="mt-2">
          <Notice tone="warn">
            No reconocemos «{value.trim()}» como zona horaria. Elige una de la lista o escríbela como «UTC-5» para que se muestre
            correctamente en tu perfil. No la cambiaremos por ti.
          </Notice>
        </div>
      )}
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
