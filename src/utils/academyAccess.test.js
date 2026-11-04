import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: null, supabaseConfigured: false }));
const { ACCESS_STATE, filterLessonsForScope, isGrantActive, pickActiveScope, resolveAcademyAccess } = await import('./academyAccess');
const { groupAcademyLessons, weekLabel } = await import('./academyLayout');
const { buildChildFilter, buildFeedFilter } = await import('./communityPosts');
const { buildLessonCommentPayload } = await import('./lessonComments');
const { diffLessonCohorts } = await import('./adminCohorts');

const NOW = new Date('2026-11-03T12:00:00Z');
const G1 = { id: '11111111-1111-4111-8111-111111111111', slug: 'g1-founders', name: 'G1 Founders', starts_on: '2026-09-01' };
const G2 = { id: '22222222-2222-4222-8222-222222222222', slug: 'g2-setter-pro', name: 'G2 Setter Pro', starts_on: '2026-10-20' };
const PRO = { id: '33333333-3333-4333-8333-333333333333', slug: 'digital-set-pro', name: 'Digital SET Pro' };
const ME = '44444444-4444-4444-8444-444444444444';
const grant = (extra) => ({ kind: 'cohort', starts_at: '2026-09-01T00:00:00Z', ends_at: null, revoked_at: null, ...extra });

// Catálogo como en producción: 4 semanas (G1) + 2 del Módulo 0 + GoHighLevel
// (G1 y G2 tras la asignación de B0) + 1 clase propia de G2 + 1 sin asignar.
const L = (id, module_id, lesson_id, position = 1) => ({ id, course_id: 'set-academy', module_id, lesson_id, title: lesson_id, position });
const lessons = [
  L('w1', 'week-01', 'set-method-foundations'), L('w2', 'week-02', 'conversations-that-book-and-sell'),
  L('w3', 'week-03', 'objections-and-follow-up'), L('w4', 'week-04', 'opportunities-and-interviews'),
  L('m2', 'digital-set-start', 'digital-sales-work', 2), L('m1', 'digital-set-start', 'digital-ecosystem', 1),
  L('ghl', 'practical-labs', 'ghl-foundations'), L('g2a', 'g2-week-01', 'g2-kickoff'), L('loose', 'week-05', 'draft'),
];
const lessonCohorts = [
  ...['w1', 'w2', 'w3', 'w4', 'm1', 'm2', 'ghl'].map((lesson_id) => ({ lesson_id, cohort_id: G1.id })),
  ...['m1', 'm2', 'ghl', 'g2a'].map((lesson_id) => ({ lesson_id, cohort_id: G2.id })),
];
const collectionLessons = [
  { collection_id: PRO.id, lesson_id: 'g2a', release_at: null },
  { collection_id: PRO.id, lesson_id: 'm1', release_at: '2026-12-01T00:00:00Z' },
];
const access = (role, grants) => resolveAcademyAccess({ role, grants, cohorts: [G2, G1], collections: [PRO], now: NOW });
const visible = (acc, stored) => filterLessonsForScope({ lessons, scope: pickActiveScope(acc.scopes, stored), lessonCohorts, collectionLessons, now: NOW }).map((l) => l.id).sort();

describe('vigencia de un acceso (misma regla que la base de datos)', () => {
  it('vigente, revocado, vencido y futuro', () => {
    expect(isGrantActive(grant({}), NOW)).toBe(true);
    expect(isGrantActive(grant({ revoked_at: '2026-10-01T00:00:00Z' }), NOW)).toBe(false);
    expect(isGrantActive(grant({ ends_at: '2026-11-01T00:00:00Z' }), NOW)).toBe(false);
    expect(isGrantActive(grant({ starts_at: '2026-12-01T00:00:00Z' }), NOW)).toBe(false);
  });
});

