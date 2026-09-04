import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { MISSION_01, MISSION_FIELDS, isMissionCaseComplete, isMissionComplete } from '../data/missions';
import { getMissionProgress, saveMissionProgress, startMissionProgress } from '../utils/missionProgress';

const EMPTY_RESPONSE = Object.fromEntries(MISSION_FIELDS.map(field => [field.key, '']));
const buildEvaluatorPayload = responses => MISSION_01.cases.map(missionCase => ({ id: missionCase.id, industry: missionCase.industry, context: missionCase.context, leadMessage: missionCase.leadMessage, student: responses[missionCase.id], reference: missionCase.reference }));

const parseEvaluatorJson = text => {
  const raw = String(text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  const parsed = JSON.parse(start >= 0 && end >= start ? raw.slice(start, end + 1) : raw);
  const keys = ['situacion', 'emocion', 'transicion', 'movimiento'];
  if (!Number.isFinite(parsed?.setScore) || !parsed?.dimensions || !parsed?.mainOpportunity) throw new Error('Formato incompleto');
  keys.forEach(key => { if (!Number.isFinite(parsed.dimensions[key]?.score) || typeof parsed.dimensions[key]?.feedback !== 'string') throw new Error('Formato de dimensión incompleto'); });
  return {
    setScore: Math.max(0, Math.min(100, Math.round(parsed.setScore))),
    level: typeof parsed.level === 'string' ? parsed.level : '',
    mainOpportunity: String(parsed.mainOpportunity),
    dimensions: Object.fromEntries(keys.map(key => [key, { score: Math.max(0, Math.min(100, Math.round(parsed.dimensions[key].score))), feedback: parsed.dimensions[key].feedback.trim() }])),
  };
};

const MissionConversationHunt = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [responses, setResponses] = useState({});
  const [currentCaseIndex, setCurrentCaseIndex] = useState(0);
  const [status, setStatus] = useState('in_progress');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [evaluation, setEvaluation] = useState(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState('');
  const [evaluationAttempt, setEvaluationAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const loadProgress = async () => {
      const existing = await getMissionProgress({ userId: user.id, missionId: MISSION_01.id });
      if (existing.error) throw new Error(existing.error);
      const started = existing.progress ? null : await startMissionProgress({ userId: user.id, missionId: MISSION_01.id });
      if (started?.error) throw new Error(started.error);
      const result = existing.progress || started?.progress;
      if (!result) throw new Error('No se pudo iniciar la misión.');
      if (!active) return;
      const savedResponses = result.responses || {};
      const missionStillComplete = isMissionComplete(savedResponses);
      setResponses(savedResponses);
      setStatus(result.status === 'completed' && missionStillComplete ? 'completed' : 'in_progress');
      const firstIncomplete = MISSION_01.cases.findIndex(missionCase => !isMissionCaseComplete(savedResponses[missionCase.id]));
      setCurrentCaseIndex(firstIncomplete === -1 ? MISSION_01.cases.length - 1 : firstIncomplete);
    };
    loadProgress().catch(caught => { if (active) setError(`No pudimos cargar la misión: ${caught instanceof Error ? caught.message : 'Error inesperado'}`); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user.id]);

  useEffect(() => {
    if (status !== 'completed' || !isMissionComplete(responses) || evaluation || evaluationError) return;
    let active = true;
    const controller = new AbortController();
    const evaluate = async () => {
      setEvaluating(true);
      try {
        const systemPrompt = `Eres el evaluador pedagógico oficial del Método S.E.T. de DIGITAL SET. Evalúas razonamiento comercial, no coincidencia literal con una referencia.\n\nS = Situación: distinguir hechos de interpretaciones, usar contexto del funnel y momento de conversación.\nE = Emoción: formular hipótesis razonables a partir de señales, sin leer la mente ni afirmar certezas no sustentadas.\nT = Transición: elegir el próximo microcompromiso lógico según el nivel real de avance del lead.\nMovimiento = ejecutar esa transición con un mensaje claro, natural, relevante y sin presión innecesaria.\n\nEvalúa el desempeño global del alumno a través de los 3 casos. Sé exigente pero pedagógico. Reconoce aciertos concretos y señala omisiones concretas. No penalices diferencias de estilo si el razonamiento es correcto. No inventes contexto.\n\nDevuelve SOLO JSON válido, sin markdown, exactamente con esta forma:\n{"setScore":0,"level":"EN DESARROLLO","mainOpportunity":"...","dimensions":{"situacion":{"score":0,"feedback":"..."},"emocion":{"score":0,"feedback":"..."},"transicion":{"score":0,"feedback":"..."},"movimiento":{"score":0,"feedback":"..."}}}\n\nTodos los scores deben ser enteros de 0 a 100. El feedback de cada dimensión debe ser breve, específico y en español, máximo 2 frases. level debe ser uno de: INICIAL, EN DESARROLLO, BIEN ENCAMINADO, SÓLIDO.`;
        const timeoutId = setTimeout(() => controller.abort(), 45000);
        let response;
        try {
          response = await fetch('/api/anthropic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ systemPrompt, maxTokens: 1500, messages: [{ role: 'user', content: `Evalúa estas respuestas del alumno. La referencia es pedagógica y no debe tratarse como única respuesta correcta.\n\n${JSON.stringify(buildEvaluatorPayload(responses), null, 2)}` }] }) });
        } finally { clearTimeout(timeoutId); }
        const data = await response.json();
        if (!response.ok || !data?.text) throw new Error(data?.error || 'No se pudo evaluar la misión');
        const parsed = parseEvaluatorJson(data.text);
        if (active) setEvaluation(parsed);
      } catch (caught) {
        if (active) setEvaluationError(caught?.name === 'AbortError' ? 'La evaluación tardó demasiado. Inténtalo de nuevo.' : (caught instanceof Error ? caught.message : 'No se pudo generar tu evaluación'));
      } finally { if (active) setEvaluating(false); }
    };
    evaluate();
    return () => { active = false; controller.abort(); };
  }, [status, responses, evaluation, evaluationError, evaluationAttempt]);

  const missionCase = MISSION_01.cases[currentCaseIndex];
  const currentResponse = useMemo(() => ({ ...EMPTY_RESPONSE, ...(responses[missionCase?.id] || {}) }), [missionCase?.id, responses]);
  const updateField = (field, value) => { setResponses(current => ({ ...current, [missionCase.id]: { ...EMPTY_RESPONSE, ...(current[missionCase.id] || {}), [field]: value } })); setError(''); };

  const saveAndContinue = async () => {
    if (!isMissionCaseComplete(currentResponse)) { setError('Completa los cuatro campos de este caso antes de continuar.'); return; }
    const updatedResponses = { ...responses, [missionCase.id]: currentResponse };
    const completed = isMissionComplete(updatedResponses);
    setSaving(true); setError('');
    const { progress, error: saveError } = await saveMissionProgress({ userId: user.id, missionId: MISSION_01.id, responses: updatedResponses, status: completed ? 'completed' : 'in_progress' });
    setSaving(false);
    if (saveError || !progress) { setError(`No pudimos guardar tu progreso: ${saveError || 'Error inesperado'}`); return; }
    setResponses(progress.responses || updatedResponses); setStatus(progress.status); setEvaluation(null); setEvaluationError('');
    if (!completed) setCurrentCaseIndex(index => Math.min(index + 1, MISSION_01.cases.length - 1));
  };

  if (loading) return <Layout><div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" /> Preparando misión...</div></Layout>;

  if (status === 'completed' && isMissionComplete(responses)) {
    const dimensionMeta = [['situacion', 'S · SITUACIÓN'], ['emocion', 'E · EMOCIÓN'], ['transicion', 'T · TRANSICIÓN'], ['movimiento', 'TU MOVIMIENTO']];
    return <Layout><div className="mx-auto max-w-5xl animate-fade-in">
      <section className="rounded-3xl border border-green-500/30 bg-bg-card p-6 text-center md:p-10"><CheckCircle2 size={52} className="mx-auto text-green-400" /><div className="mt-6 text-xs font-black tracking-[0.25em] text-green-400">MISIÓN COMPLETADA</div><h1 className="mt-3 text-2xl font-black text-text-primary md:text-4xl">Primera evidencia S.E.T. registrada.</h1><p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-text-secondary">Ahora sí vamos a evaluar tu razonamiento, no a buscar una frase idéntica a la referencia.</p></section>
      <section className="mt-6 rounded-3xl border border-accent-coral/30 bg-bg-card p-5 md:p-8">
        <div className="flex items-center gap-2 text-xs font-black tracking-[0.18em] text-accent-coral"><Sparkles size={16} /> SET EVALUATOR</div>
        {evaluating && <div className="mt-6 flex items-center gap-3 rounded-2xl border border-border-subtle bg-bg-input/50 p-5 text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" /> Analizando tu criterio S.E.T. en los tres casos...</div>}
        {evaluationError && !evaluation && <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-300">No pudimos generar el SET Score: {evaluationError}<button onClick={() => { setEvaluationError(''); setEvaluationAttempt(value => value + 1); }} className="ml-2 font-bold underline">Reintentar</button></div>}
        {evaluation && <><div className="mt-6 grid gap-5 lg:grid-cols-[220px_1fr]"><div className="rounded-2xl border border-accent-coral/30 bg-accent-coral/5 p-6 text-center"><div className="text-xs font-black tracking-[0.16em] text-text-secondary">SET SCORE</div><div className="mt-2 text-6xl font-black text-accent-coral">{evaluation.setScore}</div><div className="text-sm font-bold text-text-secondary">/100</div>{evaluation.level && <div className="mt-4 rounded-full border border-border-subtle bg-bg-input px-3 py-2 text-xs font-black text-text-primary">{evaluation.level}</div>}</div><div className="rounded-2xl border border-accent-gold/30 bg-accent-gold/5 p-5 md:p-6"><div className="text-xs font-black tracking-[0.15em] text-accent-gold">TU PRINCIPAL OPORTUNIDAD</div><p className="mt-3 text-base font-bold leading-relaxed text-text-primary">{evaluation.mainOpportunity}</p><p className="mt-4 text-xs leading-relaxed text-text-secondary">Este score evalúa la calidad de tu razonamiento en esta misión. No mide tu valor profesional ni pretende que copies una respuesta modelo.</p></div></div><div className="mt-5 grid gap-4 md:grid-cols-2">{dimensionMeta.map(([key,label]) => <div key={key} className="rounded-2xl border border-border-subtle bg-bg-input/50 p-5"><div className="flex items-center justify-between gap-3"><div className="text-xs font-black text-text-primary">{label}</div><div className="text-xl font-black text-accent-coral">{evaluation.dimensions[key].score}<span className="text-xs text-text-secondary">/100</span></div></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-primary"><div className="h-full rounded-full bg-accent-coral" style={{width:`${evaluation.dimensions[key].score}%`}} /></div><p className="mt-4 text-sm leading-relaxed text-text-secondary">{evaluation.dimensions[key].feedback}</p></div>)}</div></>}
      </section>
      <div className="mt-6 space-y-6">{MISSION_01.cases.map((completedCase,index) => <article key={completedCase.id} className="rounded-2xl border border-border-subtle bg-bg-card p-4 md:p-6"><div className="text-xs font-black tracking-[0.18em] text-accent-gold">CASO {index+1} · {completedCase.industry.toUpperCase()}</div>{completedCase.context && <div className="mt-2 text-xs font-bold text-text-secondary">CONTEXTO · {completedCase.context}</div>}<div className="mt-4 rounded-2xl rounded-tl-sm border border-border-subtle bg-bg-input px-4 py-3 text-sm leading-relaxed text-text-primary">{completedCase.leadMessage}</div><div className="mt-6 grid gap-4 lg:grid-cols-2"><section className="rounded-2xl border border-accent-coral/30 bg-accent-coral/5 p-4 md:p-5"><h2 className="text-xs font-black tracking-[0.18em] text-accent-coral">TU ANÁLISIS</h2><div className="mt-5 space-y-5">{MISSION_FIELDS.map(field => <div key={field.key}><div className="text-xs font-black text-text-secondary">{field.label}</div><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-text-primary">{responses[completedCase.id]?.[field.key]}</p></div>)}</div></section><section className="rounded-2xl border border-green-500/30 bg-green-500/5 p-4 md:p-5"><h2 className="text-xs font-black tracking-[0.14em] text-green-400">CRITERIO S.E.T. DE REFERENCIA</h2><p className="mt-2 text-xs leading-relaxed text-text-secondary">No es una respuesta para copiar. Es una referencia para contrastar tu criterio.</p><div className="mt-5 space-y-5">{MISSION_FIELDS.map(field => <div key={field.key}><div className="text-xs font-black text-text-secondary">{field.key==='movimiento'?'MOVIMIENTO SUGERIDO':field.label}</div><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-text-primary">{completedCase.reference[field.key]}</p></div>)}</div></section></div><section className="mt-4 rounded-2xl border border-accent-gold/30 bg-accent-gold/5 p-4 md:p-5"><div className="text-xs font-black tracking-[0.16em] text-accent-gold">AUTOEVALUACIÓN GUIADA</div><p className="mt-2 text-xs leading-relaxed text-text-secondary">No busques coincidir palabra por palabra. Revisa la calidad de tu razonamiento.</p><div className="mt-4 grid gap-3 md:grid-cols-2">{MISSION_FIELDS.map(field => <div key={field.key} className="rounded-xl border border-border-subtle bg-bg-input/60 p-3"><div className="text-xs font-black text-text-primary">{field.label}</div><p className="mt-1 text-xs leading-relaxed text-text-secondary">{completedCase.reflection?.[field.key]}</p></div>)}</div></section></article>)}</div>
      <section className="mt-6 rounded-2xl border border-accent-gold/30 bg-bg-card p-6 text-center md:p-8"><p className="text-lg font-black leading-relaxed text-text-primary">El objetivo no era adivinar una respuesta.<br/>Era aprender a pensar antes de responder.</p><button onClick={() => navigate('/missions')} className="mt-6 w-full rounded-xl bg-accent-coral px-5 py-3 text-sm font-bold text-white sm:w-auto">Volver a Missions</button></section>
    </div></Layout>;
  }

  return <Layout><div className="mx-auto max-w-3xl animate-fade-in"><button onClick={() => navigate('/missions')} className="mb-5 flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"><ArrowLeft size={15}/> Todas las misiones</button><header className="mb-6"><div className="text-xs font-black tracking-[0.2em] text-accent-coral">MISIÓN {MISSION_01.number} · CASO {currentCaseIndex+1} DE {MISSION_01.cases.length}</div><h1 className="mt-2 text-2xl font-black text-text-primary md:text-3xl">{MISSION_01.title}</h1><p className="mt-1 text-sm text-text-secondary">{MISSION_01.subtitle}</p><p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-text-secondary">{MISSION_01.introduction}</p></header><div className="mb-6 flex gap-2">{MISSION_01.cases.map((item,index)=><div key={item.id} className={`h-1.5 flex-1 rounded-full ${index<=currentCaseIndex?'bg-accent-coral':'bg-bg-input'}`}/>)}</div><section className="rounded-2xl border border-border-subtle bg-bg-card p-4 md:p-6"><div className="text-xs font-black uppercase tracking-wider text-accent-gold">{missionCase.industry}</div>{missionCase.context&&<div className="mt-2 text-xs font-bold text-text-secondary">CONTEXTO · {missionCase.context}</div>}<div className="mt-4 rounded-2xl rounded-tl-sm border border-border-subtle bg-bg-input px-4 py-3 text-sm leading-relaxed text-text-primary">{missionCase.leadMessage}</div><div className="mt-7 space-y-6">{MISSION_FIELDS.map(field=><label key={field.key} className="block"><span className="block text-xs font-black tracking-wide text-accent-coral">{field.label}</span><span className="mt-1 block text-sm text-text-secondary">{field.prompt}</span><textarea value={currentResponse[field.key]} onChange={event=>updateField(field.key,event.target.value)} rows={field.key==='movimiento'?4:3} className="mt-3 w-full resize-y rounded-xl border border-border-subtle bg-bg-primary px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-secondary/60 focus:border-accent-coral" placeholder="Escribe tu respuesta..."/></label>)}</div>{error&&<div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}<div className="mt-7 flex flex-col-reverse gap-3 border-t border-border-subtle pt-5 sm:flex-row sm:items-center sm:justify-between"><button onClick={()=>setCurrentCaseIndex(index=>Math.max(0,index-1))} disabled={currentCaseIndex===0||saving} className="flex items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 py-3 text-sm font-bold text-text-secondary disabled:opacity-40"><ArrowLeft size={15}/> Caso anterior</button><button onClick={saveAndContinue} disabled={saving} className="flex items-center justify-center gap-2 rounded-xl bg-accent-coral px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{saving?<Loader2 size={16} className="animate-spin"/>:currentCaseIndex===MISSION_01.cases.length-1?<CheckCircle2 size={16}/>:<ArrowRight size={16}/>} {currentCaseIndex===MISSION_01.cases.length-1?'Completar misión':'Guardar y continuar'}</button></div></section></div></Layout>;
};

export default MissionConversationHunt;
