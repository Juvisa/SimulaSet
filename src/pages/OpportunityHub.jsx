import { useEffect, useState } from 'react';
import {
  Briefcase, Sparkles, Lock, Flame, Trophy, Target, X, Check, Loader2, Rocket, Users,
  Heart, SkipForward, PartyPopper, MessageCircle, BadgeCheck, Edit3, ThumbsDown,
  ClipboardList, ShieldCheck, CheckCircle2,
} from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { calculateMatchScore } from '../utils/matchingAlgorithm';
import { getUserTalentMetrics, getAdminVisibleMetrics } from '../utils/talentMetrics';
import {
  getOpenVacancies, getMyCommercialProfile, upsertCommercialProfile,
  getMyMatches, requestMatch, createVacancy, updateMatchStatus, getVacancyApplicants,
  getSetEvaluationSummary,
} from '../utils/opportunityMarketplace';

const ROLE_LABELS = { setter: 'Setter', closer: 'Closer', sales_leader: 'Líder Comercial' };
const LEVEL_BADGES = { setter: 'SET Operator', closer: 'SET Closer', sales_leader: 'SET Commander' };
const DIMENSION_LABELS = {
  situacion: 'Sintonía con el lead (Situación)',
  emocion: 'Manejo emocional',
  transicion: 'Manejo de objeción / Transición',
  movimiento: 'Cierre a llamada / Movimiento',
};
const COMP_LABELS = { base_plus_comm: 'Base + Comisión', comm_only: 'Solo Comisión', fixed: 'Fijo' };
const MATCH_STATUS_LABELS = {
  matched: 'Solicitud enviada · En evaluación',
  interview_requested: '🎉 ¡Es un Match! Entrevista solicitada',
  accepted: '🎉 ¡Es un Match! Aceptado',
  declined: 'La empresa no continuó con este match',
};
const OPERATIONAL_TIPS = [
  '💡 Tip Operativo: Los setters con SET Score > 75 agendan hasta un 40% más de llamadas cualificadas al respetar el filtro de dolor antes del precio.',
  '💡 Tip Operativo: Una racha activa de 5+ días predice mejor consistencia operativa que un solo simulacro perfecto.',
  '💡 Tip Operativo: Los candidatos que completan sus Retos de Criterio muestran mejor manejo de objeciones en conversaciones reales.',
  '💡 Tip Operativo: La mayoría de conversaciones perdidas fallan en la Transición, no en el cierre — revisa esa dimensión en el reporte técnico.',
];

const matchColor = (score) => (score >= 75 ? '#1D9E75' : score >= 50 ? '#C9920A' : '#E0605E');
const scoreColor = (score) => (score > 80 ? '#1D9E75' : score > 70 ? '#C9920A' : '#E0605E');

