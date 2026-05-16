import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getProjects } from '../utils/storage';
import Layout from '../components/Layout';
import { Play, ChevronRight } from 'lucide-react';

const MODES = [
  {
    id: 'outbound',
    name: 'Outbound',
    emoji: '🔵',
    color: '#2563EB',
    bg: '#2563EB',
    desc: 'El lead no tiene intención declarada. Contacto en frío o tibio.',
    objective: 'Generar la conversación desde cero y conseguir que el prospecto pida la cita.',
    channel: ['Instagram DM', 'WhatsApp', 'Comentarios'],
  },
  {
    id: 'inbound',
    name: 'Inbound — Call Confirmer',
    emoji: '🟢',
    color: '#1D9E75',
    bg: '#1D9E75',
    desc: 'El lead ya agendó una llamada. Llega con curiosidad, no con convicción.',
    objective: 'Garantizar que el lead llegue comprometido a la llamada. Eliminar no-shows.',
    channel: ['WhatsApp', 'DM', 'Email'],
  },
  {
    id: 'reactivacion',
    name: 'Reactivación',
    emoji: '🔴',
    color: '#DC2626',
    bg: '#DC2626',
    desc: 'El lead canceló, no asistió o se enfrió después de una conversación previa.',
    objective: 'Reabrir la conversación y conseguir que el lead quiera reagendar.',
    channel: ['WhatsApp', 'DM'],
  },
];

const SELECT = "w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-text-primary text-sm focus:border-accent-coral transition-colors";

const ModeSelector = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState([]);
  const [selectedMode, setSelectedMode] = useState('outbound');
  const [config, setConfig] = useState({
    projectId: location.state?.projectId || '',
    temperatura: 'frio',
    canal: 'WhatsApp',
    resistencia: 'media',
    situacionReactivacion: 'no_show',
  });

  useEffect(() => {
    setProjects(getProjects(user.id));
  }, [user.id]);

  const setConf = (k, v) => setConfig(c => ({ ...c, [k]: v }));
  const selectedModeInfo = MODES.find(m => m.id === selectedMode);

  const handleStart = () => {
    if (!config.projectId) { alert('Selecciona un proyecto primero'); return; }
    navigate('/simulator', { state: { mode: selectedMode, config } });
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text-primary">Nueva simulación</h1>
          <p className="text-text-secondary text-sm mt-1">Elige el modo y configura tu práctica</p>
        </div>

        {/* Mode selection */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">Modo</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {MODES.map(mode => (
              <button
                key={mode.id}
                onClick={() => setSelectedMode(mode.id)}
                className={`text-left p-5 rounded-2xl border-2 transition-all ${
                  selectedMode === mode.id
                    ? 'border-opacity-100'
                    : 'border-border-subtle hover:border-opacity-40 bg-bg-card'
                }`}
                style={selectedMode === mode.id ? {
                  borderColor: mode.color,
                  backgroundColor: mode.color + '12',
                } : {}}
              >
                <div className="text-2xl mb-2">{mode.emoji}</div>
                <div className="font-bold text-text-primary text-sm mb-1">{mode.name}</div>
                <div className="text-text-secondary text-xs leading-relaxed">{mode.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Objective reminder */}
        <div
          className="rounded-xl px-5 py-4 mb-8 border"
          style={{ backgroundColor: selectedModeInfo.color + '10', borderColor: selectedModeInfo.color + '30' }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: selectedModeInfo.color }}>
            Objetivo de esta sesión
          </div>
          <div className="text-text-primary text-sm">{selectedModeInfo.objective}</div>
        </div>

        {/* Config */}
        <div className="bg-bg-card border border-border-subtle rounded-2xl p-6 space-y-5 mb-8">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Configuración</h2>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Proyecto *</label>
            {projects.length === 0 ? (
              <div className="bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-text-secondary text-sm">
                Sin proyectos — <button onClick={() => navigate('/projects/new')} className="text-accent-coral hover:underline">crear uno</button>
              </div>
            ) : (
              <select value={config.projectId} onChange={e => setConf('projectId', e.target.value)} className={SELECT}>
                <option value="">Selecciona un proyecto...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.expertName})</option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Temperatura del prospecto</label>
              <select value={config.temperatura} onChange={e => setConf('temperatura', e.target.value)} className={SELECT}>
                <option value="frio">❄️ Frío — no conoce al experto</option>
                <option value="tibio">🌤️ Tibio — siguió al experto</option>
                <option value="caliente">🔥 Caliente — interés declarado</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Canal</label>
              <select value={config.canal} onChange={e => setConf('canal', e.target.value)} className={SELECT}>
                {selectedModeInfo.channel.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Nivel de resistencia</label>
            <div className="grid grid-cols-3 gap-3">
              {['baja', 'media', 'alta'].map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setConf('resistencia', r)}
                  className={`py-2.5 rounded-xl text-sm font-medium border transition-all capitalize ${
                    config.resistencia === r
                      ? 'bg-accent-coral border-accent-coral text-white'
                      : 'bg-bg-input border-border-subtle text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {r === 'baja' ? '😊' : r === 'media' ? '😐' : '😤'} {r}
                </button>
              ))}
            </div>
          </div>

          {selectedMode === 'reactivacion' && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Situación del lead</label>
              <select value={config.situacionReactivacion} onChange={e => setConf('situacionReactivacion', e.target.value)} className={SELECT}>
                <option value="no_show">No-show (no apareció sin avisar)</option>
                <option value="cancelo">Canceló (avisó antes)</option>
                <option value="lead_frio">Lead frío (se enfrió en conversación previa)</option>
              </select>
            </div>
          )}
        </div>

        <button
          onClick={handleStart}
          disabled={!config.projectId}
          className="w-full flex items-center justify-center gap-3 bg-accent-coral text-white py-4 rounded-2xl font-bold text-lg hover:bg-accent-coral/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play size={20} />
          Iniciar simulación
        </button>
      </div>
    </Layout>
  );
};

export default ModeSelector;
