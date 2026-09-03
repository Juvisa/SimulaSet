create table public.mission_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  mission_id text not null,
  responses jsonb not null default '{}'::jsonb,
  status text not null default 'in_progress',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),

  primary key (user_id, mission_id),

  constraint mission_progress_mission_id_check
    check (nullif(trim(mission_id), '') is not null),

  constraint mission_progress_responses_object_check
    check (jsonb_typeof(responses) = 'object'),

  constraint mission_progress_status_check
    check (status in ('in_progress', 'completed')),

  constraint mission_progress_completed_at_check
    check (
      (status = 'completed' and completed_at is not null)
      or
      (status = 'in_progress' and completed_at is null)
    )
);

create or replace function public.set_mission_progress_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger mission_progress_set_updated_at
before update on public.mission_progress
for each row
execute function public.set_mission_progress_updated_at();

alter table public.mission_progress enable row level security;

create policy "mission_progress_select_own_or_admin"
on public.mission_progress
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "mission_progress_insert_own"
on public.mission_progress
for insert
to authenticated
with check (user_id = auth.uid());

create policy "mission_progress_update_own"
on public.mission_progress
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all on table public.mission_progress from anon, authenticated;
grant select, insert, update on table public.mission_progress to authenticated;
