-- Fase 3: la finalización de clases SOLO pasa por complete_lesson().
--
-- Hasta ahora el navegador podía escribir lesson_progress directamente
-- (upsert): con eso se podía marcar como completada una clase con video sin
-- haber visto el 85 %, o desmarcarla y volver a marcarla. El trigger de la
-- fase 1 impedía que esas escrituras se declararan 'verified_watch', pero no
-- impedía completar. Esta migración retira la escritura directa:
--   - authenticated conserva SELECT (su propia fila; el admin lee todas);
--   - complete_lesson() es SECURITY DEFINER: sigue insertando/actualizando;
--   - sin UPDATE directo tampoco se puede desmarcar una clase.
--
-- ⚠ ORDEN DE DESPLIEGUE: aplicar DESPUÉS de publicar en producción el
-- frontend que completa con complete_lesson(). Si se aplica antes, el botón
-- del frontend anterior (upsert directo) dejaría de funcionar.
-- Procedimiento, controles PRE/POST y rollback:
-- supabase/ops/202610170003_lock_lesson_progress_writes/

-- 1. Sin escritura directa (también PUBLIC y anon: defensa en profundidad,
-- no depender solo de RLS si algún rol heredara permisos por defecto). Las
-- políticas de escritura propia ya no tendrían efecto: se eliminan para que
-- el esquema refleje la regla real.
revoke insert, update, delete on table public.lesson_progress from public, anon, authenticated;
drop policy if exists "lesson_progress_insert_own" on public.lesson_progress;
drop policy if exists "lesson_progress_update_own" on public.lesson_progress;

-- 2. Cierra la ventana entre la fase 1 y esta migración. Mientras el frontend
-- anterior siguió en producción, cada clase marcada sumó +25 XP desde el
-- navegador (addXp) sin dejar fila en xp_ledger; sin ese registro,
-- complete_lesson() volvería a otorgar 25 XP al verificar la clase. Se
-- registra como ya otorgada (backfilled), con el mismo criterio que el
-- backfill de la fase 1. Solo inserta en xp_ledger: no modifica user_streaks
-- ni lesson_progress. Idempotente (on conflict do nothing).
-- Limitación conocida: si addXp falló en el navegador, esa clase queda
-- registrada como premiada sin haberlo sido; ver el README del procedimiento.
insert into public.xp_ledger (user_id, source, source_ref, amount, backfilled)
select lp.user_id, 'academy_lesson', lp.course_id || '/' || lp.module_id || '/' || lp.lesson_id, 25, true
  from public.lesson_progress lp
on conflict (user_id, source, source_ref) do nothing;
