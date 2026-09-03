import { supabase } from '../lib/supabase';
import {
  deleteProject as deleteLocalProject,
  getProjects as getLocalProjects,
  saveProject as saveLocalProject,
} from './storage';

const PROJECT_FIELDS = 'id, created_by, name, expert_name, niche, promise, price, avatar_business, avatar_current_situation, avatar_pain, avatar_desire, avatar_description, common_objections, testimonials, resources, recursos, created_at, updated_at';

const emptyRecursos = () => ({
  guias_pdfs: [],
  videos_testimonios: [],
  vsl_presentacion: { nombre: '', link: '', activo: false },
  scripts_apertura: { outbound: '', inbound: '', reactivacion: '' },
});

const fromDatabase = (row) => ({
  id: row.id,
  userId: row.created_by,
  setter_id: row.created_by,
  name: row.name,
  expertName: row.expert_name || '',
  niche: row.niche || '',
  promise: row.promise || '',
  price: row.price || '',
  avatarBusiness: row.avatar_business || '',
  avatarCurrentSituation: row.avatar_current_situation || '',
  avatarPain: row.avatar_pain || '',
  avatarDesire: row.avatar_desire || '',
  avatarDescription: row.avatar_description || '',
  commonObjections: row.common_objections || '',
  testimonials: Array.isArray(row.testimonials) ? row.testimonials : [],
  resources: Array.isArray(row.resources) ? row.resources : [],
  recursos: row.recursos && typeof row.recursos === 'object' && !Array.isArray(row.recursos)
    ? row.recursos
    : emptyRecursos(),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toDatabase = (project, { includeId = false, createdBy } = {}) => {
  const payload = {
    name: project.name?.trim(),
    expert_name: project.expertName?.trim() || null,
    niche: project.niche?.trim() || null,
    promise: project.promise?.trim() || null,
    price: project.price?.trim() || null,
    avatar_business: project.avatarBusiness?.trim() || null,
    avatar_current_situation: project.avatarCurrentSituation?.trim() || null,
    avatar_pain: project.avatarPain?.trim() || null,
    avatar_desire: project.avatarDesire?.trim() || null,
    avatar_description: project.avatarDescription?.trim() || null,
    common_objections: project.commonObjections?.trim() || null,
    testimonials: Array.isArray(project.testimonials) ? project.testimonials : [],
    resources: Array.isArray(project.resources) ? project.resources : [],
    recursos: project.recursos && typeof project.recursos === 'object' && !Array.isArray(project.recursos)
      ? project.recursos
      : emptyRecursos(),
  };

  if (includeId) payload.id = project.id;
  if (createdBy) payload.created_by = createdBy;
  if (includeId && project.createdAt) payload.created_at = project.createdAt;
  if (includeId && project.updatedAt) payload.updated_at = project.updatedAt;
  return payload;
};

const formatError = (error) => error?.message || 'Error inesperado al consultar proyectos.';

export const migrateLocalProjects = async (userId) => {
  const localProjects = getLocalProjects(userId);
  if (!supabase || localProjects.length === 0) return { migrated: 0, errors: [] };

  const ids = [...new Set(localProjects.map(project => project.id).filter(Boolean))];
  const { data: existingRows, error: lookupError } = await supabase
    .from('projects')
    .select('id')
    .in('id', ids);

  if (lookupError) return { migrated: 0, errors: [formatError(lookupError)] };

  const existingIds = new Set((existingRows || []).map(row => row.id));
  let migrated = 0;
  const errors = [];

  for (const project of localProjects) {
    if (!project.id || existingIds.has(project.id)) continue;
    const { error } = await supabase
      .from('projects')
      .insert(toDatabase(project, { includeId: true, createdBy: userId }));

    if (error) {
      const uuidConflict = error.code === '23505';
      errors.push(uuidConflict
        ? `El UUID ${project.id} ya pertenece a otro proyecto y no fue sobrescrito.`
        : `No se pudo migrar “${project.name || project.id}”: ${formatError(error)}`);
      continue;
    }
    existingIds.add(project.id);
    migrated += 1;
  }

  return { migrated, errors };
};

export const getProjects = async (userId) => {
  const migration = await migrateLocalProjects(userId);
  if (!supabase) return { projects: getLocalProjects(userId), error: 'Supabase no está configurado.', migrationErrors: migration.errors };

  const { data, error } = await supabase
    .from('projects')
    .select(`${PROJECT_FIELDS}, project_setters!inner(user_id, active)`)
    .eq('project_setters.user_id', userId)
    .eq('project_setters.active', true)
    .order('updated_at', { ascending: false });

  if (error) {
    return { projects: getLocalProjects(userId), error: formatError(error), migrationErrors: migration.errors };
  }
  return { projects: (data || []).map(fromDatabase), error: null, migrationErrors: migration.errors };
};

export const getProjectById = async (id) => {
  if (!supabase) return { project: null, error: 'Supabase no está configurado.' };
  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_FIELDS)
    .eq('id', id)
    .maybeSingle();
  return { project: data ? fromDatabase(data) : null, error: error ? formatError(error) : null };
};

export const createProject = async (project, userId) => {
  if (!supabase) return { project: null, error: 'Supabase no está configurado.' };
  const { data, error } = await supabase
    .from('projects')
    .insert(toDatabase(project, { includeId: true, createdBy: userId }))
    .select(PROJECT_FIELDS)
    .single();

  if (error) {
    return {
      project: null,
      error: error.code === '23505'
        ? `El UUID ${project.id} ya pertenece a otro proyecto y no fue sobrescrito.`
        : formatError(error),
    };
  }
  const savedProject = fromDatabase(data);
  saveLocalProject(savedProject);
  return { project: savedProject, error: null };
};

export const updateProject = async (id, project) => {
  if (!supabase) return { project: null, error: 'Supabase no está configurado.' };
  const { data, error } = await supabase
    .from('projects')
    .update(toDatabase(project))
    .eq('id', id)
    .select(PROJECT_FIELDS)
    .single();

  if (error) return { project: null, error: formatError(error) };
  const savedProject = fromDatabase(data);
  saveLocalProject(savedProject);
  return { project: savedProject, error: null };
};

export const deleteProject = async (id) => {
  if (!supabase) return { deletedId: null, error: 'Supabase no está configurado.' };
  const { data, error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) return { deletedId: null, error: formatError(error) };
  if (!data) return { deletedId: null, error: 'No tienes permiso para eliminar este proyecto.' };
  deleteLocalProject(id);
  return { deletedId: data.id, error: null };
};
