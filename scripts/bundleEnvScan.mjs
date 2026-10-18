// Revisión del JavaScript público generado por Vite: detecta variables de
// entorno o secretos incrustados por accidente. Módulo puro (sin efectos al
// importarlo); lo usan scripts/check-bundle-env.mjs y sus pruebas.
// Nunca devuelve valores: solo nombres de variables, patrones y archivos.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';

// Únicas variables VITE_ que el frontend puede incrustar (públicas por diseño).
export const ALLOWED_VITE = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_PUBLIC_SITE_URL']);

export const listBundleFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name);
  if (e.isDirectory()) return listBundleFiles(p);
  return /\.(js|mjs|html)$/.test(e.name) ? [p] : [];
});

// Claim "role" de un JWT, sin exponer el resto del payload.
export const jwtRole = (token) => {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8')).role || null;
  } catch {
    return null;
  }
};

const SECRET_PATTERNS = [
  ['clave de Anthropic (sk-ant-…)', /sk-ant-[A-Za-z0-9_-]{8,}/g],
  ['clave secreta de Supabase (sb_secret_…)', /sb_secret_[A-Za-z0-9_-]{8,}/g],
  ['clave privada PEM', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
];

// Revisa un texto. `forbiddenValues`: valores concretos que no deben aparecer
// (secretos del entorno de build o canarios); se informan solo por su etiqueta.
export const scanText = (text, name, forbiddenValues = []) => {
  const problems = [];
  const inlinedKeys = [...new Set([...text.matchAll(/\b(VITE_[A-Z0-9_]+)\s*:\s*["'`]/g)].map((m) => m[1]))];
  if (inlinedKeys.length) problems.push(`${name}: objeto de entorno incrustado con ${inlinedKeys.length} claves (${inlinedKeys.join(', ')})`);
  if (text.includes('VITE_VERCEL_')) problems.push(`${name}: contiene VITE_VERCEL_*`);
  const names = [...new Set(text.match(/\bVITE_[A-Z0-9_]+/g) || [])].filter((n) => !ALLOWED_VITE.has(n));
  if (names.length) problems.push(`${name}: nombres VITE_ no permitidos (${names.join(', ')})`);
  for (const [label, re] of SECRET_PATTERNS) {
    const n = (text.match(re) || []).length;
    if (n) problems.push(`${name}: ${n} coincidencia(s) de ${label}`);
  }
  for (const token of text.match(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g) || []) {
    const role = jwtRole(token);
    if (role && role !== 'anon') problems.push(`${name}: JWT con rol "${role}" (solo se admite "anon")`);
  }
  for (const { label, value } of forbiddenValues) {
    if (value && value.length >= 8 && text.includes(value)) problems.push(`${name}: aparece el valor de ${label}`);
  }
  return problems;
};

export const scanBundle = (dir, forbiddenValues = []) => listBundleFiles(dir)
  .flatMap((file) => scanText(readFileSync(file, 'utf8'), file.slice(dir.length + 1), forbiddenValues));

// Variables del entorno de build cuyo VALOR nunca debe llegar al bundle:
// todo lo que no sea una VITE_ permitida y parezca credencial.
export const serverSecretsFromEnv = (env) => Object.entries(env)
  .filter(([key, value]) => typeof value === 'string' && value.length >= 16
    && !ALLOWED_VITE.has(key)
    && /(KEY|SECRET|TOKEN|PASSWORD|SERVICE_ROLE)/.test(key))
  .map(([key, value]) => ({ label: key, value }));
