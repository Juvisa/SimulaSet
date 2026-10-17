-- COMPENSACIÓN · PRE · solo lectura.
-- Clases que la Academia nunca premió: marcadas por última vez antes del
-- 2026-09-10 00:18:20 UTC, cuando empezó el XP de clases. Calcula la huella
-- (fingerprint) que se copia en 02_apply.sql y lista los administradores
-- activos que pueden figurar como aprobadores.
with objetivo as (
  select lp.user_id, p.name, lp.course_id || '/' || lp.module_id || '/' || lp.lesson_id as clase,
         lp.status, lp.completed_at, lp.updated_at
  from public.lesson_progress lp
  join public.profiles p on p.id = lp.user_id
  where (lp.status = 'completed' and lp.completed_at < timestamptz '2026-09-10 00:18:20+00')
     or (lp.status = 'pending' and lp.updated_at < timestamptz '2026-09-10 00:18:20+00')
)
select json_build_object(
  'requisitos', json_build_object(
    'migracion_0003_aplicada', not exists (
        select 1 from pg_class c cross join lateral aclexplode(c.relacl) x
        where c.oid = 'public.lesson_progress'::regclass and x.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
          and (x.grantee = 0 or x.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))),
    'migracion_0004_aplicada', exists (select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'xp_adjustment_batches')
        and exists (select 1 from pg_constraint
        where conname = 'xp_ledger_source_check' and pg_get_constraintdef(oid) like '%xp_adjustment%')),
  'resumen', json_build_object(
    'clases', (select count(*) from objetivo),
    'alumnos', (select count(distinct user_id) from objetivo),
    'xp_a_otorgar', (select count(*) * 25 from objetivo),
    'fingerprint', (select md5(coalesce(string_agg(user_id::text || ':' || clase, ',' order by user_id, clase), '')) from objetivo),
    'lote_ya_aplicado', exists (select 1 from public.xp_ledger
        where source = 'xp_adjustment' and source_ref like 'pre_xp_lessons_2026_10:%')),
  'administradores_activos', (select json_agg(json_build_object('nombre', p.name, 'email', p.email) order by p.name)
        from public.profiles p where p.role = 'admin' and p.active = true),
  'detalle', (select json_agg(json_build_object('alumno', o.name, 'clase', o.clase, 'estado', o.status,
        'marcada', coalesce(o.completed_at, o.updated_at),
        'xp_actual', (select json_build_object('total', us.total_xp, 'lifetime', us.lifetime_xp)
                      from public.user_streaks us where us.user_id = o.user_id))
        order by o.name, o.clase) from objetivo o)
) as pre_compensacion;
