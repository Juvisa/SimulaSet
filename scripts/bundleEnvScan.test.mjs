import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Buffer } from 'node:buffer';
import { jwtRole, scanBundle, scanText, serverSecretsFromEnv } from './bundleEnvScan.mjs';

const jwt = (role) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64({ role, iss: 'supabase' })}.${'s'.repeat(43)}`;
};

describe('scanText: no rechaza lo público legítimo', () => {
  it('URL de Supabase, clave publicable, JWT anon y dominio de verificación', () => {
    const code = `const u="https://abcdefghijklmnopqrst.supabase.co",k="sb_publishable_abc123XYZ",a="${jwt('anon')}",s="https://digitalset.simulaset.com";`;
    expect(scanText(code, 'index.js')).toEqual([]);
  });

  it('código normal de librerías sin variables', () => {
    expect(scanText('function f(e){return e?.x??null}const DEV=!1;', 'a.js')).toEqual([]);
  });
});

describe('scanText: detecta filtraciones', () => {
  it('objeto de entorno completo (incidente del 2026-10-18)', () => {
    const code = 'const env={VITE_SUPABASE_URL:`https://x.supabase.co`,VITE_VERCEL_ENV:`production`,VITE_VERCEL_GIT_COMMIT_MESSAGE:`msg`};';
    const problems = scanText(code, 'index.js');
    expect(problems.join('\n')).toMatch(/objeto de entorno incrustado/);
    expect(problems.join('\n')).toMatch(/VITE_VERCEL_/);
  });

  it('nombres VITE_ fuera de la lista permitida', () => {
    expect(scanText('x("VITE_STRIPE_SECRET")', 'a.js').join('\n')).toMatch(/no permitidos \(VITE_STRIPE_SECRET\)/);
  });

  it('claves de Anthropic, secretas de Supabase y PEM', () => {
    expect(scanText('k="sk-ant-api03-abcdefghijkl"', 'a.js').join('\n')).toMatch(/Anthropic/);
    expect(scanText('k="sb_secret_abcdefghijkl"', 'a.js').join('\n')).toMatch(/secreta de Supabase/);
    expect(scanText('-----BEGIN RSA PRIVATE KEY-----', 'a.js').join('\n')).toMatch(/PEM/);
  });

  it('JWT de service_role', () => {
    expect(scanText(`k="${jwt('service_role')}"`, 'a.js').join('\n')).toMatch(/rol "service_role"/);
    expect(jwtRole(jwt('anon'))).toBe('anon');
  });

  it('valores prohibidos concretos, informados solo por su etiqueta', () => {
    const problems = scanText('x="mi-valor-secreto-123"', 'a.js', [{ label: 'MUX_TOKEN_SECRET', value: 'mi-valor-secreto-123' }]);
    expect(problems).toEqual(['a.js: aparece el valor de MUX_TOKEN_SECRET']);
    expect(problems.join('')).not.toContain('mi-valor-secreto-123');
  });
});

describe('serverSecretsFromEnv', () => {
  it('toma las credenciales del servidor y deja fuera las VITE_ permitidas y valores cortos', () => {
    const env = {
      ANTHROPIC_API_KEY: 'sk-ant-xxxxxxxxxxxxxxxx', SUPABASE_SERVICE_ROLE_KEY: 'eyJxxxxxxxxxxxxxxxxxx', MUX_TOKEN_SECRET: 'abcdefghijklmnopqrst',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_xxxxxxxxxxxx', PATH: '/usr/bin:/bin:/usr/local/bin', NODE_ENV: 'production', SHORT_KEY: 'abc',
    };
    expect(serverSecretsFromEnv(env).map((s) => s.label).sort()).toEqual(['ANTHROPIC_API_KEY', 'MUX_TOKEN_SECRET', 'SUPABASE_SERVICE_ROLE_KEY']);
  });
});

describe('scanBundle', () => {
  it('recorre la carpeta del build e informa archivo por archivo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scan-test-'));
    try {
      mkdirSync(join(dir, 'assets'));
      writeFileSync(join(dir, 'assets', 'ok.js'), 'const a=1;');
      writeFileSync(join(dir, 'assets', 'mal.js'), 'const e={VITE_VERCEL_ENV:`production`};');
      writeFileSync(join(dir, 'index.html'), '<script src="/assets/ok.js"></script>');
      const problems = scanBundle(dir);
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.every((p) => p.includes('mal.js'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
