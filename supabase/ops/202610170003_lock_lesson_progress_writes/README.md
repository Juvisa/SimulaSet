# Despliegue de `202610170003_lock_lesson_progress_writes`

Fase 3 de clases verificadas: la finalización de clases pasa solo por
`complete_lesson()` y se retira la escritura directa sobre `lesson_progress`.

Estos scripts **no** los ejecuta la CLI de Supabase (solo lee
`supabase/migrations/`). Se pegan a mano en el SQL Editor, uno por uno.

| Archivo | Tipo | Cuándo |
|---|---|---|
| `01_pre.sql` | Solo lectura | Antes del merge. Guardar el resultado. |
| `02_apply.sql` | Escritura (una transacción) | Con el frontend nuevo ya en producción |
| `03_post.sql` | Solo lectura | Justo después de `02_apply.sql` |
| `04_rollback.sql` | Escritura (una transacción) | Solo si hay que revertir |

`02_apply.sql` contiene las mismas sentencias que la migración, rodeadas de
controles: bloquea un instante las escrituras sobre `lesson_progress`, toma
una foto de `lesson_progress` y de la suma de XP, aplica y comprueba. Si algo
no cuadra, lanza `ABORTADO: …` y la transacción se revierte entera.

## Orden

1. `01_pre.sql`: `fase1_presente` debe estar todo en `true`.
2. Merge a `main` (desde `origin/main`) y despliegue de Vercel.
3. Prueba manual en producción con una cuenta de prueba.
4. `02_apply.sql`.
5. `03_post.sql`: `todo_ok` debe ser `true`.
6. Prueba manual en producción con la cuenta de prueba.

## Si algo falla

| Momento | Acción |
|---|---|
| Frontend nuevo falla (pasos 2–3) | Instant Rollback de Vercel al despliegue anterior. La base sigue siendo compatible con el frontend anterior. |
| `02_apply.sql` aborta o vence el bloqueo | No queda nada aplicado. Reintentar más tarde; el frontend nuevo funciona sin esta migración. |
| Problema después de aplicar | `04_rollback.sql` y después `01_pre.sql` para confirmar. |
| Volver también al frontend anterior | **Primero** `04_rollback.sql`, **después** el Instant Rollback de Vercel. |

El rollback conserva las filas añadidas a `xp_ledger`: siguen evitando que una
clase ya premiada se pague dos veces.

## Qué hace el paso 2 con el XP

Mientras el frontend anterior siguió en producción después de la fase 1, cada
clase marcada sumó +25 XP desde el navegador sin quedar registrada en
`xp_ledger`. Sin ese registro, `complete_lesson()` volvería a pagar 25 XP al
verificarla. El paso 2 la registra como ya premiada (`backfilled = true`).
Solo inserta en `xp_ledger`; no modifica `user_streaks` ni `lesson_progress`.
Es idempotente.

### Limitación conocida

El historial no permite saber, clase por clase, si el +25 XP del navegador
realmente se cobró. En esos casos la clase queda registrada como premiada y
no recibirá XP al verificarla. `01_pre.sql` lo cuantifica en `premiacion`:

| Clave | Significado |
|---|---|
| `nunca_premiada` | Marcada por última vez antes del 2026-09-10 00:18 UTC, cuando la Academia empezó a dar XP. **Nunca se pagó.** El backfill de la fase 1 ya la registró como premiada; esta migración no cambia eso. |
| `ambigua` | Creada antes de esa fecha y desmarcada después: no se sabe si llegó a cobrarse. |
| `premiada_salvo_fallo` | Marcada con el XP ya vigente. Se pagó salvo que `addXp` fallara en el navegador (error de red, cierre de pestaña o escritura concurrente). |
| `fallos_addxp_detectados` | Cota inferior de esos fallos: alumnos cuyo `lifetime_xp` no alcanza 25 por clase. No da falsos positivos, pero no detecta todos los casos. |

Corregir esos casos (por ejemplo, otorgar el XP pendiente) es una decisión de
producto aparte. Este procedimiento no modifica XP.
