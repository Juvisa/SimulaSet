-- APLICAR · migración 202610170003 con autoverificación.
-- Solo DESPUÉS de confirmar el frontend nuevo en producción.
--
-- Es UNA sola sentencia (un bloque DO): Postgres la ejecuta entera o nada,
-- sin depender de cómo el SQL Editor agrupe las sentencias. (Un begin/commit
-- explícito no sirve en el SQL Editor de Supabase: ejecuta cada sentencia por
-- separado.) Si cualquier comprobación falla, lanza 'ABORTADO: …' y no queda
-- nada aplicado. Un timeout de bloqueo también revierte: reintentar luego.
--
-- Los pasos 1 y 2 son idénticos a supabase/migrations/202610170003_lock_lesson_progress_writes.sql.
do $$
declare
  v_lp_filas       bigint;
  v_lp_completadas bigint;
  v_lp_verificadas bigint;
  v_us_filas       bigint;
  v_total_xp       bigint;
  v_lifetime_xp    bigint;
begin
  perform set_config('lock_timeout', '5s', true);
  -- Detienen un instante las escrituras (incluido complete_lesson y el XP)
  -- para que la foto y las comprobaciones vean un estado estable.
  lock table public.lesson_progress in share row exclusive mode;
  lock table public.user_streaks in share mode;

  select count(*), count(*) filter (where status = 'completed'), count(*) filter (where completion_source = 'verified_watch')
    into v_lp_filas, v_lp_completadas, v_lp_verificadas
    from public.lesson_progress;
  select count(*), coalesce(sum(total_xp), 0), coalesce(sum(lifetime_xp), 0)
    into v_us_filas, v_total_xp, v_lifetime_xp
    from public.user_streaks;

  -- 1.
  revoke insert, update, delete on table public.lesson_progress from public, anon, authenticated;
  drop policy if exists "lesson_progress_insert_own" on public.lesson_progress;
  drop policy if exists "lesson_progress_update_own" on public.lesson_progress;

  -- 2.
  insert into public.xp_ledger (user_id, source, source_ref, amount, backfilled)
  select lp.user_id, 'academy_lesson', lp.course_id || '/' || lp.module_id || '/' || lp.lesson_id, 25, true
    from public.lesson_progress lp
  on conflict (user_id, source, source_ref) do nothing;

  -- Autoverificación.
  if v_lp_filas <> (select count(*) from public.lesson_progress)
     or v_lp_completadas <> (select count(*) from public.lesson_progress where status = 'completed')
     or v_lp_verificadas <> (select count(*) from public.lesson_progress where completion_source = 'verified_watch') then
    raise exception 'ABORTADO: lesson_progress cambió';
  end if;
  if v_us_filas <> (select count(*) from public.user_streaks)
     or v_total_xp <> (select coalesce(sum(total_xp), 0) from public.user_streaks)
     or v_lifetime_xp <> (select coalesce(sum(lifetime_xp), 0) from public.user_streaks) then
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
