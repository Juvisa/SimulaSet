import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { calcularMetricasSetter } from '../utils/analytics';
import Layout from '../components/Layout';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, Award, Target, Users, BarChart2, AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react';

// ─── Reusable components ──────────────────────────────────────────────────────

const scoreColor = (v) => v >= 80 ? '#1D9E75' : v >= 60 ? '#C9920A' : '#DC2626';
const pctColor   = (v) => v >= 70 ? '#1D9E75' : v >= 50 ? '#C9920A' : '#DC2626';

export const ProgressBar = ({ value, max = 100, color }) => {
  const c = color || scoreColor(value);
  return (
    <div className="w-full bg-bg-input rounded-full h-2 overflow-hidden">
      <div
        className="h-2 rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, (value / max) * 100)}%`, backgroundColor: c }}
      />
    </div>
  );
};

export const KPICard = ({ label, value, sub, trend, color }) => {
  const c = color || '#F5F5F5';
  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor = trend > 0 ? '#1D9E75' : trend < 0 ? '#DC2626' : '#9A9A9A';
  return (
    <div className="bg-bg-card border border-border-subtle rounded-2xl p-5 flex flex-col gap-1">
      <span className="text-text-secondary text-xs font-medium uppercase tracking-wider">{label}</span>
      <span className="text-3xl font-black" style={{ color: c }}>{value}</span>
      <div className="flex items-center gap-2 mt-1">
        {sub && <span className="text-text-secondary text-xs">{sub}</span>}
        {trend !== null && trend !== undefined && (
          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: trendColor }}>
            <TrendIcon size={12} />
            {trend > 0 ? `+${trend}` : trend} vs sem. ant.
          </span>
        )}
      </div>
    </div>
  );
};

const ModeCard = ({ mode, data, isBest, isWorst }) => {
  const MODE_CONFIG = {
    outbound:    { label: 'Outbound',    color: '#2563EB', emoji: '🔵', metricLabel: 'Lead pidió la llamada' },
    inbound:     { label: 'Inbound',     color: '#1D9E75', emoji: '🟢', metricLabel: 'Confirmó con entusiasmo' },
    reactivacion:{ label: 'Reactivación',color: '#DC2626', emoji: '🔴', metricLabel: 'Quiso reagendar' },
  };
  const navigate = useNavigate();
  const cfg = MODE_CONFIG[mode];
  if (!data) return null;

  return (
    <div className="bg-bg-card border border-border-subtle rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>{cfg.emoji}</span>
          <span className="font-bold text-text-primary">{cfg.label}</span>
          {isBest && <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">Más fuerte ⭐</span>}
          {isWorst && <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">Mejorar ⚠</span>}
        </div>
        <span className="text-text-secondary text-xs">{data.sesiones} sesiones</span>
      </div>

      {data.sesiones === 0 ? (
        <p className="text-text-secondary text-sm italic">Sin sesiones aún</p>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Promedio</span>
              <span className="font-bold" style={{ color: scoreColor(data.promedio) }}>{data.promedio}/100</span>
            </div>
            <ProgressBar value={data.promedio} color={cfg.color} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">{cfg.metricLabel}</span>
              <span className="font-bold" style={{ color: pctColor(data.tasaExito) }}>{data.tasaExito}%</span>
            </div>
            <ProgressBar value={data.tasaExito} color={pctColor(data.tasaExito)} />
          </div>
        </>
      )}

      {isWorst && data.sesiones < 5 && (
        <button
          onClick={() => navigate('/simulate', { state: { preselect: mode } })}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold border transition-all"
          style={{ borderColor: cfg.color + '50', color: cfg.color, backgroundColor: cfg.color + '10' }}
        >
          Ir al Simulador modo {cfg.label} <ArrowRight size={12} />
        </button>
      )}
    </div>
  );
};

const SETSemaphore = ({ setMetrics, navigate }) => {
  if (!setMetrics) return null;
  const stages = [
    { key: 'S', label: 'S — Situación',    desc: 'Diagnóstico del prospecto' },
    { key: 'E', label: 'E — Emoción',      desc: 'Activar el dolor / urgencia' },
    { key: 'T', label: 'T — Transacción',  desc: 'Proponer la cita / cierre' },
  ];
  const debil = setMetrics.punto_debil;

  const stageColor = (v) => v >= 75 ? '#1D9E75' : v >= 50 ? '#C9920A' : '#DC2626';
  const stageIcon  = (v) => v >= 75 ? '✓' : v >= 50 ? '↗' : '⚠';

  const consejos = {
    S: 'Estás saltando al dolor antes de entender bien la situación. Haz más preguntas de diagnóstico antes de avanzar.',
    E: 'Estás yendo a la T antes de activar bien el dolor. Practica más el discovery emocional.',
    T: 'Llegas bien al dolor pero no estás cerrando la cita. Trabaja en presentar la propuesta con más confianza.',
  };

  return (
    <div className="bg-bg-card border border-border-subtle rounded-2xl p-5 space-y-4">
      <h3 className="font-bold text-text-primary">¿Qué tan bien ejecutas cada etapa?</h3>
      <div className="space-y-3">
        {stages.map(({ key, label }) => {
          const val = setMetrics[key];
          const c = stageColor(val);
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary font-medium">{label}</span>
                <span className="font-bold flex items-center gap-1.5" style={{ color: c }}>
                  {val}%  <span>{stageIcon(val)}</span>
                </span>
              </div>
              <ProgressBar value={val} color={c} />
            </div>
          );
        })}
      </div>
      {debil && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-2">
          <p className="text-amber-400 text-sm font-semibold">
            💡 Tu punto débil es la Etapa {debil}
          </p>
          <p className="text-text-secondary text-xs leading-relaxed">{consejos[debil]}</p>
          <button
            onClick={() => navigate('/simulate')}
            className="flex items-center gap-1.5 text-amber-400 text-xs font-medium hover:underline"
          >
            Practicar Etapa {debil} <ArrowRight size={11} />
          </button>
        </div>
      )}
    </div>
  );
};

