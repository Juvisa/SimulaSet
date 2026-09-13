-- Cierra el flujo dejado pendiente en 202609110004_add_avatar_to_leaderboard.sql:
-- profiles.avatar_url existía pero no había bucket ni permiso de columna para
-- que un alumno subiera su propia foto desde Profile.jsx. Mismo patrón que
-- 'project-resources' (202609120001): bucket público (el Cuadro de Honor y el
-- roster de admin leen la URL directamente vía <img src>, sin pasar por la API
-- autenticada), RLS sobre storage.objects restringida por carpeta "{uid}/...",
-- con allowed_mime_types/file_size_limit reforzando a nivel de servidor el
-- accept="image/*" del <input type="file">.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy "avatars_insert_own"
on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_update_own"
on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_delete_own"
on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- A diferencia de 'project-resources' (select restringido a own-or-admin), acá
-- cualquier autenticado puede leer cualquier avatar: son visibles para toda la
-- cohorte (Cuadro de Honor, roster de admin), y el bucket público ya expone la
-- URL sin auth de todas formas — restringir el select autenticado sería solo
-- una falsa sensación de privacidad.
create policy "avatars_select_authenticated"
on storage.objects for select to authenticated
using (bucket_id = 'avatars');

-- profiles.avatar_url solo tenía la columna; el grant de update seguía
-- limitado a (name) desde 202608270001_create_profiles_auth.sql.
grant update (avatar_url) on table public.profiles to authenticated;
