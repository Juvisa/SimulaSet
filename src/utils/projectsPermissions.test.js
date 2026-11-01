import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: null, supabaseConfigured: false }));
const { canManageProject } = await import('./projects');

describe('canManageProject: quién ve «Editar» y «Eliminar» en Mis Proyectos', () => {
  const project = { id: 'p1', userId: 'duena' };
  it('la propietaria', () => expect(canManageProject(project, { id: 'duena', role: 'setter' })).toBe(true));
  it('un admin', () => expect(canManageProject(project, { id: 'admin', role: 'admin' })).toBe(true));
  it('NO una setter asignada (lo ve en su lista, pero no lo administra)', () => expect(canManageProject(project, { id: 'setter', role: 'setter' })).toBe(false));
  it('NO sin sesión ni sin proyecto', () => {
    expect(canManageProject(project, null)).toBe(false);
    expect(canManageProject(null, { id: 'duena', role: 'setter' })).toBe(false);
  });
});
