import { useEffect, useState } from 'react';
import {
  ShieldCheck, Users, Rocket, Loader2, Heart, ThumbsDown, ClipboardList,
  CheckCircle2, BadgeCheck, Flame, X, Target,
} from 'lucide-react';
import Layout from '../components/Layout';
import MatchCelebrationModal from '../components/MatchCelebrationModal';
import { getAdminVisibleMetrics } from '../utils/talentMetrics';
import {
  getOpenVacancies, createVacancy, updateMatchStatus, getVacancyApplicants, getSetEvaluationSummary,
} from '../utils/opportunityMarketplace';

const ROLE_LABELS = { setter: 'Setter', closer: 'Closer', sales_leader: 'Líder Comercial' };
const LEVEL_BADGES = { setter: 'SET Operator', closer: 'SET Closer', sales_leader: 'SET Commander' };
const DIMENSION_LABELS = {
  situacion: 'Sintonía con el lead (Situación)',
  emocion: 'Manejo emocional',
  transicion: 'Manejo de objeción / Transición',
  movimiento: 'Cierre a llamada / Movimiento',
};
const MATCH_STATUS_LABELS = {
  matched: 'Solicitud enviada · En evaluación',
  interview_requested: '🎉 ¡Es un Match! Entrevista solicitada',
  accepted: '🎉 ¡Es un Match! Aceptado',
  declined: 'Descartado',
};
const OPERATIONAL_TIPS = [
  '💡 Tip Operativo: Los setters con SET Score > 75 agendan hasta un 40% más de llamadas cualificadas al respetar el filtro de dolor antes del precio.',
  '💡 Tip Operativo: Una racha activa de 5+ días predice mejor consistencia operativa que un solo simulacro perfecto.',
  '💡 Tip Operativo: Los candidatos que completan sus Retos de Criterio muestran mejor manejo de objeciones en conversaciones reales.',
  '💡 Tip Operativo: La mayoría de conversaciones perdidas fallan en la Transición, no en el cierre — revisa esa dimensión en el reporte técnico.',
];

const matchColor = (score) => (score >= 75 ? '#1D9E75' : score >= 50 ? '#C9920A' : '#E0605E');
const scoreColor = (score) => (score > 80 ? '#1D9E75' : score > 70 ? '#C9920A' : '#E0605E');

const VacancyForm = ({ onSubmitted }) => {
  const [companyName, setCompanyName] = useState('');
  const [industryNiche, setIndustryNiche] = useState('');
  const [roleNeeded, setRoleNeeded] = useState('setter');
  const [offerTicketRange, setOfferTicketRange] = useState('');
  const [compensationType, setCompensationType] = useState('base_plus_comm');
  const [compensationDetails, setCompensationDetails] = useState('');
  const [minSetScore, setMinSetScore] = useState(70);
  const [spots, setSpots] = useState(1);
  const [contactLink, setContactLink] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    setMessage('');
    const { vacancy, error } = await createVacancy({
      company_name: companyName.trim(),
      industry_niche: industryNiche.trim(),
      role_needed: roleNeeded,
      offer_ticket_range: offerTicketRange.trim() || null,
      compensation_type: compensationType,
      compensation_details: compensationDetails.trim() || null,
      min_set_score: Number(minSetScore) || 70,
      spots: Number(spots) || 1,
      contact_link: contactLink.trim() || null,
      status: 'open',
    });
    setSubmitting(false);

    if (vacancy) {
      setIsError(false);
      setMessage('¡Vacante publicada! Ya es visible en el marketplace.');
      onSubmitted?.(vacancy);
      setCompanyName(''); setIndustryNiche(''); setOfferTicketRange(''); setCompensationDetails(''); setContactLink('');
      return;
    }

    setIsError(true);
    setMessage(error || 'No pudimos publicar tu vacante.');
  };

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <h2 className="text-base font-black text-text-primary">Publicar Vacante</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Nombre de la empresa" className="rounded-xl border border-border-subtle bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-accent-coral" />
        <input value={industryNiche} onChange={(e) => setIndustryNiche(e.target.value)} placeholder="Nicho / industria" className="rounded-xl border border-border-subtle bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-accent-coral" />
        <select value={roleNeeded} onChange={(e) => setRoleNeeded(e.target.value)} className="rounded-xl border border-border-subtle bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-coral">
          <option value="setter">Setter</option>
          <option value="closer">Closer</option>
          <option value="sales_leader">Líder Comercial</option>
        </select>
        <input value={offerTicketRange} onChange={(e) => setOfferTicketRange(e.target.value)} placeholder="Ticket ofrecido (ej. $2,000+)" className="rounded-xl border border-border-subtle bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-accent-coral" />
        <select value={compensationType} onChange={(e) => setCompensationType(e.target.value)} className="rounded-xl border border-border-subtle bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-coral">
          <option value="base_plus_comm">Base + Comisión</option>
          <option value="comm_only">Solo Comisión</option>
          <option value="fixed">Fijo</option>
        </select>
        <input type="number" min="0" max="100" value={minSetScore} onChange={(e) => setMinSetScore(e.target.value)} placeholder="SET Score mínimo" className="rounded-xl border border-border-subtle bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-accent-coral" />
        <input type="number" min="1" value={spots} onChange={(e) => setSpots(e.target.value)} placeholder="Cupos" className="rounded-xl border border-border-subtle bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-accent-coral" />
        <input value={contactLink} onChange={(e) => setContactLink(e.target.value)} placeholder="Link de contacto (WhatsApp/Calendly)" className="rounded-xl border border-border-subtle bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-accent-coral sm:col-span-2" />
      </div>
      <textarea value={compensationDetails} onChange={(e) => setCompensationDetails(e.target.value)} rows={2} placeholder="Detalles de la compensación" className="mt-3 w-full resize-y rounded-xl border border-border-subtle bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-accent-coral" />

      {message && <p className={`mt-3 text-xs ${isError ? 'text-red-400' : 'text-green-400'}`}>{message}</p>}

      <button onClick={handleSubmit} disabled={submitting || !companyName.trim() || !industryNiche.trim()} className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-accent-coral px-5 py-3 text-sm font-black text-white disabled:opacity-50">
        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />}
        {submitting ? 'Publicando...' : 'Registrar vacante'}
      </button>
    </div>
  );
};

