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
| `01_pre.sql` | Solo lectura | Antes de aplicar. Guardar el resultado (incluye conteos de impacto). |
| `02_apply.sql` | Escritura (una sentencia) | Antes o después del frontend (ver «Orden») |
| `03_post.sql` | Solo lectura | Justo después de `02_apply.sql` |
| `05_emergencia_lectura.sql` | Escritura (una sentencia) | Emergencia nivel 2 (ver «Emergencia») |
| `06_quitar_emergencia.sql` | Escritura (una sentencia) | Para retirar el nivel 2 |
| `04_rollback.sql` | Escritura (una sentencia) | Emergencia nivel 3, último recurso |

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
- **compatibilidad con el frontend desplegado**: las consultas de
  `src/utils/projects.js` de `main` (lista, guardar, eliminar, crear), con la
  forma de PostgREST, dan lo mismo antes y después salvo que la setter no
  propietaria ya no puede eliminar;
- los conteos de impacto de `01_pre.sql`;
- la emergencia nivel 2: reabre solo la lectura, el ataque encadenado sigue
  bloqueado y `06_quitar_emergencia.sql` vuelve al estado seguro;
- el rollback: vuelve exactamente a las políticas auditadas, sin tocar datos,
  es repetible y permite volver a aplicar;
- que los scripts de escritura son una sentencia cada uno y que `01_pre.sql` y
  `03_post.sql` corren en una transacción de solo lectura.

```bash
npm i --no-save @electric-sql/pglite   # no modifica package.json
node supabase/ops/202611020001_secure_projects_rls/tests/rehearsal.mjs
```

## Orden (base primero: menos tiempo de exposición)

El frontend desplegado hoy es compatible con las políticas nuevas (ensayo,
bloque «frontend desplegado»): cada rol ve en «Mis Proyectos» exactamente lo
mismo que antes, crear, editar y eliminar como propietaria funcionan, y el
admin ahora sí puede editar. La única diferencia visible hasta desplegar el
frontend de esta rama: una setter asignada que no es propietaria sigue viendo
«Editar» (vuelve a la lista, como hoy) y «Eliminar» (aviso «No tienes
permiso», no se borra nada). `01_pre.sql` dice cuántas son
(`impacto_setters_no_propietarias`).

1. `01_pre.sql`: `estado_auditado` debe ser `true`. Guardar el resultado.
2. Comprobar el respaldo disponible (ver «Respaldo»).
3. `02_apply.sql` y enseguida `03_post.sql`: `todo_ok` debe ser `true` y
   `huella_datos` igual a la del paso 1. Desde aquí la exposición está cerrada.
4. Prueba manual con cuentas y proyectos de prueba (nunca con proyectos
   reales): crear, editar y eliminar como propietaria; la setter asignada lo
   ve pero no lo edita ni lo elimina; una alumna ajena no lo ve.
5. Merge a `main` y despliegue del frontend de esta rama (botones solo para la
   propietaria o el admin). El Preview de la rama usa la base de producción:
   no usarlo para probar.
6. Comprobar «Mis Proyectos» con las mismas cuentas de prueba.

La creación de proyectos funciona con estas políticas aunque no se publique
`fix/project-create-rls`: la propietaria puede leer su proyecto en el mismo
instante en que lo crea.

## Respaldo

La migración solo cambia políticas: no modifica filas, y `02_apply.sql` lo
comprueba con una huella antes y después. Las políticas anteriores están
guardadas, exactas, en `04_rollback.sql`. Aun así, antes del paso 3:

- revisar en Supabase (Database → Backups) qué copias automáticas hay y de
  cuándo es la última, y si está activada la recuperación a un punto en el
  tiempo (PITR);
- opcional: exportar a CSV desde el SQL Editor `select * from public.projects`
  y `select * from public.project_setters` (solo lectura) y guardarlos fuera
  de Supabase.

## Emergencia (escalonada)

Restaurar las políticas anteriores reabre las vulnerabilidades críticas, así
que no es la primera opción.

1. **Nivel 1, sin tocar la base.** Si el problema es de pantalla (botones,
   mensajes) o de creación de proyectos: desplegar el frontend de esta rama o
   `fix/project-create-rls`. Si es el frontend nuevo el que falla: `git revert`
   del merge; las políticas siguen protegiendo con el frontend anterior.
2. **Nivel 2, `05_emergencia_lectura.sql`.** Si alguien imprescindible no
   puede LEER un proyecto que necesita: reabre temporalmente solo la lectura
   de proyectos, y mantiene cerradas las asignaciones, la creación a nombre de
   otra persona, la edición y el borrado ajenos (el ataque encadenado sigue
   bloqueado, comprobado en el ensayo). Retirar con `06_quitar_emergencia.sql`
   y comprobar con `03_post.sql`.
3. **Nivel 3, `04_rollback.sql`.** Último recurso: vuelve **exactamente** a las
   políticas auditadas, sin tocar datos, y **reabre todas las
   vulnerabilidades**. Después, `01_pre.sql` debe dar `estado_auditado = true`.
