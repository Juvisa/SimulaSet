-- SET Passport — Bloque 3: perfil profesional estructurado + control de consumo
-- del asistente de IA.
--
-- Qué hace:
--   1. Amplía public.setter_passports con información DECLARADA por el alumno:
--      trayectoria, experiencias, preferencias de oportunidad. Todas las
--      columnas nuevas tienen default: las filas existentes siguen siendo
--      válidas y el cliente actual sigue pudiendo guardar sin cambios.
--   2. Crea public.passport_ai_generations + funciones de reserva/cierre para
--      limitar el asistente (3 generaciones exitosas y 6 intentos por alumno y
--      día, con corte a medianoche de Colombia). Solo las ejecuta el servidor
--      (service_role). Solo guarda metadatos: nunca prompts, respuestas del
--      alumno ni textos generados.
--
-- Qué NO toca: onboarding, commercial_profiles, simulator_sessions, profiles
-- ni las políticas RLS existentes de setter_passports.

-- ─── 1. Validadores (sin SECURITY DEFINER, sin acceso a tablas) ──────────────

-- Arreglo de valores de una lista cerrada: unidimensional, sin nulos, sin
-- duplicados, con tope de elementos. NULL o estructura inesperada → false.
create or replace function public.passport_enum_array_ok(arr text[], allowed text[], max_items integer)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item text;
  seen text[] := '{}';
begin
  if arr is null or allowed is null or max_items is null then
    return false;
  end if;
  if cardinality(arr) = 0 then
    return true;
  end if;
  if array_ndims(arr) <> 1 or cardinality(arr) > max_items then
    return false;
  end if;
  foreach item in array arr loop
    if item is null or not (item = any (allowed)) or item = any (seen) then
      return false;
    end if;
    seen := seen || item;
  end loop;
  return true;
end;
$$;

-- Experiencias declaradas: [{kind, role, context?, period?, functions?[]}].
-- Validación paso a paso (IF anidados) para que ninguna función jsonb se
-- evalúe sobre un tipo inesperado: cualquier entrada inválida devuelve false,
-- nunca un error ni NULL. No admite claves extra (ni cifras, ventas o resultados).
create or replace function public.passport_experiences_ok(items jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  e jsonb;
  f jsonb;
  k text;
  t text;
begin
  if items is null or jsonb_typeof(items) is distinct from 'array' then
    return false;
  end if;
  if jsonb_array_length(items) > 8 or octet_length(items::text) > 20000 then
    return false;
  end if;

  for e in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(e) is distinct from 'object' then
      return false;
    end if;

    for k in select jsonb_object_keys(e) loop
      if k not in ('kind', 'role', 'context', 'period', 'functions') then
        return false;
      end if;
    end loop;

    if jsonb_typeof(e -> 'kind') is distinct from 'string' then
      return false;
    end if;
    if (e ->> 'kind') not in ('setter', 'closer', 'ventas', 'atencion_cliente', 'otro_comercial') then
      return false;
    end if;

    if jsonb_typeof(e -> 'role') is distinct from 'string' then
      return false;
    end if;
    t := e ->> 'role';
    if char_length(btrim(t)) = 0 or char_length(t) > 80 then
      return false;
    end if;

    if e ? 'context' then
      if jsonb_typeof(e -> 'context') is distinct from 'string' then
        return false;
      end if;
      t := e ->> 'context';
      if char_length(btrim(t)) = 0 or char_length(t) > 120 then
        return false;
      end if;
    end if;

    if e ? 'period' then
      if jsonb_typeof(e -> 'period') is distinct from 'string' then
        return false;
      end if;
      t := e ->> 'period';
      if char_length(btrim(t)) = 0 or char_length(t) > 40 then
        return false;
      end if;
    end if;

    if e ? 'functions' then
      if jsonb_typeof(e -> 'functions') is distinct from 'array' then
        return false;
      end if;
      if jsonb_array_length(e -> 'functions') > 8 then
        return false;
      end if;
      for f in select value from jsonb_array_elements(e -> 'functions') loop
        if jsonb_typeof(f) is distinct from 'string' then
          return false;
        end if;
        t := f #>> '{}';
        if char_length(btrim(t)) = 0 or char_length(t) > 80 then
          return false;
        end if;
      end loop;
    end if;
  end loop;

  return true;
end;
$$;

-- ─── 2. Columnas nuevas de setter_passports ─────────────────────────────────

alter table public.setter_passports
  add column experience_track  text,
  add column experiences       jsonb  not null default '[]'::jsonb,
  add column preferred_roles   text[] not null default '{}',
  add column work_modes        text[] not null default '{}',
  add column opportunity_notes text;

alter table public.setter_passports
  add constraint setter_passports_experience_track_check
    check (experience_track is null
           or experience_track in ('setter_closer', 'comercial_transferible', 'en_formacion')),
  add constraint setter_passports_experiences_check
    check (public.passport_experiences_ok(experiences)),
  add constraint setter_passports_preferred_roles_check
    check (public.passport_enum_array_ok(
      preferred_roles, array['setter', 'closer', 'soporte_comercial', 'atencion_cliente'], 4)),
  add constraint setter_passports_work_modes_check
    check (public.passport_enum_array_ok(
      work_modes, array['remoto', 'hibrido', 'presencial'], 3)),
  add constraint setter_passports_opportunity_notes_check
    check (opportunity_notes is null
           or (char_length(btrim(opportunity_notes)) > 0 and char_length(opportunity_notes) <= 300));

-- Permisos por columna para el alumno, igual que las columnas existentes. RLS
-- sin cambios: solo su propia fila y solo si está activo.
grant insert (experience_track, experiences, preferred_roles, work_modes, opportunity_notes)
  on table public.setter_passports to authenticated;
grant update (experience_track, experiences, preferred_roles, work_modes, opportunity_notes)
  on table public.setter_passports to authenticated;

-- ─── 3. Control de consumo del asistente de IA ──────────────────────────────

-- Un registro por intento de generación. Solo metadatos: nunca el prompt, las
-- respuestas del alumno ni el texto generado.
--   pending   → reservado, la IA está generando
--   succeeded → generación entregada (consume del límite diario)
--   failed    → error de IA o salida rechazada (no consume; sí cuenta intento)
--   expired   → reserva abandonada (> 2 min sin cerrar; cuenta intento)
create table public.passport_ai_generations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'pending',
  input_tokens  integer,
  output_tokens integer,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz,

  constraint passport_ai_generations_status_check
    check (status in ('pending', 'succeeded', 'failed', 'expired')),
  constraint passport_ai_generations_finished_check
    check ((status = 'pending') = (finished_at is null)),
  constraint passport_ai_generations_tokens_check
    check ((input_tokens is null or input_tokens >= 0) and (output_tokens is null or output_tokens >= 0))
);

