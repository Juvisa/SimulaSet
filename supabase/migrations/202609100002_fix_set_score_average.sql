-- Corrige recalculate_set_score(): excluye sesiones sin evaluación real (scores
-- vacío) del promedio. Antes, una sesión con scores=[] se guardaba con
-- average_score=0 y contaminaba el promedio junto a sesiones válidas.
create or replace function public.recalculate_set_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid;
  new_avg numeric;
begin
  target_user := coalesce(new.user_id, old.user_id);

  select coalesce(avg(average_score), 0) into new_avg
  from public.simulator_sessions
  where user_id = target_user
    and jsonb_array_length(scores) > 0;

  update public.profiles
  set set_score = round(new_avg::numeric, 0)
  where id = target_user;

  return coalesce(new, old);
end;
$$;

-- El trigger solo corre a futuro (en nuevos insert/delete). Recalcula set_score
-- para TODOS los perfiles ya existentes con la lógica corregida, de una vez.
update public.profiles p
set set_score = coalesce((
  select round(avg(s.average_score)::numeric, 0)
  from public.simulator_sessions s
  where s.user_id = p.id
    and jsonb_array_length(s.scores) > 0
), 0);
