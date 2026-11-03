import { useEffect, useState } from 'react';
import { Loader2, Plus, UserMinus, UserPlus, Users } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import {
  createCohort, getCohortMembers, getCohortsOverview, getPrograms, grantCohortAccess, revokeCohortAccess,
} from '../utils/adminCohorts';

const inputClass = 'min-h-11 w-full rounded-xl border border-border-subtle bg-bg-input px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-coral';

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const Members = ({ cohort, adminId, onCountChange }) => {
  const [state, setState] = useState({ loaded: false, members: [], error: '' });
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    getCohortMembers(cohort.id).then(({ members, error }) => {
      if (active) setState({ loaded: true, members, error });
    });
    return () => { active = false; };
  }, [cohort.id, reload]);

  const refresh = (delta) => { setReload((n) => n + 1); onCountChange(delta); };

  const handleGrant = async () => {
    setBusy('grant'); setMessage('');
    const { error } = await grantCohortAccess({ cohortId: cohort.id, email, grantedBy: adminId });
    setBusy('');
    if (error) { setMessage(error); return; }
    setEmail(''); setMessage('Acceso otorgado.'); refresh(1);
  };

  const handleRevoke = async (member) => {
    if (!window.confirm(`¿Revocar el acceso de ${member.name || member.email} a ${cohort.name}? Su progreso, XP y certificados no se borran.`)) return;
    setBusy(member.id); setMessage('');
    const { error } = await revokeCohortAccess(member.id);
    setBusy('');
    if (error) { setMessage(error); return; }
    setMessage('Acceso revocado.'); refresh(-1);
  };

  const active = state.members.filter((member) => member.active);
  const inactive = state.members.filter((member) => !member.active);

  return (
    <div className="mt-4 border-t border-border-subtle pt-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo de la cuenta registrada" className={inputClass} />
        <button type="button" onClick={handleGrant} disabled={busy === 'grant' || !email.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent-coral px-4 text-sm font-black text-white disabled:opacity-40">
          {busy === 'grant' ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Dar acceso
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-text-secondary">{message}</p>}
      {!state.loaded ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-text-secondary"><Loader2 size={14} className="animate-spin" /> Cargando miembros...</div>
      ) : state.error ? (
        <p className="mt-4 text-xs text-red-400">{state.error}</p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-border-subtle">
            {active.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-text-primary">{member.name || '(sin nombre)'}</span>
                  <span className="block truncate text-xs text-text-secondary">{member.email} · desde {formatDate(member.starts_at)}{member.ends_at ? ` · vence ${formatDate(member.ends_at)}` : ''}</span>
                </span>
                <button type="button" onClick={() => handleRevoke(member)} disabled={busy === member.id} className="inline-flex items-center gap-1 rounded-lg border border-border-subtle px-2 py-1 text-xs font-bold text-text-secondary hover:text-red-400 disabled:opacity-40">
                  {busy === member.id ? <Loader2 size={13} className="animate-spin" /> : <UserMinus size={13} />} Revocar
                </button>
              </li>
            ))}
            {active.length === 0 && <li className="py-2 text-xs text-text-secondary">Sin miembros con acceso vigente.</li>}
          </ul>
          {inactive.length > 0 && <p className="mt-2 text-xs text-text-secondary">{inactive.length} acceso(s) revocado(s) o vencido(s) se conservan en el historial.</p>}
        </>
      )}
    </div>
  );
};

const AdminCohorts = () => {
  const { user } = useAuth();
  const [data, setData] = useState({ loaded: false, cohorts: [], programs: [], error: '' });
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([getCohortsOverview(), getPrograms()]).then(([overview, programs]) => {
      if (active) setData({ loaded: true, cohorts: overview.cohorts, programs: programs.programs, error: overview.error || programs.error });
    });
    return () => { active = false; };
  }, []);

  const changeCount = (cohortId, delta) => setData((current) => ({
    ...current,
    cohorts: current.cohorts.map((cohort) => (cohort.id === cohortId ? { ...cohort, activeMembers: Math.max(0, cohort.activeMembers + delta) } : cohort)),
  }));

  const handleCreate = async () => {
    setSaving(true); setFormError('');
    const { cohort, error } = await createCohort(form);
    setSaving(false);
    if (error) { setFormError(error); return; }
    setData((current) => ({ ...current, cohorts: [...current.cohorts, cohort] }));
    setForm(null);
  };

  return (
    <Layout>
      <div className="mx-auto max-w-4xl animate-fade-in">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-accent-coral"><Users size={16} /> Administración</div>
            <h1 className="mt-2 text-3xl font-black text-text-primary">Generaciones</h1>
            <p className="mt-2 text-sm text-text-secondary">Quién pertenece a cada generación. Las clases de cada una se asignan en SET Academy.</p>
          </div>
          <button type="button" onClick={() => setForm({ programId: data.programs[0]?.id || '', name: '', slug: '', startsOn: '' })} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent-coral px-4 text-sm font-black text-white">
            <Plus size={16} /> Nueva generación
          </button>
        </div>

        {form && (
          <div className="mb-6 rounded-2xl border border-border-subtle bg-bg-card p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-text-secondary">Programa
                <select value={form.programId} onChange={(e) => setForm({ ...form, programId: e.target.value })} className={`${inputClass} mt-1`}>
                  {data.programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-text-secondary">Nombre
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="G3 …" className={`${inputClass} mt-1`} />
              </label>
              <label className="text-xs font-bold text-text-secondary">Identificador
                <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="g3-…" className={`${inputClass} mt-1`} />
              </label>
              <label className="text-xs font-bold text-text-secondary">Inicio
                <input type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} className={`${inputClass} mt-1`} />
              </label>
            </div>
            {formError && <p className="mt-3 text-xs text-red-400">{formError}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={handleCreate} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent-coral px-4 text-sm font-black text-white disabled:opacity-40">
                {saving && <Loader2 size={15} className="animate-spin" />} Crear
              </button>
              <button type="button" onClick={() => setForm(null)} className="min-h-11 rounded-xl border border-border-subtle px-4 text-sm font-bold text-text-secondary">Cancelar</button>
            </div>
          </div>
        )}

        {!data.loaded ? (
          <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" /> Cargando generaciones...</div>
        ) : data.error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{data.error}</div>
        ) : (
          <div className="space-y-4">
            {data.cohorts.map((cohort) => (
              <article key={cohort.id} className="rounded-2xl border border-border-subtle bg-bg-card p-5">
                <button type="button" onClick={() => setOpenId((current) => (current === cohort.id ? null : cohort.id))} className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={openId === cohort.id}>
                  <span>
                    <span className="block text-lg font-black text-text-primary">{cohort.name}</span>
                    <span className="block text-xs text-text-secondary">{cohort.slug} · inicio {formatDate(cohort.starts_on)}</span>
                  </span>
                  <span className="rounded-full bg-bg-input px-3 py-1 text-xs font-black text-text-primary">{cohort.activeMembers} con acceso</span>
                </button>
                {openId === cohort.id && <Members cohort={cohort} adminId={user.id} onCountChange={(delta) => changeCount(cohort.id, delta)} />}
              </article>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AdminCohorts;
