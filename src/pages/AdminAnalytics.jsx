import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { calcularMetricasAdmin } from '../utils/analytics';
import Layout from '../components/Layout';
import LevelBadge from '../components/LevelBadge';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { Users, BarChart2, Target, TrendingUp, AlertTriangle, CheckCircle, ChevronUp, ChevronDown } from 'lucide-react';
import { KPICard, ProgressBar } from './Analytics';

// ─── Color helpers ────────────────────────────────────────────────────────────

const scoreColor = (v) => v >= 80 ? '#1D9E75' : v >= 60 ? '#C9920A' : '#DC2626';
const pctColor   = (v) => v >= 70 ? '#1D9E75' : v >= 50 ? '#C9920A' : '#DC2626';

const NIVEL_COLORS = {
  'Novato':      '#DC2626',
  'Aprendiz':    '#D97706',
  'Practicante': '#C9920A',
  'Pro':         '#2563EB',
  'Élite':       '#1D9E75',
};

const BarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-card border border-border-subtle rounded-xl px-3 py-2 text-sm">
      <p className="text-text-secondary text-xs mb-1">{label}</p>
      <p className="font-bold text-text-primary">{payload[0].value} sesiones</p>
    </div>
  );
};

const PieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-card border border-border-subtle rounded-xl px-3 py-2 text-sm">
      <p className="font-bold text-text-primary">{payload[0].name}: {payload[0].value}</p>
    </div>
  );
};

// ─── Ranking table ────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { key: 'promedio', label: 'Promedio' },
  { key: 'agendamiento', label: 'Tasa agend.' },
  { key: 'sesiones', label: 'Sesiones' },
  { key: 'nivel', label: 'Nivel' },
];

const STATUS_CONFIG = {
  listo:   { label: 'Listo para proyecto', color: '#1D9E75', icon: CheckCircle },
  atencion:{ label: 'Necesita ayuda',       color: '#DC2626', icon: AlertTriangle },
  normal:  { label: 'En progreso',          color: '#9A9A9A', icon: null },
};

const SetterRow = ({ setter, rank, navigate }) => {
  const m = setter.metricas;
  const promedio = m.simulador?.promedio_total || 0;
  const agend    = m.leadsReales?.tasa_agendamiento || 0;
  const sesiones = m.simulador?.sesiones_totales || 0;

  const status = m.certificacion?.listo ? 'listo'
    : promedio < 50 && sesiones >= 3 ? 'atencion'
    : 'normal';
  const { label: statusLabel, color: statusColor, icon: StatusIcon } = STATUS_CONFIG[status];

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
        <LevelBadge level={setter.level || 1} size="sm" />
      </td>
      <td className="px-4 py-3 text-center">
        <span className="font-bold text-sm" style={{ color: scoreColor(promedio) }}>{promedio}/100</span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="font-bold text-sm" style={{ color: pctColor(agend) }}>{agend > 0 ? `${agend}%` : '—'}</span>
      </td>
      <td className="px-4 py-3 text-center text-text-secondary text-sm">{sesiones}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: statusColor }}>
          {StatusIcon && <StatusIcon size={12} />}
          {statusLabel}
        </div>
      </td>
    </tr>
  );
};

// ─── Main Admin Analytics page ────────────────────────────────────────────────

