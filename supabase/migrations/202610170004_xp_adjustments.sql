-- Ajustes de XP aprobados por Digital SET (compensaciones), auditables.
--
-- Operación INDEPENDIENTE de la fase 3: no forma parte del despliegue de
-- 202610170003. Procedimiento: supabase/ops/202610170004_compensate_pre_xp_lessons/
--
--   - xp_adjustment_batches: un registro por lote, con motivo, criterio,
--     huella de la selección y el administrador que lo aprobó (FK a su
--     perfil; debe ser admin activo al registrar el lote). Inmutable: no se
--     puede editar ni borrar. Sin escritura de clientes; el admin solo lee.
--   - xp_ledger admite la fuente 'xp_adjustment': cada compensación es una
--     fila del ledger, de modo que award_xp_once() la otorga una sola vez y
--     suma a total_xp y lifetime_xp igual que el XP de clases.
--
-- Solo crea objetos y amplía una restricción: no modifica datos.
-- Revertir (solo si no se aplicó ningún lote): ver 04_rollback_schema.sql.

create table public.xp_adjustment_batches (
  batch_code          text primary key,
  reason              text not null,
  criteria            text not null,
  approved_by         uuid not null references public.profiles (id) on delete restrict,
  approved_by_email   text not null,
  approval_reference  text not null,
  rows_awarded        integer not null,
  xp_per_row          integer not null,
  fingerprint         text not null,
  applied_at          timestamptz not null default now(),
  applied_by_role     text not null default current_user,
  applied_by_session  text not null default session_user,

  constraint xp_adjustment_batches_code_check      check (batch_code ~ '^[a-z0-9_]{3,60}$'),
  constraint xp_adjustment_batches_reason_check    check (char_length(btrim(reason)) between 10 and 500),
  constraint xp_adjustment_batches_criteria_check  check (char_length(btrim(criteria)) between 10 and 500),
  constraint xp_adjustment_batches_reference_check check (char_length(btrim(approval_reference)) between 5 and 300),
  constraint xp_adjustment_batches_rows_check      check (rows_awarded > 0),
  constraint xp_adjustment_batches_xp_check        check (xp_per_row > 0 and xp_per_row <= 1000),
  constraint xp_adjustment_batches_fp_check        check (fingerprint ~ '^[0-9a-f]{32}$')
);

-- El aprobador debe ser un administrador activo en el momento del registro;
-- el email se guarda tal como estaba (foto) para la auditoría.
create or replace function public.guard_xp_adjustment_batches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'xp_adjustment_batches es inmutable: registra un lote nuevo en lugar de modificar uno existente.'
      using errcode = '42501';
  end if;
  select p.email into v_email
    from public.profiles p
   where p.id = new.approved_by and p.role = 'admin' and p.active = true;
  if not found then
    raise exception 'El aprobador debe ser un administrador activo de Digital SET.' using errcode = '42501';
  end if;
  new.approved_by_email := v_email;
  new.applied_at := now();
  new.applied_by_role := current_user;
  new.applied_by_session := session_user;
  return new;
end;
$$;

create trigger xp_adjustment_batches_guard
before insert or update or delete on public.xp_adjustment_batches
for each row execute function public.guard_xp_adjustment_batches();

create trigger xp_adjustment_batches_guard_truncate
before truncate on public.xp_adjustment_batches
for each statement execute function public.guard_xp_adjustment_batches();

alter table public.xp_adjustment_batches enable row level security;

create policy "xp_adjustment_batches_select_admin"
on public.xp_adjustment_batches
for select
to authenticated
using (public.is_admin());

revoke all on table public.xp_adjustment_batches from public, anon, authenticated;
grant select on table public.xp_adjustment_batches to authenticated;
revoke execute on function public.guard_xp_adjustment_batches() from public, anon, authenticated;

alter table public.xp_ledger drop constraint xp_ledger_source_check;
alter table public.xp_ledger add constraint xp_ledger_source_check
  check (source in ('academy_lesson', 'daily_mission', 'community_post', 'xp_adjustment'));
