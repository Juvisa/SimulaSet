-- Retira la política de 05_emergencia_lectura.sql y vuelve al estado seguro.
-- Después, 03_post.sql debe dar todo_ok = true. Se puede repetir sin riesgo.
-- Es UNA sola sentencia (un bloque DO).
do $$
begin
  perform set_config('lock_timeout', '5s', true);
  drop policy if exists "projects_select_emergencia_temporal" on public.projects;
end $$;
