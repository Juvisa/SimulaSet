-- ROLLBACK de 202610170003 · devuelve la escritura directa del alumno sobre
-- su propia fila (estado previo exacto). Después ejecutar 01_pre.sql para
-- confirmar escritura_directa.authenticated = INSERT,SELECT,UPDATE.
--
-- Las filas que el paso 2 añadió a xp_ledger se CONSERVAN a propósito: siguen
-- impidiendo que complete_lesson() pague dos veces clases ya premiadas.
--
-- Si además hay que volver al frontend anterior: ejecutar ESTE script PRIMERO
-- y después el Instant Rollback de Vercel. Al revés, el frontend anterior no
-- podría marcar clases.
begin;
set local lock_timeout = '5s';

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

commit;
