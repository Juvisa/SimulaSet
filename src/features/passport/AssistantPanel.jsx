import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Loader2, X, RefreshCw, Check, AlertTriangle, Info } from 'lucide-react';
import { EXPERIENCE_TRACKS, FUNCTION_SUGGESTIONS, PASSPORT_LIMITS, PREFERRED_ROLE_OPTIONS } from './passportModel';
import { ASSISTANT_LIMITS, STRENGTH_OPTIONS, TONE_OPTIONS, countWords } from './assistant/assistantContract';
import {
  buildAssistantContext, getVisibleQuestions, planDraftApplication, toAnswersPayload, validateQuestionAnswers,
} from './assistant/assistantQuestions';
import { generateAssistantDraft, getAssistantQuota } from './assistant/assistantApi';
import { TagInput } from './PassportSections';
import { INPUT, LABEL } from './passportStyles';

// El panel vive dentro del <form> del Passport: Enter no debe enviarlo.
const blockEnter = (e) => { if (e.key === 'Enter') e.preventDefault(); };
const QUESTION_TITLE = 'text-sm font-semibold text-text-primary';
const HINT = 'text-xs text-text-secondary';

const Chips = ({ options, values, onChange, max }) => {
  const selected = new Set(values);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => {
        const on = selected.has(o.value);
        const blocked = !on && max && values.length >= max;
        return (
          <button key={o.value} type="button" aria-pressed={on} disabled={blocked}
            onClick={() => onChange(on ? values.filter(v => v !== o.value) : [...values, o.value])}
            className={`rounded-xl border px-3 py-2 text-sm transition-colors disabled:opacity-40 ${on
              ? 'border-accent-coral bg-accent-coral/15 font-semibold text-text-primary'
              : 'border-border-subtle bg-bg-input text-text-secondary hover:text-text-primary'}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
};

const QuotaLine = ({ quota }) => (quota ? (
  <span className={HINT}>Te quedan <b className="text-text-primary">{quota.remaining}</b> de 3 propuestas hoy.</span>
) : null);

// Asistente: preguntas → propuesta → aprobación explícita. Nunca guarda nada:
// "Usar" solo copia al formulario; persistir sigue siendo el botón Guardar.
const AssistantPanel = ({ savedForm, currentForm, suggestedTrack, commercialProfile, onApply, onClose }) => {
  const ctx = useMemo(() => buildAssistantContext({ savedForm, suggestedTrack, commercialProfile }), [savedForm, suggestedTrack, commercialProfile]);
  const [answers, setAnswers] = useState(ctx.defaults);
  const [step, setStep] = useState('questions'); // questions | generating | preview
  const [quota, setQuota] = useState(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null);
  const [selection, setSelection] = useState({ headline: true, summary: true });
  const [confirmReplace, setConfirmReplace] = useState(null);

  useEffect(() => {
    let active = true;
    getAssistantQuota().then((r) => {
      if (!active) return;
      if (r.ok) setQuota(r.quota);
      else setError(r.message);
    });
    return () => { active = false; };
  }, []);

  const visible = getVisibleQuestions(answers, ctx);
  const set = (field, value) => setAnswers(a => ({ ...a, [field]: value }));
  const noQuota = quota && (quota.remaining === 0 || quota.attemptsLeft === 0);

  const generate = async () => {
    const problem = validateQuestionAnswers(answers, visible);
    if (problem) { setError(problem); return; }
    setError('');
    setConfirmReplace(null);
    setStep('generating');
    const r = await generateAssistantDraft(toAnswersPayload(answers, visible));
    if (r.quota) setQuota(r.quota);
    if (!r.ok) {
      setError(r.message);
      setStep(draft ? 'preview' : 'questions');
      return;
    }
    setDraft({ headline: r.draft.headline, summary: r.draft.summary });
    setSelection({ headline: true, summary: true });
    setStep('preview');
  };

  const apply = (confirmed) => {
    const plan = planDraftApplication({ current: currentForm, draft, selection });
    if (!Object.keys(plan.changes).length) { setError('Selecciona al menos un texto distinto del actual.'); return; }
    if (plan.replacements.length && !confirmed) { setConfirmReplace(plan.replacements); return; }
    onApply(plan.changes);
  };

  return (
    <section aria-label="Asistente de perfil con IA" className="rounded-2xl border border-accent-coral/30 bg-accent-coral/5 p-4 md:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="inline-flex items-center gap-2 font-display text-base font-bold text-text-primary"><Sparkles size={16} className="text-accent-coral" /> Crear mi perfil con IA</h3>
          <p className={`${HINT} mt-1`}>
            Te proponemos un titular y un resumen a partir de lo que declaraste. La IA no inventa experiencia, cifras ni certificaciones,
            y tu práctica en SimulaSET se presenta como entrenamiento. Tú revisas y decides qué usar.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar asistente" className="text-text-secondary hover:text-text-primary"><X size={18} /></button>
      </div>

      {step !== 'preview' && (
        <div className="space-y-5">
          <div>
            <p className={QUESTION_TITLE}>¿Qué describe mejor tu situación?</p>
            <div className="mt-2 grid gap-2">
              {EXPERIENCE_TRACKS.map(t => (
                <label key={t.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${answers.track === t.value
                  ? 'border-accent-coral bg-accent-coral/10 text-text-primary' : 'border-border-subtle bg-bg-input/60 text-text-secondary'}`}>
                  <input type="radio" name="pa-track" checked={answers.track === t.value} onChange={() => set('track', t.value)} className="mt-0.5 accent-[#E0605E]" />
                  {t.label}
                </label>
              ))}
            </div>
            {ctx.savedTrack && answers.track !== ctx.savedTrack && (
              <p className={`${HINT} mt-1`}>Es distinta de la que tienes guardada. Esto solo afecta a la propuesta; tu perfil no cambia.</p>
            )}
          </div>

          {visible.includes('functions') && (
            <div>
              <p className={QUESTION_TITLE}>¿Qué funciones realizabas como setter o closer?</p>
              <div className="mt-2">
                <TagInput id="pa-functions" label="Funciones" values={answers.functions} max={ASSISTANT_LIMITS.functions}
                  maxLength={ASSISTANT_LIMITS.functionLength} suggestions={FUNCTION_SUGGESTIONS}
                  placeholder="Escribe una función y pulsa Enter" onChange={v => set('functions', v)} />
              </div>
            </div>
          )}

          {visible.includes('transferable') && (
            <div className="space-y-2">
              <p className={QUESTION_TITLE}>¿En qué trabajo comercial o de atención tienes experiencia?</p>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pa-role" className={LABEL}>Rol o cargo</label>
                  <input id="pa-role" className={INPUT} value={answers.transferableRole.role} maxLength={ASSISTANT_LIMITS.role}
                    placeholder="Ej. Asesora comercial" onKeyDown={blockEnter} onChange={e => set('transferableRole', { ...answers.transferableRole, role: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="pa-context" className={LABEL}>Contexto <span className="text-xs text-text-secondary/70">(opcional)</span></label>
                  <input id="pa-context" className={INPUT} value={answers.transferableRole.context} maxLength={ASSISTANT_LIMITS.context}
                    placeholder="Ej. Tienda online de ropa" onKeyDown={blockEnter} onChange={e => set('transferableRole', { ...answers.transferableRole, context: e.target.value })} />
                </div>
              </div>
              <TagInput id="pa-tfunctions" label="Funciones (opcional)" values={answers.functions} max={ASSISTANT_LIMITS.functions}
                maxLength={ASSISTANT_LIMITS.functionLength} suggestions={FUNCTION_SUGGESTIONS}
                placeholder="Escribe una función y pulsa Enter" onChange={v => set('functions', v)} />
            </div>
          )}

          {visible.includes('strengths') && (
            <div>
              <p className={QUESTION_TITLE}>¿Qué fortalezas aplicas en una conversación de venta? <span className={HINT}>(hasta {ASSISTANT_LIMITS.strengths})</span></p>
              <div className="mt-2"><Chips options={STRENGTH_OPTIONS} values={answers.strengths} max={ASSISTANT_LIMITS.strengths} onChange={v => set('strengths', v)} /></div>
            </div>
          )}

          {visible.includes('roles') && (
            <div>
              <p className={QUESTION_TITLE}>¿Qué tipo de oportunidad buscas?</p>
              <div className="mt-2"><Chips options={PREFERRED_ROLE_OPTIONS} values={answers.preferredRoles} onChange={v => set('preferredRoles', v)} /></div>
            </div>
          )}

          <div>
            <label htmlFor="pa-highlight" className={QUESTION_TITLE}>¿Qué quieres que destaque tu perfil? <span className={HINT}>(opcional · {answers.highlight.length}/{ASSISTANT_LIMITS.highlight})</span></label>
            <textarea id="pa-highlight" rows={2} className={`${INPUT} mt-2`} value={answers.highlight} maxLength={ASSISTANT_LIMITS.highlight}
              placeholder="Ej. Me gusta escuchar antes de proponer y soy muy constante con el seguimiento." onChange={e => set('highlight', e.target.value)} />
          </div>

          <div>
            <p className={QUESTION_TITLE}>Tono</p>
            <div className="mt-2"><Chips options={TONE_OPTIONS} values={[answers.tone]} onChange={v => set('tone', v.filter(x => x !== answers.tone)[0] || answers.tone)} /></div>
          </div>

          <p className={HINT}><Info size={12} className="mr-1 inline" />Usamos también lo que ya guardaste en tu perfil, así que no te lo volvemos a preguntar. Tus respuestas aquí no se guardan.</p>
        </div>
      )}

      {step === 'preview' && draft && (
        <div className="space-y-4">
          <p className="rounded-xl border border-accent-gold/40 bg-accent-gold/10 px-3 py-2 text-xs text-accent-gold">
            Borrador generado con IA a partir de lo que declaraste. Revísalo y edítalo: tú eres responsable de que sea verdadero.
          </p>
          {[['headline', 'Titular', PASSPORT_LIMITS.headline], ['summary', 'Resumen profesional', PASSPORT_LIMITS.summary]].map(([field, label, max]) => (
            <div key={field} className="rounded-xl border border-border-subtle bg-bg-input/40 p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <input type="checkbox" checked={selection[field]} onChange={e => setSelection(s => ({ ...s, [field]: e.target.checked }))} className="accent-[#E0605E]" />
                Usar este {label.toLowerCase()}
              </label>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <span className={LABEL}>Actual</span>
                  <p className="min-h-[3rem] whitespace-pre-line rounded-xl border border-dashed border-border-subtle px-3 py-2 text-sm text-text-secondary">
                    {(currentForm[field] || '').trim() || <em>Vacío</em>}
                  </p>
                </div>
                <div>
                  <label htmlFor={`pa-draft-${field}`} className={LABEL}>
                    Propuesta de IA {field === 'summary' && <span className="text-xs text-text-secondary/70">({countWords(draft.summary)} palabras)</span>}
                  </label>
                  {field === 'headline' ? (
                    <input id={`pa-draft-${field}`} className={INPUT} value={draft.headline} maxLength={max}
                      onChange={e => setDraft(d => ({ ...d, headline: e.target.value }))} />
                  ) : (
                    <textarea id={`pa-draft-${field}`} rows={7} className={INPUT} value={draft.summary} maxLength={max}
                      onChange={e => setDraft(d => ({ ...d, summary: e.target.value }))} />
                  )}
                </div>
              </div>
            </div>
          ))}

          {confirmReplace && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent-gold/40 bg-accent-gold/10 px-3 py-2.5 text-sm text-accent-gold">
              <AlertTriangle size={15} /> Esto reemplazará tu {confirmReplace.join(' y tu ')} actual en el formulario (no se guarda hasta que pulses Guardar).
              <button type="button" onClick={() => apply(true)} className="rounded-lg bg-accent-gold px-3 py-1.5 text-xs font-bold text-black">Reemplazar</button>
              <button type="button" onClick={() => setConfirmReplace(null)} className="text-xs underline">Cancelar</button>
            </div>
          )}
        </div>
      )}

      {error && <p role="alert" className="flex items-start gap-1.5 text-sm text-red-400"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        {step === 'preview' ? (
          <>
            <button type="button" onClick={() => apply(false)} className="inline-flex items-center gap-2 rounded-xl bg-accent-coral px-4 py-2.5 text-sm font-bold text-white hover:opacity-90">
              <Check size={15} /> Usar en mi perfil
            </button>
            <button type="button" onClick={generate} disabled={noQuota}
              className="inline-flex items-center gap-2 rounded-xl border border-border-subtle px-4 py-2.5 text-sm text-text-primary disabled:opacity-50">
              <RefreshCw size={15} /> Regenerar
            </button>
            <button type="button" onClick={() => { setStep('questions'); setDraft(null); setConfirmReplace(null); }} className="text-sm text-text-secondary hover:text-text-primary">
              Descartar
            </button>
          </>
        ) : (
          <button type="button" onClick={generate} disabled={step === 'generating' || noQuota}
            className="inline-flex items-center gap-2 rounded-xl bg-accent-coral px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
            {step === 'generating' ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {step === 'generating' ? 'Generando propuesta…' : 'Generar propuesta'}
          </button>
        )}
        <QuotaLine quota={quota} />
      </div>
    </section>
  );
};

export default AssistantPanel;
