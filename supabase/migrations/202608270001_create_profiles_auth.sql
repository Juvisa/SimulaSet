create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text not null,
  role text not null default 'setter',
  level integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('setter', 'admin')),
  constraint profiles_level_check check (level between 1 and 5)
);

create unique index profiles_email_unique on public.profiles (lower(email)) where email is not null;

create or replace function public.set_profile_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_profile_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;

create policy "profiles_select_own_or_admin" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

create policy "profiles_update_own_active" on public.profiles
for update to authenticated
using (id = auth.uid() and active = true)
with check (id = auth.uid() and active = true);

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (name) on table public.profiles to authenticated;
