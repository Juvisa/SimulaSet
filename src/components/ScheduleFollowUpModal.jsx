import { useState } from 'react';
import { X, Clock, Check } from 'lucide-react';
import { createFollowUp } from '../utils/followUps';

const TIEMPOS = [
  { label: 'En 2 horas',   horas: 2 },
  { label: 'En 24 horas',  horas: 24 },
  { label: 'En 2 días',    horas: 48 },
  { label: 'En 3 días',    horas: 72 },
  { label: 'En 1 semana',  horas: 168 },
  { label: 'Fecha exacta', horas: null },
];

const TIPOS = [
  { id: 'valor',        label: 'Aportar valor',           desc: 'Entregar un recurso útil' },
  { id: 'angulo',       label: 'Cambio de ángulo',        desc: 'Lead no respondió — entrada diferente' },
  { id: 'reactivacion', label: 'Reactivación',            desc: 'Lleva varios días sin responder' },
  { id: 'confirmacion', label: 'Confirmar asistencia',    desc: 'Llamada ya agendada' },
];

const ScheduleFollowUpModal = ({ isOpen, onClose, lead, project, setterId, onScheduled }) => {
  const [tiempoIdx, setTiempoIdx] = useState(1);
  const [fechaExacta, setFechaExacta] = useState('');
  const [tipo, setTipo] = useState('angulo');
  const [nota, setNota] = useState('');
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const calcFecha = () => {
    const sel = TIEMPOS[tiempoIdx];
    if (!sel.horas) return fechaExacta ? new Date(fechaExacta).toISOString() : null;
    return new Date(Date.now() + sel.horas * 3600000).toISOString();
  };

  const handleGuardar = () => {
    const programado = calcFecha();
    if (!programado) return;

    const ultimaInteraccion = lead.conversacion?.slice(-1)[0]?.content || '';
    const diasSinResp = lead.horas_sin_respuesta ? Math.floor(lead.horas_sin_respuesta / 24) : 0;

    createFollowUp({
      setter_id: setterId,
      lead_id: lead.id,
      lead_nombre: lead.nombre,
      project_id: project?.id || lead.project_id,
      programado_para: programado,
      tipo_seguimiento: tipo,
      nota,
      ultima_interaccion: ultimaInteraccion,
      dias_sin_respuesta: diasSinResp,
      temperatura_actual: lead.temperatura || 'Tibio',
    });

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onScheduled?.();
      onClose();
    }, 1200);
  };

  const tiempoSel = TIEMPOS[tiempoIdx];

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-bg-card border border-border-subtle rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden">
        <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg, #C9920A, #F59E0B)' }} />

        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Clock size={18} style={{ color: '#C9920A' }} />
            <h2 className="font-bold text-text-primary">Programar Seguimiento</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-text-secondary hover:text-text-primary rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          <div>
            <p className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-1">Lead</p>
            <p className="text-text-primary font-medium">{lead?.nombre}</p>
          </div>

          {/* Tiempo */}
          <div>
            <p className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-2">¿Cuándo escribirle?</p>
            <div className="space-y-2">
              {TIEMPOS.map((t, i) => (
                <button key={i} onClick={() => setTiempoIdx(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm transition-all ${tiempoIdx === i ? 'border-accent-gold text-text-primary' : 'border-border-subtle text-text-secondary hover:text-text-primary'}`}
                  style={tiempoIdx === i ? { backgroundColor: '#C9920A15' } : {}}>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${tiempoIdx === i ? 'border-accent-gold' : 'border-border-subtle'}`}>
                    {tiempoIdx === i && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#C9920A' }} />}
                  </div>
                  {t.label}
                </button>
              ))}
            </div>
            {tiempoSel.horas === null && (
              <input type="datetime-local" value={fechaExacta} onChange={e => setFechaExacta(e.target.value)}
                className="w-full mt-2 bg-bg-input border border-border-subtle rounded-xl px-3 py-2 text-text-primary text-sm focus:border-accent-gold transition-colors" />
            )}
          </div>

          {/* Tipo */}
          <div>
            <p className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-2">¿Qué tipo de seguimiento?</p>
            <div className="space-y-2">
              {TIPOS.map(t => (
                <button key={t.id} onClick={() => setTipo(t.id)}
                  className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-all ${tipo === t.id ? 'border-accent-gold' : 'border-border-subtle hover:border-border-subtle/80'}`}
                  style={tipo === t.id ? { backgroundColor: '#C9920A15' } : {}}>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${tipo === t.id ? 'border-accent-gold' : 'border-border-subtle'}`}>
                    {tipo === t.id && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#C9920A' }} />}
                  </div>
                  <div>
                    <div className="text-text-primary text-sm font-medium">{t.label}</div>
                    <div className="text-text-secondary text-xs mt-0.5">{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Nota */}
          <div>
            <p className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-2">Nota para ti (opcional)</p>
            <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
              className="w-full bg-bg-input border border-border-subtle rounded-xl px-3 py-2 text-text-primary text-sm resize-none focus:border-accent-gold transition-colors"
              placeholder="Ej: Mencionó que habla con su socio primero..." />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border-subtle flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border-subtle text-text-secondary hover:text-text-primary text-sm font-medium transition-all">
            Cancelar
          </button>
          <button onClick={handleGuardar}
            disabled={tiempoSel.horas === null && !fechaExacta}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-black text-sm font-bold transition-all disabled:opacity-40"
            style={{ backgroundColor: saved ? '#1D9E75' : '#C9920A' }}>
            {saved ? <><Check size={16} /> ¡Programado!</> : 'Programar →'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleFollowUpModal;
