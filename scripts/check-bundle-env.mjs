// Revisa el JavaScript público generado por Vite para detectar variables de
// entorno o secretos incrustados por accidente. Nunca imprime valores: solo
// nombres de variables, patrones y archivos.
//
//   node scripts/check-bundle-env.mjs            revisa dist/ (tras `npm run build`)
//   node scripts/check-bundle-env.mjs --simulate compila en una carpeta temporal con
//                                                variables "canario" falsas (como las de
//                                                Vercel) y comprueba que no se filtran
//
// Sale con código 1 si encuentra algo.
import { readdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import process from 'node:process';

// Únicas variables VITE_ que el frontend puede incrustar (son públicas por diseño).
const ALLOWED_VITE = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_PUBLIC_SITE_URL']);

const listJs = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name);
  if (e.isDirectory()) return listJs(p);
  return /\.(js|mjs|html)$/.test(e.name) ? [p] : [];
});

// Decodifica el payload de un JWT sin imprimirlo; devuelve solo el claim "role".
const jwtRole = (token) => {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8')).role || null;
  } catch { return null; }
};

export const scanBundle = (dir, canaries = []) => {
  const problems = [];
  for (const file of listJs(dir)) {
    const text = readFileSync(file, 'utf8');
    const name = file.slice(dir.length + 1);
    // 1. Objeto de entorno completo incrustado (import.meta.env usado como objeto).
    const inlinedKeys = [...new Set([...text.matchAll(/\b(VITE_[A-Z0-9_]+)\s*:\s*["'`]/g)].map((m) => m[1]))];
    if (inlinedKeys.length) problems.push(`${name}: objeto de entorno incrustado con ${inlinedKeys.length} claves (${inlinedKeys.join(', ')})`);
    // 2. Metadatos de la plataforma Vercel.
    if (text.includes('VITE_VERCEL_')) problems.push(`${name}: contiene VITE_VERCEL_*`);
    // 3. Nombres VITE_ fuera de la lista permitida.
    const names = [...new Set(text.match(/\bVITE_[A-Z0-9_]+/g) || [])].filter((n) => !ALLOWED_VITE.has(n));
    if (names.length) problems.push(`${name}: nombres VITE_ no permitidos (${names.join(', ')})`);
    // 4. Patrones de secretos (sin mostrar el valor).
    const secretPatterns = [
      ['clave de Anthropic (sk-ant-…)', /sk-ant-[A-Za-z0-9_-]{8,}/g],
      ['clave secreta de Supabase (sb_secret_…)', /sb_secret_[A-Za-z0-9_-]{8,}/g],
      ['clave privada PEM', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
    ];
    for (const [label, re] of secretPatterns) {
      const n = (text.match(re) || []).length;
      if (n) problems.push(`${name}: ${n} coincidencia(s) de ${label}`);
    }
    for (const token of text.match(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g) || []) {
      const role = jwtRole(token);
      if (role && role !== 'anon') problems.push(`${name}: JWT con rol "${role}" (solo se admite "anon")`);
    }
    // 5. Canarios de la simulación.
    for (const { label, value } of canaries) {
      if (text.includes(value)) problems.push(`${name}: se filtró la variable canario ${label}`);
    }
  }
  return problems;
};

const report = (title, problems) => {
  if (problems.length === 0) { console.log(`✔ ${title}: sin variables ni secretos filtrados`); return true; }
  console.log(`✘ ${title}:`);
  problems.forEach((p) => console.log(`  - ${p}`));
  return false;
};

if (process.argv.includes('--simulate')) {
  const tag = randomBytes(6).toString('hex');
  const canaries = [
    { label: 'VITE_VERCEL_GIT_COMMIT_MESSAGE', value: `canary-vercel-${tag}` },
    { label: 'VITE_VERCEL_DEPLOYMENT_ID', value: `canary-deploy-${tag}` },
    { label: 'VITE_ZZ_UNUSED_CANARY', value: `canary-unused-${tag}` },
    { label: 'VITE_ANTHROPIC_API_KEY', value: `sk-ant-canary${tag}` },
  ];
  for (const c of canaries) process.env[c.label] = c.value;
  // La única variable que SÍ debe llegar al bundle: el dominio de verificación.
  const siteUrl = `https://verificar-${tag}.example.com`;
  process.env.VITE_PUBLIC_SITE_URL = siteUrl;
  const outDir = mkdtempSync(join(tmpdir(), 'bundle-check-'));
  try {
    const { build } = await import('vite');
    await build({ logLevel: 'silent', build: { outDir, emptyOutDir: true } });
    const problems = scanBundle(outDir, canaries);
    const siteUrlIncluded = listJs(outDir).some((file) => readFileSync(file, 'utf8').includes(siteUrl));
    if (!siteUrlIncluded) problems.push('VITE_PUBLIC_SITE_URL configurada no llegó al bundle (los enlaces de verificación no la usarían)');
    process.exitCode = report('Compilación simulada con variables de Vercel', problems) ? 0 : 1;
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
} else {
  process.exitCode = report('dist/', scanBundle(join(process.cwd(), 'dist'))) ? 0 : 1;
}
