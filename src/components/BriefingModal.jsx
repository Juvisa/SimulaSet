import { useState, useEffect } from 'react';
import { callClaude } from '../utils/anthropic';
import { buildBriefingPrompt } from '../utils/prompts';
import { X, Copy, Check, Loader2, Edit3, Save, FileText, MessageSquare, LayoutList, RefreshCw } from 'lucide-react';

// ─── Format builders ──────────────────────────────────────────────────────

const buildPlainText = (b) => {
  const recursos = b.recursos_entregados?.length
    ? b.recursos_entregados.map(r => `  - ${r.nombre}${r.link ? ' — ' + r.link : ''}`).join('\n')
    : '  - Ninguno enviado';
  const objeciones = b.objeciones_probables?.map((o, i) =>
    `  ${i + 1}. ${o.objecion}\n     → ${o.como_abordarla}`
  ).join('\n');

  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 BRIEFING PARA EL CLOSER
Generado por SimulaSET — Método S.E.T.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 DATOS DEL LEAD
Nombre:           ${b.lead?.nombre}
País/Ubicación:   ${b.lead?.ubicacion}
Canal de origen:  ${b.lead?.canal_origen}
Origen:           ${b.lead?.origen}
Tipo de negocio:  ${b.lead?.tipo_negocio}
Situación actual: ${b.lead?.situacion_actual}
Tiempo en el problema: ${b.lead?.tiempo_en_el_problema}

💼 PERFIL DEL NEGOCIO
${b.lead?.situacion_actual}

🔥 DOLOR PRINCIPAL DETECTADO
${b.dolor_principal}

⚡ NIVEL DE URGENCIA / FOMO
Nivel: ${b.urgencia?.nivel}
Por qué: ${b.urgencia?.explicacion}

⚠️ POSIBLES OBJECIONES EN LA LLAMADA
${objeciones}

📦 RECURSOS ENTREGADOS POR EL SETTER
${recursos}

🎯 NOTA ESTRATÉGICA PARA EL CLOSER
${b.nota_estrategica}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Setter: ${b.setter}
Proyecto: ${b.proyecto}
Generado: ${b.timestamp}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
};

const buildCRMText = (b) => {
  const obj = b.objeciones_probables?.map((o, i) => `${i + 1}. ${o.objecion}`).join(' / ');
  const rec = b.recursos_entregados?.length
    ? b.recursos_entregados.map(r => r.nombre).join(', ')
    : 'Ninguno';
  return `Lead: ${b.lead?.nombre}
Origen: ${b.lead?.origen}
Canal: ${b.lead?.canal_origen}
Negocio: ${b.lead?.tipo_negocio}
Situación: ${b.lead?.situacion_actual}
Dolor: ${b.dolor_principal}
Urgencia: ${b.urgencia?.nivel} — ${b.urgencia?.explicacion}
Objeciones: ${obj}
Recursos enviados: ${rec}
Nota closer: ${b.nota_estrategica}
Setter: ${b.setter} | ${b.timestamp}`;
};

const buildWhatsAppText = (b) => {
  const obj1 = b.objeciones_probables?.[0]?.objecion || 'No identificada';
  const rec = b.recursos_entregados?.length
    ? b.recursos_entregados.map(r => r.nombre).join(', ')
    : 'Ninguno';
  return `📋 *BRIEFING — ${b.lead?.nombre}*

👤 *Perfil:* ${b.lead?.tipo_negocio}
🔥 *Dolor:* ${b.dolor_principal}
⚡ *Urgencia:* ${b.urgencia?.nivel}
⚠️ *Watch out:* ${obj1}
🎯 *Estrategia:* ${b.nota_estrategica}

📦 Recursos enviados: ${rec}

_Setter: ${b.setter} — SimulaSET_`;
};

// ─── Editable Field ───────────────────────────────────────────────────────

const EditableField = ({ label, value, onChange, multiline = false }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const save = () => { onChange(draft); setEditing(false); };

  return (
    <div className="group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          {editing ? (
            multiline ? (
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                className="w-full bg-bg-input border border-accent-gold/40 rounded-xl px-3 py-2 text-text-primary text-sm resize-none focus:border-accent-gold transition-colors"
                rows={4}
                autoFocus
              />
            ) : (
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                className="w-full bg-bg-input border border-accent-gold/40 rounded-xl px-3 py-2 text-text-primary text-sm focus:border-accent-gold transition-colors"
                autoFocus
              />
            )
          ) : (
            <span className="text-text-primary text-sm leading-relaxed">{value}</span>
          )}
        </div>
        {editing ? (
          <button onClick={save} className="flex-shrink-0 p-1.5 text-green-400 hover:bg-green-400/10 rounded-lg transition-all mt-0.5">
            <Save size={14} />
          </button>
        ) : (
          <button
            onClick={() => { setDraft(value); setEditing(true); }}
            className="flex-shrink-0 p-1.5 text-text-secondary hover:text-accent-gold hover:bg-accent-gold/10 rounded-lg transition-all mt-0.5 opacity-0 group-hover:opacity-100"
          >
            <Edit3 size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Section Block ─────────────────────────────────────────────────────────

const Section = ({ icon, title, children, accentColor = '#C9920A' }) => (
  <div className="border-b border-border-subtle pb-5 last:border-0 last:pb-0">
    <div className="flex items-center gap-2 mb-3">
      <span className="text-base">{icon}</span>
      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accentColor }}>{title}</span>
    </div>
    <div className="space-y-2 pl-6">{children}</div>
  </div>
);

