// Preview local de Inbound — Primer contacto. Ver sandbox/vite.config.mjs.
// Es el punto de entrada (nadie importa este archivo), así que define sus
// componentes aquí mismo.
//
// Diseño: NADA del preview flota sobre el chat. Una barra superior fina
// (sticky; la cabecera del chat se corre debajo) con «Escribir sugerido» y un
// botón para mostrar u ocultar el panel de prueba; el panel va en una columna
// propia a la derecha en pantallas anchas, o debajo del chat en pantallas
// angostas. Oculto, no ocupa ningún espacio. (Antes era una caja fija sobre
// la esquina inferior izquierda: tapaba el campo de escritura, también
// contraída.)
/* eslint-disable react-refresh/only-export-components */
import './networkGuard.js';
import { StrictMode, useEffect, useRef, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import '../../src/index.css';
import Simulator from '../../src/pages/Simulator.jsx';
import { SCENARIOS } from './scenarios.js';
import { sandbox } from './state.js';

const useSandbox = () => useSyncExternalStore(sandbox.subscribe, sandbox.get);

// Ancho a partir del cual el panel va en columna propia junto al simulador.
const WIDE = '(min-width: 1100px)';
const useWide = () => useSyncExternalStore(
  (cb) => { const m = window.matchMedia(WIDE); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
  () => window.matchMedia(WIDE).matches,
);

// Preferencia de mostrar u ocultar el panel (solo comodidad de quien revisa).
const PANEL_KEY = 'preview-primer-contacto:panel';
const panelPref = {
  listeners: new Set(),
  read() {
    try { const v = window.localStorage.getItem(PANEL_KEY); if (v === 'visible' || v === 'oculto') return v; } catch { /* sin almacenamiento */ }
    return window.matchMedia(WIDE).matches ? 'visible' : 'oculto';
  },
  value: null,
  get() { if (this.value === null) this.value = this.read(); return this.value; },
  set(v) { this.value = v; try { window.localStorage.setItem(PANEL_KEY, v); } catch { /* sin almacenamiento */ } this.listeners.forEach((l) => l()); },
  subscribe(l) { panelPref.listeners.add(l); return () => panelPref.listeners.delete(l); },
};
const usePanelVisible = () => useSyncExternalStore((l) => panelPref.subscribe(l), () => panelPref.get()) === 'visible';

const BAR_HEIGHT = 32;
// La pantalla del simulador ocupa toda la altura (min-h-screen): dentro del
// preview se le descuenta la barra superior para que el campo de escritura
// quede a la vista sin desplazar la página. Solo afecta al preview.
// La barra superior queda fija arriba (sticky) y la cabecera del chat, que
// también es sticky, se corre debajo de ella: ninguna tapa a la otra.
const SHELL_CSS = `
.preview-sim .min-h-screen { min-height: calc(100vh - ${BAR_HEIGHT}px); }
.preview-sim .sticky.top-0 { top: ${BAR_HEIGHT}px; }
.preview-btn { background: #0e7490; color: #fff; border: 0; border-radius: 8px; padding: 6px 10px; cursor: pointer; font: inherit; }
.preview-btn.secundario { background: #374151; }
.preview-btn:focus-visible { outline: 2px solid #67e8f9; outline-offset: 2px; }
`;

const muted = { color: '#9ca3af' };
const card = { background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 12, padding: 12 };

const barButton = { background: 'transparent', color: '#fff7ed', border: '1px solid #fdba74', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', font: 'inherit', flexShrink: 0 };
const TopBar = ({ withPanelToggle }) => {
  const s = useSandbox();
  const visible = usePanelVisible();
  const scenario = withPanelToggle ? sandbox.scenario() : null;
  const next = scenario?.turns[s.nextTurn];
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 40, height: BAR_HEIGHT, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', background: '#7c2d12', color: '#fff7ed', font: '12px system-ui, sans-serif', whiteSpace: 'nowrap' }}>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        PREVIEW LOCAL · IA simulada · sin Supabase · nada se guarda · conexiones externas bloqueadas: <b data-bloqueadas>{s.blocked.length}</b>
      </span>
      {next && (
        <button type="button" title={next.setter} onClick={() => fillSuggested(next.setter)} style={barButton}>Escribir sugerido</button>
      )}
      {withPanelToggle && (
        <button type="button" aria-expanded={visible} aria-controls="panel-de-prueba" onClick={() => panelPref.set(visible ? 'oculto' : 'visible')} style={barButton}>
          {visible ? 'Ocultar panel' : 'Panel de prueba'}
        </button>
      )}
    </div>
  );
};

const startScenario = (navigate, scenario) => {
  sandbox.start(scenario.id);
  navigate('/simulator', { state: { mode: 'primer_contacto', config: { projectId: 'preview-local', ...scenario.config } } });
};

const Page = ({ children }) => (
  <div style={{ minHeight: `calc(100vh - ${BAR_HEIGHT}px)`, background: '#0b0f17', color: '#e5e7eb', padding: '32px 16px', font: '14px/1.5 system-ui, sans-serif' }}>
    <div style={{ maxWidth: 860, margin: '0 auto' }}>{children}</div>
  </div>
);

const Picker = () => {
  const navigate = useNavigate();
  return (
    <><TopBar withPanelToggle={false} />
      <Page>
        <h1 style={{ fontSize: 24, margin: '0 0 4px' }}>Preview local · Inbound — Primer contacto</h1>
        <p style={muted}>Pantalla real del simulador con la lógica real de Primer contacto. La IA responde con un guion; no hay red, Supabase ni guardado. El botón «Panel de prueba» (arriba a la derecha) muestra el mensaje sugerido de cada turno.</p>
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          {SCENARIOS.map((s) => (
            <div key={s.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <b style={{ fontSize: 15 }}>{s.title}</b>
                <button type="button" className="preview-btn" onClick={() => startScenario(navigate, s)}>Abrir</button>
              </div>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{s.check.map((c) => <li key={c}>{c}</li>)}</ul>
              <div style={{ ...muted, marginTop: 4 }}>Enlace directo: <code>?escenario={s.id}</code></div>
            </div>
          ))}
        </div>
      </Page>
    </>
  );
};

// Escribe el mensaje sugerido en el campo del simulador (como si se tecleara).
const fillSuggested = (text) => {
  const ta = document.querySelector('.preview-sim textarea');
  if (!ta) return;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, text);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
};

const PanelContent = () => {
  const s = useSandbox();
  const navigate = useNavigate();
  const scenario = sandbox.scenario();
  if (!scenario) return null;
  const next = scenario.turns[s.nextTurn];
  return (
    <div style={{ font: '12px/1.45 system-ui, sans-serif', color: '#e5e7eb', display: 'grid', gap: 10 }}>
      <div><b>Panel de prueba</b> · {scenario.title}</div>
      <div>
        <b>Turno {s.nextTurn + 1}</b>{next ? ' · mensaje sugerido:' : ' · fin del guion (puedes pulsar «Terminar»)'}
        {next && <div data-sugerido style={{ margin: '4px 0 6px', padding: 6, background: '#1f2937', borderRadius: 6 }}>{next.setter}</div>}
        {next && <button type="button" className="preview-btn" onClick={() => fillSuggested(next.setter)}>Escribir mensaje sugerido</button>}
      </div>
      <div>
        <label style={{ display: 'block' }}>Demora del prospecto: {(s.prospectMs / 1000).toFixed(1)} s
          <input type="range" min="0" max="5000" step="100" value={s.prospectMs} onChange={(e) => sandbox.setDelays({ prospectMs: Number(e.target.value) })} style={{ width: '100%' }} />
        </label>
        <label style={{ display: 'block' }}>Demora del coaching: {(s.coachMs / 1000).toFixed(1)} s
          <input type="range" min="0" max="8000" step="100" value={s.coachMs} onChange={(e) => sandbox.setDelays({ coachMs: Number(e.target.value) })} style={{ width: '100%' }} />
        </label>
      </div>
      <div>
        <b>Qué revisar</b>
        <ul style={{ margin: '2px 0', paddingLeft: 18 }}>{scenario.check.map((c) => <li key={c}>{c}</li>)}</ul>
      </div>
      <div>
        <b>Llamadas simuladas</b>
        <div style={{ ...muted, maxHeight: 160, overflow: 'auto' }}>
          {s.log.length === 0 ? '—' : [...s.log].reverse().map((l, i) => <div key={i}>{l.at} · {l.rol}{l.turno ? ` · turno ${l.turno}` : ''} · {l.detalle}</div>)}
        </div>
      </div>
      <div><button type="button" className="preview-btn secundario" onClick={() => navigate('/simulate')}>Cambiar de escenario</button></div>
    </div>
  );
};

// Pantallas angostas: el panel va DEBAJO del chat (ni lo tapa ni lo empuja).
// Al abrirlo, la página se desplaza hasta él; el campo de escritura sigue en
// su lugar (en móvil es una barra fija, por eso el margen inferior).
const NarrowPanel = () => {
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, []);
  return (
    <section ref={ref} id="panel-de-prueba" aria-label="Panel de prueba" style={{ background: '#111827', borderTop: '1px solid #374151', padding: '12px 12px 140px', scrollMarginTop: BAR_HEIGHT }}>
      <PanelContent />
    </section>
  );
};

const SimulatorRun = () => {
  const s = useSandbox();
  const wide = useWide();
  const visible = usePanelVisible();
  return (
    <>
      <TopBar withPanelToggle />
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div className="preview-sim" style={{ flex: 1, minWidth: 0 }}>
          <Simulator key={s.run} />
        </div>
        {visible && wide && (
          <aside id="panel-de-prueba" aria-label="Panel de prueba" style={{ width: 340, flexShrink: 0, position: 'sticky', top: BAR_HEIGHT, height: `calc(100vh - ${BAR_HEIGHT}px)`, overflow: 'auto', background: '#111827', borderLeft: '1px solid #374151', padding: 12 }}>
            <PanelContent />
          </aside>
        )}
      </div>
      {visible && !wide && <NarrowPanel />}
    </>
  );
};

const Report = () => {
  const s = useSandbox();
  const navigate = useNavigate();
  const session = useLocation().state?.session;
  return (
    <><TopBar withPanelToggle={false} />
      <Page>
        <div style={card}>
          <h2 style={{ marginTop: 0 }}>Sesión terminada (preview local)</h2>
          <p>En la aplicación aquí se abriría el reporte. En el preview se muestra la fila que se habría guardado en <code>simulator_sessions</code>; <b>no se guardó nada</b>.</p>
          <pre style={{ background: '#1f2937', padding: 10, borderRadius: 8, overflow: 'auto' }}>{JSON.stringify(s.saved, null, 2)}</pre>
          <p style={muted}>Mensajes en la sesión: {session?.messages?.length ?? 0} · Estado final: {session?.finalState || '—'}</p>
          <button type="button" className="preview-btn" onClick={() => navigate('/simulate')}>Volver a los escenarios</button>
        </div>
      </Page>
    </>
  );
};

// Abre el escenario de ?escenario= UNA sola vez y lo quita de la dirección.
// (Antes el efecto dependía de `navigate`, que cambia con cada cambio de
// ruta: al terminar la sesión o al pulsar «Cambiar de escenario», el
// escenario volvía a arrancar desde cero en vez de mostrar el resumen.)
let autoStarted = false;
const AutoStart = () => {
  const navigate = useNavigate();
  useEffect(() => {
    if (autoStarted) return;
    autoStarted = true;
    const id = new URLSearchParams(window.location.search).get('escenario');
    const scenario = SCENARIOS.find((x) => x.id === id);
    if (!scenario) return;
    window.history.replaceState(null, '', window.location.pathname);
    startScenario(navigate, scenario);
  }, [navigate]);
  return null;
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <style>{SHELL_CSS}</style>
    <MemoryRouter initialEntries={['/simulate']}>
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
