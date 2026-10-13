import { ShieldCheck, Dumbbell, PenLine } from 'lucide-react';

// Mismas clases de formulario que Profile.jsx (identidad visual Digital SET).
export const INPUT = 'w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder-text-secondary text-sm focus:border-accent-coral transition-colors outline-none';
export const LABEL = 'block text-sm font-medium text-text-secondary mb-1.5';

// Las tres capas de información del Passport, siempre rotuladas.
export const LAYERS = {
  declared: { label: 'Declarado por ti', color: '#2563EB', icon: PenLine },
  registered: { label: 'Registrado en SimulaSET', color: '#C9920A', icon: Dumbbell },
  verified: { label: 'Verificado por Digital SET', color: '#1D9E75', icon: ShieldCheck },
};
