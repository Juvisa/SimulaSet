create table public.projects (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references public.profiles (id),
  name text not null,
  expert_name text,
  niche text,
  promise text,
  price text,
  avatar_business text,
  avatar_current_situation text,
  avatar_pain text,
  avatar_desire text,
  avatar_description text,
  common_objections text,
  testimonials jsonb not null default '[]'::jsonb,
  resources jsonb not null default '[]'::jsonb,
  recursos jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_name_not_blank check (nullif(trim(name), '') is not null),
  constraint projects_testimonials_array check (jsonb_typeof(testimonials) = 'array'),
  constraint projects_resources_array check (jsonb_typeof(resources) = 'array'),
  constraint projects_recursos_object check (jsonb_typeof(recursos) = 'object')
);

create table public.project_setters (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'setter',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id),
  constraint project_setters_role_check check (role in ('setter', 'manager'))
);

create index projects_created_by_idx on public.projects (created_by);
create index projects_updated_at_idx on public.projects (updated_at desc);
create index project_setters_user_id_idx on public.project_setters (user_id);
create index project_setters_active_user_idx on public.project_setters (user_id, project_id)
where active = true;

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_profile_updated_at();

create or replace function public.assign_project_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_setters (project_id, user_id, role, active)
  values (new.id, new.created_by, 'setter', true);
  return new;
end;
$$;

revoke all on function public.assign_project_creator() from public;

create trigger projects_assign_creator
after insert on public.projects
for each row execute function public.assign_project_creator();

alter table public.projects enable row level security;
alter table public.project_setters enable row level security;

create policy "projects_select_assigned_or_admin"
on public.projects
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.project_setters ps
    where ps.project_id = projects.id
      and ps.user_id = auth.uid()
      and ps.active = true
  )
);

create policy "projects_insert_own_or_admin"
on public.projects
for insert
to authenticated
with check (created_by = auth.uid() or public.is_admin());

create policy "projects_update_creator_or_admin"
on public.projects
for update
to authenticated
using (created_by = auth.uid() or public.is_admin())
with check (created_by = auth.uid() or public.is_admin());

create policy "projects_delete_creator_or_admin"
on public.projects
for delete
to authenticated
using (created_by = auth.uid() or public.is_admin());

create policy "project_setters_select_own_or_admin"
on public.project_setters
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "project_setters_insert_admin"
on public.project_setters
for insert
to authenticated
with check (public.is_admin());

create policy "project_setters_update_admin"
on public.project_setters
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "project_setters_delete_admin"
on public.project_setters
for delete
to authenticated
using (public.is_admin());

revoke all on table public.projects from anon, authenticated;
revoke all on table public.project_setters from anon, authenticated;

grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update, delete on table public.project_setters to authenticated;
