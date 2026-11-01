// Preview local de Inbound — Primer contacto (solo desarrollo).
//
//   npm run sandbox:primer-contacto   →  http://127.0.0.1:5199/
//
// Monta la pantalla REAL del simulador (src/pages/Simulator.jsx, sin cambios)
// con la lógica real de Primer contacto, pero sustituye los cinco módulos que
// tocan red o datos por versiones simuladas (carpeta primer-contacto/stubs):
//   src/lib/supabase.js            → lanza un error si alguien lo usa
//   src/context/AuthContext.jsx    → alumno ficticio, sin sesión real
//   src/utils/anthropic.js         → respuestas de IA guionadas, sin red
//   src/utils/projects.js          → proyecto ficticio
//   src/utils/simulatorSessions.js → no guarda nada; solo muestra lo que se guardaría
//
// Garantías:
//   - No carga ninguna variable de entorno (envDir vacío y un prefijo que no
//     coincide con ninguna variable): ni claves ni URLs de Supabase.
//   - Solo escucha en 127.0.0.1 (no queda expuesto en la red local).
//   - No se puede compilar: `vite build` con esta configuración se detiene.
//     El build de producción (vite.config.js, index.html de la raíz) no
//     incluye nada de esta carpeta.
import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = realpathSync.native(dirname(fileURLToPath(import.meta.url)));
const repo = resolve(here, '..');
const app = resolve(here, 'primer-contacto');
const key = (p) => realpathSync.native(p).replace(/\\/g, '/').toLowerCase();

const SWAPS = new Map([
  ['src/lib/supabase.js', 'stubs/supabase.js'],
  ['src/context/AuthContext.jsx', 'stubs/AuthContext.jsx'],
  ['src/utils/anthropic.js', 'stubs/anthropic.js'],
  ['src/utils/projects.js', 'stubs/projects.js'],
  ['src/utils/simulatorSessions.js', 'stubs/simulatorSessions.js'],
].map(([real, stub]) => [key(resolve(repo, real)), resolve(app, stub)]));

const swapModules = {
  name: 'primer-contacto-sandbox:swap',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!importer) return null;
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
    if (!resolved || resolved.external) return null;
    const id = resolved.id.split('?')[0];
    try { return SWAPS.get(key(id)) || null; } catch { return null; }
  },
};

const refuseBuild = {
  name: 'primer-contacto-sandbox:no-build',
  apply: 'build',
  buildStart() { throw new Error('El preview de Primer contacto es solo para desarrollo local: no se compila.'); },
};

export default defineConfig({
  root: app,
  envDir: resolve(here, 'sin-variables'),
  envPrefix: 'SANDBOX_PRIMER_CONTACTO_NUNCA_',
  plugins: [swapModules, react(), refuseBuild],
  css: { postcss: repo },
  server: { host: '127.0.0.1', port: 5199, strictPort: true, open: '/', fs: { allow: [repo] } },
});
