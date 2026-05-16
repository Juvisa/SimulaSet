import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getRealLeads, saveRealLead } from '../utils/storage';
import Layout from '../components/Layout';
import { Plus, MessageCircle, Clock, AlertTriangle, Zap, FileText, Bell } from 'lucide-react';
import { getPendingFollowUpsForLead } from '../utils/followUps';

const ESTADO_CONFIG = {
  activo:          { label: 'Activo',          color: '#E0605E', bg: '#E0605E15' },
  agendado:        { label: 'Agendado',         color: '#1D9E75', bg: '#1D9E7515' },
  no_show:         { label: 'No-show',          color: '#DC2626', bg: '#DC262615' },
  cancelado:       { label: 'Cancelado',        color: '#D97706', bg: '#D9770615' },
  cerrado_ganado:  { label: 'Cerrado ✓',        color: '#065F46', bg: '#065F4615' },
  cerrado_perdido: { label: 'Cerrado ✗',        color: '#6B7280', bg: '#6B728015' },
  fantasma:        { label: '👻 Fantasma',      color: '#DC2626', bg: '#DC262615' },
};

const TEMP_ICON = { 'Frío': '❄️', 'Tibio': '🌤️', 'Caliente': '🔥' };

const timeAgo = (ts) => {
  if (!ts) return 'Sin contacto';
  const diff = Date.now() - new Date(ts).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'Hace menos de 1h';
  if (h < 24) return `Hace ${h}h`;
  const d = Math.floor(h / 24);
  return `Hace ${d}d`;
};

