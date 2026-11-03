import { Link } from 'react-router-dom';
import { Loader2, Lock, RefreshCw } from 'lucide-react';
import Layout from './Layout';
import { SUPPORT_CONTACT } from '../data/support';

// Pantallas de acceso a la formación: cargando, error (con reintento) y
// «formación no habilitada». Un error de red NUNCA se presenta como falta de acceso.

export const AccessLoading = () => (
  <Layout>
    <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-text-secondary">
      <Loader2 size={18} className="animate-spin" /> Verificando tu acceso...
    </div>
  </Layout>
);

export const AccessError = ({ error, onRetry }) => (
  <Layout>
    <div className="mx-auto max-w-xl rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
      <h1 className="text-lg font-black text-text-primary">No pudimos verificar tu acceso</h1>
      <p className="mt-2 text-sm text-text-secondary">Revisa tu conexión e inténtalo de nuevo.{error ? ` (${error})` : ''}</p>
      <button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent-coral px-4 py-2 text-sm font-black text-white">
        <RefreshCw size={15} /> Reintentar
      </button>
    </div>
  </Layout>
);

const COPY = {
  formacion: {
    title: 'Tu formación no está habilitada',
    body: 'Tu cuenta está activa, pero todavía no tiene acceso a las clases ni a la comunidad de Digital SET.',
  },
  comunidad: {
    title: 'La comunidad no está incluida en tu acceso',
    body: 'Tu acceso incluye las grabaciones de la formación, pero no la comunidad de una generación.',
  },
};

export const TrainingNotEnabled = ({ variant = 'formacion' }) => {
  const copy = COPY[variant] || COPY.formacion;
  return (
    <Layout>
      <div className="mx-auto max-w-xl rounded-2xl border border-border-subtle bg-bg-card p-6 text-center sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-bg-input text-accent-coral"><Lock size={22} /></div>
        <h1 className="mt-4 text-xl font-black text-text-primary">{copy.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">{copy.body} Si crees que es un error, escríbenos y lo revisamos.</p>
        {SUPPORT_CONTACT.href ? (
          <a href={SUPPORT_CONTACT.href} target="_blank" rel="noreferrer" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-accent-coral px-5 py-2 text-sm font-black text-white">
            {SUPPORT_CONTACT.label || 'Contactar a soporte'}
          </a>
        ) : (
          <p className="mt-5 text-sm font-semibold text-text-primary">Escríbele al equipo de Digital SET por el canal de soporte que te compartieron al inscribirte.</p>
        )}
        <div className="mt-5">
          <Link to="/dashboard" className="text-sm font-semibold text-accent-coral hover:underline">Volver al inicio</Link>
        </div>
      </div>
    </Layout>
  );
};

// Pestañas de generación/colección: solo aparecen con más de un ámbito, así
// quien pertenece a una sola generación ve la pantalla igual que antes.
export const ScopeSwitcher = ({ scopes, activeScope, onSelect }) => {
  if (!scopes || scopes.length < 2) return null;
  return (
    <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Generación">
      {scopes.map((scope) => {
        const active = activeScope?.key === scope.key;
        return (
          <button
            key={scope.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(scope.key)}
            className={`rounded-xl border px-3 py-2 text-xs font-black transition-colors ${active ? 'border-accent-coral bg-accent-coral/10 text-accent-coral' : 'border-border-subtle bg-bg-input/60 text-text-secondary hover:text-text-primary'}`}
          >
            {scope.name}{scope.type === 'collection' ? ' · Grabaciones' : ''}
          </button>
        );
      })}
    </div>
  );
};
