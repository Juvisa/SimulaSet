-- Análisis de conversaciones reales pegadas/subidas en el Analizador
-- (Analyzer.jsx). Antes vivía 100% en localStorage ('simulaset_analyses'),
-- así que ni el propio alumno lo veía en otro dispositivo ni el admin podía
-- verlo de verdad en AdminSetterDetail (leía su propio localStorage, no el
-- del setter).
create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id text,
  project_name text,
  mode text,
  conversation_text text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),

  constraint analyses_conversation_text_not_blank
    check (nullif(trim(conversation_text), '') is not null)
);

create index analyses_user_id_idx on public.analyses (user_id);

alter table public.analyses enable row level security;

create policy "analyses_select_own_or_admin"
on public.analyses
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "analyses_insert_own"
on public.analyses
for insert
to authenticated
with check (user_id = auth.uid());

revoke all on table public.analyses from anon, authenticated;
grant select, insert on table public.analyses to authenticated;
