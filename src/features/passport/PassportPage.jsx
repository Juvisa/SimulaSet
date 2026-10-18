import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Save, Check, AlertTriangle, RefreshCw, Lock, MapPin, Clock, Briefcase, FileText, Download, Sparkles } from 'lucide-react';
import AssistantPanel from './AssistantPanel';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import { saveMyPassport } from './passportApi';
import { loadPassportSources } from './passportData';
import {
  AVAILABILITY_OPTIONS,
  PASSPORT_LIMITS,
  buildPassportState,
  emptyPassport,
  getPassportCompleteness,
  getPassportWarnings,
  passportFromRow,
  toPassportPayload,
  validatePassport,
} from './passportModel';
import {
  LayerTag, TagInput, LanguagesEditor, EvidencePanel,
  ExperienceEditor, OpportunityPreferences, TimezoneField,
} from './PassportSections';
import TrainingCertificatePanel from '../credentials/TrainingCertificatePanel';
import { INPUT, LABEL } from './passportStyles';

const availabilityLabel = (value) => AVAILABILITY_OPTIONS.find(o => o.value === value)?.label;
const SECTION = 'space-y-4 border-t border-border-subtle pt-5';
const SUBTITLE = 'font-display text-base font-bold text-text-primary';

const PassportPage = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState(null);
  const [form, setForm] = useState(emptyPassport());
  const [unavailable, setUnavailable] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  // Cada visita vuelve a leer TODO de sus fuentes oficiales: el historial
  // completo de simulaciones (incluidas las anteriores a SET Passport) y el
  // SET Score recién leído de profiles. Así una nueva simulación válida se
  // refleja al volver a entrar o al pulsar "Actualizar", sin sincronización.
  const fetchPassportData = async () => {
    const sources = await loadPassportSources({
      userId: user.id, refreshUser, fallbackSetScore: user.set_score, withSuggestions: true,
    });
    const next = buildPassportState({
      passportRow: sources.passportRow,
      commercialProfile: sources.commercialProfile,
      onboarding: sources.onboarding,
      sessions: sources.sessions,
      setScore: sources.setScore,
    });
    // El asistente usa el perfil comercial solo para precargar sus preguntas.
    return { next: { ...next, commercialProfile: sources.commercialProfile || null }, unavailable: sources.unavailable, error: sources.error };
  };

  // keepForm: al actualizar con cambios sin guardar, se refrescan evidencia y
  // estado pero NO se pisa lo que el alumno está escribiendo.
  const applyPassportData = ({ next, unavailable: isUnavailable, error }, { keepForm = false } = {}) => {
    setState(next);
    if (!keepForm) {
      setForm(next.form);
      setErrors({});
    }
    setUnavailable(isUnavailable);
    setLoadError(error ? `No pudimos cargar todos tus datos: ${error}` : '');
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    fetchPassportData().then((result) => { if (active) applyPassportData(result); });
    return () => { active = false; };
  }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDirty = Boolean(state) && JSON.stringify(form) !== JSON.stringify(state.form);
  // La vista profesional y el PDF muestran SOLO lo guardado: avisar si hay
  // cambios o sugerencias precargadas que todavía no se guardaron.
  const hasUnsaved = Boolean(state) && (isDirty || (!state.exists && state.prefillSources.length > 0));

  // Cerrar o recargar la pestaña con cambios sin guardar pide confirmación.
  useEffect(() => {
    if (!isDirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const goToProfessionalView = (print) => {
    if (hasUnsaved && !window.confirm('Tienes cambios sin guardar. La vista profesional y el PDF solo incluyen lo que ya guardaste. ¿Continuar sin guardar?')) return;
    navigate(print ? '/passport/vista?imprimir=1' : '/passport/vista');
  };

  const reload = () => {
    const keepForm = isDirty;
    setRefreshing(true);
    setSaveMessage('');
    setSaveError('');
    fetchPassportData()
      .then((result) => applyPassportData(result, { keepForm }))
      .finally(() => setRefreshing(false));
  };

  const completeness = useMemo(() => getPassportCompleteness(form), [form]);
  const warnings = useMemo(() => getPassportWarnings(form), [form]);
  const setField = (field, value) => {
    setForm(current => ({ ...current, [field]: value }));
    setSaveMessage('');
  };

  // Valida y guarda el formulario. Devuelve true si quedó guardado.
  const persistForm = async () => {
    const nextErrors = validatePassport(form);
    setErrors(nextErrors);
    setSaveError('');
    setSaveMessage('');
    if (Object.keys(nextErrors).length) {
      setSaveError(`Revisa los campos marcados: ${Object.values(nextErrors).join(' ')}`);
      return false;
    }
    setSaving(true);
    const { passport, error } = await saveMyPassport({ userId: user.id, payload: toPassportPayload(form), exists: state.exists });
    setSaving(false);
    if (error) {
      setSaveError(`No pudimos guardar tu SET Passport: ${error}`);
      return false;
    }
    const saved = passportFromRow(passport);
    setForm(saved);
    setState(current => ({ ...current, exists: true, form: saved, prefillSources: [] }));
    setSaveMessage('SET Passport guardado.');
    return true;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    await persistForm();
  };

  // El asistente trabaja con lo GUARDADO (el servidor lo lee con RLS). Si hay
  // cambios o sugerencias sin guardar, primero se validan y se guardan.
  const openAssistant = async () => {
    if (hasUnsaved && !(await persistForm())) return;
    setAssistantOpen(true);
  };

  // "Usar en mi perfil": copia al formulario; persistir sigue siendo Guardar.
  const applyDraft = (changes) => {
    setForm(current => ({ ...current, ...changes }));
    setAssistantOpen(false);
    setSaveError('');
    setSaveMessage('Propuesta aplicada al formulario. Revísala y pulsa Guardar para conservarla.');
  };

  if (loading || !state) {
    return (
      <Layout>
        <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-text-secondary">
          <Loader2 size={18} className="animate-spin" /> Cargando tu SET Passport...
        </div>
      </Layout>
    );
  }

  const location = [form.city, form.country].map(v => v.trim()).filter(Boolean).join(', ');
  const initials = (user.name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6 pb-10">
        {/* Encabezado */}
        <section className="relative overflow-hidden card-tactical border-accent-coral/20 rounded-2xl p-6 md:p-8">
          <div className="absolute -right-16 -top-20 w-56 h-56 rounded-full bg-accent-coral/10 blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-start justify-between gap-5">
            <div className="flex items-start gap-4 min-w-0">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover border border-border-subtle shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-accent-coral/20 border border-accent-coral/30 flex items-center justify-center text-xl font-black text-accent-coral shrink-0">{initials}</div>
              )}
              <div className="min-w-0">
                <div className="font-mono text-xs font-black uppercase tracking-[0.25em] text-accent-coral mb-1">SET Passport</div>
                <h1 className="font-display text-2xl md:text-3xl font-black text-text-primary truncate">{user.name}</h1>
                <p className="text-text-secondary text-sm mt-1">{form.headline.trim() || 'Agrega un titular profesional para presentarte.'}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-text-secondary">
                  {location && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {location}</span>}
                  {availabilityLabel(form.availability) && <span className="inline-flex items-center gap-1"><Clock size={12} /> {availabilityLabel(form.availability)}{form.hoursPerWeek ? ` · ${form.hoursPerWeek} h/semana` : ''}</span>}
                  {form.openToOpportunities && <span className="inline-flex items-center gap-1 text-color-success"><Briefcase size={12} /> Abierto a oportunidades</span>}
                </div>
              </div>
            </div>
            <div className="shrink-0 md:text-right">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-input px-3 py-1 text-xs text-text-secondary">
                <Lock size={12} /> Privado · solo tú y el equipo de Digital SET
              </span>
              <button type="button" onClick={reload} disabled={refreshing} className="mt-2 md:ml-2 inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary">
                <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Actualizando…' : 'Actualizar datos'}
              </button>
              <div className="mt-3 flex flex-wrap gap-2 md:justify-end">
                <button type="button" onClick={() => goToProfessionalView(false)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-bg-input px-3 py-2 text-xs font-bold text-text-primary hover:border-accent-coral/50">
                  <FileText size={14} /> Vista profesional
                </button>
                <button type="button" onClick={() => goToProfessionalView(true)}
                  title="Abre el diálogo de impresión del navegador: elige «Guardar como PDF»."
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white hover:opacity-90"
                  style={{ backgroundColor: '#A61E2D' }}>
                  <Download size={14} /> Descargar mi SET Passport
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-text-secondary">PDF: se abre el diálogo de impresión; elige «Guardar como PDF».</p>
            </div>
          </div>

          {/* Completitud: SOLO campos declarados */}
          <div className="relative mt-6">
            <div className="flex justify-between text-xs text-text-secondary mb-1.5">
              <span>Perfil profesional completo</span>
              <span className="font-bold text-text-primary">{completeness.percent}% · {completeness.completed}/{completeness.total}</span>
            </div>
            <div className="h-2 bg-bg-input rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-accent-coral to-accent-gold rounded-full transition-all duration-500" style={{ width: `${completeness.percent}%` }} />
            </div>
            {completeness.missing.length > 0 && (
              <p className="text-[11px] text-text-secondary mt-1.5">Falta: {completeness.missing.join(' · ')}. Se calcula solo con lo que declaras; no depende de tu SET Score ni de tu práctica.</p>
            )}
          </div>
        </section>

        {loadError && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{loadError}</div>}

        {/* Entrenamiento registrado — visible para todo alumno, haya o no Passport guardado */}
        <EvidencePanel evidence={state.evidence} />

        {/* Información declarada */}
        <form onSubmit={handleSave} className="card-tactical rounded-2xl p-5 md:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-text-primary">Información profesional</h2>
            <LayerTag layer="declared" />
          </div>

          {unavailable && (
            <div className="flex items-start gap-2 rounded-xl border border-accent-gold/30 bg-accent-gold/10 px-4 py-3 text-sm text-accent-gold">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              SET Passport todavía no está habilitado en tu cuenta. Tu entrenamiento registrado ya se muestra arriba; podrás guardar tu información profesional muy pronto.
            </div>
          )}
          {!state.exists && !unavailable && state.prefillSources.length > 0 && (
            <div className="rounded-xl border border-border-subtle bg-bg-input/60 px-4 py-3 text-xs text-text-secondary">
              Precargamos algunos campos con lo que ya nos contaste en {state.prefillSources.join(' y ')}. Revísalos: no se guarda nada hasta que pulses “Guardar”.
            </div>
          )}

          <fieldset disabled={unavailable || saving} className="space-y-5 disabled:opacity-60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className={SUBTITLE}>Presentación</h3>
              {!assistantOpen && (
                <button type="button" onClick={openAssistant} disabled={unavailable || saving || refreshing}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-accent-coral/50 bg-accent-coral/10 px-3 py-2 text-xs font-bold text-text-primary hover:bg-accent-coral/20 disabled:opacity-50">
                  <Sparkles size={14} className="text-accent-coral" />
                  {hasUnsaved ? 'Guardar y crear mi perfil con IA' : 'Crear mi perfil con IA'}
                </button>
              )}
            </div>
            {assistantOpen && (
              <AssistantPanel
                savedForm={state.form}
                currentForm={form}
                suggestedTrack={state.suggestedTrack}
                commercialProfile={state.commercialProfile}
                onApply={applyDraft}
                onClose={() => setAssistantOpen(false)}
              />
            )}
            <div>
              <label htmlFor="pp-headline" className={LABEL}>Titular profesional</label>
              <input id="pp-headline" className={INPUT} value={form.headline} maxLength={PASSPORT_LIMITS.headline}
                placeholder="Ej. Setter de alto ticket para infoproductos" onChange={(e) => setField('headline', e.target.value)} />
              {errors.headline && <p className="text-xs text-red-400 mt-1">{errors.headline}</p>}
            </div>
            <div>
              <label htmlFor="pp-summary" className={LABEL}>Resumen profesional <span className="text-xs text-text-secondary/70">({form.summary.length}/{PASSPORT_LIMITS.summary})</span></label>
              <textarea id="pp-summary" rows={5} className={INPUT} value={form.summary} maxLength={PASSPORT_LIMITS.summary}
                placeholder="Cuenta quién eres, qué has hecho y qué buscas. Solo experiencia real: tus simulaciones ya aparecen aparte."
                onChange={(e) => setField('summary', e.target.value)} />
              {errors.summary && <p className="text-xs text-red-400 mt-1">{errors.summary}</p>}
            </div>

            <div className={SECTION}>
              <ExperienceEditor
                track={form.experienceTrack}
                experiences={form.experiences}
                onTrackChange={(v) => setField('experienceTrack', v)}
                onExperiencesChange={(v) => setField('experiences', v)}
                errors={errors}
                warnings={warnings}
                suggestedTrack={state.suggestedTrack}
                onboardingExperience={state.onboardingExperience}
              />
            </div>

            <div className={SECTION}>
              <h3 className={SUBTITLE}>Qué oportunidad buscas</h3>
              <OpportunityPreferences preferredRoles={form.preferredRoles} workModes={form.workModes} notes={form.opportunityNotes}
                onChange={setField} error={errors.opportunityNotes} />
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="pp-availability" className={LABEL}>Disponibilidad</label>
                  <select id="pp-availability" className={INPUT} value={form.availability} onChange={(e) => setField('availability', e.target.value)}>
                    <option value="">Selecciona…</option>
                    {AVAILABILITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {errors.availability && <p className="text-xs text-red-400 mt-1">{errors.availability}</p>}
                </div>
                <div>
                  <label htmlFor="pp-hours" className={LABEL}>Horas por semana</label>
                  <input id="pp-hours" type="number" inputMode="numeric" min={PASSPORT_LIMITS.hoursMin} max={PASSPORT_LIMITS.hoursMax}
                    className={INPUT} value={form.hoursPerWeek} onChange={(e) => setField('hoursPerWeek', e.target.value)} />
                  {errors.hoursPerWeek && <p className="text-xs text-red-400 mt-1">{errors.hoursPerWeek}</p>}
                </div>
                <label className="flex items-center gap-3 rounded-xl border border-border-subtle bg-bg-input/60 px-4 py-3 md:mt-7 cursor-pointer">
                  <input type="checkbox" checked={form.openToOpportunities} onChange={(e) => setField('openToOpportunities', e.target.checked)} className="accent-[#E0605E]" />
                  <span className="text-sm text-text-primary">Me interesan oportunidades comerciales</span>
                </label>
              </div>
            </div>

            <div className={SECTION}>
              <h3 className={SUBTITLE}>Ubicación e idiomas</h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="pp-country" className={LABEL}>País</label>
                  <input id="pp-country" className={INPUT} value={form.country} maxLength={PASSPORT_LIMITS.country} onChange={(e) => setField('country', e.target.value)} />
                </div>
                <div>
                  <label htmlFor="pp-city" className={LABEL}>Ciudad</label>
                  <input id="pp-city" className={INPUT} value={form.city} maxLength={PASSPORT_LIMITS.city} onChange={(e) => setField('city', e.target.value)} />
                </div>
                <TimezoneField value={form.timezone} onChange={(v) => setField('timezone', v)} error={errors.timezone} />
              </div>
              <LanguagesEditor values={form.languages} onChange={(v) => setField('languages', v)} error={errors.languages} />
            </div>

            <div className={SECTION}>
              <h3 className={SUBTITLE}>Habilidades, herramientas y nichos</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <TagInput id="pp-skills" label="Habilidades" values={form.skills} max={PASSPORT_LIMITS.skills}
                  placeholder="Ej. Calificación de leads (Enter para añadir)" onChange={(v) => setField('skills', v)} error={errors.skills} />
                <TagInput id="pp-tools" label="Herramientas comerciales" values={form.tools} max={PASSPORT_LIMITS.tools}
                  placeholder="Ej. Kommo, WhatsApp Business" onChange={(v) => setField('tools', v)} error={errors.tools} />
              </div>
              <TagInput id="pp-niches" label="Nichos de interés o experiencia" values={form.niches} max={PASSPORT_LIMITS.niches}
                placeholder="Ej. Infoproductos high ticket" onChange={(v) => setField('niches', v)} error={errors.niches} />
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button type="submit" disabled={unavailable || saving || refreshing}
              className="inline-flex items-center gap-2 rounded-xl bg-accent-coral px-6 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar
            </button>
            {saveMessage && <span className="inline-flex items-center gap-1 text-sm text-color-success"><Check size={14} /> {saveMessage}</span>}
            {saveError && <span className="inline-flex items-center gap-1 text-sm text-red-400"><AlertTriangle size={14} /> {saveError}</span>}
          </div>
        </form>

        <TrainingCertificatePanel />
      </div>
    </Layout>
  );
};

export default PassportPage;