const CertBadge = ({ cert, userName }) => {
  const NIVEL_LABELS = ['', 'Novato', 'Aprendiz', 'Practicante', 'Pro', 'Élite'];
  const allModes = ['outbound', 'inbound', 'reactivacion'];
  const faltanModos = cert.modos_faltantes || [];

  if (cert.listo) {
    return (
      <div className="rounded-2xl p-6 text-center space-y-3" style={{ background: 'linear-gradient(135deg, #C9920A20, #F59E0B10)', border: '1px solid #C9920A40' }}>
        <div className="text-4xl">🏆</div>
        <h3 className="text-xl font-black" style={{ color: '#C9920A' }}>SETTER ÉLITE</h3>
        <p className="text-text-secondary text-sm">Método S.E.T. Certificado</p>
        <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
          <div className="bg-bg-input rounded-xl p-2">
            <div className="font-bold text-green-400">{cert.promedio_simulador}/100</div>
            <div className="text-text-secondary mt-0.5">Promedio simulador</div>
          </div>
          <div className="bg-bg-input rounded-xl p-2">
            <div className="font-bold text-green-400">{cert.leads_reales}</div>
            <div className="text-text-secondary mt-0.5">Leads reales</div>
          </div>
          <div className="bg-bg-input rounded-xl p-2">
            <div className="font-bold text-green-400">3/3</div>
            <div className="text-text-secondary mt-0.5">Modos dominados</div>
          </div>
        </div>
        <p className="text-text-secondary text-xs mt-2">Haz captura de pantalla para compartir tu certificado 📸</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-card border border-border-subtle rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="text-2xl">🎯</div>
        <div>
          <h3 className="font-bold text-text-primary">Certificación Setter Élite</h3>
          <p className="text-text-secondary text-xs">Completa los 3 requisitos para certificarte</p>
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-text-secondary text-sm">Promedio simulador ≥ 80</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: scoreColor(cert.promedio_simulador) }}>
              {cert.promedio_simulador}/100
            </span>
            {cert.promedio_simulador >= 80
              ? <CheckCircle size={14} className="text-green-400" />
              : <AlertTriangle size={14} className="text-amber-400" />}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-secondary text-sm">Leads reales ≥ 5</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: cert.leads_reales >= 5 ? '#1D9E75' : '#C9920A' }}>
              {cert.leads_reales}/5
            </span>
            {cert.leads_reales >= 5
              ? <CheckCircle size={14} className="text-green-400" />
              : <AlertTriangle size={14} className="text-amber-400" />}
          </div>
        </div>
        {allModes.map(m => {
          const done = !cert.modos_faltantes?.includes(m);
          const labels = { outbound: 'Outbound', inbound: 'Inbound', reactivacion: 'Reactivación' };
          return (
            <div key={m} className="flex items-center justify-between">
              <span className="text-text-secondary text-sm">5 sesiones {labels[m]}</span>
              {done
                ? <CheckCircle size={14} className="text-green-400" />
                : <AlertTriangle size={14} className="text-amber-400" />}
            </div>
          );
        })}
      </div>
      {faltanModos.length > 0 && (
        <p className="text-text-secondary text-xs bg-bg-input rounded-xl p-3">
          Te faltan 5 sesiones en {faltanModos.map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(' y ')} con promedio &gt; 80 para la certificación.
        </p>
      )}
    </div>
  );
};

// ─── Custom recharts tooltip ──────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-card border border-border-subtle rounded-xl px-3 py-2 text-sm">
      <p className="text-text-secondary text-xs mb-1">{label}</p>
      <p className="font-bold text-text-primary">{payload[0].value}/100</p>
    </div>
  );
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

