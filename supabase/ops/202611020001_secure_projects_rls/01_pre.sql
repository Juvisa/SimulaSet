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
  'huella_datos', md5(
    (select coalesce(string_agg(to_jsonb(p)::text, '|' order by p.id), '') from public.projects p) || '#' ||
    (select coalesce(string_agg(to_jsonb(s)::text, '|' order by s.project_id, s.user_id), '') from public.project_setters s))
) as pre;
