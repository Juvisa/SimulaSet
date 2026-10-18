// Direcciones públicas de verificación de credenciales.
//
// Hoy se usa el dominio desde el que se abre la app (project-jscj2.vercel.app).
// Para pasar a un dominio propio basta con definir VITE_PUBLIC_SITE_URL
// (por ejemplo https://simulaset.digitalset.co) en Vercel: los enlaces nuevos
// lo usarán y las rutas /verificar/:codigo funcionan en cualquier dominio.

export const CREDENTIAL_CODE_PATTERN = /^DSF-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;

export const normalizeCredentialCode = (raw) => String(raw ?? '').trim().toUpperCase();

export const isCredentialCode = (raw) => CREDENTIAL_CODE_PATTERN.test(normalizeCredentialCode(raw));

// Se lee SOLO esta variable, de forma estática. Nunca usar import.meta.env como
// objeto completo: Vite incrustaría en el JavaScript público todas las
// variables VITE_ (incluidas las de la plataforma Vercel y cualquier otra que
// se configure). Lo vigila scripts/check-bundle-env.mjs.
const CONFIGURED_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL;

export const getPublicSiteUrl = (configured = CONFIGURED_SITE_URL, location = typeof window !== 'undefined' ? window.location : null) => {
  const base = String(configured || '').trim().replace(/\/+$/, '');
  if (/^https:\/\/[^\s/]+$/i.test(base)) return base;
  return location?.origin || '';
};

export const credentialVerifyPath = (code) => `/verificar/${encodeURIComponent(normalizeCredentialCode(code))}`;

export const credentialVerifyUrl = (code, base = getPublicSiteUrl()) => `${base}${credentialVerifyPath(code)}`;
