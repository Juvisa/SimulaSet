-- POST · solo lectura. Justo después de 02_apply.sql.
-- todo_ok debe ser true y huella_datos igual a la de 01_pre.sql.
-- Compara las condiciones REALES (roles, USING y WITH CHECK, sin espacios),
-- no solo los nombres. diferencias lista lo que sobre o falte.
with
actual(tabla, nombre, comando, tipo, roles, using_expr, check_expr) as (
  select tablename::text, policyname::text, cmd, permissive, roles::text,
         regexp_replace(coalesce(qual, ''), '[[:space:]]+', '', 'g'),
         regexp_replace(coalesce(with_check, ''), '[[:space:]]+', '', 'g')
  from pg_policies where schemaname = 'public' and tablename in ('projects', 'project_setters')
),
esperado(tabla, nombre, comando, tipo, roles, using_expr, check_expr) as (values
  ('project_setters', 'project_setters_delete_admin', 'DELETE', 'PERMISSIVE', '{authenticated}', 'is_admin()', ''),
  ('project_setters', 'project_setters_insert_admin', 'INSERT', 'PERMISSIVE', '{authenticated}', '', 'is_admin()'),
  ('project_setters', 'project_setters_select_own_or_admin', 'SELECT', 'PERMISSIVE', '{authenticated}', '((user_id=auth.uid())ORis_admin())', ''),
  ('project_setters', 'project_setters_update_admin', 'UPDATE', 'PERMISSIVE', '{authenticated}', 'is_admin()', 'is_admin()'),
  ('projects', 'projects_delete_owner_or_admin', 'DELETE', 'PERMISSIVE', '{authenticated}', '((created_by=auth.uid())ORis_admin())', ''),
  ('projects', 'projects_insert_owner_or_admin', 'INSERT', 'PERMISSIVE', '{authenticated}', '', '((created_by=auth.uid())ORis_admin())'),
  ('projects', 'projects_select_owner_assigned_or_admin', 'SELECT', 'PERMISSIVE', '{authenticated}',
   '((created_by=auth.uid())ORis_admin()OR(EXISTS(SELECT1FROMproject_setterspsWHERE((ps.project_id=projects.id)AND(ps.user_id=auth.uid())AND(ps.active=true)))))', ''),
  ('projects', 'projects_update_owner_or_admin', 'UPDATE', 'PERMISSIVE', '{authenticated}', '((created_by=auth.uid())ORis_admin())', '((created_by=auth.uid())ORis_admin())')
),
dif as ((select 'sobra' as diferencia, * from actual except select 'sobra', * from esperado)
        union all (select 'falta', * from esperado except select 'falta', * from actual)),
c as (
  select
    not exists (select 1 from dif) as politicas_exactas,
    (select bool_and(relrowsecurity) from pg_class where oid in ('public.projects'::regclass, 'public.project_setters'::regclass)) as rls_ok
)
select json_build_object(
  'politicas_exactas', politicas_exactas,
  'rls_ok', rls_ok,
  'todo_ok', politicas_exactas and rls_ok,
  'diferencias', (select json_agg(json_build_object('diferencia', diferencia, 'tabla', tabla, 'nombre', nombre, 'using', using_expr, 'with_check', check_expr)) from dif),
  'proyectos', (select count(*) from public.projects),
  'asignaciones', (select count(*) from public.project_setters),
  'huella_datos', md5(
    (select coalesce(string_agg(to_jsonb(p)::text, '|' order by p.id), '') from public.projects p) || '#' ||
    (select coalesce(string_agg(to_jsonb(s)::text, '|' order by s.project_id, s.user_id), '') from public.project_setters s))
) as post
from c;
