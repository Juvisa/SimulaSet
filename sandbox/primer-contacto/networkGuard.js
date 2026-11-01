// Preview local: bloquea cualquier conexión fuera del propio servidor de
// desarrollo (127.0.0.1). Así se puede comprobar en pantalla que no hay
// llamadas a Supabase, a /api/anthropic ni a ningún otro servicio.
import { sandbox } from './state.js';

const sameHost = (url) => {
  try { return new URL(String(url), window.location.href).host === window.location.host; } catch { return false; }
};
const urlOf = (input) => (typeof input === 'string' ? input : input?.url || String(input));
const deny = (url) => {
  sandbox.blockedRequest(url);
  return new Error(`Preview local: conexión bloqueada (${String(url).slice(0, 80)})`);
};

const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = urlOf(input);
  // Ni siquiera /api/anthropic del propio servidor: la IA es simulada.
  if (!sameHost(url) || new URL(url, window.location.href).pathname.startsWith('/api/')) return Promise.reject(deny(url));
  return realFetch(input, init);
};

const realOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function open(method, url, ...rest) {
  if (!sameHost(url)) throw deny(url);
  return realOpen.call(this, method, url, ...rest);
};

const RealWebSocket = window.WebSocket;
window.WebSocket = function WebSocket(url, protocols) {
  if (!sameHost(url)) throw deny(url); // el recargado en caliente de Vite usa el mismo host
  return new RealWebSocket(url, protocols);
};
window.WebSocket.prototype = RealWebSocket.prototype;
Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });

if (navigator.sendBeacon) navigator.sendBeacon = (url) => { if (!sameHost(url)) { deny(url); return false; } return false; };
