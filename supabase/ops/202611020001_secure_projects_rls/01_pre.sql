-- PRE · solo lectura. Ejecutar ANTES de 02_apply.sql y guardar el resultado.
-- Seguir solo si estado_auditado es true: las políticas son exactamente las de
-- la auditoría del 2026-11-01, con sus condiciones reales (roles, USING y
-- WITH CHECK, comparados sin espacios). diferencias lista lo que sobre o
-- falte. huella_datos se compara con 03_post.sql.
with
actual(tabla, nombre, comando, tipo, roles, using_expr, check_expr) as (
  select tablename::text, policyname::text, cmd, permissive, roles::text,
         regexp_replace(coalesce(qual, ''), '[[:space:]]+', '', 'g'),
         regexp_replace(coalesce(with_check, ''), '[[:space:]]+', '', 'g')
  from pg_policies where schemaname = 'public' and tablename in ('projects', 'project_setters')
),
auditado(tabla, nombre, comando, tipo, roles, using_expr, check_expr) as (values
  ('project_setters', 'project_setters_delete_admin', 'DELETE', 'PERMISSIVE', '{authenticated}', 'is_admin()', ''),
  ('project_setters', 'project_setters_insert_admin', 'INSERT', 'PERMISSIVE', '{authenticated}', '', 'is_admin()'),
  ('project_setters', 'project_setters_policy', 'ALL', 'PERMISSIVE', '{authenticated}', 'true', 'true'),
  ('project_setters', 'project_setters_select_own_or_admin', 'SELECT', 'PERMISSIVE', '{authenticated}', '((user_id=auth.uid())ORis_admin())', ''),
  ('project_setters', 'project_setters_update_admin', 'UPDATE', 'PERMISSIVE', '{authenticated}', 'is_admin()', 'is_admin()'),
  ('projects', 'projects_delete_assigned_or_admin', 'DELETE', 'PERMISSIVE', '{authenticated}',
   '(is_admin()OR(EXISTS(SELECT1FROMproject_setterspsWHERE((ps.project_id=projects.id)AND(ps.user_id=auth.uid())AND(ps.active=true)))))', ''),
  ('projects', 'projects_insert_authenticated', 'INSERT', 'PERMISSIVE', '{authenticated}', '', 'true'),
  ('projects', 'projects_select_authenticated', 'SELECT', 'PERMISSIVE', '{authenticated}',
   '((created_by=auth.uid())OR(EXISTS(SELECT1FROMproject_setterspsWHERE((ps.project_id=projects.id)AND(ps.user_id=auth.uid()))))ORtrue)', ''),
  ('projects', 'projects_update_authenticated', 'UPDATE', 'PERMISSIVE', '{authenticated}', '(created_by=auth.uid())', '(created_by=auth.uid())')
),
dif as ((select 'sobra' as diferencia, * from actual except select 'sobra', * from auditado)
        union all (select 'falta', * from auditado except select 'falta', * from actual))
select json_build_object(
  'estado_auditado', not exists (select 1 from dif),
  'diferencias', (select json_agg(json_build_object('diferencia', diferencia, 'tabla', tabla, 'nombre', nombre, 'using', using_expr, 'with_check', check_expr)) from dif),
  'politicas', (select json_agg(json_build_object('tabla', tabla, 'nombre', nombre, 'comando', comando) order by tabla, nombre) from actual),
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
