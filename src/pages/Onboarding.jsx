import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const STEPS = [
  { eyebrow: 'Tu punto de partida', title: 'Cuéntanos sobre tu experiencia', subtitle: 'Dos preguntas rápidas para personalizar tu recorrido.' },
  { eyebrow: 'Herramientas', title: 'Tu entorno digital', subtitle: 'Queremos entender con qué herramientas has trabajado.' },
  { eyebrow: 'Experiencia comercial', title: 'Tu contacto con las ventas', subtitle: 'Esto define el punto de partida de tu formación.' },
  { eyebrow: 'Tu meta', title: '¿Qué quieres conseguir?', subtitle: 'Usaremos tu objetivo para orientar tu experiencia.' },
];

const CRM_OPTIONS = [
  ['none', 'No'],
  ['leadsales', 'LeadSales'],
  ['kommo', 'Kommo'],
  ['ghl', 'GHL'],
  ['other', 'Otro'],
];

const GOAL_OPTIONS = [
  ['first_opportunity', 'Conseguir mi primera oportunidad'],
  ['learn_chat_sales', 'Aprender ventas por chat'],
  ['improve_setter', 'Mejorar como setter'],
  ['improve_closer', 'Mejorar como closer'],
  ['improve_current_results', 'Mejorar resultados comerciales actuales'],
  ['other', 'Otro'],
];

const initialAnswers = {
  worked_digital_business: null,
  knows_lead: null,
  crm: '',
  crm_other: '',
  worked_setter: null,
  worked_closer: null,
  participated_launch: null,
  sold_by_chat: null,
  primary_goal: '',
  goal_other: '',
};

const ChoiceButton = ({ selected, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`relative rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${selected
      ? 'border-accent-coral bg-accent-coral/10 text-text-primary shadow-[0_0_0_1px_rgba(224,96,94,0.15)]'
      : 'border-border-subtle bg-bg-input text-text-secondary hover:border-accent-coral/40 hover:text-text-primary'}`}
  >
    {children}
    {selected && <Check size={14} className="absolute right-3 top-3 text-accent-coral" />}
  </button>
);

const BooleanQuestion = ({ label, value, onChange }) => (
  <div>
    <p className="mb-3 text-sm font-semibold text-text-primary">{label}</p>
    <div className="grid grid-cols-2 gap-3">
      <ChoiceButton selected={value === true} onClick={() => onChange(true)}>Sí</ChoiceButton>
      <ChoiceButton selected={value === false} onClick={() => onChange(false)}>No</ChoiceButton>
    </div>
  </div>
);

