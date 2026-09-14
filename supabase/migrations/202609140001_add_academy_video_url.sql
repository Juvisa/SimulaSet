-- Complemento al pipeline de Mux: permite que un admin publique una clase con
-- un link externo (Loom/YouTube/Vimeo) en vez de subir un MP4, para casos
-- donde la grabación ya vive en otra plataforma o se necesita disponible de
-- inmediato sin esperar el procesamiento de Mux. Es un campo independiente
-- de video_provider/mux_* — no interactúa con esas columnas ni sus checks,
-- así que academy_lessons_video_metadata_check y academy_lessons_ready_video_check
-- siguen aplicando sin cambios solo al pipeline de Mux.
alter table public.academy_lessons
  add column if not exists video_url text;

alter table public.academy_lessons
  add constraint academy_lessons_video_url_check
    check (video_url is null or video_url ~ '^https?://');
