-- EMERGENCIA NIVEL 2 · reabre TEMPORALMENTE solo la LECTURA de proyectos.
--
-- Para cuando la corrección esté aplicada y algo imprescindible falle porque
-- alguien no puede LEER un proyecto que necesita (por ejemplo, asignaciones
-- inactivas que sí se usaban). En lugar de 04_rollback.sql:
--   - vuelve a dejar leer todos los proyectos (como antes de la corrección);
--   - MANTIENE cerradas las asignaciones, la creación a nombre de otra persona,
--     la edición y el borrado de proyectos ajenos (el ataque encadenado sigue
--     bloqueado).
-- Retirarla cuanto antes con 06_quitar_emergencia.sql.
--
-- Es UNA sola sentencia (un bloque DO). Solo se aplica sobre la corrección.
do $$
begin
  perform set_config('lock_timeout', '5s', true);
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projects'
                  and policyname = 'projects_select_owner_assigned_or_admin') then
    raise exception 'ABORTADO: la corrección 202611020001 no está aplicada';
  end if;
  drop policy if exists "projects_select_emergencia_temporal" on public.projects;
  create policy "projects_select_emergencia_temporal"
  on public.projects
  for select
  to authenticated
  using (true);
  raise warning 'EMERGENCIA ACTIVA: cualquier usuario con sesión puede LEER todos los proyectos. Retirar con 06_quitar_emergencia.sql.';
end $$;
