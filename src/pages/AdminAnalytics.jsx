import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { calcularMetricasAdminReal } from '../utils/analytics';
import Layout from '../components/Layout';
import PracticeLevelBadge from '../components/PracticeLevelBadge';
import { PRACTICE_LEVELS } from '../utils/practiceLevel';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { Users, BarChart2, Loader2, AlertTriangle, CheckCircle, ChevronUp, ChevronDown, Zap } from 'lucide-react';
import { KPICard, ProgressBar } from './Analytics';

const MODE_META = {
  outbound: { label: 'Outbound', color: '#2563EB' },
  inbound: { label: 'Inbound', color: '#1D9E75' },
  reactivacion: { label: 'Reactivación', color: '#DC2626' },
};

const formatRelativeDate = (isoString) => {
  if (!isoString) return 'Sin actividad';
  const days = Math.floor((Date.now() - new Date(isoString)) / 86400000);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days}d`;
  return new Date(isoString).toLocaleDateString('es', { day: '2-digit', month: 'short' });
};

// ─── Color helpers ────────────────────────────────────────────────────────────

const scoreColor = (v) => v >= 80 ? '#1D9E75' : v >= 60 ? '#C9920A' : '#DC2626';

// Colores de la distribución por nivel de práctica: se leen de la fuente única
// (practiceLevel.js), sin mapa de niveles propio en esta pantalla.
const PRACTICE_LEVEL_COLORS = Object.fromEntries(PRACTICE_LEVELS.map(level => [level.name, level.color]));

const BarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card-tactical rounded-xl px-3 py-2 text-sm">
      <p className="text-text-secondary text-xs mb-1">{label}</p>
      <p className="font-bold text-text-primary">{payload[0].value} sesiones</p>
    </div>
  );
};

const PieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card-tactical rounded-xl px-3 py-2 text-sm">
      <p className="font-bold text-text-primary">{payload[0].name}: {payload[0].value}</p>
    </div>
  );
};

// ─── Ranking table ────────────────────────────────────────────────────────────


const SortBtn = ({ col, label, sortBy, sortDir, onSort }) => {
  const active = sortBy === col;
  return (
    <th
      className="px-4 py-3 text-center cursor-pointer select-none hover:text-text-primary transition-colors"
      onClick={() => onSort(col)}
    >
      <span className="flex items-center justify-center gap-1 text-xs font-semibold uppercase tracking-wider"
        style={{ color: active ? '#E0605E' : '#9A9A9A' }}>
        {label}
        {active && (sortDir === 'desc' ? <ChevronDown size={10} /> : <ChevronUp size={10} />)}
      </span>
    </th>
  );
};

const SetterRow = ({ setter, rank, navigate }) => {
  // SET Score oficial (profiles.set_score) y simulaciones válidas: métricas
  // independientes. El "Estado" es SOLO el mínimo de práctica (volumen);
  // "Necesita ayuda" es una alerta de desempeño aparte, no un estado de nivel.
  const setScore = Math.round(setter.set_score || 0);
  const validSimulations = setter.validSimulations || 0;
  const needsHelp = setScore < 50 && validSimulations >= 3;

  return (
    <tr
      className="border-b border-border-subtle hover:bg-bg-input/30 cursor-pointer transition-colors"
      onClick={() => navigate(`/admin/setter/${setter.id}`)}
    >
      <td className="px-4 py-3 text-center text-text-secondary text-sm font-bold">{rank}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-accent-coral/20 flex items-center justify-center text-accent-coral font-bold text-sm flex-shrink-0">
            {setter.name?.[0]?.toUpperCase()}
          </div>
          <span className="text-text-primary text-sm font-medium">{setter.name}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <PracticeLevelBadge validSimulations={validSimulations} size="sm" />
      </td>
      <td className="px-4 py-3 text-center">
        <span className="font-bold text-sm" style={{ color: scoreColor(setScore) }}>{setScore}/100</span>
      </td>
      <td className="px-4 py-3 text-center text-text-secondary text-sm">{validSimulations}</td>
      <td className="px-4 py-3 text-center text-text-secondary text-xs">{formatRelativeDate(setter.lastActivity)}</td>
      <td className="px-4 py-3">
        <div className="text-xs font-medium" style={{ color: setter.practiceMinimum?.met ? '#1D9E75' : '#9A9A9A' }}>
          {setter.practiceMinimum?.label || 'En entrenamiento'}
        </div>
        {needsHelp && (
          <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-red-400">
            <AlertTriangle size={11} /> Necesita ayuda
          </div>
        )}
      </td>
    </tr>
  );
};

// ─── Main Admin Analytics page ────────────────────────────────────────────────

const EMPTY_METRICAS = {
  total_setters: 0, setters_activos: 0, simulaciones_total: 0, simulaciones_esta_semana: 0,
  set_score_promedio_cohorte: 0, por_modo_global: [], ranking: [], minimo_practica_cumplido: [],
  sin_actividad_7_dias: [], bajo_rendimiento: [], distribucion_niveles: {}, actividad_barras: [],
};

const AdminAnalytics = () => {
  const navigate = useNavigate();
  const [metricas, setMetricas] = useState(EMPTY_METRICAS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('set_score');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    let active = true;
    calcularMetricasAdminReal().then((result) => {
      if (!active) return;
      setMetricas(result);
      if (result.error) setError(`No pudimos cargar algunos datos: ${result.error}`);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const toggleSort = (key) => {
    if (sortBy === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(key); setSortDir('desc'); }
  };

  const sortedRanking = useMemo(() => {
    return [...(metricas.ranking || [])].sort((a, b) => {
      const getVal = (s) => {
        if (sortBy === 'set_score')     return s.set_score || 0;
        if (sortBy === 'simulaciones')  return s.validSimulations || 0;
        if (sortBy === 'actividad') return s.lastActivity ? new Date(s.lastActivity).getTime() : 0;
        return 0;
      };
      return sortDir === 'desc' ? getVal(b) - getVal(a) : getVal(a) - getVal(b);
    });
  }, [metricas.ranking, sortBy, sortDir]);

  const pieData = Object.entries(metricas.distribucion_niveles || {})
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6 pb-10">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-black text-text-primary flex items-center gap-2">
            <BarChart2 size={22} className="text-accent-coral" />
            Analytics Admin
          </h1>
          <p className="text-text-secondary text-sm mt-0.5">
            Visión global de todos los setters y la plataforma
          </p>
        </div>

        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-text-secondary">
            <Loader2 size={18} className="animate-spin" /> Cargando métricas de la cohorte...
          </div>
        ) : (
        <>
        {/* Sección A — KPIs globales */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard
            label="Setters activos"
            value={metricas.setters_activos}
            sub={`de ${metricas.total_setters} total`}
            color="#F5F5F5"
          />
          <KPICard
            label="Simulaciones esta semana"
            value={metricas.simulaciones_esta_semana}
            sub={`${metricas.simulaciones_total} total`}
            color="#E0605E"
          />
          <KPICard
            label="Simulaciones totales"
            value={metricas.simulaciones_total}
            sub="histórico de la cohorte"
            color="#C9920A"
          />
          {/* SET Score promedio de COHORTE: media de profiles.set_score de los
              setters con práctica — no es el SET Score de ningún setter ni se
              recalcula desde simulator_sessions (ver analytics.js). */}
          <KPICard
            label="SET Score promedio"
            value={`${metricas.set_score_promedio_cohorte}/100`}
            sub="cohorte · setters con práctica"
            color={scoreColor(metricas.set_score_promedio_cohorte)}
          />
        </div>

        {/* Sección B — Ranking */}
        <div className="card-tactical rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
            <h3 className="font-bold text-text-primary flex items-center gap-2">
              <Users size={16} className="text-accent-coral" /> Ranking de Setters
            </h3>
            <span className="text-text-secondary text-xs">Clic en setter → ver detalle</span>
          </div>
          {sortedRanking.length === 0 ? (
            <div className="p-8 text-center text-text-secondary text-sm">
              No hay setters registrados aún
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border-subtle">
                  <tr>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-text-secondary">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">Setter</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">Nivel de práctica</th>
                    <SortBtn col="set_score" label="SET Score" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <SortBtn col="simulaciones" label="Simulaciones" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <SortBtn col="actividad" label="Última act." sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRanking.map((setter, i) => (
                    <SetterRow key={setter.id} setter={setter} rank={i + 1} navigate={navigate} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sección C — Alertas */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Necesitan atención */}
          <div className="card-tactical rounded-2xl p-5">
            <h3 className="font-bold text-red-400 mb-3 flex items-center gap-2">
              <AlertTriangle size={16} /> Requieren Atención ({metricas.bajo_rendimiento?.length + metricas.sin_actividad_7_dias?.length || 0})
            </h3>
            {metricas.bajo_rendimiento?.length === 0 && metricas.sin_actividad_7_dias?.length === 0 ? (
              <p className="text-text-secondary text-sm italic">Todo en orden ✓</p>
            ) : (
              <div className="space-y-2">
                {metricas.bajo_rendimiento?.map(s => (
                  <div key={s.id} className="flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                    <div>
                      <span className="text-text-primary text-sm font-medium">{s.name}</span>
                      <span className="text-red-400 text-xs ml-2">promedio bajo en últimas sesiones</span>
                    </div>
                    <button onClick={() => navigate(`/admin/setter/${s.id}`)}
                      className="text-xs text-red-400 hover:underline flex-shrink-0">Ver →</button>
                  </div>
                ))}
                {metricas.sin_actividad_7_dias?.map(s => (
                  <div key={s.id} className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                    <div>
                      <span className="text-text-primary text-sm font-medium">{s.name}</span>
                      <span className="text-amber-400 text-xs ml-2">sin actividad +7 días</span>
                    </div>
                    <button onClick={() => navigate(`/admin/setter/${s.id}`)}
                      className="text-xs text-amber-400 hover:underline flex-shrink-0">Ver →</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mínimo de práctica cumplido — SOLO volumen (≥ 20 simulaciones
              válidas). NO implica elegibilidad SET Match, Setter Verified ni
              certificación: esas decisiones son administrativas. */}
          <div className="card-tactical rounded-2xl p-5">
            <h3 className="font-bold text-green-400 mb-1 flex items-center gap-2">
              <CheckCircle size={16} /> Mínimo de práctica cumplido ({metricas.minimo_practica_cumplido?.length || 0})
            </h3>
            <p className="text-text-secondary text-xs mb-3">Solo indica volumen de entrenamiento. No es elegibilidad ni certificación.</p>
            {metricas.minimo_practica_cumplido?.length === 0 ? (
              <p className="text-text-secondary text-sm italic">Aún nadie llega al mínimo de práctica</p>
            ) : (
              <div className="space-y-2">
                {metricas.minimo_practica_cumplido?.map(s => (
                  <div key={s.id} className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">
                    <div>
                      <span className="text-text-primary text-sm font-medium">{s.name}</span>
                      <span className="text-green-400 text-xs ml-2">
                        {s.validSimulations} simulaciones · SET Score {Math.round(s.set_score || 0)}
                      </span>
                    </div>
                    <button onClick={() => navigate(`/admin/setter/${s.id}`)}
                      className="text-xs text-green-400 hover:underline flex-shrink-0">Ver →</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sección D — Distribución por modo */}
        <div className="card-tactical rounded-2xl p-5">
          <h3 className="font-bold text-text-primary mb-4 flex items-center gap-2">
            <Zap size={16} className="text-accent-coral" /> Distribución de Actividad por Modo
          </h3>
          <p className="text-text-secondary text-xs -mt-2 mb-3">Sesiones iniciadas (incluye las no puntuadas).</p>
          {!metricas.por_modo_global?.some(m => m.sesiones > 0) ? (
            <p className="text-text-secondary text-sm italic text-center py-4">Sin sesiones registradas aún</p>
          ) : (
            <div className="space-y-3">
              {metricas.por_modo_global.map(({ mode, sesiones, pct: modePct }) => (
                <div key={mode} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary font-medium">{MODE_META[mode].label}</span>
                    <span className="font-bold text-text-primary">{sesiones} <span className="text-text-secondary font-normal">({modePct}%)</span></span>
                  </div>
                  <ProgressBar value={modePct} color={MODE_META[mode].color} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sección E+F — Gráficas */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Distribución por nivel (pie) */}
          <div className="card-tactical rounded-2xl p-5">
            <h3 className="font-bold text-text-primary mb-4">Distribución por Nivel de Práctica</h3>
            {pieData.length === 0 ? (
              <p className="text-text-secondary text-sm italic text-center py-8">Sin datos</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                      {pieData.map(({ name }) => (
                        <Cell key={name} fill={PRACTICE_LEVEL_COLORS[name] || '#9A9A9A'} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 flex-1">
                  {pieData.map(({ name, value }) => (
                    <div key={name} className="flex items-center gap-2 text-sm">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PRACTICE_LEVEL_COLORS[name] }} />
                      <span className="text-text-secondary flex-1">{name}</span>
                      <span className="font-bold text-text-primary">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Actividad 14 días (barras) */}
          <div className="card-tactical rounded-2xl p-5">
            <h3 className="font-bold text-text-primary mb-1">Actividad — últimos 14 días</h3>
            <p className="text-text-secondary text-xs mb-3">Sesiones iniciadas por día (incluye las no puntuadas).</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={metricas.actividad_barras || []} barSize={10}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff14" />
                <XAxis
                  dataKey="fecha"
                  tick={{ fill: '#94a3b8', fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  interval={2}
                />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<BarTooltip />} cursor={{ fill: '#E0605E10' }} />
                <Bar dataKey="sesiones" radius={[4, 4, 0, 0]}>
                  {(metricas.actividad_barras || []).map((entry, i) => (
                    <Cell key={i} fill={entry.sesiones > 0 ? '#E0605E' : '#262B31'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        </>
        )}
      </div>
    </Layout>
  );
};

export default AdminAnalytics;
