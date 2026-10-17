-- ROLLBACK DE ESQUEMA de 202610170004 · una sola sentencia (bloque DO).
-- Solo revierte la migración (tabla de lotes y fuente 'xp_adjustment') y
-- SOLO si todavía no se otorgó ninguna compensación. Si ya se aplicó un lote,
-- aborta: el XP otorgado no se retira con este script (ver README).
do $$
begin
  if exists (select 1 from public.xp_ledger where source = 'xp_adjustment') then
    raise exception 'ABORTADO: ya hay compensaciones otorgadas; el esquema no se revierte';
  end if;
  drop table if exists public.xp_adjustment_batches;
  drop function if exists public.guard_xp_adjustment_batches();
  alter table public.xp_ledger drop constraint xp_ledger_source_check;
  alter table public.xp_ledger add constraint xp_ledger_source_check
    check (source in ('academy_lesson', 'daily_mission', 'community_post'));
end $$;
