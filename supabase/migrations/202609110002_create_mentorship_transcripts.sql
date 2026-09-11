create table public.mentorship_transcripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_title text,
  session_date date not null default current_date,
  session_type text not null default 'group',
  content text not null,
  created_at timestamptz not null default now(),

  constraint mentorship_transcripts_session_type_check
    check (session_type in ('individual', 'group')),

  constraint mentorship_transcripts_content_check
    check (nullif(trim(content), '') is not null)
);

alter table public.mentorship_transcripts enable row level security;

-- Un alumno SOLO puede leer sus propias transcripciones (RLS estricto, como pediste).
-- Deliberadamente NO puede insertar/editar/borrar las suyas: si pudiera, podría
-- fabricar "acuerdos" falsos y el asistente de mentoría los citaría como reales,
-- rompiendo la garantía de "jamás inventar acuerdos que no figuren en las
-- transcripciones". Las transcripciones las carga el equipo/mentor (admin) después
-- de cada sesión.
create policy "mentorship_transcripts_select_own_or_admin"
on public.mentorship_transcripts
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "mentorship_transcripts_insert_admin"
on public.mentorship_transcripts
for insert
to authenticated
with check (public.is_admin());

create policy "mentorship_transcripts_update_admin"
on public.mentorship_transcripts
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "mentorship_transcripts_delete_admin"
on public.mentorship_transcripts
for delete
to authenticated
using (public.is_admin());

revoke all on table public.mentorship_transcripts from anon, authenticated;
grant select on table public.mentorship_transcripts to authenticated;
grant insert, update, delete on table public.mentorship_transcripts to authenticated;
