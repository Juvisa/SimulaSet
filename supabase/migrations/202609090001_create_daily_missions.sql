create table public.daily_mission_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  mission_date date not null,
  mission_id text not null,
  status text not null default 'pending',
  set_score_achieved integer,
  evidence_url text,
  evidence_note text,
  submitted_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),

  primary key (user_id, mission_date),

  constraint daily_mission_progress_mission_id_check
    check (nullif(trim(mission_id), '') is not null),

  constraint daily_mission_progress_status_check
    check (status in ('pending', 'in_progress', 'in_review', 'completed')),

  constraint daily_mission_progress_score_check
    check (set_score_achieved is null or (set_score_achieved between 0 and 100)),

  constraint daily_mission_progress_completed_at_check
    check (
      (status = 'completed' and completed_at is not null)
      or (status <> 'completed')
    )
);

create or replace function public.set_daily_mission_progress_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger daily_mission_progress_set_updated_at
before update on public.daily_mission_progress
for each row
execute function public.set_daily_mission_progress_updated_at();

alter table public.daily_mission_progress enable row level security;

create policy "daily_mission_progress_select_own_or_admin"
on public.daily_mission_progress
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "daily_mission_progress_insert_own"
on public.daily_mission_progress
for insert
to authenticated
with check (user_id = auth.uid());

create policy "daily_mission_progress_update_own"
on public.daily_mission_progress
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all on table public.daily_mission_progress from anon, authenticated;
grant select, insert, update on table public.daily_mission_progress to authenticated;


create table public.user_streaks (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  total_xp integer not null default 0,
  last_completed_date date,
  updated_at timestamptz not null default now(),

  constraint user_streaks_current_streak_check check (current_streak >= 0),
  constraint user_streaks_longest_streak_check check (longest_streak >= 0),
  constraint user_streaks_total_xp_check check (total_xp >= 0)
);

create trigger user_streaks_set_updated_at
before update on public.user_streaks
for each row
execute function public.set_daily_mission_progress_updated_at();

alter table public.user_streaks enable row level security;

create policy "user_streaks_select_own_or_admin"
on public.user_streaks
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "user_streaks_insert_own"
on public.user_streaks
for insert
to authenticated
with check (user_id = auth.uid());

create policy "user_streaks_update_own"
on public.user_streaks
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all on table public.user_streaks from anon, authenticated;
grant select, insert, update on table public.user_streaks to authenticated;


insert into storage.buckets (id, name, public)
values ('mission-evidence', 'mission-evidence', true)
on conflict (id) do nothing;

create policy "mission_evidence_insert_own"
on storage.objects for insert to authenticated
with check (bucket_id = 'mission-evidence' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "mission_evidence_update_own"
on storage.objects for update to authenticated
using (bucket_id = 'mission-evidence' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'mission-evidence' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "mission_evidence_select_own_or_admin"
on storage.objects for select to authenticated
using (
  bucket_id = 'mission-evidence'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);
