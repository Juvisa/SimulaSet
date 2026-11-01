-- Seguridad de projects y project_setters (fase 1).
--
-- Producción tenía políticas distintas de las del repositorio (auditoría de
-- solo lectura del 2026-11-01):
--   - projects_select_authenticated terminaba en «OR true»: cualquier usuario
--     con sesión leía todos los proyectos;
--   - projects_insert_authenticated con WITH CHECK (true): se podían crear
--     proyectos a nombre de otra persona (y el trigger se los asignaba);
--   - project_setters_policy, ALL con USING (true) y WITH CHECK (true):
--     cualquiera podía asignarse a cualquier proyecto, o cambiar y borrar
--     asignaciones ajenas; encadenado con el DELETE «asignado o admin», podía
--     borrar proyectos ajenos (y en cascada sus project_value_assets);
--   - el administrador no podía editar proyectos ajenos.
--
-- Reglas que quedan (las del producto):
--   - Propietario (created_by): lee, edita y elimina su proyecto, esté o no
--     asignado como setter. No puede cederlo a otra persona.
--   - Setter asignado (project_setters activo): lee el proyecto para trabajar
--     con él. No lo edita, no lo elimina y no toca asignaciones.
--   - Cualquier otro alumno: no lo ve, y solo crea proyectos a su nombre.
--   - Administrador: lee, crea, edita y elimina cualquier proyecto, y es el
--     único que administra project_setters.
--
-- La lectura del propietario no depende de project_setters: por eso crear un
-- proyecto con INSERT … RETURNING (.insert().select()) funciona sin esperar al
-- trigger que crea la asignación.
--
-- Qué NO toca: datos, columnas, permisos de tablas o funciones, el trigger
-- projects_assign_creator (con el INSERT restringido, solo puede asignar al
-- propio creador, o a quien indique un admin) ni ninguna otra tabla.

-- projects: se quitan las políticas de producción y las del repositorio.
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

-- project_setters: se quita la política abierta. Quedan las del repositorio
-- (leer las propias o admin; insertar, editar y borrar solo admin).
drop policy if exists "project_setters_policy" on public.project_setters;