const ProfileSetupForm = ({ userId, initialProfile, onSaved, onCancel }) => {
  const [roleType, setRoleType] = useState(initialProfile?.role_type || 'setter');
  const [primaryNiche, setPrimaryNiche] = useState(initialProfile?.primary_niche || '');
  const [ticketExperience, setTicketExperience] = useState(initialProfile?.ticket_experience || '');
  const [monthlyLeadCapacity, setMonthlyLeadCapacity] = useState(initialProfile?.monthly_lead_capacity ?? '');
  const [bioPitch, setBioPitch] = useState(initialProfile?.bio_pitch || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    const { profile, error: saveError } = await upsertCommercialProfile({
      userId,
      roleType,
      primaryNiche,
      ticketExperience,
      monthlyLeadCapacity: monthlyLeadCapacity !== '' ? Number(monthlyLeadCapacity) : null,
      bioPitch,
    });
    setSaving(false);
    if (saveError) { setError(saveError); return; }
    onSaved(profile);
  };

  return (
    <div className="rounded-2xl border border-accent-coral/30 bg-bg-card p-5">
      <h2 className="text-base font-black text-text-primary">{initialProfile ? 'Editar perfil comercial' : 'Completa tu perfil comercial'}</h2>
      <p className="mt-1 text-sm text-text-secondary">Lo usamos para calcular tu % de match con cada vacante. No hay postulaciones a ciegas.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-bold text-text-primary">Tu rol comercial</span>
          <select value={roleType} onChange={(e) => setRoleType(e.target.value)} className="mt-1.5 w-full rounded-xl border border-border-subtle bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-coral">
            <option value="setter">Setter</option>
            <option value="closer">Closer</option>
            <option value="sales_leader">Líder Comercial / Sales Manager</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-bold text-text-primary">Nicho principal</span>
          <input value={primaryNiche} onChange={(e) => setPrimaryNiche(e.target.value)} placeholder="Ej. Infoproductos High Ticket" className="mt-1.5 w-full rounded-xl border border-border-subtle bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-accent-coral" />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-text-primary">Ticket con el que has trabajado</span>
          <input value={ticketExperience} onChange={(e) => setTicketExperience(e.target.value)} placeholder="Ej. $1,500 - $3,000" className="mt-1.5 w-full rounded-xl border border-border-subtle bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-accent-coral" />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-text-primary">Capacidad mensual de leads</span>
          <input type="number" min="0" value={monthlyLeadCapacity} onChange={(e) => setMonthlyLeadCapacity(e.target.value)} placeholder="Ej. 60" className="mt-1.5 w-full rounded-xl border border-border-subtle bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-accent-coral" />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="text-xs font-bold text-text-primary">Pitch breve sobre ti</span>
        <textarea value={bioPitch} onChange={(e) => setBioPitch(e.target.value)} rows={2} placeholder="¿Qué te hace un comercial confiable?" className="mt-1.5 w-full resize-y rounded-xl border border-border-subtle bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-accent-coral" />
      </label>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      <div className="mt-4 flex gap-2">
        {initialProfile && (
          <button onClick={onCancel} className="flex-1 rounded-xl border border-border-subtle px-5 py-3 text-sm font-bold text-text-secondary hover:text-text-primary sm:flex-none">Cancelar</button>
        )}
        <button onClick={handleSave} disabled={saving || !primaryNiche.trim()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-coral px-5 py-3 text-sm font-black text-white disabled:opacity-50 sm:flex-none">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          {saving ? 'Guardando...' : 'Guardar perfil comercial'}
        </button>
      </div>
    </div>
  );
};

const ProfileStatusBar = ({ profile, onEdit }) => (
  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-bg-card px-4 py-3">
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded-full bg-accent-coral/10 px-3 py-1 font-bold text-accent-coral">{ROLE_LABELS[profile.role_type] || profile.role_type}</span>
      <span className="text-text-secondary">|</span>
      <span className="font-semibold text-text-primary">{profile.primary_niche}</span>
      {profile.ticket_experience && (
        <>
          <span className="text-text-secondary">|</span>
          <span className="text-text-secondary">{profile.ticket_experience}</span>
        </>
      )}
    </div>
    <button onClick={onEdit} className="flex items-center gap-1.5 text-xs font-bold text-text-secondary hover:text-text-primary">
      <Edit3 size={13} /> Editar Perfil
    </button>
  </div>
);

const PassportBar = ({ metrics }) => (
  <div className="mb-6 grid grid-cols-3 gap-3 rounded-2xl border border-accent-gold/25 bg-accent-gold/5 p-4">
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-xl font-black text-accent-coral"><Target size={16} /> {metrics.avgSetScore}</div>
      <div className="mt-0.5 text-[11px] font-bold text-text-secondary">SET Score</div>
    </div>
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-xl font-black text-accent-gold"><Flame size={16} /> {metrics.currentStreak}</div>
      <div className="mt-0.5 text-[11px] font-bold text-text-secondary">Racha de días</div>
    </div>
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-xl font-black text-green-400"><Trophy size={16} /> {metrics.victoryCount}</div>
      <div className="mt-0.5 text-[11px] font-bold text-text-secondary">Victorias SET WINS</div>
    </div>
  </div>
);

const SwipeCard = ({ vacancy, matchResult, onPass, onConnect }) => (
  <article className="relative overflow-hidden rounded-3xl border border-border-subtle bg-bg-card p-6">
    <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: matchResult.blocked ? '#E0605E' : matchColor(matchResult.score) }} />
    <div className="flex items-start justify-between gap-3">
      <div>
        <span className="text-xs font-black uppercase tracking-wide text-accent-coral">{ROLE_LABELS[vacancy.role_needed] || vacancy.role_needed}</span>
        <h3 className="mt-1 text-lg font-bold text-text-primary">{vacancy.company_name}</h3>
        <p className="mt-0.5 text-sm text-text-secondary">{vacancy.industry_niche}</p>
      </div>
      {!matchResult.blocked && (
        <span className="shrink-0 rounded-full px-3 py-1.5 text-sm font-black text-white" style={{ backgroundColor: matchColor(matchResult.score) }}>
          {matchResult.score}% Match
        </span>
      )}
    </div>

    <div className="mt-4 flex flex-wrap gap-2 text-xs text-text-secondary">
      <span className="rounded-full border border-border-subtle bg-bg-input px-2.5 py-1">{COMP_LABELS[vacancy.compensation_type] || vacancy.compensation_type}</span>
      {vacancy.offer_ticket_range && <span className="rounded-full border border-border-subtle bg-bg-input px-2.5 py-1">Ticket {vacancy.offer_ticket_range}</span>}
      <span className="rounded-full border border-border-subtle bg-bg-input px-2.5 py-1">{vacancy.spots} cupo{vacancy.spots === 1 ? '' : 's'}</span>
    </div>

    {vacancy.compensation_details && <p className="mt-4 text-sm leading-relaxed text-text-secondary">{vacancy.compensation_details}</p>}

    {matchResult.blocked && (
      <div className="mt-5 flex items-start gap-2 rounded-xl border border-border-subtle bg-bg-input/60 px-4 py-3 text-xs text-text-secondary">
        <Lock size={15} className="mt-0.5 shrink-0" />
        {matchResult.reason}
      </div>
    )}

    <div className="mt-6 flex gap-3">
      <button onClick={onPass} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 py-3 text-sm font-bold text-text-secondary hover:text-text-primary">
        <SkipForward size={16} /> Pasar
      </button>
      <button
        onClick={onConnect}
        disabled={matchResult.blocked}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-coral px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Heart size={16} /> Conectar / Solicitar Match
      </button>
    </div>
  </article>
);

