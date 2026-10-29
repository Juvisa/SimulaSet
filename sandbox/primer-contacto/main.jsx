// Preview local de Inbound — Primer contacto. Ver sandbox/vite.config.mjs.
// Es el punto de entrada (nadie importa este archivo), así que define sus
// componentes aquí mismo.
/* eslint-disable react-refresh/only-export-components */
import './networkGuard.js';
import { StrictMode, useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import '../../src/index.css';
import Simulator from '../../src/pages/Simulator.jsx';
import { SCENARIOS } from './scenarios.js';
import { sandbox } from './state.js';

const useSandbox = () => useSyncExternalStore(sandbox.subscribe, sandbox.get);

const box = { background: '#111827f2', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 12, padding: 12, font: '12px/1.45 system-ui, sans-serif' };
const btn = { background: '#0e7490', color: 'white', border: 0, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', font: 'inherit' };
const muted = { color: '#9ca3af' };

const Banner = () => {
  const s = useSandbox();
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000, background: '#7c2d12', color: '#fff7ed', font: '12px system-ui, sans-serif', padding: '4px 12px', textAlign: 'center' }}>
      PREVIEW LOCAL · IA simulada · sin Supabase · nada se guarda · conexiones externas bloqueadas: {s.blocked.length}
    </div>
  );
};

const startScenario = (navigate, scenario) => {
  sandbox.start(scenario.id);
  navigate('/simulator', { state: { mode: 'primer_contacto', config: { projectId: 'preview-local', ...scenario.config } } });
};

const Picker = () => {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', background: '#0b0f17', color: '#e5e7eb', padding: '48px 16px', font: '14px/1.5 system-ui, sans-serif' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, margin: '0 0 4px' }}>Preview local · Inbound — Primer contacto</h1>
        <p style={muted}>Pantalla real del simulador con la lógica real de Primer contacto. La IA responde con un guion; no hay red, Supabase ni guardado. Usa el botón «Escribir mensaje sugerido» del panel para seguir el guion.</p>
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          {SCENARIOS.map((s) => (
            <div key={s.id} style={box}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <b style={{ fontSize: 15 }}>{s.title}</b>
                <button type="button" style={btn} onClick={() => startScenario(navigate, s)}>Abrir</button>
              </div>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{s.check.map((c) => <li key={c}>{c}</li>)}</ul>
              <div style={{ ...muted, marginTop: 4 }}>Enlace directo: <code>?escenario={s.id}</code></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const fillSuggested = (text) => {
  const ta = document.querySelector('textarea');
  if (!ta) return;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, text);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
};

const Panel = () => {
  const s = useSandbox();
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const scenario = sandbox.scenario();
  if (!scenario) return null;
  const next = scenario.turns[s.nextTurn];
  return (
    <div style={{ ...box, position: 'fixed', left: 12, bottom: 12, width: 'min(360px, calc(100vw - 24px))', maxHeight: '70vh', overflow: 'auto', zIndex: 9999 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <b>Panel de prueba</b>
        <button type="button" style={{ ...btn, background: '#374151' }} onClick={() => setOpen(!open)}>{open ? 'Ocultar' : 'Mostrar'}</button>
      </div>
      {open && (
        <>
          <div style={{ marginTop: 6 }}>{scenario.title}</div>
          <div style={{ marginTop: 8 }}>
            <b>Turno {s.nextTurn + 1}</b>{next ? ' · mensaje sugerido:' : ' · fin del guion'}
            {next && <div style={{ margin: '4px 0', padding: 6, background: '#1f2937', borderRadius: 6 }}>{next.setter}</div>}
            {next && <button type="button" style={btn} onClick={() => fillSuggested(next.setter)}>Escribir mensaje sugerido</button>}
          </div>
          <div style={{ marginTop: 10 }}>
            <label>Prospecto: {(s.prospectMs / 1000).toFixed(1)} s
              <input type="range" min="0" max="5000" step="100" value={s.prospectMs} onChange={(e) => sandbox.setDelays({ prospectMs: Number(e.target.value) })} style={{ width: '100%' }} />
            </label>
            <label>Coaching: {(s.coachMs / 1000).toFixed(1)} s
              <input type="range" min="0" max="8000" step="100" value={s.coachMs} onChange={(e) => sandbox.setDelays({ coachMs: Number(e.target.value) })} style={{ width: '100%' }} />
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <b>Qué revisar</b>
            <ul style={{ margin: '2px 0', paddingLeft: 18 }}>{scenario.check.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
          <div style={{ marginTop: 8 }}>
            <b>Llamadas simuladas</b>
            <div style={{ ...muted, maxHeight: 140, overflow: 'auto' }}>
              {s.log.length === 0 ? '—' : [...s.log].reverse().map((l, i) => <div key={i}>{l.at} · {l.rol}{l.turno ? ` · turno ${l.turno}` : ''} · {l.detalle}</div>)}
            </div>
          </div>
          <button type="button" style={{ ...btn, background: '#374151', marginTop: 8 }} onClick={() => navigate('/simulate')}>Cambiar de escenario</button>
        </>
      )}
    </div>
  );
};

const Report = () => {
  const s = useSandbox();
  const navigate = useNavigate();
  const session = useLocation().state?.session;
  return (
    <div style={{ minHeight: '100vh', background: '#0b0f17', color: '#e5e7eb', padding: '48px 16px', font: '14px/1.5 system-ui, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', ...box }}>
        <h2 style={{ marginTop: 0 }}>Sesión terminada (preview local)</h2>
        <p>En la aplicación aquí se abriría el reporte. En el preview se muestra la fila que se habría guardado en <code>simulator_sessions</code>; <b>no se guardó nada</b>.</p>
        <pre style={{ background: '#1f2937', padding: 10, borderRadius: 8, overflow: 'auto' }}>{JSON.stringify(s.saved, null, 2)}</pre>
        <p style={muted}>Mensajes en la sesión: {session?.messages?.length ?? 0} · Estado final: {session?.finalState || '—'}</p>
        <button type="button" style={btn} onClick={() => navigate('/simulate')}>Volver a los escenarios</button>
      </div>
    </div>
  );
};

const SimulatorRun = () => {
  const s = useSandbox();
  return (<><Simulator key={s.run} /><Panel /></>);
};

const AutoStart = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('escenario');
    const scenario = SCENARIOS.find((x) => x.id === id);
    if (scenario) startScenario(navigate, scenario);
  }, [navigate]);
  return null;
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MemoryRouter initialEntries={['/simulate']}>
      <Banner />
      <AutoStart />
      <Routes>
        <Route path="/simulate" element={<Picker />} />
        <Route path="/simulator" element={<SimulatorRun />} />
        <Route path="/simulation-report" element={<Report />} />
        <Route path="*" element={<Picker />} />
      </Routes>
    </MemoryRouter>
  </StrictMode>,
);
