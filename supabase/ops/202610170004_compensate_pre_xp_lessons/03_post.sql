-- COMPENSACIÓN · POST · solo lectura. todo_ok debe ser true.
with lote as (
  select * from public.xp_adjustment_batches where batch_code = 'pre_xp_lessons_2026_10'
), ledger as (
  select count(*) as filas, coalesce(sum(amount), 0) as xp, count(distinct user_id) as alumnos
  from public.xp_ledger
  where source = 'xp_adjustment' and source_ref like 'pre_xp_lessons_2026_10:%' and amount = 25 and not backfilled
)
select json_build_object(
  'todo_ok', exists (select 1 from lote)
             and (select rows_awarded from lote) = (select filas from ledger)
             and exists (select 1 from lote l join public.profiles p on p.id = l.approved_by where p.role = 'admin'),
  'lote', (select json_build_object('aprobado_por', p.name, 'email', l.approved_by_email, 'referencia', l.approval_reference,
             'clases', l.rows_awarded, 'xp_por_clase', l.xp_per_row, 'fingerprint', l.fingerprint,
             'aplicado_en', l.applied_at, 'ejecutado_por', l.applied_by_session)
           from lote l join public.profiles p on p.id = l.approved_by),
  'ledger', (select row_to_json(ledger) from ledger),
  'xp', (select json_build_object('total_xp', coalesce(sum(total_xp), 0), 'lifetime_xp', coalesce(sum(lifetime_xp), 0))
         from public.user_streaks)
) as post_compensacion;
