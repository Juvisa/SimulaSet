# Despliegue de `202611020001_secure_projects_rls`

Seguridad de `projects` y `project_setters` (fase 1). Sustituye las políticas
abiertas que tenía producción (auditoría de solo lectura del 2026-11-01) por
las reglas del producto:

| | Leer | Crear | Editar | Eliminar | Asignaciones |
|---|---|---|---|---|---|
| Propietaria (`created_by`) | Sí, siempre | Solo a su nombre | Sí (no puede cederlo) | Sí | Solo lee las suyas |
| Setter asignada (activa) | Sí | Solo a su nombre | No | No | Solo lee las suyas |
| Otra alumna | No | Solo a su nombre | No | No | Solo lee las suyas |
| Admin | Sí | Sí, para cualquiera | Sí | Sí | Lee, crea, edita y borra |

No cambia datos, columnas, permisos de tablas o funciones ni el trigger
`projects_assign_creator` (con la creación restringida, solo puede asignar a
la propia creadora o a quien indique un admin).

Estos scripts **no** los ejecuta la CLI de Supabase. Se pegan a mano en el SQL
Editor, uno por uno.

| Archivo | Tipo | Cuándo |
|---|---|---|
| `01_pre.sql` | Solo lectura | Antes de aplicar. Guardar el resultado. |
| `02_apply.sql` | Escritura (una sentencia) | Después de publicar el frontend (paso 2) |
| `03_post.sql` | Solo lectura | Justo después de `02_apply.sql` |
| `04_rollback.sql` | Escritura (una sentencia) | Solo si hay que revertir |

`02_apply.sql` es un único bloque `do $$ … $$`: se aplica entero o nada.
**Solo se aplica sobre el estado auditado**: si las políticas de `projects` y
`project_setters` no son exactamente las 9 de la auditoría, aborta sin tocar
nada. Bloquea un instante las escrituras sobre las dos tablas, toma una huella
de los datos, cambia las políticas y comprueba el conjunto resultante, que no
quede ninguna política siempre verdadera, que la RLS siga activa y que los
datos no cambiaron.

## Ensayo (sin tocar Supabase)

`tests/rehearsal.mjs` reconstruye el estado auditado de producción en PGlite
(migraciones del repo más las políticas abiertas) con datos ficticios y
cuatro roles: propietaria, setter asignada, alumna ajena y admin. En modo
script y modo SQL Editor, con y sin los permisos por defecto de Supabase:

- **antes**: comprueba que los ataques funcionan (la ajena lee, se asigna,
  borra el proyecto con sus activos en cascada y crea a nombre de otra), para
  confirmar que el ensayo reproduce el problema;
- **después**: lectura, creación (incluida `.insert().select()` de PostgREST),
  edición, eliminación y asignaciones con cada rol; el ataque encadenado
  (asignarse y después borrar) no afecta a nada; la propietaria no puede ceder
  el proyecto ni la setter apropiárselo; activos y leads ajenos siguen
  invisibles;
- que la migración y `02_apply.sql` dejan las mismas políticas y que los datos
  no cambian;
- que aborta si se repite, si el estado no es el auditado o si es el del
  repositorio;
- el rollback: vuelve exactamente a las políticas auditadas, sin tocar datos,
  es repetible y permite volver a aplicar;
- que `02_apply.sql` y `04_rollback.sql` son una sentencia cada uno y que
  `01_pre.sql` y `03_post.sql` corren en una transacción de solo lectura.

```bash
npm i --no-save @electric-sql/pglite   # no modifica package.json
node supabase/ops/202611020001_secure_projects_rls/tests/rehearsal.mjs
```

## Orden

1. `01_pre.sql`: `estado_auditado` debe ser `true`. Guardar `huella_datos`.
2. Merge a `main` y despliegue del frontend de esta rama: en «Mis Proyectos»,
   «Editar» y «Eliminar» se muestran solo a la propietaria o al admin. (Si la
   migración se aplicara antes, una setter asignada vería esos botones y
   recibiría «No tienes permiso»: no es un riesgo, pero confunde.)
3. `02_apply.sql`.
4. `03_post.sql`: `todo_ok` debe ser `true` y `huella_datos` igual a la del
   paso 1.
5. Prueba manual con cuentas de prueba y proyectos de prueba (nunca con
   proyectos reales): crear, editar y eliminar como propietaria; ver sin
   botones de administrar como setter asignada; no ver proyectos ajenos.

La creación de proyectos funciona con estas políticas aunque no se publique
`fix/project-create-rls`: la propietaria puede leer su proyecto en el mismo
instante en que lo crea.

## Rollback

`04_rollback.sql` vuelve **exactamente** a las políticas auditadas y no toca
datos. **Reabre las vulnerabilidades**: usarlo solo si la corrección rompe algo
imprescindible y por el menor tiempo posible. Después, `01_pre.sql` debe dar
`estado_auditado = true`. El frontend de esta rama sigue funcionando con las
políticas anteriores.
