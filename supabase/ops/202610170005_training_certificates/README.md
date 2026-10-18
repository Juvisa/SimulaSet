# Despliegue de `202610170005_training_certificates`

Constancia de Formación Digital SET: emisión desde el servidor, código único,
registro auditable y verificación pública.

**Qué acredita:** la visualización registrada del recorrido formativo (las
cuatro clases obligatorias con `verified_watch` y ≥ 85 %). No evalúa
competencias ni es una certificación profesional. No usa simulaciones.

Estos scripts **no** los ejecuta la CLI de Supabase. Se pegan a mano en el SQL
Editor, uno por uno. **Cada archivo es una sola sentencia** (el SQL Editor
ejecuta cada sentencia en su propia transacción; ver el incidente en
`../202610170003_lock_lesson_progress_writes/README.md`).

| Archivo | Tipo | Cuándo |
|---|---|---|
| `01_pre.sql` | Solo lectura | Antes de aplicar. Guardar el resultado. |
| `02_apply.sql` | Esquema (un bloque DO, todo o nada) | Tras un PRE correcto |
| `03_post.sql` | Solo lectura | Justo después |
| `04_rollback.sql` | Esquema (un bloque DO) | Solo si hay que retirar la migración **y no se emitió ninguna constancia** |
| `05_register_test_account.sql` | Admin | Antes de que una cuenta de QA emita su constancia |
| `06_revoke_credential.sql` | Admin | Para revocar una constancia (auditado) |

`02_apply.sql` se **genera** desde la migración (`tests/generate-apply.mjs`):
contiene exactamente su texto, dentro de un bloque DO con comprobaciones
finales. Si la migración ya estaba aplicada, avisa y no cambia nada.

## Orden

1. `01_pre.sql`: todo `requisitos` en `true`. Anotar `referencia`.
2. `02_apply.sql`.
3. `03_post.sql`: `todo_ok: true`; `referencia` igual que en el PRE.
4. `05_register_test_account.sql` con la cuenta de QA.
5. Prueba en el Preview con la cuenta de QA: 4 clases verificadas →
   elegibilidad → consentimiento → emisión → verificación pública → vista
   imprimible.
6. Si se decide: `06_revoke_credential.sql` con motivo `prueba`.

La migración es aditiva: el frontend actual de producción no la usa, así que
puede aplicarse antes del despliegue del frontend nuevo.

## Si algo falla

| Momento | Acción |
|---|---|
| `02_apply.sql` aborta | No queda nada aplicado. Revisar el mensaje `ABORTADO: …`. |
| Problema antes de emitir ninguna constancia | `04_rollback.sql` y luego `01_pre.sql` (`objetos_0005_ausentes: true`). |
| Problema después de emitir alguna | `04_rollback.sql` **aborta a propósito**: una constancia emitida es un registro real. Se revierte solo el frontend (Instant Rollback de Vercel); las constancias problemáticas se revocan con `06_revoke_credential.sql`. |

## Seguridad

| Riesgo | Control |
|---|---|
| Que el alumno se emita una constancia sin cumplir | `issue_training_certificate()` usa `auth.uid()`, exige perfil de alumno activo y vuelve a comprobar en la base las 4 clases (`verified_watch`, ≥ 85 %). |
| Que escriba o altere credenciales | Sin permisos de escritura para clientes en las 4 tablas; triggers que solo permiten insertar desde la emisión y actualizar desde la revocación. Nunca se borra. |
| Emisión doble | Bloqueo por alumno, índice único de una constancia activa por alumno y respuesta `already_issued`. |
| Consentimiento | La emisión exige la versión vigente del texto aceptado (`publica_v1`) y la guarda con la fecha. |
| Exposición de datos | `verify_credential()` devuelve solo nombre, título, emisor, fecha y estado. Nunca el id de usuario, el email ni la evidencia. |
| Constancias de prueba | Cuentas registradas en `credential_test_accounts`: sus constancias se marcan `is_test` y la verificación pública lo indica. |
| Revocación | Solo desde el SQL Editor, con el email de un administrador activo y una nota. Queda un evento con actor, motivo y nota. Con motivo `fraude`, el alumno no puede volver a emitirla. |
| Auditoría | `credential_events` solo admite nuevos eventos del servidor. La evidencia se guarda congelada con su hash SHA-256. |
| Cambios de criterio | Una versión de la definición no se modifica: un criterio nuevo es una versión nueva. |

## Ensayo (sin tocar Supabase)

```bash
npm i --no-save @electric-sql/pglite   # no modifica package.json
node supabase/ops/202610170005_training_certificates/tests/rehearsal.mjs
```

Ejecuta todo en PGlite, en modo script completo y en modo SQL Editor, con y
sin los permisos por defecto de Supabase, verificando las clases de verdad
(registro de visualización y `complete_lesson()`).
