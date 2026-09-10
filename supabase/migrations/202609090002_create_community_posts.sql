create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  author_name text not null,
  post_type text not null,
  content text not null,
  niche text,
  evidence_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint community_posts_post_type_check
    check (post_type in ('victoria', 'rescate', 'criterio')),

  constraint community_posts_content_check
    check (nullif(trim(content), '') is not null),

  constraint community_posts_author_name_check
    check (nullif(trim(author_name), '') is not null)
);

create trigger community_posts_set_updated_at
before update on public.community_posts
for each row
execute function public.set_daily_mission_progress_updated_at();

alter table public.community_posts enable row level security;

create policy "community_posts_select_all"
on public.community_posts
for select
to authenticated
using (true);

create policy "community_posts_insert_own"
on public.community_posts
for insert
to authenticated
with check (user_id = auth.uid());

create policy "community_posts_update_own_or_admin"
on public.community_posts
for update
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create policy "community_posts_delete_own_or_admin"
on public.community_posts
for delete
to authenticated
using (user_id = auth.uid() or public.is_admin());

revoke all on table public.community_posts from anon, authenticated;
grant select, insert, update, delete on table public.community_posts to authenticated;


create table public.community_post_reactions (
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reaction text not null default 'fire',
  created_at timestamptz not null default now(),

  primary key (post_id, user_id, reaction),

  constraint community_post_reactions_reaction_check
    check (reaction in ('fire'))
);

alter table public.community_post_reactions enable row level security;

create policy "community_post_reactions_select_all"
on public.community_post_reactions
for select
to authenticated
using (true);

create policy "community_post_reactions_insert_own"
on public.community_post_reactions
for insert
to authenticated
with check (user_id = auth.uid());

create policy "community_post_reactions_delete_own"
on public.community_post_reactions
for delete
to authenticated
using (user_id = auth.uid());

revoke all on table public.community_post_reactions from anon, authenticated;
grant select, insert, delete on table public.community_post_reactions to authenticated;


create table public.community_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  author_name text not null,
  content text not null,
  created_at timestamptz not null default now(),

  constraint community_post_comments_content_check
    check (nullif(trim(content), '') is not null),

  constraint community_post_comments_author_name_check
    check (nullif(trim(author_name), '') is not null)
);

alter table public.community_post_comments enable row level security;

create policy "community_post_comments_select_all"
on public.community_post_comments
for select
to authenticated
using (true);

create policy "community_post_comments_insert_own"
on public.community_post_comments
for insert
to authenticated
with check (user_id = auth.uid());

create policy "community_post_comments_update_own"
on public.community_post_comments
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "community_post_comments_delete_own_or_admin"
on public.community_post_comments
for delete
to authenticated
using (user_id = auth.uid() or public.is_admin());

revoke all on table public.community_post_comments from anon, authenticated;
grant select, insert, update, delete on table public.community_post_comments to authenticated;


insert into storage.buckets (id, name, public)
values ('community-posts', 'community-posts', true)
on conflict (id) do nothing;

create policy "community_posts_evidence_insert_own"
on storage.objects for insert to authenticated
with check (bucket_id = 'community-posts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "community_posts_evidence_select_all"
on storage.objects for select to authenticated
using (bucket_id = 'community-posts');
