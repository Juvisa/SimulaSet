import { describe, expect, it } from 'vitest';
import { credentialVerifyPath, credentialVerifyUrl, getPublicSiteUrl, isCredentialCode, normalizeCredentialCode } from './credentialUrls';

describe('credentialUrls', () => {
  it('normaliza el código (espacios y minúsculas)', () => {
    expect(normalizeCredentialCode('  dsf-1a2b-3c4d-5e6f-7a8b ')).toBe('DSF-1A2B-3C4D-5E6F-7A8B');
    expect(normalizeCredentialCode(null)).toBe('');
  });

  it('reconoce solo códigos con el formato emitido', () => {
    expect(isCredentialCode('DSF-1A2B-3C4D-5E6F-7A8B')).toBe(true);
    expect(isCredentialCode('dsf-1a2b-3c4d-5e6f-7a8b')).toBe(true);
    expect(isCredentialCode('DSF-1A2B-3C4D-5E6F')).toBe(false);
    expect(isCredentialCode('DSF-ZZZZ-3C4D-5E6F-7A8B')).toBe(false);
    expect(isCredentialCode("DSF-' or 1=1")).toBe(false);
  });

  it('usa VITE_PUBLIC_SITE_URL si es https válido; si no, el origen actual', () => {
    const location = { origin: 'https://project-jscj2.vercel.app' };
    expect(getPublicSiteUrl('https://simulaset.digitalset.co/', location)).toBe('https://simulaset.digitalset.co');
    expect(getPublicSiteUrl('', location)).toBe('https://project-jscj2.vercel.app');
    expect(getPublicSiteUrl(undefined, location)).toBe('https://project-jscj2.vercel.app');
    expect(getPublicSiteUrl('http://inseguro.com', location)).toBe('https://project-jscj2.vercel.app');
    expect(getPublicSiteUrl('https://a.com/ruta', location)).toBe('https://project-jscj2.vercel.app');
  });

  it('sin VITE_PUBLIC_SITE_URL configurada, usa el dominio desde el que se abre la app', () => {
    expect(getPublicSiteUrl(undefined, { origin: 'https://digitalset.simulaset.com' })).toBe('https://digitalset.simulaset.com');
    expect(credentialVerifyUrl('DSF-1A2B-3C4D-5E6F-7A8B', getPublicSiteUrl(undefined, { origin: 'https://digitalset.simulaset.com' })))
      .toBe('https://digitalset.simulaset.com/verificar/DSF-1A2B-3C4D-5E6F-7A8B');
  });

  it('arma la ruta y la URL de verificación', () => {
    expect(credentialVerifyPath('dsf-1a2b-3c4d-5e6f-7a8b')).toBe('/verificar/DSF-1A2B-3C4D-5E6F-7A8B');
    expect(credentialVerifyUrl('DSF-1A2B-3C4D-5E6F-7A8B', 'https://x.app')).toBe('https://x.app/verificar/DSF-1A2B-3C4D-5E6F-7A8B');
  });
});
