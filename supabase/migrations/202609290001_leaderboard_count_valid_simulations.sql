-- leaderboard_stats.simulaciones_realizadas pasa a contar SOLO simulaciones
-- válidas: filas de simulator_sessions con al menos un score
-- (jsonb_array_length(scores) > 0). Es exactamente la misma población que ya
-- usa recalculate_set_score() para el SET Score
-- (202609100002_fix_set_score_average.sql) y la misma definición que el
-- frontend (isValidSimulation en src/utils/practiceLevel.js), para que
-- Dashboard, Profile, Admin, Leaderboard y SET WINS muestren el mismo número y
-- el mismo nivel de práctica.
--
-- Solo cambia la expresión de esa columna. No se tocan datos: ninguna fila de
-- simulator_sessions se modifica ni se borra; las sesiones sin scores siguen
-- existiendo, simplemente dejan de contarse aquí.
--
-- Se usa create or replace view con las mismas columnas, en el mismo orden y
-- con los mismos tipos (count(*) → bigint), así que Postgres lo acepta sin
-- drop + create y se conservan los GRANT existentes (select a authenticated).
create or replace view public.leaderboard_stats as
select
  p.id as user_id,
  p.name,
  p.set_score,
  coalesce(us.lifetime_xp, 0) as lifetime_xp,
  coalesce(us.current_streak, 0) as current_streak,
  (
    select count(*)
    from public.simulator_sessions s
    where s.user_id = p.id
      and jsonb_array_length(s.scores) > 0
  ) as simulaciones_realizadas,
  (select count(*) from public.daily_mission_progress d where d.user_id = p.id and d.status = 'completed') as misiones_completadas,
  p.avatar_url
from public.profiles p
left join public.user_streaks us on us.user_id = p.id
where p.role = 'setter'
  and p.active = true
  and p.name not ilike '%Julieth Alumna%';
