create table public.academy_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id text not null,
  module_id text not null,
  lesson_id text not null,
  title text not null,
  description text not null default '',
  position integer not null default 0,
  topics text[] not null default '{}',
  resources jsonb not null default '[]'::jsonb,
  published boolean not null default false,
  scheduled_at timestamptz,
  video_provider text,
  mux_upload_id text,
  mux_asset_id text,
  mux_playback_id text,
  mux_playback_policy text not null default 'public',
  video_status text not null default 'not_uploaded',
  duration_seconds integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint academy_lessons_identity_unique
    unique (course_id, module_id, lesson_id),

  constraint academy_lessons_course_id_check
    check (nullif(trim(course_id), '') is not null),

  constraint academy_lessons_module_id_check
    check (nullif(trim(module_id), '') is not null),

  constraint academy_lessons_lesson_id_check
    check (nullif(trim(lesson_id), '') is not null),

  constraint academy_lessons_title_check
    check (nullif(trim(title), '') is not null),

  constraint academy_lessons_position_check
    check (position >= 0),

  constraint academy_lessons_resources_check
    check (jsonb_typeof(resources) = 'array'),

  constraint academy_lessons_video_provider_check
    check (video_provider is null or video_provider = 'mux'),

  constraint academy_lessons_mux_playback_policy_check
    check (mux_playback_policy in ('public', 'signed')),

  constraint academy_lessons_video_status_check
    check (video_status in (
      'not_uploaded',
      'waiting_for_upload',
      'uploading',
      'processing',
      'ready',
      'errored'
    )),

  constraint academy_lessons_duration_check
    check (duration_seconds is null or duration_seconds >= 0),

  constraint academy_lessons_video_metadata_check
    check (
      (
        video_status = 'not_uploaded'
        and video_provider is null
        and mux_upload_id is null
        and mux_asset_id is null
        and mux_playback_id is null
        and duration_seconds is null
      )
      or
      (
        video_status <> 'not_uploaded'
        and video_provider = 'mux'
      )
    ),

  constraint academy_lessons_ready_video_check
    check (
      video_status <> 'ready'
      or (
        video_provider = 'mux'
        and mux_asset_id is not null
        and mux_playback_id is not null
      )
    )
);

create index academy_lessons_course_module_position_idx
on public.academy_lessons (course_id, module_id, position);

create index academy_lessons_published_course_module_position_idx
on public.academy_lessons (course_id, module_id, position)
where published = true;

create unique index academy_lessons_mux_upload_id_unique
on public.academy_lessons (mux_upload_id)
where mux_upload_id is not null;

create unique index academy_lessons_mux_asset_id_unique
on public.academy_lessons (mux_asset_id)
where mux_asset_id is not null;

create unique index academy_lessons_mux_playback_id_unique
on public.academy_lessons (mux_playback_id)
where mux_playback_id is not null;

create or replace function public.set_academy_lessons_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger academy_lessons_set_updated_at
before update on public.academy_lessons
for each row
execute function public.set_academy_lessons_updated_at();

alter table public.academy_lessons enable row level security;

create policy "academy_lessons_select_published_or_admin"
on public.academy_lessons
for select
to authenticated
using (
  published = true
  or public.is_admin()
);

create policy "academy_lessons_insert_admin"
on public.academy_lessons
for insert
to authenticated
with check (
  public.is_admin()
);

create policy "academy_lessons_update_admin"
on public.academy_lessons
for update
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

create policy "academy_lessons_delete_admin"
on public.academy_lessons
for delete
to authenticated
using (
  public.is_admin()
);

revoke all on table public.academy_lessons from anon, authenticated;
grant select, insert, update, delete on table public.academy_lessons to authenticated;
