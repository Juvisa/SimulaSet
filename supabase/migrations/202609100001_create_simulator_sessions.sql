create table public.simulator_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id text,
  project_name text,
  mode text,
  average_score numeric not null default 0,
  final_state text,
  scores jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),

  constraint simulator_sessions_average_score_check
    check (average_score >= 0 and average_score <= 100),

  constraint simulator_sessions_scores_check
    check (jsonb_typeof(scores) = 'array')
);

alter table public.simulator_sessions enable row level security;

create policy "simulator_sessions_select_own_or_admin"
on public.simulator_sessions
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "simulator_sessions_insert_own"
on public.simulator_sessions
for insert
to authenticated
with check (user_id = auth.uid());

revoke all on table public.simulator_sessions from anon, authenticated;
grant select, insert on table public.simulator_sessions to authenticated;


-- profiles.set_score: única fuente de verdad del SET Score. La leen tanto la vista
-- "Soy Comercial" (candado de postulación) como "Soy Empresa" (bandeja de candidatos)
-- en el Opportunity Hub.
--
-- Deliberadamente NO se otorga permiso de UPDATE sobre esta columna a `authenticated`
-- (igual que con verified_status en commercial_profiles): si el cliente pudiera
-- escribirla directamente, cualquiera podría autoinflar su propio score llamando a
-- supabase.from('profiles').update({set_score: 100}) desde la consola del navegador.
-- Solo se recalcula automáticamente vía trigger, a partir de sesiones reales
-- persistidas en simulator_sessions.
alter table public.profiles
  add column if not exists set_score numeric not null default 0;

alter table public.profiles
  add constraint profiles_set_score_check check (set_score >= 0 and set_score <= 100);

create or replace function public.recalculate_set_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid;
  new_avg numeric;
begin
  target_user := coalesce(new.user_id, old.user_id);

  select coalesce(avg(average_score), 0) into new_avg
  from public.simulator_sessions
  where user_id = target_user;

  update public.profiles
  set set_score = round(new_avg::numeric, 0)
  where id = target_user;

  return coalesce(new, old);
end;
$$;

create trigger simulator_sessions_recalculate_set_score
after insert or delete on public.simulator_sessions
for each row
execute function public.recalculate_set_score();