const Onboarding = () => {
  const navigate = useNavigate();
  const { completeOnboarding } = useAuth();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(initialAnswers);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setAnswer = (field, value) => setAnswers(current => ({ ...current, [field]: value }));
  const canContinue = [
    answers.worked_digital_business !== null && answers.knows_lead !== null,
    Boolean(answers.crm) && (answers.crm !== 'other' || Boolean(answers.crm_other.trim())) && answers.participated_launch !== null,
    answers.worked_setter !== null && answers.worked_closer !== null && answers.sold_by_chat !== null,
    Boolean(answers.primary_goal) && (answers.primary_goal !== 'other' || Boolean(answers.goal_other.trim())),
  ][step];

  const handleContinue = async () => {
    if (!canContinue) return;
    setError('');
    if (step < STEPS.length - 1) {
      setStep(current => current + 1);
      return;
    }

    setSaving(true);
    const result = await completeOnboarding(answers);
    setSaving(false);
    if (result.error) {
      setError(`No pudimos guardar tus respuestas: ${result.error}`);
      return;
    }
    navigate('/dashboard', { replace: true });
  };

  return (
    <main className="min-h-screen bg-bg-primary px-4 py-8 md:py-14">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg font-black tracking-tight text-text-primary">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-coral text-white"><Sparkles size={18} /></span>
            DIGITAL SET
          </div>
          <span className="text-xs font-semibold text-text-secondary">{step + 1} de {STEPS.length}</span>
        </div>

        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-bg-input">
          <div className="h-full rounded-full bg-gradient-to-r from-accent-coral to-accent-gold transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>

        <section className="overflow-hidden rounded-3xl border border-border-subtle bg-bg-card shadow-2xl shadow-black/20">
          <div className="border-b border-border-subtle px-6 py-6 md:px-8">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-accent-coral">{STEPS[step].eyebrow}</p>
            <h1 className="text-2xl font-black text-text-primary md:text-3xl">{STEPS[step].title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">{STEPS[step].subtitle}</p>
          </div>

          <div className="space-y-6 px-6 py-7 md:px-8">
            {step === 0 && (
              <>
                <BooleanQuestion label="¿Has trabajado antes en negocios digitales?" value={answers.worked_digital_business} onChange={value => setAnswer('worked_digital_business', value)} />
                <BooleanQuestion label="¿Sabes qué es un lead?" value={answers.knows_lead} onChange={value => setAnswer('knows_lead', value)} />
              </>
            )}

            {step === 1 && (
              <>
                <div>
                  <p className="mb-3 text-sm font-semibold text-text-primary">¿Has usado CRM?</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {CRM_OPTIONS.map(([value, label]) => <ChoiceButton key={value} selected={answers.crm === value} onClick={() => setAnswer('crm', value)}>{label}</ChoiceButton>)}
                  </div>
                  {answers.crm === 'other' && <input autoFocus value={answers.crm_other} onChange={event => setAnswer('crm_other', event.target.value)} placeholder="¿Cuál CRM?" className="mt-3 w-full rounded-xl border border-border-subtle bg-bg-input px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-accent-coral" />}
                </div>
                <BooleanQuestion label="¿Has participado en un lanzamiento digital?" value={answers.participated_launch} onChange={value => setAnswer('participated_launch', value)} />
              </>
            )}

            {step === 2 && (
              <>
                <BooleanQuestion label="¿Has trabajado como setter?" value={answers.worked_setter} onChange={value => setAnswer('worked_setter', value)} />
                <BooleanQuestion label="¿Has trabajado como closer?" value={answers.worked_closer} onChange={value => setAnswer('worked_closer', value)} />
                <BooleanQuestion label="¿Has vendido por chat?" value={answers.sold_by_chat} onChange={value => setAnswer('sold_by_chat', value)} />
              </>
            )}

            {step === 3 && (
              <div>
                <div className="grid gap-3">
                  {GOAL_OPTIONS.map(([value, label]) => <ChoiceButton key={value} selected={answers.primary_goal === value} onClick={() => setAnswer('primary_goal', value)}>{label}</ChoiceButton>)}
                </div>
                {answers.primary_goal === 'other' && <input autoFocus value={answers.goal_other} onChange={event => setAnswer('goal_other', event.target.value)} placeholder="Cuéntanos tu objetivo" className="mt-3 w-full rounded-xl border border-border-subtle bg-bg-input px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-accent-coral" />}
              </div>
            )}

            {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
          </div>

          <div className="flex items-center gap-3 border-t border-border-subtle px-6 py-5 md:px-8">
            {step > 0 && <button type="button" onClick={() => { setError(''); setStep(current => current - 1); }} disabled={saving} className="flex items-center gap-2 rounded-xl border border-border-subtle px-4 py-3 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40"><ArrowLeft size={16} /> Atrás</button>}
            <button type="button" onClick={handleContinue} disabled={!canContinue || saving} className="ml-auto flex items-center gap-2 rounded-xl bg-accent-coral px-5 py-3 text-sm font-bold text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
              {saving ? <><Loader2 size={16} className="animate-spin" /> Guardando...</> : step === STEPS.length - 1 ? <>Comenzar <Check size={16} /></> : <>Continuar <ArrowRight size={16} /></>}
            </button>
          </div>
        </section>

        <p className="mt-5 text-center text-xs text-text-secondary">Tus respuestas nos ayudan a personalizar tu experiencia.</p>
      </div>
    </main>
  );
};

export default Onboarding;
