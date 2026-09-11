-- avatar_url no existía en profiles (solo hay campos avatar_* en projects, que
-- describen al PROSPECTO de las simulaciones, no al alumno). Se agrega aquí.
-- Nota: todavía no hay ningún flujo en la app para que un alumno suba su foto
-- (ni en Profile.jsx ni en Supabase Storage) — hasta que se construya eso, esta
-- columna quedará NULL para todos y el Cuadro de Honor mostrará el fallback de
-- iniciales, que es justamente lo que se pidió para ese caso.
alter table public.profiles
  add column if not exists avatar_url text;

-- avatar_url se agrega al FINAL del select (no entre name y set_score): con
-- create or replace view, Postgres exige que las columnas ya existentes
-- mantengan el mismo nombre y posición; solo se pueden agregar columnas nuevas
-- al final sin tener que hacer drop + create.
create or replace view public.leaderboard_stats as
select
  p.id as user_id,
  p.name,
  p.set_score,
  coalesce(us.lifetime_xp, 0) as lifetime_xp,
  coalesce(us.current_streak, 0) as current_streak,
  (select count(*) from public.simulator_sessions s where s.user_id = p.id) as simulaciones_realizadas,
  (select count(*) from public.daily_mission_progress d where d.user_id = p.id and d.status = 'completed') as misiones_completadas,
  p.avatar_url
from public.profiles p
left join public.user_streaks us on us.user_id = p.id
where p.role = 'setter'
  and p.active = true
  and p.name not ilike '%Julieth Alumna%';
