-- ROLLBACK de 202610170003 · devuelve la escritura directa del alumno sobre
-- su propia fila (estado previo exacto). Después ejecutar 01_pre.sql para
-- confirmar escritura_directa.authenticated = INSERT,SELECT,UPDATE y las 4
-- políticas.
--
-- Es UNA sola sentencia (un bloque DO): se aplica entera o nada, sin depender
-- de cómo el SQL Editor agrupe las sentencias. Se puede repetir sin riesgo.
--
-- Las filas que la migración añadió a xp_ledger se CONSERVAN a propósito:
-- siguen impidiendo que complete_lesson() pague dos veces clases ya premiadas.
--
-- Si además hay que volver al frontend anterior: ejecutar ESTE script PRIMERO
-- y después el Instant Rollback de Vercel. Al revés, el frontend anterior no
-- podría marcar clases.
do $$
begin
  perform set_config('lock_timeout', '5s', true);

  grant insert, update on table public.lesson_progress to authenticated;

  drop policy if exists "lesson_progress_insert_own" on public.lesson_progress;
  create policy "lesson_progress_insert_own"
  on public.lesson_progress
  for insert
  to authenticated
  with check (user_id = auth.uid());

  drop policy if exists "lesson_progress_update_own" on public.lesson_progress;
  create policy "lesson_progress_update_own"
  on public.lesson_progress
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
end $$;
