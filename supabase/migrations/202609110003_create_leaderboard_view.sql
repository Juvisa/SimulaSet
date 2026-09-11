-- Cuadro de Honor: los alumnos regulares NO pueden leer profiles/user_streaks/
-- simulator_sessions de otros usuarios (RLS: user_id = auth.uid() or is_admin()).
-- Esta vista expone un subconjunto seguro y de solo lectura (nombre + métricas de
-- mérito, sin email ni otros datos sensibles) para que cualquier alumno autenticado
-- pueda ver el ranking, sin abrir las tablas subyacentes.
--
-- Importante: NO se marca security_invoker=true. Sin esa marca, la vista se evalúa
-- con los privilegios de su dueño (quien corre esta migración, típicamente con
-- permisos que ignoran RLS), por lo que SÍ devuelve filas de todos los alumnos que
-- cumplen el WHERE — el control de acceso queda en el propio SELECT/WHERE de la
-- vista (qué columnas y qué filas expone) y en los GRANT de abajo, no en RLS.
create or replace view public.leaderboard_stats as
select
  p.id as user_id,
  p.name,
  p.set_score,
  coalesce(us.lifetime_xp, 0) as lifetime_xp,
  coalesce(us.current_streak, 0) as current_streak,
  (select count(*) from public.simulator_sessions s where s.user_id = p.id) as simulaciones_realizadas,
  (select count(*) from public.daily_mission_progress d where d.user_id = p.id and d.status = 'completed') as misiones_completadas
from public.profiles p
left join public.user_streaks us on us.user_id = p.id
where p.role = 'setter'
  and p.active = true
  and p.name not ilike '%Julieth Alumna%';

revoke all on public.leaderboard_stats from anon, authenticated;
grant select on public.leaderboard_stats to authenticated;
