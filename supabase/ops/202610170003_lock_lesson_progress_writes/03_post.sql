-- POST · solo lectura. todo_ok debe ser true.
with acl as (
  select case when a.grantee = 0 then 'PUBLIC' else r.rolname end as grantee, a.privilege_type
  from pg_class c cross join lateral aclexplode(c.relacl) a
  left join pg_roles r on r.oid = a.grantee
  where c.oid = 'public.lesson_progress'::regclass
), chk as (
  select
    not exists (select 1 from acl where grantee in ('PUBLIC', 'anon', 'authenticated')
                and privilege_type in ('INSERT', 'UPDATE', 'DELETE'))                         as sin_escritura_directa,
    exists (select 1 from acl where grantee = 'authenticated' and privilege_type = 'SELECT') as alumno_puede_leer,
    not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lesson_progress'
                and policyname in ('lesson_progress_insert_own', 'lesson_progress_update_own')) as politicas_escritura_eliminadas,
    exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lesson_progress'
            and policyname = 'lesson_progress_select_own')                                    as politica_lectura_intacta,
    has_function_privilege('authenticated', 'public.complete_lesson(text,text,text)', 'execute') as complete_lesson_ejecutable,
    not exists (select 1 from public.lesson_progress lp
                where not exists (select 1 from public.xp_ledger x where x.user_id = lp.user_id and x.source = 'academy_lesson'
                                  and x.source_ref = lp.course_id || '/' || lp.module_id || '/' || lp.lesson_id)) as ledger_completo
)
select json_build_object(
  'todo_ok', sin_escritura_directa and alumno_puede_leer and politicas_escritura_eliminadas
             and politica_lectura_intacta and complete_lesson_ejecutable and ledger_completo,
  'detalle', row_to_json(chk),
  -- Comparar con el PRE: solo pueden diferir por actividad normal de alumnos
  -- entre ambos (misiones, clases completadas con el frontend nuevo).
  'lesson_progress', (select json_build_object('filas', count(*), 'completadas', count(*) filter (where status = 'completed'),
      'verified_watch', count(*) filter (where completion_source = 'verified_watch'))
      from public.lesson_progress),
  'xp_ledger_clases', (select count(*) from public.xp_ledger where source = 'academy_lesson'),
  'xp', (select json_build_object('total_xp', coalesce(sum(total_xp), 0), 'lifetime_xp', coalesce(sum(lifetime_xp), 0))
         from public.user_streaks)
) as post
from chk;