const MyRequestsList = ({ requests, onViewContact }) => {
  if (requests.length === 0) return null;
  return (
    <div className="mt-6">
      <h3 className="mb-3 text-xs font-black uppercase tracking-wide text-text-secondary">Tus solicitudes</h3>
      <div className="space-y-2">
        {requests.map(({ match, vacancy }) => (
          <div key={match.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle bg-bg-card px-4 py-3">
            <div>
              <div className="text-sm font-bold text-text-primary">{vacancy?.company_name || 'Vacante'}</div>
              <div className="text-xs text-text-secondary">{MATCH_STATUS_LABELS[match.status] || match.status}</div>
            </div>
            {(match.status === 'interview_requested' || match.status === 'accepted') && (
              <button onClick={() => onViewContact(match, vacancy)} className="rounded-lg bg-accent-gold/10 px-3 py-1.5 text-xs font-bold text-accent-gold">Ver contacto</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const MatchCelebrationModal = ({ vacancy, onClose }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
    <div className="w-full max-w-sm rounded-2xl border border-accent-gold/40 bg-bg-card p-6 text-center" onClick={(e) => e.stopPropagation()}>
      <PartyPopper size={40} className="mx-auto text-accent-gold" />
      <h3 className="mt-4 text-xl font-black text-text-primary">¡Es un Match!</h3>
      <p className="mt-2 text-sm text-text-secondary">{vacancy?.company_name} quiere conectar contigo.</p>
      {vacancy?.contact_link ? (
        <a href={vacancy.contact_link} target="_blank" rel="noreferrer" className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-accent-coral px-5 py-3 text-sm font-black text-white">
          <MessageCircle size={16} /> Ir al contacto
        </a>
      ) : (
        <p className="mt-5 text-xs text-text-secondary">La empresa se pondrá en contacto pronto a través de DIGITAL SET.</p>
      )}
      <button onClick={onClose} className="mt-3 text-xs font-bold text-text-secondary hover:text-text-primary">Cerrar</button>
    </div>
  </div>
);

const MatchModal = ({ vacancy, matchResult, metrics, requesting, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4" onClick={onCancel}>
    <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-bg-card p-5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-black text-text-primary">Confirmar solicitud de match</h3>
        <button onClick={onCancel} className="text-text-secondary hover:text-text-primary"><X size={18} /></button>
      </div>
      <p className="mt-2 text-sm text-text-secondary">{vacancy.company_name}</p>

      <div className="mt-4 rounded-xl border border-border-subtle bg-bg-input/50 p-4">
        <div className="text-xs font-bold text-text-secondary">Tus métricas auditadas</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="flex items-center justify-center gap-1 text-lg font-black text-accent-coral"><Target size={14} /> {metrics.avgSetScore}</div>
            <div className="text-[10px] text-text-secondary">SET Score</div>
          </div>
          <div>
            <div className="flex items-center justify-center gap-1 text-lg font-black text-accent-gold"><Flame size={14} /> {metrics.currentStreak}</div>
            <div className="text-[10px] text-text-secondary">Racha</div>
          </div>
          <div>
            <div className="flex items-center justify-center gap-1 text-lg font-black text-green-400"><Trophy size={14} /> {metrics.victoryCount}</div>
            <div className="text-[10px] text-text-secondary">Victorias</div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl border border-border-subtle bg-bg-input/50 px-4 py-3">
        <span className="text-sm font-bold text-text-primary">Tu % de match</span>
        <span className="text-xl font-black" style={{ color: matchColor(matchResult.score) }}>{matchResult.score}%</span>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-text-secondary">
        Al confirmar, la empresa verá tus métricas auditadas y tu % de match. No se comparte información de contacto hasta que la empresa acepte.
      </p>

      <div className="mt-5 flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-bold text-text-secondary hover:text-text-primary">Cancelar</button>
        <button onClick={onConfirm} disabled={requesting} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-coral px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
          {requesting ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />}
          {requesting ? 'Enviando...' : 'Solicitar Match / Conectar'}
        </button>
      </div>
    </div>
  </div>
);

const VacancyForm = ({ isAdmin, onSubmitted }) => {
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

    setIsError(isAdmin);
    setMessage(isAdmin ? (error || 'No pudimos publicar tu vacante.') : 'Gracias por tu interés. Nuestro equipo revisará tu vacante y la publicará pronto.');
  };

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <h2 className="text-base font-black text-text-primary">Registra tu vacante</h2>
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

const TalentInbox = ({ vacancies, isAdmin }) => {
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

  if (!isAdmin) {
    return (
      <p className="mt-5 rounded-xl border border-border-subtle bg-bg-input/40 px-4 py-3 text-xs text-text-secondary">
        La bandeja de talento está disponible para el equipo DIGITAL SET. Contáctanos para gestionar tu vacante y revisar candidatos.
      </p>
    );
  }

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

const OpportunityHub = () => {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const [perspective, setPerspective] = useState('comercial');

  const [profile, setProfile] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [vacancies, setVacancies] = useState([]);
  const [matches, setMatches] = useState({});
  const [passedIds, setPassedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [pendingVacancy, setPendingVacancy] = useState(null);
  const [pendingMatchResult, setPendingMatchResult] = useState(null);
  const [requesting, setRequesting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [celebration, setCelebration] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      getMyCommercialProfile(user.id),
      getUserTalentMetrics({ userId: user.id, level: user.level }),
      getOpenVacancies(),
      getMyMatches(user.id),
    ]).then(([profileResult, metricsResult, vacanciesResult, matchesResult]) => {
      if (!active) return;
      setProfile(profileResult.profile);
      setMetrics(metricsResult);
      setVacancies(vacanciesResult.vacancies);
      setMatches(Object.fromEntries(matchesResult.matches.map((m) => [m.vacancy_id, m])));
      const firstError = profileResult.error || vacanciesResult.error || matchesResult.error;
      if (firstError) setError(`No pudimos cargar el marketplace: ${firstError}`);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [user.id, user.level]);

  const handleRequestMatch = (vacancy, matchResult) => {
    setPendingVacancy(vacancy);
    setPendingMatchResult(matchResult);
  };

  const handleConfirmMatch = async () => {
    setRequesting(true);
    const { match, error: matchError } = await requestMatch({
      userId: user.id, vacancyId: pendingVacancy.id, matchScore: pendingMatchResult.score,
    });
    setRequesting(false);
    if (matchError) { setError(matchError); setPendingVacancy(null); return; }
    setMatches((prev) => ({ ...prev, [match.vacancy_id]: match }));
    setSuccessMsg(`Solicitud enviada a ${pendingVacancy.company_name}.`);
    setTimeout(() => setSuccessMsg(''), 5000);
    setPendingVacancy(null);
  };

  const stackVacancies = vacancies.filter((v) => !matches[v.id] && !passedIds.has(v.id));
  const currentVacancy = stackVacancies[0] || null;
  const currentMatchResult = profile && currentVacancy ? calculateMatchScore(profile, currentVacancy, metrics) : null;
  const myRequests = Object.values(matches).map((match) => ({ match, vacancy: vacancies.find((v) => v.id === match.vacancy_id) }));

  return (
    <Layout>
      <div className="mx-auto max-w-4xl animate-fade-in">
        <header className="mb-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.25em] text-accent-coral"><Briefcase size={16} /> Marketplace</div>
          <h1 className="mt-2 text-3xl font-black text-text-primary md:text-4xl">SET Opportunity Hub</h1>
          <p className="mt-2 text-sm text-text-secondary">Marketplace de talento comercial de alto rendimiento. Sin postulaciones a ciegas.</p>

          <div className="mt-4 inline-flex items-center gap-1 rounded-xl bg-bg-input p-1">
            <button onClick={() => setPerspective('comercial')} className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors ${perspective === 'comercial' ? 'bg-accent-coral text-white' : 'text-text-secondary hover:text-text-primary'}`}>
              Soy Comercial
            </button>
            <button onClick={() => setPerspective('empresa')} className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors ${perspective === 'empresa' ? 'bg-accent-coral text-white' : 'text-text-secondary hover:text-text-primary'}`}>
              Soy Empresa
            </button>
          </div>
        </header>

        <div className="mb-6 rounded-2xl border border-accent-gold/25 bg-accent-gold/5 p-5">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-accent-gold"><Sparkles size={14} /> ¿Buscas un Closer o Setter de Élite? Deja de contratar a ciegas.</div>
          <p className="mt-1.5 text-sm text-text-secondary">Filtramos el talento por métricas reales de simulación y criterio conversacional, no por currículum.</p>
        </div>

        {error && <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
        {successMsg && <div className="mb-5 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">{successMsg}</div>}

        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" /> Cargando marketplace...</div>
        ) : perspective === 'empresa' ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-accent-coral/30 bg-accent-coral/5 p-5">
              <div className="flex items-center gap-2 text-sm font-black text-text-primary"><Users size={16} className="text-accent-coral" /> Aumenta tus ventas con un equipo comercial validado</div>
              <p className="mt-1.5 text-xs text-text-secondary">Publica tu vacante y conecta con talento ya evaluado por SET Score, racha y victorias reales.</p>
            </div>
            <VacancyForm isAdmin={isAdmin} onSubmitted={(vacancy) => setVacancies((prev) => [vacancy, ...prev])} />
            <TalentInbox vacancies={vacancies} isAdmin={isAdmin} />
          </div>
        ) : !profile || editingProfile ? (
          <ProfileSetupForm
            userId={user.id}
            initialProfile={editingProfile ? profile : null}
            onSaved={(saved) => { setProfile(saved); setEditingProfile(false); }}
            onCancel={() => setEditingProfile(false)}
          />
        ) : (
          <div>
            <ProfileStatusBar profile={profile} onEdit={() => setEditingProfile(true)} />
            <PassportBar metrics={metrics} />

            {currentVacancy ? (
              <SwipeCard
                vacancy={currentVacancy}
                matchResult={currentMatchResult}
                onPass={() => setPassedIds((prev) => new Set(prev).add(currentVacancy.id))}
                onConnect={() => handleRequestMatch(currentVacancy, currentMatchResult)}
              />
            ) : (
              <p className="rounded-2xl border border-border-subtle bg-bg-card p-6 text-center text-sm text-text-secondary">Ya viste todas las vacantes disponibles por ahora. Vuelve pronto por más.</p>
            )}

            <MyRequestsList
              requests={myRequests}
              onViewContact={(match, vacancy) => setCelebration(vacancy)}
            />
          </div>
        )}
      </div>

      {pendingVacancy && (
        <MatchModal
          vacancy={pendingVacancy}
          matchResult={pendingMatchResult}
          metrics={metrics}
          requesting={requesting}
          onConfirm={handleConfirmMatch}
          onCancel={() => setPendingVacancy(null)}
        />
      )}

      {celebration && <MatchCelebrationModal vacancy={celebration} onClose={() => setCelebration(null)} />}
    </Layout>
  );
};

export default OpportunityHub;
