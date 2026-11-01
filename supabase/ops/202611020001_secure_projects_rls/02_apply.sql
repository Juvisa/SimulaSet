-- APLICAR · migración 202611020001 con autoverificación.
--
-- Es UNA sola sentencia (un bloque DO): Postgres la ejecuta entera o nada. Si
-- cualquier comprobación falla, lanza 'ABORTADO: …' y no queda nada aplicado.
-- Un timeout de bloqueo también revierte: reintentar luego.
--
-- Comprueba las condiciones REALES de cada política, no solo su nombre:
-- tabla, nombre, comando, tipo (PERMISSIVE), roles, USING y WITH CHECK. Las
-- expresiones se comparan sin espacios ni saltos de línea, para no depender
-- de cómo cada versión de Postgres las imprime.
--   ANTES:   deben ser exactamente las 9 políticas de la auditoría (2026-11-01).
--   DESPUÉS: deben ser exactamente las 8 políticas nuevas.
-- Además: RLS activa y datos idénticos (huella antes y después).
--
-- Las sentencias del paso 1 son las de
-- supabase/migrations/202611020001_secure_projects_rls.sql.
do $$
declare
  v_huella text;
  v_dif text;
begin
  perform set_config('lock_timeout', '5s', true);
  -- Detiene un instante las escrituras sobre las dos tablas.
  lock table public.projects, public.project_setters in share row exclusive mode;

  -- ANTES: las 9 políticas auditadas, con sus condiciones exactas.
  with actual(tabla, nombre, comando, tipo, roles, using_expr, check_expr) as (
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
  select string_agg(format('%s %s.%s', diferencia, tabla, nombre), ', ') into v_dif from dif;
  if v_dif is not null then
    raise exception 'ABORTADO: las políticas actuales no son las auditadas (%). Ejecutar 01_pre.sql y revisar.', v_dif;
  end if;

  v_huella := md5(
    (select coalesce(string_agg(to_jsonb(p)::text, '|' order by p.id), '') from public.projects p) || '#' ||
    (select coalesce(string_agg(to_jsonb(s)::text, '|' order by s.project_id, s.user_id), '') from public.project_setters s));

  -- 1.
  drop policy if exists "projects_select_authenticated" on public.projects;
  drop policy if exists "projects_insert_authenticated" on public.projects;
  drop policy if exists "projects_update_authenticated" on public.projects;
  drop policy if exists "projects_delete_assigned_or_admin" on public.projects;
  drop policy if exists "projects_select_assigned_or_admin" on public.projects;
  drop policy if exists "projects_insert_own_or_admin" on public.projects;
  drop policy if exists "projects_update_creator_or_admin" on public.projects;
  drop policy if exists "projects_delete_creator_or_admin" on public.projects;

  create policy "projects_select_owner_assigned_or_admin"
  on public.projects
  for select
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_admin()
    or exists (
      select 1
      from public.project_setters ps
      where ps.project_id = projects.id
        and ps.user_id = auth.uid()
        and ps.active = true
    )
  );

  create policy "projects_insert_owner_or_admin"
  on public.projects
  for insert
  to authenticated
  with check (created_by = auth.uid() or public.is_admin());

  create policy "projects_update_owner_or_admin"
  on public.projects
  for update
  to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

  create policy "projects_delete_owner_or_admin"
  on public.projects
  for delete
  to authenticated
  using (created_by = auth.uid() or public.is_admin());

  drop policy if exists "project_setters_policy" on public.project_setters;

  -- DESPUÉS: exactamente las 8 políticas nuevas, con sus condiciones.
  with actual(tabla, nombre, comando, tipo, roles, using_expr, check_expr) as (
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
          union all (select 'falta', * from esperado except select 'falta', * from actual))
  select string_agg(format('%s %s.%s', diferencia, tabla, nombre), ', ') into v_dif from dif;
  if v_dif is not null then
    raise exception 'ABORTADO: las políticas resultantes no son las esperadas (%)', v_dif;
  end if;

  if not (select bool_and(relrowsecurity) from pg_class where oid in ('public.projects'::regclass, 'public.project_setters'::regclass)) then
    raise exception 'ABORTADO: RLS desactivada';
  end if;
  if v_huella <> md5(
    (select coalesce(string_agg(to_jsonb(p)::text, '|' order by p.id), '') from public.projects p) || '#' ||
    (select coalesce(string_agg(to_jsonb(s)::text, '|' order by s.project_id, s.user_id), '') from public.project_setters s)) then
    raise exception 'ABORTADO: los datos cambiaron';
  end if;
end $$;
