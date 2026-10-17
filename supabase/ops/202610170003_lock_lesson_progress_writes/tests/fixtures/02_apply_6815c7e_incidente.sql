-- APLICAR · migración 202610170003 con autoverificación.
-- Solo DESPUÉS de confirmar el frontend nuevo en producción.
-- Los pasos 1 y 2 son idénticos a supabase/migrations/202610170003_lock_lesson_progress_writes.sql.
-- Si cualquier comprobación falla, la transacción se revierte sola (no queda
-- nada a medias). Un timeout de bloqueo también revierte: reintentar luego.
begin isolation level repeatable read;
set local lock_timeout = '5s';
-- Detiene un instante las escrituras sobre lesson_progress (incluido
-- complete_lesson) para que el paso 2 vea todas las filas.
lock table public.lesson_progress in share row exclusive mode;

create temp table _antes on commit drop as
select (select count(*) from public.lesson_progress) as lp_filas,
       (select count(*) from public.lesson_progress where status = 'completed') as lp_completadas,
       (select count(*) from public.lesson_progress where completion_source = 'verified_watch') as lp_verificadas,
       (select count(*) from public.user_streaks) as us_filas,
       (select coalesce(sum(total_xp), 0) from public.user_streaks) as total_xp,
       (select coalesce(sum(lifetime_xp), 0) from public.user_streaks) as lifetime_xp;

-- 1.
revoke insert, update, delete on table public.lesson_progress from public, anon, authenticated;
drop policy if exists "lesson_progress_insert_own" on public.lesson_progress;
drop policy if exists "lesson_progress_update_own" on public.lesson_progress;

-- 2.
insert into public.xp_ledger (user_id, source, source_ref, amount, backfilled)
select lp.user_id, 'academy_lesson', lp.course_id || '/' || lp.module_id || '/' || lp.lesson_id, 25, true
  from public.lesson_progress lp
on conflict (user_id, source, source_ref) do nothing;

do $$
declare a record;
begin
  select * into a from _antes;
  if a.lp_filas <> (select count(*) from public.lesson_progress)
     or a.lp_completadas <> (select count(*) from public.lesson_progress where status = 'completed')
     or a.lp_verificadas <> (select count(*) from public.lesson_progress where completion_source = 'verified_watch') then
    raise exception 'ABORTADO: lesson_progress cambió';
  end if;
  if a.us_filas <> (select count(*) from public.user_streaks)
     or a.total_xp <> (select coalesce(sum(total_xp), 0) from public.user_streaks)
     or a.lifetime_xp <> (select coalesce(sum(lifetime_xp), 0) from public.user_streaks) then
    raise exception 'ABORTADO: el XP cambió';
  end if;
  if exists (select 1 from public.lesson_progress lp
             where not exists (select 1 from public.xp_ledger x where x.user_id = lp.user_id and x.source = 'academy_lesson'
                               and x.source_ref = lp.course_id || '/' || lp.module_id || '/' || lp.lesson_id)) then
    raise exception 'ABORTADO: quedan clases sin registro en el ledger';
  end if;
  if exists (select 1 from pg_class c cross join lateral aclexplode(c.relacl) x
             where c.oid = 'public.lesson_progress'::regclass
               and x.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
               and (x.grantee = 0 or x.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))) then
    raise exception 'ABORTADO: sigue habiendo escritura directa';
  end if;
end $$;

commit;
