create table public.onboarding (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  worked_digital_business boolean not null,
  knows_lead boolean not null,
  crm text not null,
  crm_other text,
  worked_setter boolean not null,
  worked_closer boolean not null,
  participated_launch boolean not null,
  sold_by_chat boolean not null,
  primary_goal text not null,
  goal_other text,
  classification text not null,
  experience_score integer not null,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint onboarding_crm_check check (crm in ('none', 'leadsales', 'kommo', 'ghl', 'other')),
  constraint onboarding_goal_check check (primary_goal in (
    'first_opportunity',
    'learn_chat_sales',
    'improve_setter',
    'improve_closer',
    'improve_current_results',
    'other'
  )),
  constraint onboarding_classification_check check (
    classification = case
      when worked_setter or worked_closer or sold_by_chat then 'experienced'
      else 'starter'
    end
  ),
  constraint onboarding_experience_score_check check (experience_score between 0 and 10),
  constraint onboarding_crm_other_check check (
    (crm = 'other' and nullif(trim(crm_other), '') is not null)
    or (crm <> 'other' and crm_other is null)
  ),
  constraint onboarding_goal_other_check check (
    (primary_goal = 'other' and nullif(trim(goal_other), '') is not null)
    or (primary_goal <> 'other' and goal_other is null)
  )
);

alter table public.onboarding enable row level security;

create policy "onboarding_select_own" on public.onboarding
for select to authenticated
using (user_id = auth.uid());

create policy "onboarding_insert_own" on public.onboarding
for insert to authenticated
with check (user_id = auth.uid());

create policy "onboarding_update_own" on public.onboarding
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all on table public.onboarding from anon, authenticated;
grant select, insert, update on table public.onboarding to authenticated;
