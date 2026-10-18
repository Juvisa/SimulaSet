// Regresión: toda llamada a la IA del frontend declara una operación de la
// lista cerrada del servidor (api/_anthropic/operations.js), y nadie llama a
// /api/anthropic por fuera de utils/anthropic.js. Si se añade una pantalla con
// IA sin declarar su operación, el servidor la rechazaría (400) en producción:
// esta prueba lo detecta antes.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AI_OPERATIONS } from '../../api/_anthropic/operations.js';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const sourceFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name);
  if (e.isDirectory()) return sourceFiles(p);
  return /\.(js|jsx)$/.test(e.name) && !/\.test\.jsx?$/.test(e.name) ? [p] : [];
});
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const files = sourceFiles(SRC).map((path) => ({ path: path.slice(SRC.length).replace(/\\/g, '/'), text: stripComments(readFileSync(path, 'utf8')) }));

// Texto de los argumentos de cada llamada fn( … ) con paréntesis balanceados.
const callArgs = (text, fn) => {
  const out = [];
  const re = new RegExp(`\\b${fn}\\(`, 'g');
  let m;
  while ((m = re.exec(text))) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < text.length && depth > 0) {
      if (text[i] === '(') depth += 1;
      else if (text[i] === ')') depth -= 1;
      i += 1;
    }
    out.push(text.slice(m.index + m[0].length, i - 1));
  }
  return out;
};

describe('operaciones de IA en el frontend', () => {
  const usedOperations = new Set(files.flatMap(({ text }) => [...text.matchAll(/operation:\s*'([a-z_]+)'/g)].map((m) => m[1])));

  it('todas las operaciones usadas existen en la lista del servidor', () => {
    expect([...usedOperations].filter((op) => !Object.prototype.hasOwnProperty.call(AI_OPERATIONS, op))).toEqual([]);
  });

  it('todas las operaciones del servidor se usan en algún lugar (no hay permisos sobrantes)', () => {
    expect(Object.keys(AI_OPERATIONS).filter((op) => !usedOperations.has(op))).toEqual([]);
  });

  it('cada llamada a callClaude/requestClaude declara su operación', () => {
    const missing = [];
    for (const { path, text } of files) {
      if (path === 'utils/anthropic.js') {
        // Dentro del propio cliente solo se exige en las funciones que llaman a la IA.
        for (const args of [...callArgs(text, 'callClaude'), ...callArgs(text, 'request')]) {
          if (/messages/.test(args) && !/operation/.test(args)) missing.push(`${path}: ${args.slice(0, 60)}`);
        }
        continue;
      }
      for (const fn of ['callClaude', 'requestClaude']) {
        for (const args of callArgs(text, fn)) {
          if (!/operation\s*:|CHAT_MODEL_OPTIONS/.test(args)) missing.push(`${path}: ${fn}(${args.slice(0, 60)}…)`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('nadie llama a /api/anthropic por fuera del cliente central', () => {
    const offenders = files.filter(({ path, text }) => path !== 'utils/anthropic.js' && /fetch\(\s*['"`]\/api\/anthropic/.test(text)).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});
