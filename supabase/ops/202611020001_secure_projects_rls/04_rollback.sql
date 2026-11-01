-- ROLLBACK de 202611020001 · vuelve EXACTAMENTE a las políticas que tenía
-- producción en la auditoría del 2026-11-01. No toca datos.
--
-- ATENCIÓN: revertir REABRE las vulnerabilidades (lectura de todos los
-- proyectos, asignaciones abiertas y borrado de proyectos ajenos). Usarlo solo
-- si la corrección rompe algo imprescindible, y por el menor tiempo posible.
--
-- Es UNA sola sentencia (un bloque DO): se aplica entera o nada. Se puede
-- repetir sin riesgo. Después, 01_pre.sql debe dar estado_auditado = true.
do $$
begin
  perform set_config('lock_timeout', '5s', true);
  lock table public.projects, public.project_setters in share row exclusive mode;

  drop policy if exists "projects_select_owner_assigned_or_admin" on public.projects;
  drop policy if exists "projects_insert_owner_or_admin" on public.projects;
  drop policy if exists "projects_update_owner_or_admin" on public.projects;
  drop policy if exists "projects_delete_owner_or_admin" on public.projects;

  drop policy if exists "projects_select_authenticated" on public.projects;
  create policy "projects_select_authenticated"
  on public.projects
  for select
  to authenticated
  using (
    (created_by = auth.uid())
    or (exists (select 1 from public.project_setters ps where ps.project_id = projects.id and ps.user_id = auth.uid()))
    or true
  );

  drop policy if exists "projects_insert_authenticated" on public.projects;
  create policy "projects_insert_authenticated"
  on public.projects
  for insert
  to authenticated
  with check (true);

  drop policy if exists "projects_update_authenticated" on public.projects;
  create policy "projects_update_authenticated"
  on public.projects
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

  drop policy if exists "projects_delete_assigned_or_admin" on public.projects;
  create policy "projects_delete_assigned_or_admin"
  on public.projects
  for delete
  to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.project_setters ps
               where ps.project_id = projects.id and ps.user_id = auth.uid() and ps.active = true)
  );

  drop policy if exists "project_setters_policy" on public.project_setters;
  create policy "project_setters_policy"
  on public.project_setters
  for all
  to authenticated
  using (true)
  with check (true);
end $$;
