-- Tienda XP: recompensas digitales de descarga instantánea (7 recursos
-- tácticos S.E.T., 150-1200 XP). A diferencia de las recompensas anteriores
-- (mentoría, auditoría, etc. — entrega manual vía AdminRewards), estas son
-- archivos estáticos que el alumno debe poder descargar apenas canjea, sin
-- que un admin tenga que "entregar" nada a mano.
--
-- Bucket PRIVADO (a diferencia de avatars/mission-evidence/project-resources,
-- que son públicos): el requisito de producto es que el archivo no quede
-- accesible por URL predecible sin haber canjeado. El acceso se resuelve con
-- supabase.storage.createSignedUrl(), que Supabase evalúa contra la política
-- SELECT de abajo antes de emitir la URL — así que ni conociendo el path
-- exacto del archivo se puede generar una URL de descarga sin pasar por RLS.
--
-- Convención de carpeta: '{reward_id}/{nombre_archivo}' — UN solo archivo
-- maestro por recompensa (no por usuario, a diferencia de avatars/mission-evidence),
-- porque es un recurso de solo lectura compartido entre todos los que la canjean.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reward-files',
  'reward-files',
  false,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

-- Solo admin sube/reemplaza los archivos maestros de cada recompensa.
create policy "reward_files_insert_admin"
on storage.objects for insert to authenticated
with check (bucket_id = 'reward-files' and public.is_admin());

create policy "reward_files_update_admin"
on storage.objects for update to authenticated
using (bucket_id = 'reward-files' and public.is_admin())
with check (bucket_id = 'reward-files' and public.is_admin());

create policy "reward_files_delete_admin"
on storage.objects for delete to authenticated
using (bucket_id = 'reward-files' and public.is_admin());

-- El alumno solo puede leer (y por lo tanto generar signed URL de) el archivo
-- de una recompensa que YA canjeó — se verifica contra reward_redemptions,
-- que solo gana filas a través de redeem_reward() (descuento atómico de XP,
-- ver 202609110005_redeem_reward_rpc.sql). No depende del status
-- pending/delivered: para estos recursos digitales el acceso es inmediato
-- desde el momento del canje, ese campo sigue siendo solo para el flujo de
-- entrega manual de las recompensas no-digitales.
create policy "reward_files_select_entitled_or_admin"
on storage.objects for select to authenticated
using (
  bucket_id = 'reward-files'
  and (
    public.is_admin()
    or exists (
      select 1 from public.reward_redemptions rr
      where rr.user_id = auth.uid()
        and rr.reward_id = (storage.foldername(name))[1]
    )
  )
);
