-- Nota de diseño: el spec original pide "user_id FK a auth.users". Todas las demás
-- tablas de este proyecto referencian public.profiles(id) en su lugar (que ya es 1:1
-- con auth.users.id) para mantener consistencia con el resto del esquema y evitar
-- referenciar directamente el schema interno `auth` de Supabase. Se mantiene la misma
-- integridad referencial.

create table public.commercial_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role_type text not null,
  primary_niche text not null,
  ticket_experience text,
  monthly_lead_capacity integer,
  bio_pitch text,
  verified_status boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint commercial_profiles_role_type_check
    check (role_type in ('setter', 'closer', 'sales_leader')),

  constraint commercial_profiles_primary_niche_check
    check (nullif(trim(primary_niche), '') is not null),

  constraint commercial_profiles_capacity_check
    check (monthly_lead_capacity is null or monthly_lead_capacity >= 0)
);

create or replace function public.set_opportunity_marketplace_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger commercial_profiles_set_updated_at
before update on public.commercial_profiles
for each row
execute function public.set_opportunity_marketplace_updated_at();

-- verified_status es un flag de vetting: un alumno puede editar el resto de su
-- perfil libremente, pero no puede auto-verificarse. Solo admin puede cambiarlo.
create or replace function public.protect_commercial_profile_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_admin() then
    new.verified_status := old.verified_status;
  end if;
  return new;
end;
$$;

create trigger commercial_profiles_protect_verification
before update on public.commercial_profiles
for each row
execute function public.protect_commercial_profile_verification();

alter table public.commercial_profiles enable row level security;

create policy "commercial_profiles_select_verified_own_or_admin"
on public.commercial_profiles
for select
to authenticated
using (verified_status = true or user_id = auth.uid() or public.is_admin());

create policy "commercial_profiles_insert_own"
on public.commercial_profiles
for insert
to authenticated
with check (user_id = auth.uid());

create policy "commercial_profiles_update_own_or_admin"
on public.commercial_profiles
for update
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

revoke all on table public.commercial_profiles from anon, authenticated;
grant select, insert, update on table public.commercial_profiles to authenticated;


create table public.company_vacancies (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  industry_niche text not null,
  role_needed text not null,
  offer_ticket_range text,
  compensation_type text not null,
  compensation_details text,
  min_set_score integer not null default 70,
  spots integer not null default 1,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint company_vacancies_company_name_check
    check (nullif(trim(company_name), '') is not null),

  constraint company_vacancies_role_needed_check
    check (role_needed in ('setter', 'closer', 'sales_leader')),

  constraint company_vacancies_compensation_type_check
    check (compensation_type in ('base_plus_comm', 'comm_only', 'fixed')),

  constraint company_vacancies_min_set_score_check
    check (min_set_score between 0 and 100),

  constraint company_vacancies_spots_check
    check (spots > 0),

  constraint company_vacancies_status_check
    check (status in ('open', 'closed'))
);

create trigger company_vacancies_set_updated_at
before update on public.company_vacancies
for each row
execute function public.set_opportunity_marketplace_updated_at();

alter table public.company_vacancies enable row level security;

-- Nota: no existe todavía un rol/cuenta de "empresa" en profiles (solo setter/admin).
-- Por ahora, la gestión de vacantes queda en manos de admin (representando al equipo
-- DIGITAL SET operando el marketplace en nombre de las empresas). Cuando exista un
-- rol de empresa real, esta policy se puede ampliar.
create policy "company_vacancies_select_open_or_admin"
on public.company_vacancies
for select
to authenticated
using (status = 'open' or public.is_admin());

create policy "company_vacancies_insert_admin"
on public.company_vacancies
for insert
to authenticated
with check (public.is_admin());

create policy "company_vacancies_update_admin"
on public.company_vacancies
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "company_vacancies_delete_admin"
on public.company_vacancies
for delete
to authenticated
using (public.is_admin());

revoke all on table public.company_vacancies from anon, authenticated;
grant select on table public.company_vacancies to authenticated;
grant insert, update, delete on table public.company_vacancies to authenticated;


create table public.talent_matches (
  id uuid primary key default gen_random_uuid(),
  vacancy_id uuid not null references public.company_vacancies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  match_score integer not null,
  status text not null default 'matched',
  company_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (vacancy_id, user_id),

  constraint talent_matches_match_score_check
    check (match_score between 0 and 100),

  constraint talent_matches_status_check
    check (status in ('matched', 'interview_requested', 'accepted', 'declined'))
);

create trigger talent_matches_set_updated_at
before update on public.talent_matches
for each row
execute function public.set_opportunity_marketplace_updated_at();

alter table public.talent_matches enable row level security;

create policy "talent_matches_select_own_or_admin"
on public.talent_matches
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "talent_matches_insert_own"
on public.talent_matches
for insert
to authenticated
with check (user_id = auth.uid());

-- El alumno crea su propia solicitud de match; solo admin (en representación de la
-- empresa) puede aceptarla/rechazarla o anotar company_notes.
create policy "talent_matches_update_admin"
on public.talent_matches
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on table public.talent_matches from anon, authenticated;
grant select, insert on table public.talent_matches to authenticated;
grant update on table public.talent_matches to authenticated;


-- Seed: 2 vacantes de prueba
insert into public.company_vacancies
  (company_name, industry_niche, role_needed, offer_ticket_range, compensation_type, compensation_details, min_set_score, spots, status)
values
  ('Infoproducto Alto Ticket · Coaching de Negocios', 'Infoproductos High Ticket', 'setter', '$1,500 - $3,000', 'base_plus_comm',
   'Base fija + comisión por cita efectiva agendada. Turno flexible, 100% remoto.', 70, 2, 'open'),
  ('Agencia B2B · Software para Clínicas', 'Software B2B', 'closer', '$2,000+', 'comm_only',
   'Comisión pura sobre ventas cerradas, ticket promedio $2,400. Leads calificados entregados por el equipo de setters.', 75, 1, 'open');