const AdminAnalytics = () => {
  const navigate = useNavigate();
  const metricas = useMemo(() => calcularMetricasAdmin(), []);
  const [sortBy, setSortBy] = useState('promedio');
  const [sortDir, setSortDir] = useState('desc');

  const toggleSort = (key) => {
    if (sortBy === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(key); setSortDir('desc'); }
  };

  const sortedRanking = useMemo(() => {
    return [...(metricas.ranking || [])].sort((a, b) => {
      const getVal = (s) => {
        if (sortBy === 'promedio')     return s.metricas.simulador?.promedio_total || 0;
        if (sortBy === 'agendamiento') return s.metricas.leadsReales?.tasa_agendamiento || 0;
        if (sortBy === 'sesiones')     return s.metricas.simulador?.sesiones_totales || 0;
        if (sortBy === 'nivel')        return s.level || 1;
        return 0;
      };
      return sortDir === 'desc' ? getVal(b) - getVal(a) : getVal(a) - getVal(b);
    });
  }, [metricas.ranking, sortBy, sortDir]);

  const pieData = Object.entries(metricas.distribucion_niveles || {})
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  const SortBtn = ({ col, label }) => {
    const active = sortBy === col;
    return (
      <th
        className="px-4 py-3 text-center cursor-pointer select-none hover:text-text-primary transition-colors"
        onClick={() => toggleSort(col)}
      >
        <span className="flex items-center justify-center gap-1 text-xs font-semibold uppercase tracking-wider"
          style={{ color: active ? '#E0605E' : '#9A9A9A' }}>
          {label}
          {active && (sortDir === 'desc' ? <ChevronDown size={10} /> : <ChevronUp size={10} />)}
        </span>
      </th>
    );
  };

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
            label="Leads agendados"
            value={`${metricas.leads_agendados_total} / ${metricas.leads_total}`}
            sub={metricas.leads_total ? `${Math.round((metricas.leads_agendados_total / metricas.leads_total) * 100)}% tasa global` : 'Sin leads'}
            color={pctColor(metricas.leads_total ? Math.round((metricas.leads_agendados_total / metricas.leads_total) * 100) : 0)}
          />
          <KPICard
            label="Promedio global"
            value={`${metricas.promedio_global}/100`}
            sub="plataforma"
            color={scoreColor(metricas.promedio_global)}
          />
        </div>

        {/* Sección B — Ranking */}
        <div className="bg-bg-card border border-border-subtle rounded-2xl overflow-hidden">
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
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">Nivel</th>
                    <SortBtn col="promedio" label="Promedio" />
                    <SortBtn col="agendamiento" label="Agend.%" />
                    <SortBtn col="sesiones" label="Sesiones" />
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
          <div className="bg-bg-card border border-border-subtle rounded-2xl p-5">
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

          {/* Listos para proyecto */}
          <div className="bg-bg-card border border-border-subtle rounded-2xl p-5">
            <h3 className="font-bold text-green-400 mb-3 flex items-center gap-2">
              <CheckCircle size={16} /> Listos para Proyecto ({metricas.listos_para_proyecto?.length || 0})
            </h3>
            {metricas.listos_para_proyecto?.length === 0 ? (
              <p className="text-text-secondary text-sm italic">Aún nadie ha completado los criterios</p>
            ) : (
              <div className="space-y-2">
                {metricas.listos_para_proyecto?.map(s => (
                  <div key={s.id} className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">
                    <div>
                      <span className="text-text-primary text-sm font-medium">{s.name}</span>
                      <span className="text-green-400 text-xs ml-2">
                        {s.metricas.simulador?.promedio_total}/100 · {s.metricas.leadsReales?.tasa_agendamiento || 0}% agend.
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

        {/* Sección D+E — Gráficas */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Distribución por nivel (pie) */}
          <div className="bg-bg-card border border-border-subtle rounded-2xl p-5">
            <h3 className="font-bold text-text-primary mb-4">Distribución por Nivel</h3>
            {pieData.length === 0 ? (
              <p className="text-text-secondary text-sm italic text-center py-8">Sin datos</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                      {pieData.map(({ name }) => (
                        <Cell key={name} fill={NIVEL_COLORS[name] || '#9A9A9A'} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 flex-1">
                  {pieData.map(({ name, value }) => (
                    <div key={name} className="flex items-center gap-2 text-sm">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: NIVEL_COLORS[name] }} />
                      <span className="text-text-secondary flex-1">{name}</span>
                      <span className="font-bold text-text-primary">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Actividad 14 días (barras) */}
          <div className="bg-bg-card border border-border-subtle rounded-2xl p-5">
            <h3 className="font-bold text-text-primary mb-4">Actividad — últimos 14 días</h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={metricas.actividad_barras || []} barSize={10}>
                <CartesianGrid strokeDasharray="3 3" stroke="#242424" />
                <XAxis
                  dataKey="fecha"
                  tick={{ fill: '#9A9A9A', fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  interval={2}
                />
                <YAxis tick={{ fill: '#9A9A9A', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<BarTooltip />} cursor={{ fill: '#E0605E10' }} />
                <Bar dataKey="sesiones" radius={[4, 4, 0, 0]}>
                  {(metricas.actividad_barras || []).map((entry, i) => (
                    <Cell key={i} fill={entry.sesiones > 0 ? '#E0605E' : '#242424'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default AdminAnalytics;