describe('perfiles de acceso', () => {
  it('G1: solo G1, sin pestañas, ve semanas + introductorias, no la clase de G2 ni la sin asignar', () => {
    const acc = access('setter', [grant({ cohort_id: G1.id })]);
    expect(acc.state).toBe(ACCESS_STATE.COHORT);
    expect(acc.scopes.map((s) => s.slug)).toEqual(['g1-founders']);
    expect(visible(acc)).toEqual(['ghl', 'm1', 'm2', 'w1', 'w2', 'w3', 'w4']);
  });
  it('G2: ve introductorias y sus clases; NO las semanas exclusivas de G1', () => {
    const acc = access('setter', [grant({ cohort_id: G2.id })]);
    expect(visible(acc)).toEqual(['g2a', 'ghl', 'm1', 'm2']);
  });
  it('G1 + G2: por defecto la generación más reciente; puede cambiar a G1', () => {
    const acc = access('setter', [grant({ cohort_id: G1.id }), grant({ cohort_id: G2.id })]);
    expect(acc.scopes.map((s) => s.slug)).toEqual(['g1-founders', 'g2-setter-pro']);
    expect(pickActiveScope(acc.scopes).slug).toBe('g2-setter-pro');
    expect(visible(acc, `cohort:${G1.id}`)).toContain('w1');
  });
  it('una elección guardada que ya no es válida se ignora', () => {
    const acc = access('setter', [grant({ cohort_id: G1.id })]);
    expect(pickActiveScope(acc.scopes, `cohort:${G2.id}`).slug).toBe('g1-founders');
  });
  it('sin acceso: estado none, ninguna clase (pantalla «formación no habilitada»)', () => {
    const acc = access('setter', []);
    expect(acc.state).toBe(ACCESS_STATE.NONE);
    expect(pickActiveScope(acc.scopes)).toBeNull();
    expect(visible(acc)).toEqual([]);
  });
  it('acceso G1 revocado o vencido = sin acceso; el progreso histórico no concede nada', () => {
    expect(access('setter', [grant({ cohort_id: G1.id, revoked_at: '2026-10-30T00:00:00Z' })]).state).toBe(ACCESS_STATE.NONE);
    expect(access('setter', [grant({ cohort_id: G1.id, ends_at: '2026-11-01T00:00:00Z' })]).state).toBe(ACCESS_STATE.NONE);
  });
  it('solo colección (downsell, preparado): grabaciones liberadas, sin comunidad', () => {
    const acc = access('setter', [grant({ kind: 'collection', cohort_id: null, collection_id: PRO.id })]);
    expect(acc.state).toBe(ACCESS_STATE.COLLECTION);
    expect(pickActiveScope(acc.scopes).type).toBe('collection');
    expect(visible(acc)).toEqual(['g2a']); // m1 aún no liberada
  });
  it('administración: todas las generaciones como ámbitos', () => {
    const acc = access('admin', []);
    expect(acc.state).toBe(ACCESS_STATE.ADMIN);
    expect(acc.scopes.map((s) => s.slug)).toEqual(['g1-founders', 'g2-setter-pro']);
  });
});

describe('diseño de la Academia sin catálogo fijo', () => {
  it('G1 conserva su estructura: Módulo 0 ordenado, Semanas 1–4, Labs', () => {
    const acc = access('setter', [grant({ cohort_id: G1.id })]);
    const shown = filterLessonsForScope({ lessons, scope: pickActiveScope(acc.scopes), lessonCohorts, collectionLessons, now: NOW });
    const g = groupAcademyLessons(shown);
    expect(g.startLessons.map((l) => l.id)).toEqual(['digital-ecosystem', 'digital-sales-work']);
    expect(g.startLessons[0].lesson_uuid).toBe('m1');
    expect(g.weekGroups.map((w) => w.week)).toEqual(['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4']);
    expect(g.labLessons.map((l) => l.id)).toEqual(['ghl-foundations']);
    expect(g.additionalModuleGroups).toEqual([]);
  });
  it('G2 no recibe ningún título ni fecha de G1 de respaldo', () => {
    const g = groupAcademyLessons(filterLessonsForScope({ lessons, scope: { type: 'cohort', id: G2.id }, lessonCohorts }));
    expect(g.weekGroups).toEqual([]);
    expect(g.additionalModuleGroups.map((m) => m.moduleId)).toEqual(['g2-week-01']);
  });
  it('sin clases visibles: todo vacío (no hay respaldo)', () => {
    expect(groupAcademyLessons([])).toEqual({ startLessons: [], weekGroups: [], labLessons: [], additionalModuleGroups: [] });
    expect(weekLabel('week-04')).toBe('Semana 4');
  });
});

