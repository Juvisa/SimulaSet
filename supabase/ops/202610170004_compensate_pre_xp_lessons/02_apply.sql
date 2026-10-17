-- COMPENSACIÓN · APLICAR · una sola sentencia (bloque DO): todo o nada.
--
-- Antes de ejecutar, reemplazar los 4 valores marcados con <<…>> usando el
-- resultado revisado de 01_pre.sql. Si queda alguno sin reemplazar, aborta.
-- Idempotente: si el lote ya se aplicó, avisa y no cambia nada.
do $$
declare
  c_batch          constant text := 'pre_xp_lessons_2026_10';
  c_t_xp           constant timestamptz := '2026-09-10 00:18:20+00';
  c_xp             constant integer := 25;
  c_approver_email constant text := '<<EMAIL DEL ADMINISTRADOR QUE APRUEBA>>';
  c_reference      constant text := '<<REFERENCIA DE LA APROBACIÓN (dónde y cuándo)>>';
  c_clases         constant text := '<<CLASES>>';        -- p. ej. 10
  c_fingerprint    constant text := '<<FINGERPRINT>>';   -- de 01_pre.sql
  v_expected integer; v_approver uuid; v_rows integer; v_fp text; v_awarded integer := 0;
  v_total_before bigint; v_life_before bigint; r record;
begin
  if exists (select 1 from public.xp_adjustment_batches where batch_code = c_batch) then
    raise notice 'El lote % ya estaba aplicado: no se hizo ningún cambio.', c_batch;
    return;
  end if;
  if c_approver_email like '<<%' or c_reference like '<<%' or c_clases like '<<%' or c_fingerprint like '<<%' then
    raise exception 'ABORTADO: faltan valores por reemplazar (aprobador, referencia, clases o fingerprint)';
  end if;
  v_expected := c_clases::integer;

  -- Requisito: la fase 3 aplicada (sin escritura directa en lesson_progress),
  -- para que la selección no pueda cambiar desde el navegador.
  if exists (select 1 from pg_class c cross join lateral aclexplode(c.relacl) x
             where c.oid = 'public.lesson_progress'::regclass and x.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
               and (x.grantee = 0 or x.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))) then
    raise exception 'ABORTADO: la migración 202610170003 no está aplicada';
  end if;

  select p.id into v_approver
    from public.profiles p
   where lower(p.email) = lower(btrim(c_approver_email)) and p.role = 'admin' and p.active = true;
  if v_approver is null then
    raise exception 'ABORTADO: % no es un administrador activo de Digital SET', c_approver_email;
  end if;

  perform set_config('lock_timeout', '5s', true);
  lock table public.lesson_progress in share mode;
  lock table public.user_streaks in share row exclusive mode;

  select count(*), md5(coalesce(string_agg(lp.user_id::text || ':' || lp.course_id || '/' || lp.module_id || '/' || lp.lesson_id,
                                           ',' order by lp.user_id, lp.course_id || '/' || lp.module_id || '/' || lp.lesson_id), ''))
    into v_rows, v_fp
    from public.lesson_progress lp
   where (lp.status = 'completed' and lp.completed_at < c_t_xp)
      or (lp.status = 'pending' and lp.updated_at < c_t_xp);
  if v_rows <> v_expected or v_fp <> c_fingerprint then
    raise exception 'ABORTADO: la selección cambió desde el PRE (% clases, fingerprint %)', v_rows, v_fp;
  end if;

  select coalesce(sum(total_xp), 0), coalesce(sum(lifetime_xp), 0) into v_total_before, v_life_before from public.user_streaks;

  for r in
    select lp.user_id, lp.course_id || '/' || lp.module_id || '/' || lp.lesson_id as clase
      from public.lesson_progress lp
     where (lp.status = 'completed' and lp.completed_at < c_t_xp)
        or (lp.status = 'pending' and lp.updated_at < c_t_xp)
  loop
    if public.award_xp_once(r.user_id, 'xp_adjustment', c_batch || ':' || r.clase, c_xp) then
      v_awarded := v_awarded + 1;
    end if;
  end loop;

  if v_awarded <> v_expected then
    raise exception 'ABORTADO: se otorgarían % compensaciones, se esperaban %', v_awarded, v_expected;
  end if;
  if (select coalesce(sum(total_xp), 0) from public.user_streaks) <> v_total_before + v_expected * c_xp
     or (select coalesce(sum(lifetime_xp), 0) from public.user_streaks) <> v_life_before + v_expected * c_xp then
    raise exception 'ABORTADO: el XP total no subió exactamente %', v_expected * c_xp;
  end if;

  insert into public.xp_adjustment_batches
    (batch_code, reason, criteria, approved_by, approved_by_email, approval_reference, rows_awarded, xp_per_row, fingerprint)
  values (c_batch,
          'Clases marcadas antes de que la Academia otorgara XP; el backfill de la fase 1 las registró como premiadas sin haberlo sido.',
          'lesson_progress completada con completed_at < 2026-09-10 00:18:20 UTC (o pendiente con updated_at anterior)',
          v_approver, c_approver_email, c_reference, v_awarded, c_xp, c_fingerprint);
end $$;
