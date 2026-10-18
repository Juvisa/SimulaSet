// Direcciones públicas de verificación de credenciales.
//
// Hoy se usa el dominio desde el que se abre la app (project-jscj2.vercel.app).
// Para pasar a un dominio propio basta con definir VITE_PUBLIC_SITE_URL
// (por ejemplo https://simulaset.digitalset.co) en Vercel: los enlaces nuevos
// lo usarán y las rutas /verificar/:codigo funcionan en cualquier dominio.

export const CREDENTIAL_CODE_PATTERN = /^DSF-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;

export const normalizeCredentialCode = (raw) => String(raw ?? '').trim().toUpperCase();

export const isCredentialCode = (raw) => CREDENTIAL_CODE_PATTERN.test(normalizeCredentialCode(raw));

export const getPublicSiteUrl = (env = import.meta.env, location = typeof window !== 'undefined' ? window.location : null) => {
  const configured = String(env?.VITE_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
  if (/^https:\/\/[^\s/]+$/i.test(configured)) return configured;
  return location?.origin || '';
};

export const credentialVerifyPath = (code) => `/verificar/${encodeURIComponent(normalizeCredentialCode(code))}`;

export const credentialVerifyUrl = (code, base = getPublicSiteUrl()) => `${base}${credentialVerifyPath(code)}`;
