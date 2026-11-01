-- APLICAR · migración 202611020001 con autoverificación.
-- DESPUÉS de publicar el frontend que muestra «Editar» y «Eliminar» solo al
-- propietario o al admin (ver README).
--
-- Es UNA sola sentencia (un bloque DO): Postgres la ejecuta entera o nada. Si
-- las políticas actuales no son exactamente las de la auditoría, o cualquier
-- comprobación falla, lanza 'ABORTADO: …' y no queda nada aplicado. Un
-- timeout de bloqueo también revierte: reintentar luego.
--
-- Las sentencias del paso 1 son las de
-- supabase/migrations/202611020001_secure_projects_rls.sql.
do $$
declare
  v_huella text;
  v_inesperadas text;
begin
  perform set_config('lock_timeout', '5s', true);
  -- Detiene un instante las escrituras sobre las dos tablas.
  lock table public.projects, public.project_setters in share row exclusive mode;

  select string_agg(format('%s.%s(%s)', tablename, policyname, cmd), ', ' order by tablename, policyname)
    into v_inesperadas
    from (
      (select tablename, policyname, cmd from pg_policies
        where schemaname = 'public' and tablename in ('projects', 'project_setters'))
      except
      (values ('projects', 'projects_delete_assigned_or_admin', 'DELETE'),
              ('projects', 'projects_insert_authenticated', 'INSERT'),
              ('projects', 'projects_select_authenticated', 'SELECT'),
              ('projects', 'projects_update_authenticated', 'UPDATE'),
              ('project_setters', 'project_setters_delete_admin', 'DELETE'),
              ('project_setters', 'project_setters_insert_admin', 'INSERT'),
              ('project_setters', 'project_setters_policy', 'ALL'),
              ('project_setters', 'project_setters_select_own_or_admin', 'SELECT'),
              ('project_setters', 'project_setters_update_admin', 'UPDATE'))
    ) x(tablename, policyname, cmd);
  if v_inesperadas is not null
     or (select count(*) from pg_policies where schemaname = 'public' and tablename in ('projects', 'project_setters')) <> 9 then
    raise exception 'ABORTADO: las políticas actuales no son las auditadas (%). Ejecutar 01_pre.sql y revisar.', coalesce(v_inesperadas, 'faltan políticas');
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

  -- Autoverificación.
  if (select string_agg(format('%s.%s(%s)', tablename, policyname, cmd), ', ' order by tablename, policyname)
        from pg_policies where schemaname = 'public' and tablename in ('projects', 'project_setters'))
     is distinct from
     'project_setters.project_setters_delete_admin(DELETE), project_setters.project_setters_insert_admin(INSERT), '
     || 'project_setters.project_setters_select_own_or_admin(SELECT), project_setters.project_setters_update_admin(UPDATE), '
     || 'projects.projects_delete_owner_or_admin(DELETE), projects.projects_insert_owner_or_admin(INSERT), '
     || 'projects.projects_select_owner_assigned_or_admin(SELECT), projects.projects_update_owner_or_admin(UPDATE)' then
    raise exception 'ABORTADO: el conjunto de políticas resultante no es el esperado';
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename in ('projects', 'project_setters')
                and (coalesce(btrim(qual), '') in ('true', '(true)') or coalesce(btrim(with_check), '') in ('true', '(true)')
                     or rtrim(btrim(coalesce(qual, '')), ')') ~* ' or true$')) then
    raise exception 'ABORTADO: queda una política siempre verdadera';
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
