-- XP idempotente: registro de cada recompensa otorgada por el servidor.
--
-- Problema actual: el XP se suma desde el navegador (addXp en xp.js,
-- applyStreakAndXp en dailyMissions.js) con un leer-sumar-escribir sobre
-- user_streaks. Un alumno puede repetir la recompensa (p. ej. desmarcar y
-- volver a marcar una clase) o escribir total_xp directamente.
--
-- Esta migración SOLO crea la infraestructura de servidor. No cambia ningún
-- flujo existente ni revoca permisos todavía (eso llega cuando cada fuente de
-- XP use su RPC; ver plan por fases):
--   - xp_ledger: una fila por recompensa, con UNIQUE (user_id, source,
--     source_ref). La unicidad la garantiza Postgres incluso con solicitudes
--     concurrentes desde varias pestañas o dispositivos.
--   - award_xp_once(): inserta en el ledger y, SOLO si la fila es nueva, suma
--     a total_xp y lifetime_xp en la misma transacción. No la puede llamar
--     ningún cliente: solo otras funciones SECURITY DEFINER.

create table public.xp_ledger (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  source      text not null,
  source_ref  text not null,
  amount      integer not null,
  backfilled  boolean not null default false,
  created_at  timestamptz not null default now(),

  constraint xp_ledger_source_check
    check (source in ('academy_lesson', 'daily_mission', 'community_post')),
  constraint xp_ledger_source_ref_check
    check (char_length(btrim(source_ref)) between 1 and 300),
  constraint xp_ledger_amount_check
    check (amount > 0 and amount <= 1000),
  constraint xp_ledger_unique_award
    unique (user_id, source, source_ref)
);

create index xp_ledger_user_created_idx on public.xp_ledger (user_id, created_at desc);

alter table public.xp_ledger enable row level security;

create policy "xp_ledger_select_own_or_admin"
on public.xp_ledger
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

-- Lectura propia; ninguna escritura directa desde clientes.
revoke all on table public.xp_ledger from public, anon, authenticated;
grant select on table public.xp_ledger to authenticated;

-- Otorga XP una sola vez por (usuario, fuente, referencia). Devuelve true si
-- otorgó, false si esa recompensa ya existía. Atómica: el INSERT ... ON
-- CONFLICT DO NOTHING serializa a dos llamadas simultáneas sobre la misma
-- clave; solo la que inserta suma XP.
create or replace function public.award_xp_once(
  p_user_id uuid,
  p_source text,
  p_source_ref text,
  p_amount integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  if p_user_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'award_xp_once: parámetros inválidos' using errcode = '22023';
  end if;

  insert into public.xp_ledger (user_id, source, source_ref, amount)
  values (p_user_id, p_source, p_source_ref, p_amount)
  on conflict (user_id, source, source_ref) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return false;
  end if;

  -- Solo aumenta: el trigger guard_total_xp_decrease no se activa.
  insert into public.user_streaks (user_id, total_xp, lifetime_xp)
  values (p_user_id, p_amount, p_amount)
  on conflict (user_id) do update
    set total_xp    = public.user_streaks.total_xp + excluded.total_xp,
        lifetime_xp = public.user_streaks.lifetime_xp + excluded.lifetime_xp;

  return true;
end;
$$;

-- Ningún rol de API puede llamarla directamente (evita "regalarse" XP).
revoke execute on function public.award_xp_once(uuid, text, text, integer) from public, anon, authenticated, service_role;
