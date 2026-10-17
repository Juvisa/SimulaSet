-- PRE · solo lectura. Ejecutar ANTES del merge y guardar el resultado.
-- Detenerse si fase1_presente tiene algún false.
with acl as (
  select case when a.grantee = 0 then 'PUBLIC' else r.rolname end as grantee, a.privilege_type
  from pg_class c cross join lateral aclexplode(c.relacl) a
  left join pg_roles r on r.oid = a.grantee
  where c.oid = 'public.lesson_progress'::regclass
),
-- Momentos de referencia:
--   t_xp = la Academia empieza a dar +25 XP al marcar (despliegue en
--          producción de 8f7dbb4, 2026-09-10 00:18:20 UTC).
--   t_f1 = se aplicó la fase 1 (primera fila backfilled del ledger).
ref as (
  select timestamptz '2026-09-10 00:18:20+00' as t_xp,
         (select min(created_at) from public.xp_ledger where backfilled) as t_f1
),
lp as (
  select l.*,
         exists (select 1 from public.xp_ledger x where x.user_id = l.user_id and x.source = 'academy_lesson'
                 and x.source_ref = l.course_id || '/' || l.module_id || '/' || l.lesson_id) as en_ledger
  from public.lesson_progress l
),
-- Clasificación según si la clase recibió sus 25 XP desde el navegador.
clas as (
  select lp.*, case
    -- Marcada por última vez antes de que existiera el XP de clases: nunca premiada.
    when (status = 'completed' and completed_at < ref.t_xp)
      or (status = 'pending' and updated_at < ref.t_xp)                   then 'nunca_premiada'
    -- Creada antes de t_xp y desmarcada después: no se sabe si se volvió a marcar ya con XP.
    when status = 'pending' and created_at < ref.t_xp                      then 'ambigua'
    -- Marcada con XP vigente: premiada salvo que addXp fallara en el navegador.
    else 'premiada_salvo_fallo' end as clase
  from lp, ref
),
-- Cota inferior de fallos de addXp: si lifetime_xp no alcanza 25 XP por cada
-- clase "premiada_salvo_fallo", ese alumno tiene con certeza clases sin pagar.
-- (lifetime_xp también incluye XP de comunidad y el saldo previo al 2026-09-11,
-- así que la prueba solo detecta parte de los casos, nunca da falsos positivos.)
deficit as (
  select c.user_id, count(*) as clases, coalesce(max(us.lifetime_xp), 0) as lifetime_xp,
         greatest(0, ceil((count(*) * 25 - coalesce(max(us.lifetime_xp), 0)) / 25.0))::int as sin_pagar_minimo
  from clas c left join public.user_streaks us on us.user_id = c.user_id
  where c.clase = 'premiada_salvo_fallo'
  group by c.user_id
)
select json_build_object(
  'escritura_directa', (select json_object_agg(grantee, privs) from (
      select grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
      from acl where grantee in ('PUBLIC', 'anon', 'authenticated') group by grantee) g),
  'politicas', (select json_agg(policyname order by policyname) from pg_policies
                where schemaname = 'public' and tablename = 'lesson_progress'),
  'fase1_presente', json_build_object(
      'complete_lesson', has_function_privilege('authenticated', 'public.complete_lesson(text,text,text)', 'execute'),
      'record_lesson_watch', has_function_privilege('authenticated', 'public.record_lesson_watch(uuid,jsonb,integer)', 'execute'),
      'trigger_guard', exists (select 1 from pg_trigger where tgname = 'lesson_progress_guard_source'),
      'aplicada_en', (select t_f1 from ref)),
  'lesson_progress', (select json_build_object('filas', count(*),
      'completadas', count(*) filter (where status = 'completed'),
      'verified_watch', count(*) filter (where completion_source = 'verified_watch'),
      'self_reported', count(*) filter (where completion_source = 'self_reported'),
      'legacy_self_reported', count(*) filter (where completion_source = 'legacy_self_reported'))
      from public.lesson_progress),
  'xp_ledger_clases', (select count(*) from public.xp_ledger where source = 'academy_lesson'),
  'xp', (select json_build_object('filas', count(*), 'total_xp', coalesce(sum(total_xp), 0), 'lifetime_xp', coalesce(sum(lifetime_xp), 0))
         from public.user_streaks),
  -- Lo que hará el paso 2 de la migración (filas que se registrarán como premiadas).
  'sin_ledger', (select json_build_object('filas', count(*), 'alumnos', count(distinct user_id),
      'creadas_despues_fase1', count(*) filter (where created_at >= (select t_f1 from ref)))
      from lp where not en_ledger),
  -- Diagnóstico de premiación (requisito 3): cuántas clases figuran o figurarán
  -- como premiadas en el ledger sin haber recibido sus 25 XP.
  'premiacion', json_build_object(
      'nunca_premiada', (select json_build_object('filas', count(*), 'alumnos', count(distinct user_id),
          'ya_en_ledger', count(*) filter (where en_ledger)) from clas where clase = 'nunca_premiada'),
      'ambigua', (select json_build_object('filas', count(*), 'alumnos', count(distinct user_id))
          from clas where clase = 'ambigua'),
      'premiada_salvo_fallo', (select json_build_object('filas', count(*), 'alumnos', count(distinct user_id))
          from clas where clase = 'premiada_salvo_fallo'),
      'fallos_addxp_detectados', (select json_build_object('alumnos', count(*), 'clases_sin_pagar_minimo', coalesce(sum(sin_pagar_minimo), 0))
          from deficit where sin_pagar_minimo > 0))
) as pre;
