# Compensación `pre_xp_lessons_2026_10`

Reconoce 25 XP por cada clase que la Academia **nunca premió**: clases marcadas
antes del 2026-09-10 00:18:20 UTC, cuando empezó el XP de clases. El backfill
de la fase 1 las registró en `xp_ledger` como ya premiadas, así que verificarlas
hoy no da XP. En el PRE de producción del 2026-10-17 eran **10 clases de
6 alumnos (250 XP)**.

**Operación independiente:** no forma parte del despliegue de la fase 3
(`202610170003`) y se ejecuta después de ella, en otra sesión, solo con
autorización expresa.

| Archivo | Tipo | Cuándo |
|---|---|---|
| `../../migrations/202610170004_xp_adjustments.sql` | Esquema (no toca datos) | Después de la fase 3 |
| `01_pre.sql` | Solo lectura | Antes de aplicar; revisar el detalle |
| `02_apply.sql` | Escritura (una sentencia, todo o nada) | Con los 4 valores reemplazados |
| `03_post.sql` | Solo lectura | Justo después |
| `04_rollback_schema.sql` | Esquema (una sentencia) | Solo si hay que retirar la migración **antes** de otorgar nada |

Todos los archivos son **una sola sentencia**: el SQL Editor de Supabase
ejecuta cada sentencia en su propia transacción (ver el incidente en
`../202610170003_lock_lesson_progress_writes/README.md`).

## Orden

1. Fase 3 desplegada y `03_post.sql` de la 0003 con `todo_ok: true`.
2. Migración `202610170004_xp_adjustments.sql`.
3. `01_pre.sql`: `requisitos` todo en `true`; revisar `detalle` (alumno,
   clase, fecha) y anotar `clases` y `fingerprint`; elegir el aprobador entre
   `administradores_activos`.
4. En `02_apply.sql`, reemplazar:
   - `<<EMAIL DEL ADMINISTRADOR QUE APRUEBA>>`: email de un administrador
     activo de Digital SET (perfil con `role = 'admin'`);
   - `<<REFERENCIA DE LA APROBACIÓN (dónde y cuándo)>>`: por ejemplo, el canal
     y la fecha en que se aprobó;
   - `<<CLASES>>` y `<<FINGERPRINT>>`: los valores del PRE.
5. Ejecutar `02_apply.sql`.
6. `03_post.sql`: `todo_ok: true`; `ledger.xp` = 250.

## Revisión de seguridad

| Riesgo | Control |
|---|---|
| Pagar dos veces | Una fila del ledger por clase (`UNIQUE (user_id, source, source_ref)`) y `award_xp_once`, que solo suma si la fila es nueva. Repetir el script no cambia nada: el lote ya existe y se informa. |
| Pagar a quien no corresponde | La selección se recalcula dentro del bloque y debe coincidir con el número de clases y la huella revisados en el PRE; si no, aborta sin cambios. |
| Que la selección cambie durante la operación | Exige la 0003 aplicada (ningún cliente escribe `lesson_progress`) y bloquea un instante `lesson_progress` y `user_streaks`. `complete_lesson` conserva `completed_at`, así que verificar una clase no la saca de la selección. |
| Importe incorrecto | Comprueba que `total_xp` y `lifetime_xp` suben exactamente 25 × clases; si no, aborta. |
| Aprobación sin respaldo | `approved_by` es la clave del perfil del administrador (FK). Un trigger exige `role = 'admin'` y `active = true` al registrar el lote y guarda el email del perfil, la referencia de aprobación, la fecha y la sesión que ejecutó. |
| Alterar la auditoría | `xp_adjustment_batches` es inmutable: `UPDATE`, `DELETE` y `TRUNCATE` se rechazan, también desde el SQL Editor. El perfil del aprobador no se puede borrar mientras exista el lote (`on delete restrict`). |
| Que un alumno se dé XP | Sin permisos de escritura sobre la tabla de lotes ni el ledger; `award_xp_once` no es ejecutable por clientes. Solo el admin puede leer los lotes. |
| Ejecución parcial en el SQL Editor | Cada archivo es un único bloque `do $$ … $$`. |
| Ejecución por error antes de tiempo | Sin reemplazar los 4 valores, aborta. Sin la 0003 o sin la 0004, aborta sin cambios. |

**Sin script de reversión del XP, a propósito.** `user_streaks` tiene un
trigger que impide bajar `total_xp`, y los alumnos pueden gastar el XP en la
tienda apenas lo reciben. Si hubiera que corregir algo, se haría con un nuevo
lote aprobado. `04_rollback_schema.sql` solo retira la migración si todavía no
se otorgó nada.

**Efectos esperados:** cada alumno compensado recibe 25 XP por clase en
`total_xp` (saldo canjeable) y en `lifetime_xp` (leaderboard), igual que si la
clase se hubiera premiado en su momento.

## Ensayo (sin tocar Supabase)

```bash
npm i --no-save @electric-sql/pglite   # no modifica package.json
node supabase/ops/202610170004_compensate_pre_xp_lessons/tests/rehearsal.mjs
```

Ejecuta todo en PGlite, en modo script completo y en modo SQL Editor, con y
sin los permisos por defecto de Supabase.
