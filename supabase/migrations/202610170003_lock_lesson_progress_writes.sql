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

-- También a PUBLIC y anon (defensa en profundidad: no depender solo de RLS
-- si algún rol heredara permisos de escritura por defecto).
revoke insert, update, delete on table public.lesson_progress from public, anon, authenticated;

-- Las políticas de escritura propia ya no tienen efecto sin los permisos; se
-- eliminan para que el esquema refleje la regla real.
drop policy if exists "lesson_progress_insert_own" on public.lesson_progress;
drop policy if exists "lesson_progress_update_own" on public.lesson_progress;
