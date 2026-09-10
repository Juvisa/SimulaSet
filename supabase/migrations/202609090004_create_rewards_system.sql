-- user_streaks.total_xp ya existía (creado en 202609090001) y hasta ahora solo crecía.
-- A partir de esta migración pasa a ser el saldo DISPONIBLE para canjear (puede bajar).
-- lifetime_xp es nueva: el histórico total ganado, nunca disminuye, y no afecta nivel
-- (el nivel del setter se calcula aparte, a partir de sus sesiones del simulador).
alter table public.user_streaks
  add column if not exists lifetime_xp integer not null default 0;

update public.user_streaks set lifetime_xp = total_xp;

alter table public.user_streaks
  add constraint user_streaks_lifetime_xp_check check (lifetime_xp >= 0);


create table public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reward_id text not null,
  reward_title text not null,
  xp_spent integer not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),

  constraint reward_redemptions_reward_id_check
    check (nullif(trim(reward_id), '') is not null),

  constraint reward_redemptions_reward_title_check
    check (nullif(trim(reward_title), '') is not null),

  constraint reward_redemptions_xp_spent_check
    check (xp_spent > 0),

  constraint reward_redemptions_status_check
    check (status in ('pending', 'delivered'))
);

alter table public.reward_redemptions enable row level security;

create policy "reward_redemptions_select_own_or_admin"
on public.reward_redemptions
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "reward_redemptions_insert_own"
on public.reward_redemptions
for insert
to authenticated
with check (user_id = auth.uid());

create policy "reward_redemptions_update_admin"
on public.reward_redemptions
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on table public.reward_redemptions from anon, authenticated;
grant select, insert on table public.reward_redemptions to authenticated;
grant update on table public.reward_redemptions to authenticated;
