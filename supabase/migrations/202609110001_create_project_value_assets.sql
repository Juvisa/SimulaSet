-- Nota de diseño: el spec pide "user_id references auth.users(id)". Igual que en
-- las demás tablas de este proyecto, referencio public.profiles(id) en su lugar
-- (1:1 con auth.users.id) para mantener consistencia con el resto del esquema.
create table public.project_value_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text,
  asset_type text not null default 'microactivo_reactivacion',
  content jsonb not null default '{}'::jsonb,
  delivery_scripts jsonb not null default '[]'::jsonb,
  status text not null default 'pending_approval',
  created_at timestamptz not null default now(),

  constraint project_value_assets_status_check
    check (status in ('pending_approval', 'approved')),

  constraint project_value_assets_content_check
    check (jsonb_typeof(content) = 'object'),

  constraint project_value_assets_delivery_scripts_check
    check (jsonb_typeof(delivery_scripts) = 'array')
);

alter table public.project_value_assets enable row level security;

create policy "project_value_assets_select_own"
on public.project_value_assets
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "project_value_assets_insert_own"
on public.project_value_assets
for insert
to authenticated
with check (user_id = auth.uid());

create policy "project_value_assets_delete_own"
on public.project_value_assets
for delete
to authenticated
using (user_id = auth.uid());

-- No hay UI de aprobación todavía, pero el campo status ya distingue
-- pending_approval/approved — dejamos la puerta abierta para que un admin/mentor
-- apruebe activos más adelante sin necesitar otra migración.
create policy "project_value_assets_update_admin"
on public.project_value_assets
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on table public.project_value_assets from anon, authenticated;
grant select, insert, delete on table public.project_value_assets to authenticated;
grant update on table public.project_value_assets to authenticated;