create index passport_ai_generations_user_created_idx
  on public.passport_ai_generations (user_id, created_at desc);

-- RLS activo y SIN políticas: ningún rol de cliente ve ni escribe filas.
alter table public.passport_ai_generations enable row level security;
revoke all on table public.passport_ai_generations from public, anon, authenticated;

-- Inicio del día actual en Colombia (America/Bogota, UTC−5, sin horario de verano).
create or replace function public.passport_ai_day_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('day', now() at time zone 'America/Bogota') at time zone 'America/Bogota';
$$;

-- Consulta de cupo (sin reservar). Uso: acción "status" del endpoint.
create or replace function public.passport_ai_quota(p_user_id uuid)
returns table (used_today integer, remaining_today integer, attempts_today integer, busy boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with today as (
    select g.status, g.created_at
      from public.passport_ai_generations g
     where g.user_id = p_user_id
       and g.created_at >= public.passport_ai_day_start()
  )
  select
    count(*) filter (where status = 'succeeded')::integer,
    greatest(3 - count(*) filter (where status = 'succeeded'), 0)::integer,
    count(*)::integer,
    coalesce(bool_or(status = 'pending' and created_at >= now() - interval '2 minutes'), false)
  from today;
$$;

-- Reserva un intento. Resultado (outcome):
--   reserved           → reservation_id para llamar a la IA
--   busy               → ya hay una generación en curso (doble clic / repetición)
--   limit_reached      → 3 generaciones exitosas hoy
--   attempts_exhausted → 6 intentos hoy (incluidos fallidos y abandonados)
--   not_allowed        → usuario inexistente, inactivo o no alumno
-- Concurrencia: un advisory lock por usuario (transaccional) serializa las
-- reservas del mismo alumno; como solo puede haber un 'pending' a la vez, dos
-- solicitudes simultáneas nunca obtienen dos reservas.
create or replace function public.passport_ai_reserve(p_user_id uuid)
returns table (outcome text, reservation_id uuid, used_today integer, remaining_today integer, attempts_today integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_daily_limit   constant integer := 3;
  c_attempt_limit constant integer := 6;
  v_day_start timestamptz := public.passport_ai_day_start();
  v_used integer;
  v_attempts integer;
  v_pending integer;
  v_id uuid;
begin
  if p_user_id is null or not exists (
    select 1 from public.profiles p
     where p.id = p_user_id and p.active = true and p.role = 'setter'
  ) then
    return query select 'not_allowed'::text, null::uuid, 0, 0, 0;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('passport_ai:' || p_user_id::text, 0));

  update public.passport_ai_generations g
     set status = 'expired', finished_at = now()
   where g.user_id = p_user_id
     and g.status = 'pending'
     and g.created_at < now() - interval '2 minutes';

  select count(*) filter (where g.status = 'succeeded'),
         count(*) filter (where g.status = 'pending'),
         count(*)
    into v_used, v_pending, v_attempts
    from public.passport_ai_generations g
   where g.user_id = p_user_id
     and g.created_at >= v_day_start;

  if v_pending > 0 then
    return query select 'busy'::text, null::uuid, v_used, greatest(c_daily_limit - v_used, 0), v_attempts;
    return;
  end if;
  if v_used >= c_daily_limit then
    return query select 'limit_reached'::text, null::uuid, v_used, 0, v_attempts;
    return;
  end if;
  if v_attempts >= c_attempt_limit then
    return query select 'attempts_exhausted'::text, null::uuid, v_used, greatest(c_daily_limit - v_used, 0), v_attempts;
    return;
  end if;

  insert into public.passport_ai_generations (user_id)
  values (p_user_id)
  returning id into v_id;

  return query select 'reserved'::text, v_id, v_used, c_daily_limit - v_used, v_attempts + 1;
end;
$$;

-- Cierra una reserva propia que siga en 'pending'. Idempotente: un segundo
-- cierre (o el de una reserva ajena, caducada o inexistente) no cambia nada y
-- devuelve 'not_pending'.
create or replace function public.passport_ai_finish(
  p_reservation_id uuid,
  p_user_id uuid,
  p_succeeded boolean,
  p_input_tokens integer default null,
  p_output_tokens integer default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_reservation_id is null or p_user_id is null or p_succeeded is null then
    return 'invalid';
  end if;

  update public.passport_ai_generations g
     set status        = case when p_succeeded then 'succeeded' else 'failed' end,
         finished_at   = now(),
         input_tokens  = case when p_input_tokens  >= 0 then p_input_tokens  end,
         output_tokens = case when p_output_tokens >= 0 then p_output_tokens end
   where g.id = p_reservation_id
     and g.user_id = p_user_id
     and g.status = 'pending'
  returning g.status into v_status;

  return coalesce(v_status, 'not_pending');
end;
$$;

-- ─── 4. Permisos mínimos de funciones ───────────────────────────────────────
-- Supabase concede EXECUTE por defecto a anon/authenticated en funciones
-- nuevas: se revoca explícitamente.

-- Validadores: los CHECK se evalúan con los privilegios de quien escribe.
revoke execute on function public.passport_enum_array_ok(text[], text[], integer) from public, anon;
revoke execute on function public.passport_experiences_ok(jsonb) from public, anon;
grant  execute on function public.passport_enum_array_ok(text[], text[], integer) to authenticated, service_role;
grant  execute on function public.passport_experiences_ok(jsonb) to authenticated, service_role;

-- Cupo de IA: SOLO el servidor. Si un alumno pudiera llamar a
-- passport_ai_finish(…, false) se "devolvería" generaciones.
revoke execute on function public.passport_ai_day_start() from public, anon, authenticated;
revoke execute on function public.passport_ai_quota(uuid) from public, anon, authenticated;
revoke execute on function public.passport_ai_reserve(uuid) from public, anon, authenticated;
revoke execute on function public.passport_ai_finish(uuid, uuid, boolean, integer, integer) from public, anon, authenticated;
grant  execute on function public.passport_ai_day_start() to service_role;
grant  execute on function public.passport_ai_quota(uuid) to service_role;
grant  execute on function public.passport_ai_reserve(uuid) to service_role;
grant  execute on function public.passport_ai_finish(uuid, uuid, boolean, integer, integer) to service_role;
