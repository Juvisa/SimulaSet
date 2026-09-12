import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { calcularMetricasAdminReal } from '../utils/analytics';
import { MISSION_01 } from '../data/missions';
import Layout from '../components/Layout';
import LevelBadge from '../components/LevelBadge';
import ModeBadge from '../components/ModeBadge';
import { Users, Play, BarChart2, TrendingUp, ChevronRight, Search, BookOpen, Sparkles, Trophy, Loader2 } from 'lucide-react';

const StatCard = ({ label, value, icon: Icon, color }) => (
  <div className="card-tactical rounded-2xl p-5">
    <div className="flex items-center justify-between mb-2"><span className="text-text-secondary text-xs font-medium uppercase tracking-wider">{label}</span><Icon size={16} style={{ color }} /></div>
    <div className="text-2xl font-black text-text-primary">{value}</div>
  </div>
);

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [metricas, setMetricas] = useState(null);
  const [cohort, setCohort] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      const [metricasResult, { data: progress, error: progressError }] = await Promise.all([
        calcularMetricasAdminReal(),
        supabase.from('mission_progress').select('user_id, mission_id, responses, status, completed_at, updated_at').eq('mission_id', MISSION_01.id),
      ]);
      if (!active) return;

      setMetricas(metricasResult);
      if (metricasResult.error) setError(`No pudimos cargar algunas métricas: ${metricasResult.error}`);
      else if (progressError) setError(`No pudimos cargar el progreso de la Misión 01: ${progressError.message}`);

      // La cohorte reutiliza el ranking que ya trajo calcularMetricasAdminReal
      // (evita una segunda consulta a profiles) — solo se reordena de vuelta
      // por fecha de registro, porque esta sección es un roster, no un ranking.
      const progressByUser = new Map((progress || []).map(item => [item.user_id, item]));
      const roster = [...(metricasResult.ranking || [])]
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map(profile => {
          const mission = progressByUser.get(profile.id);
          const evaluation = mission?.responses?._evaluation;
          const validEvaluation = evaluation?.version === MISSION_01.version ? evaluation.data : null;
          return { ...profile, mission, evaluation: validEvaluation };
        });
      setCohort(roster);
      setLoading(false);
    };

    load();
    return () => { active = false; };
  }, []);

  const evaluated = cohort.filter(item => Number.isFinite(item.evaluation?.setScore));
  const cohortAverage = evaluated.length ? Math.round(evaluated.reduce((sum, item) => sum + item.evaluation.setScore, 0) / evaluated.length) : 0;
  const leader = [...evaluated].sort((a, b) => b.evaluation.setScore - a.evaluation.setScore)[0];

  const ranking = metricas?.ranking || [];
  const todaySessions = metricas?.actividad_barras?.[metricas.actividad_barras.length - 1]?.sesiones || 0;

  const filteredSetters = ranking.filter(u => {
    const matchSearch = (u.name || '').toLowerCase().includes(search.toLowerCase()) || (u.email || '').toLowerCase().includes(search.toLowerCase());
    const matchLevel = !filterLevel || String(u.level || 1) === filterLevel;
    return matchSearch && matchLevel;
  });

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-text-secondary">
          <Loader2 size={18} className="animate-spin" /> Cargando panel de administración...
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6"><h1 className="text-2xl font-bold text-text-primary flex items-center gap-2"><span className="text-accent-coral">Admin</span> — DIGITAL SET</h1><p className="text-text-secondary text-sm mt-1">Panel de control global</p></div>

      {error && <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Alumnos" value={cohort.length || metricas?.total_setters || 0} icon={Users} color="#E0605E" />
        <StatCard label="Evaluados M01" value={evaluated.length} icon={Sparkles} color="#2563EB" />
        <StatCard label="SET Score cohorte" value={`${cohortAverage}/100`} icon={TrendingUp} color="#1D9E75" />
        <StatCard label="Mejor SET Score" value={leader ? `${leader.evaluation.setScore}/100` : '—'} icon={Trophy} color="#C9920A" />
      </div>

      <section className="card-tactical mb-8 rounded-2xl border-accent-coral/20 p-5 md:p-6">
        <div className="flex items-center gap-2 text-accent-coral font-black"><Sparkles size={18} /> Pulso de la cohorte · Misión 01</div>
        <p className="mt-1 text-xs text-text-secondary">Evidencia real del SET Evaluator. Este será el punto de partida del motor de actividad y reconocimiento.</p>
        {cohort.length === 0 ? <div className="mt-5 rounded-xl bg-bg-input p-4 text-sm text-text-secondary">Aún no hay alumnos visibles en la cohorte.</div> : (
          <div className="mt-5 space-y-2">
            {cohort.map(student => {
              const score = student.evaluation?.setScore;
              const dimensions = student.evaluation?.dimensions;
              return <div key={student.id} className="rounded-xl border border-border-subtle bg-bg-input/50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0"><div className="font-bold text-sm text-text-primary">{student.name}</div><div className="text-xs text-text-secondary truncate">{student.email}</div></div>
                  {Number.isFinite(score) ? <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-accent-coral/10 px-3 py-1.5 font-black text-accent-coral">SET {score}/100</span>
                    <span className="rounded-full border border-border-subtle px-3 py-1.5 font-bold text-text-secondary">{student.evaluation.level || 'Evaluado'}</span>
                  </div> : <span className="text-xs font-bold text-text-secondary">{student.mission?.status === 'completed' ? 'Evaluación pendiente' : student.mission ? 'Misión en progreso' : 'Sin iniciar'}</span>}
                </div>
                {dimensions && <div className="mt-3 grid grid-cols-4 gap-2 border-t border-border-subtle pt-3">{[['situacion','S'],['emocion','E'],['transicion','T'],['movimiento','Mov.']].map(([key,label]) => <div key={key} className="text-center"><div className="text-[10px] font-black text-text-secondary">{label}</div><div className="mt-0.5 font-black text-sm text-text-primary">{dimensions[key]?.score ?? '—'}</div></div>)}</div>}
                {student.evaluation?.mainOpportunity && <div className="mt-3 text-xs leading-relaxed text-text-secondary"><span className="font-black text-accent-gold">Oportunidad:</span> {student.evaluation.mainOpportunity}</div>}
              </div>;
            })}
          </div>
        )}
      </section>

      <button type="button" onClick={() => navigate('/admin/academy')} className="card-tactical mb-8 flex min-h-16 w-full items-center gap-4 rounded-2xl p-4 text-left transition-all hover:border-accent-coral/30">
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-accent-coral/20 text-accent-coral"><BookOpen size={20} /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-text-primary">Gestionar Academy</span><span className="mt-0.5 block text-xs text-text-secondary">Crear, editar y organizar las clases de SET Academy.</span></span><ChevronRight size={18} className="flex-shrink-0 text-text-secondary" />
      </button>

      <div className="mb-4"><h2 className="font-black text-text-primary">Simulador · Actividad real</h2><p className="text-xs text-text-secondary mt-1">Sesiones reales de la plataforma (Supabase), no datos locales del navegador.</p></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Setters" value={metricas?.total_setters || 0} icon={Users} color="#E0605E" />
        <StatCard label="Sesiones hoy" value={todaySessions} icon={Play} color="#2563EB" />
        <StatCard label="Total sesiones" value={metricas?.simulaciones_total || 0} icon={TrendingUp} color="#1D9E75" />
        <StatCard label="Promedio global" value={`${metricas?.promedio_global || 0}/100`} icon={BarChart2} color="#C9920A" />
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" /><input value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-bg-input border border-border-subtle rounded-xl pl-9 pr-4 py-2.5 text-text-primary placeholder-text-secondary text-sm focus:border-accent-coral transition-colors" placeholder="Buscar setter..." /></div>
        <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} className="bg-bg-input border border-border-subtle rounded-xl px-4 py-2.5 text-text-primary text-sm focus:border-accent-coral transition-colors"><option value="">Todos los niveles</option><option value="1">Novato</option><option value="2">Aprendiz</option><option value="3">Practicante</option><option value="4">Pro</option><option value="5">Élite</option></select>
      </div>

      {filteredSetters.length === 0 ? <div className="card-tactical rounded-2xl p-12 text-center"><div className="text-4xl mb-3">👤</div><div className="text-text-secondary">Sin setters registrados aún</div></div> : <div className="space-y-2">{filteredSetters.map(u => {
        const porModo = u.metricas?.simulador?.por_modo || {};
        const topMode = Object.entries(porModo).sort((a, b) => (b[1]?.sesiones || 0) - (a[1]?.sesiones || 0))[0]?.[0];
        const promedio = u.metricas?.simulador?.promedio_total || 0;
        const totalSesiones = u.metricas?.simulador?.sesiones_totales || 0;
        return <button key={u.id} onClick={() => navigate(`/admin/setter/${u.id}`)} className="card-tactical w-full rounded-2xl p-4 flex items-center gap-4 hover:border-accent-coral/30 transition-all text-left"><div className="w-10 h-10 rounded-full bg-accent-coral/20 flex items-center justify-center text-accent-coral font-bold text-sm flex-shrink-0">{u.name?.[0]?.toUpperCase()}</div><div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-0.5"><span className="font-semibold text-text-primary text-sm">{u.name}</span><LevelBadge level={u.level || 1} size="sm" showName={false} /></div><div className="text-text-secondary text-xs">{u.email}</div></div><div className="hidden md:flex items-center gap-6 text-sm"><div className="text-center"><div className="font-bold text-text-primary">{totalSesiones}</div><div className="text-text-secondary text-xs">sesiones</div></div><div className="text-center"><div className="font-bold" style={{ color: promedio >= 80 ? '#1D9E75' : promedio >= 60 ? '#C9920A' : '#DC2626' }}>{promedio}/100</div><div className="text-text-secondary text-xs">promedio</div></div>{topMode && <div className="text-center"><ModeBadge mode={topMode} size="sm" /><div className="text-text-secondary text-xs mt-1">modo favorito</div></div>}<div className="text-center"><div className="text-text-secondary text-xs">{u.lastActivity ? new Date(u.lastActivity).toLocaleDateString('es') : 'Sin actividad'}</div><div className="text-text-secondary text-xs">última actividad</div></div></div><ChevronRight size={16} className="text-text-secondary flex-shrink-0" /></button>;
      })}</div>}
    </Layout>
  );
};

export default AdminDashboard;
