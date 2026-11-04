import { supabase } from '../lib/supabase';

// Acceso a la formación (F1B · B1). El frontend solo DECIDE QUÉ MOSTRAR: la
// protección real la dan las políticas de la base de datos (F1B-A y B2).
// Lee únicamente lo que las políticas ya permiten a cada usuario: sus propios
// accesos, las generaciones a las que pertenece y las asignaciones de clases de
// esas generaciones. Funciona igual con las políticas actuales y con las de B2.

export const ACCESS_STATE = {
  LOADING: 'loading',
  ERROR: 'error',
  ADMIN: 'admin',
  COHORT: 'cohort',
  COLLECTION: 'collection',
  NONE: 'none',
};

// Vigente = no revocado, ya empezó y no ha vencido (misma regla que
// has_cohort_access / has_collection_access en la base de datos).
export const isGrantActive = (grant, now = new Date()) => Boolean(grant)
  && !grant.revoked_at
  && (!grant.starts_at || new Date(grant.starts_at) <= now)
  && (!grant.ends_at || new Date(grant.ends_at) > now);

// Sin fecha de inicio = generación nueva: va al final (es la más reciente).
const byStartThenName = (a, b) => (
  String(a.starts_on || '9999-12-31').localeCompare(String(b.starts_on || '9999-12-31'))
  || String(a.name || '').localeCompare(String(b.name || ''), 'es')
);

// Un «ámbito» es lo que el alumno está viendo: una generación (clases +
// comunidad) o una colección (solo grabaciones, sin comunidad).
const cohortScope = (cohort) => ({ key: `cohort:${cohort.id}`, type: 'cohort', id: cohort.id, name: cohort.name, slug: cohort.slug });
const collectionScope = (collection) => ({ key: `collection:${collection.id}`, type: 'collection', id: collection.id, name: collection.name, slug: collection.slug });

export const resolveAcademyAccess = ({ role, grants = [], cohorts = [], collections = [], now = new Date() }) => {
  const sortedCohorts = [...(cohorts || [])].sort(byStartThenName);
  if (role === 'admin') {
    return { state: ACCESS_STATE.ADMIN, cohorts: sortedCohorts, collections: collections || [], scopes: sortedCohorts.map(cohortScope) };
  }
  const active = (grants || []).filter((grant) => isGrantActive(grant, now));
  const cohortIds = new Set(active.filter((g) => g.kind === 'cohort' && g.cohort_id).map((g) => g.cohort_id));
  const collectionIds = new Set(active.filter((g) => g.kind === 'collection' && g.collection_id).map((g) => g.collection_id));
  const myCohorts = sortedCohorts.filter((cohort) => cohortIds.has(cohort.id));
  const myCollections = (collections || []).filter((collection) => collectionIds.has(collection.id))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
  let state = ACCESS_STATE.NONE;
  if (myCohorts.length > 0) state = ACCESS_STATE.COHORT;
  else if (myCollections.length > 0) state = ACCESS_STATE.COLLECTION;
  return {
    state,
    cohorts: myCohorts,
    collections: myCollections,
    scopes: [...myCohorts.map(cohortScope), ...myCollections.map(collectionScope)],
  };
};

// Ámbito activo: el último elegido si sigue siendo válido; si no, la
// generación más reciente; si no hay generaciones, la primera colección.
export const pickActiveScope = (scopes = [], storedKey = null) => {
  if (!scopes.length) return null;
  const stored = storedKey && scopes.find((scope) => scope.key === storedKey);
  if (stored) return stored;
  const cohortScopes = scopes.filter((scope) => scope.type === 'cohort');
  if (cohortScopes.length) return cohortScopes[cohortScopes.length - 1];
  return scopes[0];
};

const message = (error) => (error instanceof Error ? error.message : (error?.message || 'Error inesperado'));

export const fetchAcademyAccess = async ({ userId, role }) => {
  try {
    const [grantsRes, cohortsRes, collectionsRes] = await Promise.all([
      supabase.from('access_grants').select('id, kind, cohort_id, collection_id, starts_at, ends_at, revoked_at').eq('user_id', userId),
      supabase.from('cohorts').select('id, slug, name, starts_on'),
      supabase.from('collections').select('id, slug, name'),
    ]);
    const failed = grantsRes.error || cohortsRes.error || collectionsRes.error;
    // Un error de red o de permisos NO es «sin acceso»: se muestra como error
    // con opción de reintentar, nunca como «formación no habilitada».
    if (failed) return { state: ACCESS_STATE.ERROR, cohorts: [], collections: [], scopes: [], error: message(failed) };
    return { ...resolveAcademyAccess({ role, grants: grantsRes.data, cohorts: cohortsRes.data, collections: collectionsRes.data }), error: '' };
  } catch (error) {
    return { state: ACCESS_STATE.ERROR, cohorts: [], collections: [], scopes: [], error: message(error) };
  }
};

// Asignaciones de clases. Con las políticas de F1B-A cada usuario solo recibe
// las filas de SUS generaciones y colecciones (la administración, todas).
export const fetchLessonScopes = async () => {
  try {
    const [cohortRes, collectionRes] = await Promise.all([
      supabase.from('lesson_cohorts').select('lesson_id, cohort_id'),
      supabase.from('collection_lessons').select('collection_id, lesson_id, position, release_at'),
    ]);
    const failed = cohortRes.error || collectionRes.error;
    if (failed) return { lessonCohorts: [], collectionLessons: [], error: message(failed) };
    return { lessonCohorts: cohortRes.data || [], collectionLessons: collectionRes.data || [], error: '' };
  } catch (error) {
    return { lessonCohorts: [], collectionLessons: [], error: message(error) };
  }
};

// Clases visibles en el ámbito activo. `lesson.id` es el UUID de academy_lessons.
// Una clase sin asignar no se muestra a ningún alumno (igual que can_view_lesson).
export const filterLessonsForScope = ({ lessons = [], scope, lessonCohorts = [], collectionLessons = [], now = new Date() }) => {
  if (!scope) return [];
  if (scope.type === 'cohort') {
    const ids = new Set(lessonCohorts.filter((row) => row.cohort_id === scope.id).map((row) => row.lesson_id));
    return lessons.filter((lesson) => ids.has(lesson.id));
  }
  if (scope.type === 'collection') {
    const rows = collectionLessons.filter((row) => row.collection_id === scope.id
      && (!row.release_at || new Date(row.release_at) <= now));
    const ids = new Set(rows.map((row) => row.lesson_id));
    return lessons.filter((lesson) => ids.has(lesson.id));
  }
  return [];
};
