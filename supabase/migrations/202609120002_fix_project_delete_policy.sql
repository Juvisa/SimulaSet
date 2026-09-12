-- La policy anterior ("projects_delete_creator_or_admin") solo dejaba borrar
-- al creador original (created_by) o a un admin. Pero el SELECT
-- ("projects_select_assigned_or_admin") ya le da acceso de gestión a
-- CUALQUIER setter activo en project_setters, no solo al creador — por eso
-- un setter podía VER un proyecto en "Mis Proyectos" (porque un admin lo
-- asignó como colaborador, o el proyecto se migró/creó bajo otra cuenta) pero
-- el DELETE le era rechazado por RLS con "No tienes permiso para eliminar
-- este proyecto", aunque la UI le mostrara el botón como si fuera suyo.
--
-- Se reemplaza la policy de DELETE para que use exactamente la misma
-- condición de acceso que el SELECT: si puedes ver el proyecto en tu lista,
-- puedes eliminarlo desde ahí.
drop policy if exists "projects_delete_creator_or_admin" on public.projects;

create policy "projects_delete_assigned_or_admin"
on public.projects
for delete
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.project_setters ps
    where ps.project_id = projects.id
      and ps.user_id = auth.uid()
      and ps.active = true
  )
);