const LeadCard = ({ lead, onOpen }) => {
  const estado = ESTADO_CONFIG[lead.estado] || ESTADO_CONFIG.activo;
  const isFantasma = lead.estado === 'fantasma' || lead.alerta_fantasma;
  const pendingFUs = getPendingFollowUpsForLead(lead.id);
  const vencidoFU = pendingFUs.find(f => f.estado === 'vencido');
  const proximoFU = pendingFUs.find(f => f.estado === 'pendiente');

  return (
    <div className={`bg-bg-card border rounded-2xl p-4 transition-all hover:border-accent-gold/40 ${isFantasma ? 'border-red-500/40 animate-pulse-glow' : 'border-border-subtle'}`}>
      {isFantasma && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-3">
          <AlertTriangle size={14} className="text-red-400" />
          <span className="text-red-400 text-xs font-medium">Sin respuesta — Generar Reactivación</span>
        </div>
      )}
      {vencidoFU && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-3">
          <Bell size={12} className="text-red-400 animate-bounce" />
          <span className="text-red-400 text-xs font-medium">Seguimiento VENCIDO — {vencidoFU.tipo_seguimiento}</span>
        </div>
      )}
      {!vencidoFU && proximoFU && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-1.5 mb-3" style={{ backgroundColor: '#C9920A10', border: '1px solid #C9920A30' }}>
          <Clock size={11} style={{ color: '#C9920A' }} />
          <span className="text-xs font-medium" style={{ color: '#C9920A' }}>
            Seguimiento: {new Date(proximoFU.programado_para).toLocaleString('es', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-text-primary">{lead.nombre}</span>
            <span className="text-sm">{TEMP_ICON[lead.temperatura] || '🌤️'}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${lead.origen === 'Inbound' ? 'bg-mode-inbound/20 text-mode-inbound' : 'bg-mode-outbound/20 text-mode-outbound'}`}>
              {lead.origen}
            </span>
            <span className="text-xs text-text-secondary">{lead.canal}</span>
          </div>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0"
          style={{ backgroundColor: estado.bg, color: estado.color, border: `1px solid ${estado.color}30` }}>
          {estado.label}
        </span>
      </div>

      <p className="text-text-secondary text-xs line-clamp-2 mb-3">{lead.dolor_principal}</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-text-secondary text-xs">
          <Clock size={12} />
          {timeAgo(lead.ultimo_contacto || lead.updated_at)}
        </div>
        <div className="flex items-center gap-2">
          {lead.metricas?.total_turnos > 0 && (
            <span className="text-xs text-text-secondary">{lead.metricas.total_turnos} mensajes</span>
          )}
          {lead.estado === 'agendado' && (
            <button
              onClick={() => onOpen(lead.id)}
              title="Ver Briefing"
              className="flex items-center gap-1 bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-1.5 rounded-lg text-xs hover:bg-green-500/20 transition-all"
            >
              <FileText size={12} />
            </button>
          )}
          <button
            onClick={() => onOpen(lead.id)}
            className="flex items-center gap-1 bg-accent-gold/10 text-accent-gold border border-accent-gold/20 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent-gold/20 transition-all"
          >
            <MessageCircle size={12} />
            Abrir
          </button>
        </div>
      </div>
    </div>
  );
};

const RealLeads = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [filterEstado, setFilterEstado] = useState('');
  const [filterOrigen, setFilterOrigen] = useState('');
  const [filterAlerta, setFilterAlerta] = useState(false);

  useEffect(() => {
    setLeads(getRealLeads(user.id));
  }, [user.id]);

  const filtered = leads.filter(l => {
    if (filterEstado && l.estado !== filterEstado) return false;
    if (filterOrigen && l.origen !== filterOrigen) return false;
    if (filterAlerta && !l.alerta_fantasma && l.estado !== 'fantasma') return false;
    return true;
  });

  const activeCount = leads.filter(l => l.estado === 'activo').length;
  const fantasmaCount = leads.filter(l => l.estado === 'fantasma' || l.alerta_fantasma).length;
  const agendadoCount = leads.filter(l => l.estado === 'agendado').length;

  return (
    <Layout>
      {/* Mode Real header bar */}
      <div className="h-1 w-full rounded-full mb-5" style={{ background: 'linear-gradient(90deg, #C9920A, #F59E0B)' }} />

      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-text-primary">Leads Reales</h1>
            <span className="text-xs font-black px-3 py-1 rounded-full tracking-wider"
              style={{ backgroundColor: '#C9920A20', color: '#C9920A', border: '1px solid #C9920A40' }}>
              MODO REAL
            </span>
          </div>
          <p className="text-text-secondary text-sm">Aquí operas con leads reales. La IA te asiste en cada mensaje.</p>
        </div>
        <button
          onClick={() => navigate('/leads-reales/nuevo')}
          className="flex items-center gap-2 bg-accent-gold text-black px-4 py-2.5 rounded-xl font-bold hover:bg-accent-gold/90 transition-all text-sm flex-shrink-0"
        >
          <Plus size={16} />
          Registrar Lead
        </button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-bg-card border border-border-subtle rounded-xl p-3 text-center">
          <div className="text-xl font-black text-accent-coral">{activeCount}</div>
          <div className="text-text-secondary text-xs">Activos</div>
        </div>
        <div className="bg-bg-card border border-border-subtle rounded-xl p-3 text-center">
          <div className="text-xl font-black text-color-success">{agendadoCount}</div>
          <div className="text-text-secondary text-xs">Agendados</div>
        </div>
        <div className={`bg-bg-card border rounded-xl p-3 text-center ${fantasmaCount > 0 ? 'border-red-500/30' : 'border-border-subtle'}`}>
          <div className="text-xl font-black text-red-400">{fantasmaCount}</div>
          <div className="text-text-secondary text-xs">Fantasmas</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select
          value={filterEstado}
          onChange={e => setFilterEstado(e.target.value)}
          className="bg-bg-input border border-border-subtle rounded-xl px-3 py-2 text-text-primary text-xs focus:border-accent-gold transition-colors"
        >
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={filterOrigen}
          onChange={e => setFilterOrigen(e.target.value)}
          className="bg-bg-input border border-border-subtle rounded-xl px-3 py-2 text-text-primary text-xs focus:border-accent-gold transition-colors"
        >
          <option value="">Inbound + Outbound</option>
          <option value="Inbound">Inbound</option>
          <option value="Outbound">Outbound</option>
        </select>
        <button
          onClick={() => setFilterAlerta(!filterAlerta)}
          className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${filterAlerta ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-bg-input border-border-subtle text-text-secondary'}`}
        >
          <AlertTriangle size={12} />
          Solo alertas
        </button>
      </div>

      {/* Leads grid */}
      {filtered.length === 0 ? (
        <div className="bg-bg-card border border-dashed border-border-subtle rounded-2xl p-12 text-center">
          <div className="text-5xl mb-4">👤</div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            {leads.length === 0 ? 'Sin leads registrados' : 'Sin resultados'}
          </h3>
          <p className="text-text-secondary text-sm mb-6">
            {leads.length === 0
              ? 'Registra tu primer lead real para empezar a operar con asistencia de IA'
              : 'Prueba cambiando los filtros'}
          </p>
          {leads.length === 0 && (
            <button
              onClick={() => navigate('/leads-reales/nuevo')}
              className="inline-flex items-center gap-2 bg-accent-gold text-black px-5 py-2.5 rounded-xl font-bold hover:bg-accent-gold/90 transition-all"
            >
              <Plus size={16} />
              Registrar primer lead
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.sort((a, b) => {
            // Fantasmas primero
            if ((a.alerta_fantasma || a.estado === 'fantasma') && !(b.alerta_fantasma || b.estado === 'fantasma')) return -1;
            if (!(a.alerta_fantasma || a.estado === 'fantasma') && (b.alerta_fantasma || b.estado === 'fantasma')) return 1;
            return new Date(b.updated_at) - new Date(a.updated_at);
          }).map(lead => (
            <LeadCard key={lead.id} lead={lead} onOpen={(id) => navigate(`/leads-reales/${id}`)} />
          ))}
        </div>
      )}
    </Layout>
  );
};

export default RealLeads;
