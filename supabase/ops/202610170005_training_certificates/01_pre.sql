-- PRE · solo lectura. Ejecutar antes de 02_apply.sql y guardar el resultado.
-- Detenerse si algún valor de "requisitos" es false.
with required(course_id, module_id, lesson_id) as (
  values ('set-academy', 'week-01', 'set-method-foundations'),
         ('set-academy', 'week-02', 'conversations-that-book-and-sell'),
         ('set-academy', 'week-03', 'objections-and-follow-up'),
         ('set-academy', 'week-04', 'opportunities-and-interviews')
),
verified as (
  select lp.user_id, count(*) as clases
  from public.lesson_progress lp
  join required r using (course_id, module_id, lesson_id)
  where lp.status = 'completed' and lp.completion_source = 'verified_watch' and lp.verified_percent >= 85
  group by lp.user_id
)
select json_build_object(
  'requisitos', json_build_object(
    'fase3_aplicada', not exists (
        select 1 from pg_class c cross join lateral aclexplode(c.relacl) x
        where c.oid = 'public.lesson_progress'::regclass and x.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
          and (x.grantee = 0 or x.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))),
    'clases_obligatorias_existen', (select count(*) from public.academy_lessons al join required r using (course_id, module_id, lesson_id)) = 4,
    'funcion_is_admin', to_regprocedure('public.is_admin()') is not null,
    'sha256_disponible', to_regprocedure('pg_catalog.sha256(bytea)') is not null,
    'objetos_0005_ausentes', to_regclass('public.issued_credentials') is null
                             and to_regclass('public.credential_definitions') is null
                             and to_regclass('public.credential_events') is null
                             and to_regclass('public.credential_test_accounts') is null),
  'clases_obligatorias', (select json_agg(json_build_object('clase', al.module_id || '/' || al.lesson_id, 'titulo', al.title,
                            'publicada', al.published, 'video', al.video_status) order by al.module_id)
                          from public.academy_lessons al join required r using (course_id, module_id, lesson_id)),
  'alumnos_por_clases_verificadas', json_build_object(
    'con_4', (select count(*) from verified where clases = 4),
    'con_3', (select count(*) from verified where clases = 3),
    'con_1_o_2', (select count(*) from verified where clases between 1 and 2)),
  'referencia', json_build_object(
    'lesson_progress', (select count(*) from public.lesson_progress),
    'xp_total', (select coalesce(sum(total_xp), 0) from public.user_streaks),
    'xp_lifetime', (select coalesce(sum(lifetime_xp), 0) from public.user_streaks))
) as pre_0005;