const ScoreRing = ({ score }) => {
  const color = scoreColor(score);
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, score)) / 100) * circumference;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#242424" strokeWidth="6" />
        <circle cx="32" cy="32" r={radius} fill="none" stroke={color} strokeWidth="6" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-black" style={{ color }}>{score}</span>
      </div>
    </div>
  );
};

const AuditHeader = () => {
  const [tipIndex, setTipIndex] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTipIndex((i) => (i + 1) % OPERATIONAL_TIPS.length), 7000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-black text-text-primary">Centro de Auditoría Comercial</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-gold/15 px-2.5 py-1 text-[10px] font-black text-accent-gold">
          <ShieldCheck size={11} /> Talento Auditado por Simulación IA
        </span>
      </div>
      <p className="mt-1 text-xs text-text-secondary">Candidatos entrenados bajo presión conversacional antes de tocar tus leads.</p>
      <div className="mt-3 rounded-xl border border-border-subtle bg-bg-primary px-4 py-2.5 text-xs text-text-secondary">
        {OPERATIONAL_TIPS[tipIndex]}
      </div>
    </div>
  );
};

const AuditModal = ({ applicant, metrics, evaluation, loadingEvaluation, onClose }) => {
  const dimensionEntries = evaluation
    ? Object.entries(evaluation.dimensions).sort((a, b) => b[1].score - a[1].score).slice(0, 2)
    : [];
  const score = metrics?.avgSetScore ?? 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border-subtle bg-bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-accent-coral">Reporte Técnico del Setter</div>
            <h3 className="mt-1 text-lg font-black text-text-primary">{applicant.name}</h3>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary"><X size={18} /></button>
        </div>

        <div className="mt-4 rounded-2xl border p-4 text-center" style={{ borderColor: `${scoreColor(score)}4D`, backgroundColor: `${scoreColor(score)}0D` }}>
          <div className="text-xs font-bold text-text-secondary">PROMEDIO DE PRECISIÓN MÉTODO S.E.T.</div>
          <div className="mt-1 text-4xl font-black" style={{ color: scoreColor(score) }}>{score}<span className="text-lg text-text-secondary">/100</span></div>
        </div>

        {loadingEvaluation ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-text-secondary"><Loader2 size={16} className="animate-spin" /> Cargando evaluación...</div>
        ) : evaluation ? (
          <>
            <div className="mt-5">
              <div className="text-xs font-black uppercase tracking-wide text-text-secondary">Fortalezas detectadas</div>
              <div className="mt-2 space-y-2">
                {dimensionEntries.map(([key, dim]) => (
                  <div key={key} className="rounded-xl border border-green-500/30 bg-green-500/5 p-3">
                    <div className="flex items-center justify-between text-xs font-bold text-green-400">
                      <span>{DIMENSION_LABELS[key] || key}</span><span>{dim.score}/100</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-text-secondary">{dim.feedback}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-accent-gold/30 bg-accent-gold/5 p-4">
              <div className="text-xs font-black uppercase tracking-wide text-accent-gold">Retroalimentación IA</div>
              <p className="mt-1.5 text-sm italic leading-relaxed text-text-primary">"{evaluation.mainOpportunity}"</p>
            </div>
          </>
        ) : (
          <p className="mt-4 rounded-xl border border-border-subtle bg-bg-input/40 p-4 text-xs leading-relaxed text-text-secondary">
            Este candidato aún no completó su evaluación de criterio S.E.T. (Caza Conversaciones), así que no hay fortalezas ni feedback de IA que mostrar todavía.
          </p>
        )}

        <button onClick={onClose} className="mt-5 w-full rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-bold text-text-secondary hover:text-text-primary">Cerrar</button>
      </div>
    </div>
  );
};

const TalentCard = ({ applicant, metrics, acting, onMatch, onDiscard, onAudit }) => {
  const score = metrics?.avgSetScore ?? 0;
  const highDemand = applicant.match_score >= 70 || (metrics?.currentStreak || 0) >= 3;

  return (
    <article className="relative overflow-hidden rounded-2xl border border-border-subtle bg-bg-card p-4">
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: scoreColor(score) }} />
      <div className="flex items-start gap-3">
        <ScoreRing score={score} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-bold text-text-primary">{applicant.name}</span>
            {applicant.commercialProfile?.verified_status && <BadgeCheck size={14} className="shrink-0 text-accent-gold" />}
          </div>
          <span className="mt-1 inline-block rounded-full bg-accent-coral/10 px-2 py-0.5 text-[10px] font-black text-accent-coral">
            {LEVEL_BADGES[applicant.commercialProfile?.role_type] || 'SET Talent'}
          </span>
          {applicant.commercialProfile?.primary_niche && (
            <div className="mt-1 truncate text-[11px] text-text-secondary">Especialidad: {applicant.commercialProfile.primary_niche}</div>
          )}
        </div>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-black text-white" style={{ backgroundColor: matchColor(applicant.match_score) }}>{applicant.match_score}%</span>
      </div>

      {highDemand && (
        <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-[10px] font-black text-red-400">
          ⚡ Alta Demanda: Activo en procesos de selección
        </span>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-border-subtle bg-bg-input/40 p-3 text-center text-xs">
        <div>
          <div className="flex items-center justify-center gap-1 font-black text-accent-gold"><Flame size={12} /> {metrics ? metrics.currentStreak : '—'}</div>
          <div className="text-text-secondary">Racha activa</div>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 font-black text-green-400"><CheckCircle2 size={12} /> {metrics ? metrics.criterionCompletedCount : '—'}</div>
          <div className="text-text-secondary">Retos de criterio</div>
        </div>
      </div>

      {applicant.commercialProfile?.bio_pitch && <p className="mt-3 text-xs leading-relaxed text-text-secondary">{applicant.commercialProfile.bio_pitch}</p>}

      <div className="mt-4 space-y-2">
        <button onClick={() => onAudit(applicant)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 py-2 text-xs font-bold text-text-secondary hover:text-text-primary">
          <ClipboardList size={13} /> Auditar Perfil Completo
        </button>
        {applicant.status === 'matched' ? (
          <div className="flex gap-2">
            <button onClick={() => onDiscard(applicant)} disabled={acting} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 py-2.5 text-xs font-bold text-text-secondary disabled:opacity-50">
              <ThumbsDown size={14} /> Descartar
            </button>
            <button onClick={() => onMatch(applicant)} disabled={acting} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-coral px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
              {acting ? <Loader2 size={14} className="animate-spin" /> : <Heart size={14} />} Aceptar Match / Desbloquear
            </button>
          </div>
        ) : (
          <div className="rounded-xl bg-bg-input px-4 py-2.5 text-center text-xs font-bold text-text-secondary">
            {MATCH_STATUS_LABELS[applicant.status] || applicant.status}
          </div>
        )}
      </div>
    </article>
  );
};

const TalentInbox = ({ vacancies }) => {
  const [selectedId, setSelectedId] = useState('');
  const [applicants, setApplicants] = useState([]);
  const [metricsByUser, setMetricsByUser] = useState({});
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState('');
  const [error, setError] = useState('');
  const [celebration, setCelebration] = useState(null);
  const [auditingApplicant, setAuditingApplicant] = useState(null);
  const [auditEvaluation, setAuditEvaluation] = useState(null);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const handleAudit = async (applicant) => {
    setAuditingApplicant(applicant);
    setAuditEvaluation(null);
    setLoadingAudit(true);
    const { evaluation } = await getSetEvaluationSummary(applicant.user_id);
    setLoadingAudit(false);
    setAuditEvaluation(evaluation);
  };

  useEffect(() => {
    if (!selectedId) return undefined;
    let active = true;
    getVacancyApplicants(selectedId).then(async ({ applicants: loaded, error: loadError }) => {
      if (!active) return;
      setApplicants(loaded);
      if (loadError) setError(`No pudimos cargar candidatos: ${loadError}`);
      const entries = await Promise.all(loaded.map(async (a) => [a.user_id, await getAdminVisibleMetrics(a.user_id)]));
      if (active) setMetricsByUser(Object.fromEntries(entries));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedId]);

  const handleSelectVacancy = (id) => {
    setSelectedId(id);
    setApplicants([]);
    setMetricsByUser({});
    setError('');
    setLoading(Boolean(id));
  };

  const selectedVacancy = vacancies.find((v) => v.id === selectedId);

  const handleMatch = async (applicant) => {
    setActing(applicant.id);
    const { match, error: updateError } = await updateMatchStatus({ matchId: applicant.id, status: 'interview_requested' });
    setActing('');
    if (updateError || !match) { setError(updateError || 'No pudimos actualizar el match.'); return; }
    setApplicants((prev) => prev.map((a) => (a.id === match.id ? { ...a, status: match.status } : a)));
    setCelebration(selectedVacancy);
  };

  const handleDiscard = async (applicant) => {
    setActing(applicant.id);
    const { match, error: updateError } = await updateMatchStatus({ matchId: applicant.id, status: 'declined' });
    setActing('');
    if (updateError || !match) { setError(updateError || 'No pudimos actualizar el match.'); return; }
    setApplicants((prev) => prev.map((a) => (a.id === match.id ? { ...a, status: match.status } : a)));
  };

  return (
    <div className="mt-6">
      <AuditHeader />

      <select value={selectedId} onChange={(e) => handleSelectVacancy(e.target.value)} className="w-full rounded-xl border border-border-subtle bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-coral">
        <option value="">Selecciona una vacante para ver candidatos...</option>
        {vacancies.map((v) => <option key={v.id} value={v.id}>{v.company_name} · {ROLE_LABELS[v.role_needed] || v.role_needed}</option>)}
      </select>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-text-secondary"><Loader2 size={16} className="animate-spin" /> Cargando candidatos...</div>
      ) : selectedId && applicants.length === 0 ? (
        <p className="mt-4 rounded-xl border border-border-subtle bg-bg-input/40 px-4 py-3 text-sm text-text-secondary">
          Aún no tienes postulantes en esta vacante. Nuestro algoritmo está notificando a los mejores perfiles.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {applicants.map((applicant) => (
            <TalentCard
              key={applicant.id}
              applicant={applicant}
              metrics={metricsByUser[applicant.user_id]}
              acting={acting === applicant.id}
              onMatch={handleMatch}
              onDiscard={handleDiscard}
              onAudit={handleAudit}
            />
          ))}
        </div>
      )}

      {celebration && <MatchCelebrationModal vacancy={celebration} onClose={() => setCelebration(null)} />}
      {auditingApplicant && (
        <AuditModal
          applicant={auditingApplicant}
          metrics={metricsByUser[auditingApplicant.user_id]}
          evaluation={auditEvaluation}
          loadingEvaluation={loadingAudit}
          onClose={() => setAuditingApplicant(null)}
        />
      )}
    </div>
  );
};

const TalentVault = () => {
  const [vacancies, setVacancies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getOpenVacancies().then(({ vacancies: loaded, error: loadError }) => {
      if (!active) return;
      setVacancies(loaded);
      if (loadError) setError(`No pudimos cargar tus vacantes: ${loadError}`);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <Layout>
      <div className="mx-auto max-w-4xl animate-fade-in">
        <header className="mb-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.25em] text-accent-coral"><Target size={16} /> Panel de Empresa</div>
          <h1 className="mt-2 text-3xl font-black text-text-primary md:text-4xl">Centro de Auditoría</h1>
          <p className="mt-2 text-sm text-text-secondary">Gestiona tus vacantes y audita candidatos con métricas reales de simulación.</p>
        </header>

        <div className="mb-6 rounded-2xl border border-accent-coral/30 bg-accent-coral/5 p-5">
          <div className="flex items-center gap-2 text-sm font-black text-text-primary"><Users size={16} className="text-accent-coral" /> Aumenta tus ventas con un equipo comercial validado</div>
          <p className="mt-1.5 text-xs text-text-secondary">Publica tu vacante y conecta con talento ya evaluado por SET Score, racha y victorias reales.</p>
        </div>

        {error && <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

        {loading ? (
          <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" /> Cargando panel...</div>
        ) : (
          <div className="space-y-5">
            <VacancyForm onSubmitted={(vacancy) => setVacancies((prev) => [vacancy, ...prev])} />
            <TalentInbox vacancies={vacancies} />
          </div>
        )}
      </div>
    </Layout>
  );
};

export default TalentVault;
