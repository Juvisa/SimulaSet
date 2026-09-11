import { useEffect, useState } from 'react';
import {
  Briefcase, Sparkles, Lock, Flame, Trophy, Target, X, Check, Loader2, Rocket,
  Heart, SkipForward, Edit3,
} from 'lucide-react';
import Layout from '../components/Layout';
import MatchCelebrationModal from '../components/MatchCelebrationModal';
import { useAuth } from '../context/AuthContext';
import { calculateMatchScore } from '../utils/matchingAlgorithm';
import { getUserTalentMetrics } from '../utils/talentMetrics';
import {
  getOpenVacancies, getMyCommercialProfile, upsertCommercialProfile,
  getMyMatches, requestMatch,
} from '../utils/opportunityMarketplace';

const ROLE_LABELS = { setter: 'Setter', closer: 'Closer', sales_leader: 'Líder Comercial' };
const COMP_LABELS = { base_plus_comm: 'Base + Comisión', comm_only: 'Solo Comisión', fixed: 'Fijo' };
const MATCH_STATUS_LABELS = {
  matched: 'Solicitud enviada · En evaluación',
  interview_requested: '🎉 ¡Es un Match! Entrevista solicitada',
  accepted: '🎉 ¡Es un Match! Aceptado',
  declined: 'La empresa no continuó con este match',
};

const matchColor = (score) => (score >= 75 ? '#1D9E75' : score >= 50 ? '#C9920A' : '#E0605E');

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

const OpportunityHub = () => {
  const { user } = useAuth();

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
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.25em] text-accent-coral"><Briefcase size={16} /> Bolsa de Empleo</div>
          <h1 className="mt-2 text-3xl font-black text-text-primary md:text-4xl">SET Opportunity Hub</h1>
          <p className="mt-2 text-sm text-text-secondary">Marketplace de talento comercial de alto rendimiento. Sin postulaciones a ciegas.</p>
        </header>

        <div className="mb-6 rounded-2xl border border-accent-gold/25 bg-accent-gold/5 p-5">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-accent-gold"><Sparkles size={14} /> Tu criterio conversacional, auditado</div>
          <p className="mt-1.5 text-sm text-text-secondary">Las empresas te filtran por métricas reales de simulación, no por currículum. Entrena, sube tu SET Score y desbloquea mejores vacantes.</p>
        </div>

        {error && <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
        {successMsg && <div className="mb-5 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">{successMsg}</div>}

        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" /> Cargando marketplace...</div>
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
