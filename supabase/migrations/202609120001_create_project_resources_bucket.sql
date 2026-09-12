-- Bucket para que el setter adjunte PDFs/documentos a la sección "Guías &
-- PDFs" de su proyecto, en vez de depender solo de un link externo. Mismo
-- patrón que 'mission-evidence' (202609090001): bucket público (el link
-- generado se comparte tal cual con leads reales fuera de la app, ver
-- buildFollowUpPrompt en utils/prompts.js), con RLS sobre storage.objects
-- restringida por convención de carpeta "{uid}/...".
--
-- A diferencia de los buckets anteriores, sí se fija allowed_mime_types y
-- file_size_limit (20MB) para reforzar a nivel de servidor la restricción de
-- ".pdf,.doc,.docx" del <input type="file"> — el accept del input es solo
-- una sugerencia de UI, no una validación real.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-resources',
  'project-resources',
  true,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

create policy "project_resources_insert_own"
on storage.objects for insert to authenticated
with check (bucket_id = 'project-resources' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "project_resources_update_own"
on storage.objects for update to authenticated
using (bucket_id = 'project-resources' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'project-resources' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "project_resources_delete_own"
on storage.objects for delete to authenticated
using (bucket_id = 'project-resources' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "project_resources_select_own_or_admin"
on storage.objects for select to authenticated
using (
  bucket_id = 'project-resources'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);
