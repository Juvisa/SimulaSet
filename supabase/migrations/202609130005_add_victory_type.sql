-- Categoriza las publicaciones tipo 'victoria' en SET WINS para la tarjeta de
-- showcase (borde dorado + badge de tipo de logro bien visible). Nullable:
-- las publicaciones 'rescate'/'criterio' nunca la usan, y las 'victoria' ya
-- existentes quedan sin categorizar (el frontend cae a un badge genérico
-- "🏆 Victoria" cuando victory_type es null).
alter table public.community_posts
  add column if not exists victory_type text;

alter table public.community_posts
  add constraint community_posts_victory_type_check
    check (victory_type is null or victory_type in ('llamada_agendada', 'comision_generada', 'hito_simulador', 'otro'));