// ─── Main Analytics page ──────────────────────────────────────────────────────

const Analytics = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const metricas = useMemo(() => calcularMetricasSetter(user?.id), [user?.id]);

  const { simulador, leadsReales, set: setM, curva, certificacion } = metricas;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6 pb-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-text-primary flex items-center gap-2">
              <BarChart2 size={22} className="text-accent-coral" />
              Mi Performance
            </h1>
            <p className="text-text-secondary text-sm mt-0.5">
              Todo calculado en tiempo real desde tus sesiones
            </p>
          </div>
        </div>

        {/* Sección A — 4 KPIs */}
        {!simulador && !leadsReales ? (
          <div className="bg-bg-card border border-border-subtle rounded-2xl p-10 text-center">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-text-primary font-semibold mb-1">Aún no hay datos suficientes</p>
            <p className="text-text-secondary text-sm mb-4">Completa al menos una simulación para ver tu performance</p>
            <button onClick={() => navigate('/simulate')}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-accent-coral hover:bg-accent-coral/90 transition-all">
              Iniciar simulación
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPICard
                label="Promedio general"
                value={`${simulador?.promedio_total || 0}/100`}
                color={scoreColor(simulador?.promedio_total || 0)}
                trend={simulador?.tendencia}
                sub={`${simulador?.sesiones_totales || 0} sesiones`}
              />
              <KPICard
                label="Esta semana"
                value={simulador?.sesiones_esta_semana || 0}
                sub="simulaciones"
                color="#F5F5F5"
              />
              <KPICard
                label="Leads agendados"
                value={leadsReales ? `${leadsReales.agendados} de ${leadsReales.trabajados}` : '—'}
                sub={leadsReales ? `${leadsReales.tasa_agendamiento}% tasa` : 'Sin leads aún'}
                color={leadsReales ? pctColor(leadsReales.tasa_agendamiento) : '#9A9A9A'}
              />
              <KPICard
                label="Tasa de asistencia"
                value={leadsReales ? `${leadsReales.tasa_asistencia}%` : '—'}
                sub={leadsReales ? 'de citas cumplidas' : 'Sin datos'}
                color={leadsReales ? pctColor(leadsReales.tasa_asistencia) : '#9A9A9A'}
              />
            </div>

            {/* Sección B — Curva de progreso */}
            <div className="bg-bg-card border border-border-subtle rounded-2xl p-5">
              <h3 className="font-bold text-text-primary mb-4">Curva de Progreso</h3>
              {curva.length < 3 ? (
                <div className="py-8 text-center text-text-secondary text-sm">
                  Practica al menos 3 sesiones para ver tu curva de progreso
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={curva}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#242424" />
                    <XAxis
                      dataKey="semana"
                      tick={{ fill: '#9A9A9A', fontSize: 10 }}
                      tickFormatter={v => v.split('-W')[1] ? `Sem ${v.split('-W')[1]}` : v}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: '#9A9A9A', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="promedio"
                      stroke="#E0605E"
                      strokeWidth={2.5}
                      dot={{ fill: '#E0605E', r: 4, strokeWidth: 0 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Sección C — Por modo */}
            {simulador && (
              <div className="space-y-3">
                <h3 className="font-bold text-text-primary">Performance por Modo</h3>
                <div className="grid md:grid-cols-3 gap-3">
                  {['outbound', 'inbound', 'reactivacion'].map(mode => (
                    <ModeCard
                      key={mode}
                      mode={mode}
                      data={simulador.por_modo?.[mode]}
                      isBest={simulador.modo_mas_fuerte === mode}
                      isWorst={simulador.modo_mas_debil === mode}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Sección D — Semáforo S.E.T. */}
            {setM && <SETSemaphore setMetrics={setM} navigate={navigate} />}

            {/* Sección E — Leads Reales */}
            {leadsReales && (
              <div className="bg-bg-card border border-border-subtle rounded-2xl p-5 space-y-4">
                <h3 className="font-bold text-text-primary flex items-center gap-2">
                  <Target size={16} className="text-accent-coral" />
                  Mis Leads Reales
                </h3>
                <div className="space-y-3">
                  {[
                    { label: 'Trabajados',       value: leadsReales.trabajados, pct: 100,                          color: '#E0605E' },
                    { label: 'Agendados',         value: leadsReales.agendados,  pct: leadsReales.tasa_agendamiento, color: pctColor(leadsReales.tasa_agendamiento) },
                    { label: 'Asistieron',        value: leadsReales.agendados - leadsReales.no_shows, pct: leadsReales.tasa_asistencia, color: pctColor(leadsReales.tasa_asistencia) },
                    { label: 'Cerrados ganados',  value: leadsReales.ganados,    pct: leadsReales.tasa_conversion,  color: pctColor(leadsReales.tasa_conversion) },
                  ].map(({ label, value, pct: p, color }) => (
                    <div key={label} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-text-secondary">{label}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-text-primary w-4 text-right">{value}</span>
                          <span className="text-xs font-medium w-10 text-right" style={{ color }}>{p > 0 && p < 100 ? `${p}%` : ''}</span>
                        </div>
                      </div>
                      <ProgressBar value={p} color={color} />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border-subtle text-xs">
                  {leadsReales.tiempo_promedio_cierre && (
                    <div className="bg-bg-input rounded-xl p-3">
                      <div className="font-bold text-text-primary">{leadsReales.tiempo_promedio_cierre} días</div>
                      <div className="text-text-secondary mt-0.5">Tiempo promedio de cierre</div>
                    </div>
                  )}
                  {leadsReales.canal_mas_efectivo && (
                    <div className="bg-bg-input rounded-xl p-3">
                      <div className="font-bold text-text-primary capitalize">{leadsReales.canal_mas_efectivo}</div>
                      <div className="text-text-secondary mt-0.5">Canal más efectivo</div>
                    </div>
                  )}
                  {leadsReales.inbound_tasa > 0 && (
                    <div className="bg-bg-input rounded-xl p-3">
                      <div className="font-bold" style={{ color: pctColor(leadsReales.inbound_tasa) }}>{leadsReales.inbound_tasa}%</div>
                      <div className="text-text-secondary mt-0.5">Tasa inbound</div>
                    </div>
                  )}
                  {leadsReales.outbound_tasa > 0 && (
                    <div className="bg-bg-input rounded-xl p-3">
                      <div className="font-bold" style={{ color: pctColor(leadsReales.outbound_tasa) }}>{leadsReales.outbound_tasa}%</div>
                      <div className="text-text-secondary mt-0.5">Tasa outbound</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sección F — Certificación */}
            {certificacion && <CertBadge cert={certificacion} userName={user?.name} />}
          </>
        )}
      </div>
    </Layout>
  );
};

export default Analytics;
