create table public.lesson_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id text not null,
  module_id text not null,
  lesson_id text not null,
  status text not null default 'pending',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, course_id, module_id, lesson_id),

  constraint lesson_progress_course_id_check
    check (nullif(trim(course_id), '') is not null),

  constraint lesson_progress_module_id_check
    check (nullif(trim(module_id), '') is not null),

  constraint lesson_progress_lesson_id_check
    check (nullif(trim(lesson_id), '') is not null),

  constraint lesson_progress_status_check
    check (status in ('pending', 'completed')),

  constraint lesson_progress_completed_at_check
    check (
      (status = 'completed' and completed_at is not null)
      or
      (status = 'pending' and completed_at is null)
    )
);

create or replace function public.set_lesson_progress_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger lesson_progress_set_updated_at
before update on public.lesson_progress
for each row
execute function public.set_lesson_progress_updated_at();

alter table public.lesson_progress enable row level security;

create policy "lesson_progress_select_own"
on public.lesson_progress
for select
to authenticated
using (user_id = auth.uid());

create policy "lesson_progress_insert_own"
on public.lesson_progress
for insert
to authenticated
with check (user_id = auth.uid());

create policy "lesson_progress_update_own"
on public.lesson_progress
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all on table public.lesson_progress from anon, authenticated;
grant select, insert, update on table public.lesson_progress to authenticated;
