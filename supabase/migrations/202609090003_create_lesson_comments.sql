create table public.lesson_comments (
  id uuid primary key default gen_random_uuid(),
  lesson_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  user_name text not null,
  user_role text not null,
  content text not null,
  timestamp_marker text,
  parent_id uuid references public.lesson_comments (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint lesson_comments_content_check
    check (nullif(trim(content), '') is not null),

  constraint lesson_comments_user_name_check
    check (nullif(trim(user_name), '') is not null),

  constraint lesson_comments_lesson_id_check
    check (nullif(trim(lesson_id), '') is not null),

  constraint lesson_comments_user_role_check
    check (user_role in ('setter', 'admin'))
);

alter table public.lesson_comments enable row level security;

create policy "lesson_comments_select_authenticated"
on public.lesson_comments
for select
to authenticated
using (true);

create policy "lesson_comments_insert_own"
on public.lesson_comments
for insert
to authenticated
with check (user_id = auth.uid());

create policy "lesson_comments_update_own_or_admin"
on public.lesson_comments
for update
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create policy "lesson_comments_delete_own_or_admin"
on public.lesson_comments
for delete
to authenticated
using (user_id = auth.uid() or public.is_admin());

revoke all on table public.lesson_comments from anon, authenticated;
grant select, insert, update, delete on table public.lesson_comments to authenticated;


-- Tabla adicional (no solicitada explícitamente, pero necesaria por seguridad):
-- un contador de "me sirvió" como columna mutable en lesson_comments requeriría una
-- policy de UPDATE abierta a cualquier usuario autenticado, lo que permitiría editar
-- también el contenido/autor de comentarios de otras personas. Esta tabla separada
-- registra un "like" por (comentario, usuario) sin abrir esa puerta.
create table public.lesson_comment_likes (
  comment_id uuid not null references public.lesson_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (comment_id, user_id)
);

alter table public.lesson_comment_likes enable row level security;

create policy "lesson_comment_likes_select_all"
on public.lesson_comment_likes
for select
to authenticated
using (true);

create policy "lesson_comment_likes_insert_own"
on public.lesson_comment_likes
for insert
to authenticated
with check (user_id = auth.uid());

create policy "lesson_comment_likes_delete_own"
on public.lesson_comment_likes
for delete
to authenticated
using (user_id = auth.uid());

revoke all on table public.lesson_comment_likes from anon, authenticated;
grant select, insert, delete on table public.lesson_comment_likes to authenticated;
