-- redeem_reward(): antes, el canje se hacía en el cliente con un patrón
-- leer-validar-escribir en dos pasos separados (insert en reward_redemptions,
-- luego upsert manual de total_xp) sin ninguna transacción de servidor. Eso
-- permitía doble-canje por condición de carrera (dos clics/pestañas
-- concurrentes leen el mismo total_xp antes de que la primera escritura se
-- refleje) y el "rollback" que el cliente intentaba si el descuento fallaba
-- nunca funcionaba porque reward_redemptions no tenía grant de DELETE.
--
-- Esta función hace todo en una sola sentencia UPDATE atómica: el
-- WHERE total_xp >= p_cost se evalúa bajo el lock de fila de esa sentencia,
-- así que dos llamadas concurrentes se serializan (la segunda ve el saldo ya
-- descontado por la primera) y solo se inserta la redención si el descuento
-- realmente se aplicó.
create or replace function public.redeem_reward(
  p_reward_id text,
  p_reward_title text,
  p_cost integer
)
returns table (
  redemption_id uuid,
  reward_id text,
  reward_title text,
  xp_spent integer,
  status text,
  created_at timestamptz,
  total_xp integer,
  lifetime_xp integer,
  current_streak integer,
  longest_streak integer,
  last_completed_date date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_redemption_id uuid;
  v_created_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'No autenticado.';
  end if;

  if p_cost is null or p_cost <= 0 then
    raise exception 'Costo de canje inválido.';
  end if;

  if nullif(trim(p_reward_id), '') is null or nullif(trim(p_reward_title), '') is null then
    raise exception 'Premio inválido.';
  end if;

  -- Bandera de transacción (se resetea sola al terminar la transacción) que
  -- le indica al trigger de abajo que esta disminución de total_xp es
  -- legítima, porque viene de un canje real y no de un UPDATE directo desde
  -- el cliente.
  perform set_config('app.redeem_in_progress', 'on', true);

  update public.user_streaks
  set total_xp = total_xp - p_cost
  where user_id = v_user_id
    and total_xp >= p_cost;

  if not found then
    raise exception 'No tienes suficiente XP disponible para canjear.';
  end if;

  insert into public.reward_redemptions (user_id, reward_id, reward_title, xp_spent, status)
  values (v_user_id, p_reward_id, p_reward_title, p_cost, 'pending')
  returning id, created_at into v_redemption_id, v_created_at;

  return query
  select
    v_redemption_id,
    p_reward_id,
    p_reward_title,
    p_cost,
    'pending'::text,
    v_created_at,
    us.total_xp,
    us.lifetime_xp,
    us.current_streak,
    us.longest_streak,
    us.last_completed_date
  from public.user_streaks us
  where us.user_id = v_user_id;
end;
$$;

revoke all on function public.redeem_reward(text, text, integer) from public;
grant execute on function public.redeem_reward(text, text, integer) to authenticated;

-- Ningún UPDATE directo desde el cliente (fuera de redeem_reward) puede
-- disminuir total_xp — así nadie puede registrar un "canje" manipulando el
-- saldo a mano sin pasar por el descuento atómico de arriba. Los flujos que
-- OTORGAN xp (addXp en xp.js, applyStreakAndXp en dailyMissions.js) siguen
-- escribiendo total_xp directamente desde el cliente sin pasar por esta
-- función — pero esos solo incrementan el valor, así que nunca activan este
-- guard y no se ven afectados.
create or replace function public.guard_total_xp_decrease()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.total_xp < old.total_xp
     and coalesce(current_setting('app.redeem_in_progress', true), '') <> 'on' then
    raise exception 'total_xp solo puede disminuir a través de un canje válido.';
  end if;
  return new;
end;
$$;

drop trigger if exists user_streaks_guard_total_xp_decrease on public.user_streaks;
create trigger user_streaks_guard_total_xp_decrease
before update on public.user_streaks
for each row
execute function public.guard_total_xp_decrease();

-- El insert directo en reward_redemptions ya no lo necesita el cliente:
-- ahora solo redeem_reward() (security definer, dueño de la tabla) inserta
-- filas, y solo después de haber descontado el XP de verdad. Revocar el
-- insert directo evita que alguien registre un "canje" fantasma sin pasar
-- por el descuento atómico.
revoke insert on table public.reward_redemptions from authenticated;