const FieldRow = ({ label, value, onChange }) => (
  <div className="flex gap-2">
    <span className="text-text-secondary text-sm w-36 flex-shrink-0">{label}:</span>
    <EditableField value={value || '—'} onChange={onChange} />
  </div>
);

// ─── Copy Button ──────────────────────────────────────────────────────────

const CopyBtn = ({ text, label, icon: Icon }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {});
        if (navigator.vibrate) navigator.vibrate(50);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all"
      style={copied
        ? { backgroundColor: '#1D9E7520', borderColor: '#1D9E7540', color: '#1D9E75' }
        : { backgroundColor: '#C9920A15', borderColor: '#C9920A30', color: '#C9920A' }
      }
    >
      {copied ? <Check size={14} /> : <Icon size={14} />}
      {copied ? '¡Copiado!' : label}
    </button>
  );
};

// ─── Main Modal ───────────────────────────────────────────────────────────

const BriefingModal = ({
  isOpen,
  onClose,
  // Context from caller
  project,
  lead,           // { nombre, canal, origen, dolor_principal, nivel_consciencia, temperatura }
  historial,      // string — conversation history
  modo,           // 'real' | 'simulador'
  setterName,
  nivelFomo,
  etapaMaxima,
  // Persistence
  existingBriefing,
  onSave,
}) => {
  const [loading, setLoading] = useState(false);
  const [briefing, setBriefing] = useState(existingBriefing || null);
  const [copyFormat, setCopyFormat] = useState('plain');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && !briefing && !loading) generate();
  }, [isOpen]);

  const generate = async () => {
    if (!project || !lead) return;
    setLoading(true);
    setError('');
    try {
      const prompt = buildBriefingPrompt({ project, lead, historial, modo, setterName, nivelFomo, etapaMaxima });
      const result = await callClaude(
        'Eres un experto en ventas de alto ticket. Genera briefings de traspaso setter→closer. Responde SOLO en JSON.',
        [{ role: 'user', content: prompt }]
      );
      setBriefing(result.briefing);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const updateField = (path, value) => {
    setBriefing(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let obj = updated;
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      obj[keys[keys.length - 1]] = value;
      return updated;
    });
  };

  const handleSave = () => {
    if (briefing && onSave) onSave(briefing, copyFormat);
    onClose();
  };

  const getCopyText = () => {
    if (!briefing) return '';
    if (copyFormat === 'crm') return buildCRMText(briefing);
    if (copyFormat === 'whatsapp') return buildWhatsAppText(briefing);
    return buildPlainText(briefing);
  };

  if (!isOpen) return null;

  const isReal = modo === 'real';
  const title = isReal ? '📋 Briefing para el Closer' : '📋 Briefing de Práctica';

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[95vh] md:max-h-[90vh] flex flex-col bg-bg-card border rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden"
        style={{ borderColor: '#C9920A30', borderTopColor: '#C9920A' }}>

        {/* Gold top accent */}
        <div className="h-1 w-full flex-shrink-0" style={{ background: 'linear-gradient(90deg, #C9920A, #F59E0B, #C9920A)' }} />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle flex-shrink-0">
          <div>
            <h2 className="font-bold text-text-primary">{title}</h2>
            {briefing && (
              <p className="text-text-secondary text-xs mt-0.5">
                {briefing.lead?.nombre} · {briefing.timestamp}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-bg-input rounded-xl text-text-secondary hover:text-text-primary transition-all">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 size={32} className="animate-spin" style={{ color: '#C9920A' }} />
              <p className="text-text-secondary text-sm">Analizando la conversación y generando el Briefing...</p>
            </div>
          )}

          {error && !loading && (
            <div className="p-6">
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm mb-4">{error}</div>
              <button onClick={generate}
                className="flex items-center gap-2 text-sm text-accent-coral hover:underline">
                <RefreshCw size={14} /> Reintentar
              </button>
            </div>
          )}

          {briefing && !loading && (
            <div className="p-6 space-y-5">
              {/* Lead data */}
              <Section icon="👤" title="Datos del Lead">
                <FieldRow label="Nombre" value={briefing.lead?.nombre} onChange={v => updateField('lead.nombre', v)} />
                <FieldRow label="Ubicación" value={briefing.lead?.ubicacion} onChange={v => updateField('lead.ubicacion', v)} />
                <FieldRow label="Canal" value={briefing.lead?.canal_origen} onChange={v => updateField('lead.canal_origen', v)} />
                <FieldRow label="Origen" value={briefing.lead?.origen} onChange={v => updateField('lead.origen', v)} />
                <FieldRow label="Tipo de negocio" value={briefing.lead?.tipo_negocio} onChange={v => updateField('lead.tipo_negocio', v)} />
                <FieldRow label="Situación actual" value={briefing.lead?.situacion_actual} onChange={v => updateField('lead.situacion_actual', v)} />
                <FieldRow label="Tiempo en el problema" value={briefing.lead?.tiempo_en_el_problema} onChange={v => updateField('lead.tiempo_en_el_problema', v)} />
              </Section>

              {/* Main pain */}
              <Section icon="🔥" title="Dolor Principal Detectado" accentColor="#DC2626">
                <EditableField
                  value={briefing.dolor_principal}
                  onChange={v => updateField('dolor_principal', v)}
                  multiline
                />
              </Section>

              {/* Urgency */}
              <Section icon="⚡" title="Nivel de Urgencia / FOMO" accentColor="#D97706">
                <div className="flex items-center gap-3 mb-2">
                  {['Alto', 'Medio', 'Bajo'].map(n => (
                    <button key={n} onClick={() => updateField('urgencia.nivel', n)}
                      className={`px-3 py-1 rounded-lg text-sm font-bold border transition-all ${briefing.urgencia?.nivel === n
                        ? n === 'Alto' ? 'bg-green-500/20 border-green-500 text-green-400'
                          : n === 'Medio' ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                          : 'bg-red-500/20 border-red-500 text-red-400'
                        : 'border-border-subtle text-text-secondary bg-bg-input'}`}>
                      {n}
                    </button>
                  ))}
                </div>
                <EditableField
                  value={briefing.urgencia?.explicacion}
                  onChange={v => updateField('urgencia.explicacion', v)}
                  multiline
                />
              </Section>

              {/* Objections */}
              <Section icon="⚠️" title="Posibles Objeciones en la Llamada" accentColor="#F59E0B">
                {briefing.objeciones_probables?.map((obj, i) => (
                  <div key={i} className="bg-bg-input rounded-xl p-3 space-y-1.5">
                    <div className="flex items-start gap-2">
                      <span className="text-amber-400 font-bold text-sm flex-shrink-0">{i + 1}.</span>
                      <EditableField
                        value={obj.objecion}
                        onChange={v => {
                          const arr = [...briefing.objeciones_probables];
                          arr[i] = { ...arr[i], objecion: v };
                          updateField('objeciones_probables', arr);
                        }}
                      />
                    </div>
                    <div className="flex items-start gap-2 pl-4">
                      <span className="text-text-secondary text-xs flex-shrink-0 mt-0.5">→ Cómo abordarla:</span>
                      <EditableField
                        value={obj.como_abordarla}
                        onChange={v => {
                          const arr = [...briefing.objeciones_probables];
                          arr[i] = { ...arr[i], como_abordarla: v };
                          updateField('objeciones_probables', arr);
                        }}
                        multiline
                      />
                    </div>
                  </div>
                ))}
              </Section>

              {/* Resources */}
              <Section icon="📦" title="Recursos Entregados por el Setter" accentColor="#2563EB">
                {briefing.recursos_entregados?.length
                  ? briefing.recursos_entregados.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-blue-400">•</span>
                      <span className="text-text-primary">{r.nombre}</span>
                      {r.link && <a href={r.link} target="_blank" rel="noreferrer" className="text-blue-400 text-xs hover:underline truncate">{r.link}</a>}
                    </div>
                  ))
                  : <span className="text-text-secondary text-sm italic">Ninguno enviado</span>
                }
              </Section>

              {/* Strategic note */}
              <Section icon="🎯" title="Nota Estratégica para el Closer" accentColor="#1D9E75">
                <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
                  <EditableField
                    value={briefing.nota_estrategica}
                    onChange={v => updateField('nota_estrategica', v)}
                    multiline
                  />
                </div>
              </Section>

              {/* Footer info */}
              <div className="flex items-center justify-between text-xs text-text-secondary pt-2 border-t border-border-subtle">
                <span>Setter: {briefing.setter}</span>
                <span>{briefing.proyecto}</span>
                <span>{briefing.timestamp}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {briefing && !loading && (
          <div className="border-t border-border-subtle px-6 py-4 flex-shrink-0 space-y-3">
            {/* Format selector */}
            <div className="flex items-center gap-2">
              <span className="text-text-secondary text-xs">Formato:</span>
              {[
                { id: 'plain', label: 'Texto plano', icon: FileText },
                { id: 'crm', label: 'CRM / GHL', icon: LayoutList },
                { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
              ].map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setCopyFormat(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${copyFormat === id
                    ? 'bg-accent-gold/20 border-accent-gold text-accent-gold'
                    : 'border-border-subtle text-text-secondary bg-bg-input hover:text-text-primary'}`}>
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <CopyBtn text={getCopyText()} label="Copiar Briefing" icon={Copy} />
              <button onClick={generate}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-border-subtle text-text-secondary hover:text-text-primary hover:bg-bg-input transition-all">
                <RefreshCw size={14} />
                Regenerar
              </button>
              <button onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-black transition-all ml-auto"
                style={{ backgroundColor: '#C9920A' }}>
                <Save size={14} />
                Guardar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BriefingModal;
