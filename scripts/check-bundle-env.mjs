// Revisa el JavaScript público generado por Vite para detectar variables de
// entorno o secretos incrustados por accidente. Nunca imprime valores.
//
//   node scripts/check-bundle-env.mjs            revisa dist/ con el entorno del build
//                                                (se ejecuta en `npm run build`, también en Vercel)
//   node scripts/check-bundle-env.mjs --simulate compila en una carpeta temporal con un
//                                                entorno falso equivalente al de Vercel
//                                                Production y comprueba que no se filtra
//                                                nada y que lo público legítimo sí llega
//
// Sale con código 1 si encuentra algo.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { listBundleFiles, scanBundle, serverSecretsFromEnv } from './bundleEnvScan.mjs';

const report = (title, problems) => {
  if (problems.length === 0) { console.log(`✔ ${title}: sin variables ni secretos filtrados`); return true; }
  console.log(`✘ ${title}:`);
  problems.forEach((p) => console.log(`  - ${p}`));
  return false;
};

const fakeJwt = (role, tag) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', role, ref: tag })}.${'s'.repeat(43)}`;
};

if (process.argv.includes('--simulate')) {
  const tag = randomBytes(6).toString('hex');
  // Entorno equivalente al de Vercel Production, con valores FALSOS.
  const publicVars = {
    VITE_SUPABASE_URL: `https://${tag}abcdefgh.supabase.co`,
    VITE_SUPABASE_ANON_KEY: `sb_publishable_${tag}Fake0123456789`,
    VITE_PUBLIC_SITE_URL: `https://verificar-${tag}.example.com`,
  };
  // Valores ÚNICOS (con la etiqueta aleatoria): un valor genérico como
  // "production" aparece en cualquier librería y daría falsos positivos en la
  // búsqueda por valor. Las variables reales de Vercel se detectan además por
  // nombre y por objeto de entorno incrustado (ver bundleEnvScan.mjs).
  const vercelVars = {
    VITE_VERCEL_ENV: `production-${tag}`, VITE_VERCEL_TARGET_ENV: `production-${tag}`, VITE_VERCEL_URL: `canary-${tag}.vercel.app`,
    VITE_VERCEL_BRANCH_URL: `canary-branch-${tag}.vercel.app`, VITE_VERCEL_PROJECT_PRODUCTION_URL: `canary-prod-${tag}.example.com`,
    VITE_VERCEL_DEPLOYMENT_ID: `dpl_canary${tag}`, VITE_VERCEL_PROJECT_ID: `prj_canary${tag}`,
    VITE_VERCEL_GIT_COMMIT_MESSAGE: `canary commit ${tag}`, VITE_VERCEL_GIT_COMMIT_SHA: `canarysha${tag}`,
    VITE_VERCEL_GIT_COMMIT_AUTHOR_NAME: `canary-author-${tag}`, VITE_VERCEL_GIT_REPO_ID: `canaryrepo${tag}`,
  };
  const serverSecrets = {
    ANTHROPIC_API_KEY: `sk-ant-api03-canary${tag}000000000000`,
    SUPABASE_SERVICE_ROLE_KEY: fakeJwt('service_role', tag),
    MUX_TOKEN_SECRET: `muxsecretcanary${tag}000000`,
    MUX_WEBHOOK_SECRET: `muxwebhookcanary${tag}0000`,
    VITE_ZZ_UNUSED_CANARY: `canary-unused-${tag}`,
    VITE_ANTHROPIC_API_KEY: `sk-ant-canary-vite-${tag}0000`,
  };
  Object.assign(process.env, publicVars, vercelVars, serverSecrets);

  const outDir = mkdtempSync(join(tmpdir(), 'bundle-check-'));
  try {
    const { build } = await import('vite');
    await build({ logLevel: 'silent', build: { outDir, emptyOutDir: true } });
    const forbidden = [
      ...Object.entries(vercelVars).map(([label, value]) => ({ label, value })),
      ...Object.entries(serverSecrets).map(([label, value]) => ({ label, value })),
    ];
    const problems = scanBundle(outDir, forbidden);
    const all = listBundleFiles(outDir).map((f) => readFileSync(f, 'utf8')).join('\n');
    // Lo público legítimo SÍ debe llegar; si no, el chequeo estaría rompiendo la app.
    for (const [label, value] of Object.entries(publicVars)) {
      if (!all.includes(value)) problems.push(`la variable pública ${label} no llegó al bundle`);
    }
    process.exitCode = report('Compilación simulada con un entorno equivalente a Vercel Production', problems) ? 0 : 1;
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
} else {
  // Modo build: revisa dist/ y además que ningún secreto real del entorno de
  // build (claves de servidor) aparezca en el bundle. Solo se informa el nombre.
  const problems = scanBundle(join(process.cwd(), 'dist'), serverSecretsFromEnv(process.env));
  process.exitCode = report('Bundle de dist/', problems) ? 0 : 1;
}
