-- POST · solo lectura. Justo después de 02_apply.sql.
-- todo_ok debe ser true y huella_datos igual a la de 01_pre.sql.
with
pol as (
  select tablename, policyname, cmd, qual, with_check
  from pg_policies
  where schemaname = 'public' and tablename in ('projects', 'project_setters')
),
esperado(tablename, policyname, cmd) as (
  values ('projects', 'projects_delete_owner_or_admin', 'DELETE'),
         ('projects', 'projects_insert_owner_or_admin', 'INSERT'),
         ('projects', 'projects_select_owner_assigned_or_admin', 'SELECT'),
         ('projects', 'projects_update_owner_or_admin', 'UPDATE'),
         ('project_setters', 'project_setters_delete_admin', 'DELETE'),
         ('project_setters', 'project_setters_insert_admin', 'INSERT'),
         ('project_setters', 'project_setters_select_own_or_admin', 'SELECT'),
         ('project_setters', 'project_setters_update_admin', 'UPDATE')
),
c as (
  select
    not exists (select tablename, policyname, cmd from pol except select * from esperado)
      and not exists (select * from esperado except select tablename, policyname, cmd from pol) as politicas_ok,
    not exists (select 1 from pol where coalesce(btrim(qual), '') in ('true', '(true)')
                                     or coalesce(btrim(with_check), '') in ('true', '(true)')
                                     or rtrim(btrim(coalesce(qual, '')), ')') ~* ' or true$') as sin_siempre_verdaderas,
    (select bool_and(relrowsecurity) from pg_class where oid in ('public.projects'::regclass, 'public.project_setters'::regclass)) as rls_ok
)
select json_build_object(
  'politicas_ok', politicas_ok,
  'sin_siempre_verdaderas', sin_siempre_verdaderas,
  'rls_ok', rls_ok,
  'todo_ok', politicas_ok and sin_siempre_verdaderas and rls_ok,
  'politicas', (select json_agg(json_build_object('tabla', tablename, 'nombre', policyname, 'comando', cmd, 'using', qual, 'with_check', with_check) order by tablename, policyname) from pol),
  'proyectos', (select count(*) from public.projects),
  'asignaciones', (select count(*) from public.project_setters),
  'huella_datos', md5(
    (select coalesce(string_agg(to_jsonb(p)::text, '|' order by p.id), '') from public.projects p) || '#' ||
    (select coalesce(string_agg(to_jsonb(s)::text, '|' order by s.project_id, s.user_id), '') from public.project_setters s))
) as post
from c;
