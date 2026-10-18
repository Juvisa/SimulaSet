// Regresión: el frontend solo puede leer variables de entorno de forma estática
// (import.meta.env.NOMBRE) y solo las públicas permitidas. Usar import.meta.env
// como objeto completo hace que Vite incruste en el JavaScript público TODAS las
// variables VITE_, incluidas las de la plataforma Vercel (incidente del
// 2026-10-18). La revisión del bundle compilado está en scripts/check-bundle-env.mjs.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('.', import.meta.url));
const ALLOWED = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_PUBLIC_SITE_URL', 'VITE_ANTHROPIC_API_KEY', 'DEV', 'PROD', 'MODE']);

const sourceFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name);
  if (e.isDirectory()) return sourceFiles(p);
  return /\.(js|jsx)$/.test(e.name) && !/\.test\.jsx?$/.test(e.name) ? [p] : [];
});

// Sin comentarios: solo cuenta el código que llega al bundle.
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const files = sourceFiles(SRC).map((path) => ({ path: path.slice(SRC.length), text: stripComments(readFileSync(path, 'utf8')) }));

describe('uso de variables de entorno en el frontend', () => {
  it('nunca usa import.meta.env como objeto completo', () => {
    const offenders = files.filter(({ text }) => /import\.meta\.env(?!\.[A-Z_][A-Z0-9_]*)/.test(text)).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('solo lee variables permitidas', () => {
    const used = new Set(files.flatMap(({ text }) => [...text.matchAll(/import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g)].map((m) => m[1])));
    expect([...used].filter((name) => !ALLOWED.has(name))).toEqual([]);
  });
});
