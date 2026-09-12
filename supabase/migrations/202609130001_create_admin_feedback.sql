-- Feedback que un admin deja sobre una sesión del simulador o sobre el
-- briefing de un lead real agendado. Antes vivía 100% en localStorage
-- ('simulaset_admin_feedback'), así que un setter solo veía feedback si el
-- admin lo había escrito en el MISMO navegador que el setter usaba — en la
-- práctica, nunca funcionaba entre dispositivos distintos.
--
-- El campo "a qué se refiere" es polimórfico en el código legacy (un mismo
-- "sessionId" a veces era el id de una simulator_session, a veces el id de un
-- real_lead). Aquí se modela explícitamente con dos columnas nullable + un
-- check que exige exactamente una de las dos. real_leads todavía no existe
-- como tabla (es la fase 3 de esta migración por partes) — lead_ref_id queda
-- sin foreign key por ahora; se le agregará la referencia real vía
-- "alter table ... add constraint" en la migración que cree real_leads.
create table public.admin_feedback (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  admin_id uuid references public.profiles (id) on delete set null,
  simulator_session_id uuid references public.simulator_sessions (id) on delete cascade,
  lead_ref_id uuid,
  comment text not null,
  seen boolean not null default false,
  created_at timestamptz not null default now(),

  constraint admin_feedback_comment_not_blank
    check (nullif(trim(comment), '') is not null),

  constraint admin_feedback_target_check
    check ((simulator_session_id is not null)::int + (lead_ref_id is not null)::int = 1)
);

create index admin_feedback_target_user_idx on public.admin_feedback (target_user_id);
create index admin_feedback_simulator_session_idx on public.admin_feedback (simulator_session_id);
create index admin_feedback_lead_ref_idx on public.admin_feedback (lead_ref_id);

alter table public.admin_feedback enable row level security;

create policy "admin_feedback_select_own_or_admin"
on public.admin_feedback
for select
to authenticated
using (target_user_id = auth.uid() or public.is_admin());

-- Solo un admin puede escribir feedback, y solo a nombre de sí mismo.
create policy "admin_feedback_insert_admin"
on public.admin_feedback
for insert
to authenticated
with check (public.is_admin() and admin_id = auth.uid());

-- El setter destinatario (o un admin) puede marcarlo como visto — pero el
-- grant de columna de abajo asegura que nadie pueda editar el "comment" de
-- otra persona, solo el estado "seen".
create policy "admin_feedback_update_seen"
on public.admin_feedback
for update
to authenticated
using (target_user_id = auth.uid() or public.is_admin())
with check (target_user_id = auth.uid() or public.is_admin());

revoke all on table public.admin_feedback from anon, authenticated;
grant select, insert on table public.admin_feedback to authenticated;
grant update (seen) on table public.admin_feedback to authenticated;
