-- PRE · solo lectura. Ejecutar ANTES de 02_apply.sql y guardar el resultado.
-- Seguir solo si estado_auditado es true (las políticas son exactamente las
-- de la auditoría del 2026-11-01). huella_datos se compara con 03_post.sql.
with
pol as (
  select tablename, policyname, cmd
  from pg_policies
  where schemaname = 'public' and tablename in ('projects', 'project_setters')
),
esperado(tablename, policyname, cmd) as (
  values ('projects', 'projects_delete_assigned_or_admin', 'DELETE'),
         ('projects', 'projects_insert_authenticated', 'INSERT'),
         ('projects', 'projects_select_authenticated', 'SELECT'),
         ('projects', 'projects_update_authenticated', 'UPDATE'),
         ('project_setters', 'project_setters_delete_admin', 'DELETE'),
         ('project_setters', 'project_setters_insert_admin', 'INSERT'),
         ('project_setters', 'project_setters_policy', 'ALL'),
         ('project_setters', 'project_setters_select_own_or_admin', 'SELECT'),
         ('project_setters', 'project_setters_update_admin', 'UPDATE')
)
select json_build_object(
  'estado_auditado', not exists (select * from pol except select * from esperado)
                     and not exists (select * from esperado except select * from pol),
  'politicas', (select json_agg(json_build_object('tabla', tablename, 'nombre', policyname, 'comando', cmd) order by tablename, policyname) from pol),
  'rls', (select json_object_agg(relname, relrowsecurity) from pg_class where oid in ('public.projects'::regclass, 'public.project_setters'::regclass)),
  'proyectos', (select count(*) from public.projects),
  'asignaciones', (select count(*) from public.project_setters),
  -- Impacto (solo números). Setters asignadas que NO son propietarias: dejarán
  -- de poder editar y eliminar; con el frontend actual verían los botones y
  -- recibirían «No tienes permiso».
  'impacto_setters_no_propietarias', (select count(*) from public.project_setters ps join public.projects p on p.id = ps.project_id
                                      where ps.active and ps.user_id <> p.created_by),
  -- Asignaciones inactivas: hoy leen el proyecto por el «OR true»; dejarán de verlo.
  'impacto_asignaciones_inactivas', (select count(*) from public.project_setters where not active),
  -- Leads y sesiones de simulación cuyo proyecto su dueño dejará de ver (el
  -- informe y la conversación siguen funcionando, sin el contexto del proyecto).
  'impacto_leads_sin_acceso_al_proyecto', (select count(*) from public.real_leads l join public.projects p on p.id = l.project_id
                                           where p.created_by <> l.setter_id
                                             and not exists (select 1 from public.project_setters ps
                                                             where ps.project_id = p.id and ps.user_id = l.setter_id and ps.active)
                                             and not exists (select 1 from public.profiles a where a.id = l.setter_id and a.role = 'admin' and a.active)),
  'impacto_sesiones_sin_acceso_al_proyecto', (select count(*) from public.simulator_sessions s join public.projects p on p.id::text = s.project_id
                                              where p.created_by <> s.user_id
                                                and not exists (select 1 from public.project_setters ps
                                                                where ps.project_id = p.id and ps.user_id = s.user_id and ps.active)
                                                and not exists (select 1 from public.profiles a where a.id = s.user_id and a.role = 'admin' and a.active)),
  'huella_datos', md5(
    (select coalesce(string_agg(to_jsonb(p)::text, '|' order by p.id), '') from public.projects p) || '#' ||
    (select coalesce(string_agg(to_jsonb(s)::text, '|' order by s.project_id, s.user_id), '') from public.project_setters s))
) as pre;
