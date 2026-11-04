import { supabase } from '../lib/supabase';
import { isGrantActive } from './academyAccess';

// Administración de generaciones (F1B · B1). Todas las escrituras dependen de
// las políticas *_admin_write de F1A/F1B-A (is_admin()): un alumno no puede
// ejecutarlas aunque llame a estas funciones.

const friendly = (error) => {
  if (!error) return '';
  if (error.code === '23505') return 'Ya existe: esa persona ya tiene acceso vigente o el identificador ya está en uso.';
  if (error.code === '42501') return 'Tu cuenta no tiene permisos de administración para este cambio.';
  return error.message || 'Error inesperado.';
};
const fail = (error) => (error instanceof Error ? error.message : 'Error inesperado');

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const getPrograms = async () => {
  try {
    const { data, error } = await supabase.from('programs').select('id, slug, name, kind').order('name');
    return { programs: data || [], error: friendly(error) };
  } catch (error) { return { programs: [], error: fail(error) }; }
};

export const getCohortsOverview = async () => {
  try {
    const [cohortsRes, grantsRes] = await Promise.all([
      supabase.from('cohorts').select('id, program_id, slug, name, starts_on, created_at').order('starts_on', { ascending: true, nullsFirst: false }),
      supabase.from('access_grants').select('id, cohort_id, kind, starts_at, ends_at, revoked_at').eq('kind', 'cohort'),
    ]);
    const error = cohortsRes.error || grantsRes.error;
    if (error) return { cohorts: [], error: friendly(error) };
    const now = new Date();
    const counts = {};
    (grantsRes.data || []).forEach((grant) => {
      if (isGrantActive(grant, now)) counts[grant.cohort_id] = (counts[grant.cohort_id] || 0) + 1;
    });
    return { cohorts: (cohortsRes.data || []).map((cohort) => ({ ...cohort, activeMembers: counts[cohort.id] || 0 })), error: '' };
  } catch (error) { return { cohorts: [], error: fail(error) }; }
};

export const createCohort = async ({ programId, slug, name, startsOn }) => {
  const cleanSlug = String(slug || '').trim();
  if (!programId || !String(name || '').trim()) return { cohort: null, error: 'Completa el programa y el nombre.' };
  if (!SLUG_PATTERN.test(cleanSlug)) return { cohort: null, error: 'El identificador solo admite minúsculas, números y guiones (p. ej. g3-setter-pro).' };
  try {
    const { data, error } = await supabase.from('cohorts')
      .insert({ program_id: programId, slug: cleanSlug, name: name.trim(), starts_on: startsOn || null })
      .select('id, program_id, slug, name, starts_on, created_at').single();
    return { cohort: data ? { ...data, activeMembers: 0 } : null, error: friendly(error) };
  } catch (error) { return { cohort: null, error: fail(error) }; }
};

// Miembros: accesos de la generación + nombre y correo del perfil.
export const getCohortMembers = async (cohortId) => {
  try {
    const { data: grants, error } = await supabase.from('access_grants')
      .select('id, user_id, starts_at, ends_at, revoked_at, source, created_at')
      .eq('kind', 'cohort').eq('cohort_id', cohortId).order('created_at', { ascending: true });
    if (error) return { members: [], error: friendly(error) };
    const userIds = [...new Set((grants || []).map((grant) => grant.user_id))];
    let profiles = [];
    if (userIds.length) {
      const res = await supabase.from('profiles').select('id, name, email').in('id', userIds);
      if (res.error) return { members: [], error: friendly(res.error) };
      profiles = res.data || [];
    }
    const byId = Object.fromEntries(profiles.map((profile) => [profile.id, profile]));
    const now = new Date();
    return {
      members: (grants || []).map((grant) => ({
        ...grant, name: byId[grant.user_id]?.name || '', email: byId[grant.user_id]?.email || '', active: isGrantActive(grant, now),
      })),
      error: '',
    };
  } catch (error) { return { members: [], error: fail(error) }; }
};

export const grantCohortAccess = async ({ cohortId, email, grantedBy }) => {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail.includes('@')) return { error: 'Escribe un correo válido.' };
  try {
    const { data: profile, error: lookupError } = await supabase.from('profiles').select('id, name, email').ilike('email', cleanEmail.replace(/[\\%_]/g, (c) => `\\${c}`)).maybeSingle();
    if (lookupError) return { error: friendly(lookupError) };
    if (!profile) return { error: 'No hay ninguna cuenta registrada con ese correo.' };
    const { error } = await supabase.from('access_grants')
      .insert({ user_id: profile.id, kind: 'cohort', cohort_id: cohortId, source: 'manual', granted_by: grantedBy || null });
    return { error: friendly(error) };
  } catch (error) { return { error: fail(error) }; }
};

// Revocar conserva la fila (historial); no borra progreso, XP ni certificados.
export const revokeCohortAccess = async (grantId) => {
  try {
    const { error } = await supabase.from('access_grants').update({ revoked_at: new Date().toISOString() }).eq('id', grantId).is('revoked_at', null);
    return { error: friendly(error) };
  } catch (error) { return { error: fail(error) }; }
};

export const getAllLessonCohorts = async () => {
  try {
    const { data, error } = await supabase.from('lesson_cohorts').select('lesson_id, cohort_id');
    return { rows: data || [], error: friendly(error) };
  } catch (error) { return { rows: [], error: fail(error) }; }
};

// Diferencia entre las generaciones actuales de una clase y las elegidas.
export const diffLessonCohorts = (currentIds = [], nextIds = []) => {
  const current = new Set(currentIds);
  const next = new Set(nextIds);
  return { toAdd: [...next].filter((id) => !current.has(id)), toRemove: [...current].filter((id) => !next.has(id)) };
};

export const setLessonCohorts = async ({ lessonId, currentIds, nextIds }) => {
  const { toAdd, toRemove } = diffLessonCohorts(currentIds, nextIds);
  try {
    if (toAdd.length) {
      const { error } = await supabase.from('lesson_cohorts').insert(toAdd.map((cohortId) => ({ lesson_id: lessonId, cohort_id: cohortId })));
      if (error) return { error: friendly(error) };
    }
    if (toRemove.length) {
      const { error } = await supabase.from('lesson_cohorts').delete().eq('lesson_id', lessonId).in('cohort_id', toRemove);
      if (error) return { error: friendly(error) };
    }
    return { error: '' };
  } catch (error) { return { error: fail(error) }; }
};