describe('G3 y generaciones futuras sin cambiar código', () => {
  const G3 = { id: '55555555-5555-4555-8555-555555555555', slug: 'g3-setter-pro', name: 'G3 Setter Pro', starts_on: null };
  const g3Lessons = [L('g3w1', 'week-01', 'g3-intro'), L('g3w6', 'week-06', 'g3-cierre'), L('g3w2', 'week-02', 'g3-objeciones')];
  const g3Cohorts = [...lessonCohorts, ...['m1', 'm2', 'ghl', 'g3w1', 'g3w6', 'g3w2'].map((lesson_id) => ({ lesson_id, cohort_id: G3.id }))];
  const acc3 = (grants) => resolveAcademyAccess({ role: 'setter', grants, cohorts: [G1, G2, G3], collections: [PRO], now: NOW });
  it('alumno de G3: compartidas + exclusivas de G3, nada de G1 ni de G2', () => {
    const acc = acc3([grant({ cohort_id: G3.id })]);
    const ids = filterLessonsForScope({ lessons: [...lessons, ...g3Lessons], scope: pickActiveScope(acc.scopes), lessonCohorts: g3Cohorts, now: NOW }).map((l) => l.id).sort();
    expect(ids).toEqual(['g3w1', 'g3w2', 'g3w6', 'ghl', 'm1', 'm2']);
  });
  it('G3 con 6 semanas: «Semana 1, 2, 6» en orden numérico, en el mismo diseño que G1', () => {
    const g = groupAcademyLessons(g3Lessons);
    expect(g.weekGroups.map((w) => w.week)).toEqual(['Semana 1', 'Semana 2', 'Semana 6']);
    expect(g.additionalModuleGroups).toEqual([]);
  });
  it('G2 + G3 (G3 aún sin fecha de inicio): por defecto la más reciente, G3', () => {
    const acc = acc3([grant({ cohort_id: G2.id }), grant({ cohort_id: G3.id })]);
    expect(acc.scopes.map((s) => s.slug)).toEqual(['g2-setter-pro', 'g3-setter-pro']);
    expect(pickActiveScope(acc.scopes).slug).toBe('g3-setter-pro');
  });
});

describe('comunidad y comentarios por generación', () => {
  it('filtro del muro: la generación, anuncios para todas y lo propio sin asignar', () => {
    expect(buildFeedFilter({ cohortId: G1.id, userId: ME }))
      .toBe(`audience.eq.all_cohorts,cohort_id.eq.${G1.id},and(user_id.eq.${ME},audience.eq.unassigned)`);
    expect(buildChildFilter({ cohortId: G2.id })).toBe(`cohort_id.eq.${G2.id},cohort_id.is.null`);
  });
  it('rechaza identificadores que no son UUID (no se inyectan en el filtro)', () => {
    expect(() => buildFeedFilter({ cohortId: 'x),or(true', userId: ME })).toThrow();
  });
  it('un comentario de clase lleva la clase (UUID) y la generación activa', () => {
    expect(buildLessonCommentPayload({ lessonId: 'digital-ecosystem', lessonRef: 'm1', cohortId: G2.id, userId: ME, userName: 'A', userRole: 'setter', content: '  hola ', parentId: null }))
      .toMatchObject({ lesson_id: 'digital-ecosystem', lesson_ref: 'm1', cohort_id: G2.id, content: 'hola', parent_id: null });
  });
});

describe('asignación clase ↔ generación (administración)', () => {
  it('solo escribe las diferencias', () => {
    expect(diffLessonCohorts([G1.id], [G1.id, G2.id])).toEqual({ toAdd: [G2.id], toRemove: [] });
    expect(diffLessonCohorts([G1.id, G2.id], [G2.id])).toEqual({ toAdd: [], toRemove: [G1.id] });
    expect(diffLessonCohorts([G1.id], [G1.id])).toEqual({ toAdd: [], toRemove: [] });
  });
});
