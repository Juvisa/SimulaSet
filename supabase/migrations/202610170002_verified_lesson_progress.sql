-- Finalización verificada de clases (fase 1: solo base de datos).
--
-- Tres conceptos separados:
--   1. VISUALIZACIÓN  → lesson_watch_progress: segmentos únicos vistos de un
--      video de Mux, acumulados por el servidor (record_lesson_watch).
--   2. FINALIZACIÓN   → lesson_progress (+ completion_source): la clase
--      queda completada; complete_lesson() exige ≥ 85 % de segmentos únicos
--      en clases con video Mux medible.
--   3. ELEGIBILIDAD   → NO se decide aquí. Las futuras constancias leerán
--      solo completion_source = 'verified_watch'.
--
-- Compatibilidad: no revoca nada todavía. El cliente actual (upsert directo
-- a lesson_progress + addXp) sigue funcionando; un trigger impide que una
-- escritura directa se haga pasar por 'verified_watch'.
--
-- Requiere Postgres ≥ 14 (int4multirange). Supabase usa 15+.

-- ─── 1. Visualización ────────────────────────────────────────────────────────

create table public.lesson_watch_progress (
  user_id               uuid not null references public.profiles (id) on delete cascade,
  lesson_id             uuid not null references public.academy_lessons (id) on delete cascade,
  -- Copia del video medido: si el admin lo reemplaza, el progreso se reinicia.
  mux_asset_id          text not null,
  duration_seconds      integer not null,
  watched               int4multirange not null default '{}',
  watched_seconds       integer not null default 0,
  last_position_seconds integer not null default 0,
  -- Crédito de segundos aceptables (como máximo 2x en tiempo real).
  credit_seconds        integer not null default 30,
  heartbeat_count       integer not null default 0,
  first_watched_at      timestamptz not null default now(),
  last_heartbeat_at     timestamptz not null default now(),

  primary key (user_id, lesson_id),
  constraint lesson_watch_progress_duration_check check (duration_seconds > 0),
  constraint lesson_watch_progress_watched_check check (watched_seconds between 0 and duration_seconds),
  constraint lesson_watch_progress_position_check check (last_position_seconds between 0 and duration_seconds),
  constraint lesson_watch_progress_credit_check check (credit_seconds between 0 and 120),
  constraint lesson_watch_progress_heartbeats_check check (heartbeat_count >= 0)
);

alter table public.lesson_watch_progress enable row level security;

create policy "lesson_watch_progress_select_own_or_admin"
on public.lesson_watch_progress
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

-- Solo lectura para clientes: se escribe exclusivamente con record_lesson_watch().
revoke all on table public.lesson_watch_progress from public, anon, authenticated;
grant select on table public.lesson_watch_progress to authenticated;

-- ─── 2. Finalización: origen de cada clase completada ───────────────────────

alter table public.lesson_progress
  add column completion_source text,
  add column verified_percent numeric(5, 2);

-- Clases ya completadas antes de este control: se conservan, sin verificar.
update public.lesson_progress
   set completion_source = 'legacy_self_reported'
 where status = 'completed';

alter table public.lesson_progress
  add constraint lesson_progress_completion_source_check
    check (
      (status = 'completed' and completion_source in ('verified_watch', 'self_reported', 'legacy_self_reported'))
      or (status = 'pending' and completion_source is null)
    ),
  add constraint lesson_progress_verified_percent_check
    check (
      verified_percent is null
      or (completion_source = 'verified_watch' and verified_percent between 85 and 100)
    );

-- El admin puede leer el progreso (necesario para reportes y constancias).
create policy "lesson_progress_select_admin"
on public.lesson_progress
for select
to authenticated
using (public.is_admin());

-- XP ya otorgado por clases: se registra en el ledger para que verificar una
-- clase después NO vuelva a dar XP. Cualquier fila existente (también las
-- 'pending', que solo existen tras desmarcar) implica que la clase se marcó
-- al menos una vez y ya recibió +25 XP desde el navegador. No toca user_streaks.
insert into public.xp_ledger (user_id, source, source_ref, amount, backfilled)
select lp.user_id, 'academy_lesson', lp.course_id || '/' || lp.module_id || '/' || lp.lesson_id, 25, true
  from public.lesson_progress lp
on conflict (user_id, source, source_ref) do nothing;

-- Escrituras directas desde el navegador (cliente actual): nunca pueden
-- declararse 'verified_watch'. Solo complete_lesson() activa la bandera de
-- transacción app.lesson_completion_rpc (mismo patrón que redeem_reward).
create or replace function public.guard_lesson_progress_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.lesson_completion_rpc', true), '') = 'on' then
    return new;
  end if;

  if new.status = 'completed' then
    if tg_op = 'UPDATE' and old.status = 'completed' then
      new.completion_source := old.completion_source;
      new.verified_percent := old.verified_percent;
    else
      new.completion_source := 'self_reported';
      new.verified_percent := null;
    end if;
  else
    new.completion_source := null;
    new.verified_percent := null;
  end if;
  return new;
end;
$$;

create trigger lesson_progress_guard_source
before insert or update on public.lesson_progress
for each row
execute function public.guard_lesson_progress_source();

-- ─── 3. RPC: registrar visualización ────────────────────────────────────────
-- p_segments: [[inicio, fin], ...] en segundos del video, solo tramos
-- realmente reproducidos (el cliente corta en cada salto). Se pueden reenviar
-- los mismos tramos: la unión de rangos no cuenta dos veces.
-- Defensa en el servidor (no confía en el navegador):
--   - duración y video salen de academy_lessons (webhook de Mux);
--   - tramos recortados a [0, duración] y redondeados hacia dentro;
--   - como máximo 60 tramos por llamada;
--   - crédito: los segundos NUEVOS aceptados no superan 2x el tiempo real
--     transcurrido entre envíos (tope acumulable de 120 s);
--   - FOR UPDATE sobre la fila: pestañas y dispositivos simultáneos se
--     serializan y comparten el mismo crédito.
create or replace function public.record_lesson_watch(
  p_lesson_id uuid,
  p_segments jsonb,
  p_position integer default null
)
returns table (
  watched_seconds integer,
  duration_seconds integer,
  required_seconds integer,
  watched_percent numeric,
  eligible boolean,
  accepted_seconds integer,
  last_position_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_rate          constant numeric := 2;
  c_credit_max    constant integer := 120;
  c_credit_start  constant integer := 30;
  c_min_interval  constant numeric := 3;
  c_max_segments  constant integer := 60;
  v_uid uuid := auth.uid();
  v_lesson record;
  v_row public.lesson_watch_progress%rowtype;
  v_seg jsonb;
  v_start numeric;
  v_end numeric;
  v_incoming int4multirange := '{}';
  v_new int4multirange;
  v_range int4range;
  v_take integer;
  v_credit integer;
  v_accepted integer := 0;
  v_elapsed numeric;
  v_position integer;
  v_required integer;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.active = true) then
    raise exception 'Tu cuenta no está activa.' using errcode = '42501';
  end if;

  select l.id, l.published, l.video_status, l.video_provider, l.mux_asset_id, l.duration_seconds
    into v_lesson
    from public.academy_lessons l
   where l.id = p_lesson_id;
  if not found or v_lesson.published is not true then
    raise exception 'Clase no disponible.' using errcode = 'P0002';
  end if;
  if v_lesson.video_status <> 'ready' or v_lesson.video_provider is distinct from 'mux'
     or v_lesson.mux_asset_id is null or coalesce(v_lesson.duration_seconds, 0) <= 0 then
    raise exception 'Esta clase no admite seguimiento de visualización.' using errcode = '22023';
  end if;

  -- Validación de tramos.
  if p_segments is null or jsonb_typeof(p_segments) is distinct from 'array' then
    raise exception 'Tramos inválidos.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_segments) > c_max_segments then
    raise exception 'Demasiados tramos en un envío.' using errcode = '22023';
  end if;
  for v_seg in select value from jsonb_array_elements(p_segments) loop
    if jsonb_typeof(v_seg) is distinct from 'array' or jsonb_array_length(v_seg) <> 2
       or jsonb_typeof(v_seg -> 0) is distinct from 'number' or jsonb_typeof(v_seg -> 1) is distinct from 'number' then
      raise exception 'Tramo inválido.' using errcode = '22023';
    end if;
    v_start := (v_seg ->> 0)::numeric;
    v_end := (v_seg ->> 1)::numeric;
    if v_start < 0 or v_end <= v_start then
      raise exception 'Tramo inválido.' using errcode = '22023';
    end if;
    -- Redondeo hacia dentro y recorte a la duración real.
    v_start := ceil(v_start);
    v_end := least(floor(v_end), v_lesson.duration_seconds);
    if v_end > v_start then
      v_incoming := v_incoming + int4multirange(int4range(v_start::integer, v_end::integer));
    end if;
  end loop;

  v_position := greatest(0, least(coalesce(p_position, 0), v_lesson.duration_seconds));

  -- Fila del alumno y bloqueo (serializa pestañas/dispositivos).
  insert into public.lesson_watch_progress (user_id, lesson_id, mux_asset_id, duration_seconds, credit_seconds)
  values (v_uid, v_lesson.id, v_lesson.mux_asset_id, v_lesson.duration_seconds, c_credit_start)
  on conflict on constraint lesson_watch_progress_pkey do nothing;

  select * into v_row
    from public.lesson_watch_progress w
   where w.user_id = v_uid and w.lesson_id = v_lesson.id
   for update;

  -- Video reemplazado por el admin: el progreso anterior ya no aplica.
  if v_row.mux_asset_id <> v_lesson.mux_asset_id or v_row.duration_seconds <> v_lesson.duration_seconds then
    v_row.mux_asset_id := v_lesson.mux_asset_id;
    v_row.duration_seconds := v_lesson.duration_seconds;
    v_row.watched := '{}';
    v_row.watched_seconds := 0;
    v_row.last_position_seconds := 0;
    v_row.credit_seconds := c_credit_start;
    v_row.heartbeat_count := 0;
    v_row.last_heartbeat_at := now();
  end if;

  v_required := ceil(v_row.duration_seconds * 0.85)::integer;
  v_elapsed := greatest(extract(epoch from (now() - v_row.last_heartbeat_at)), 0);

  -- Envíos demasiado seguidos: no suman (el cliente reenvía sus tramos luego).
  if v_row.heartbeat_count > 0 and v_elapsed < c_min_interval then
    return query select v_row.watched_seconds, v_row.duration_seconds, v_required,
      round(100.0 * v_row.watched_seconds / v_row.duration_seconds, 2),
      v_row.watched_seconds >= v_required, 0, v_row.last_position_seconds;
    return;
  end if;

  v_credit := least(c_credit_max, v_row.credit_seconds + floor(v_elapsed * c_rate)::integer);

  -- Solo lo NUEVO (no visto antes), en orden, hasta agotar el crédito.
  v_new := v_incoming - v_row.watched;
  for v_range in select r from unnest(v_new) as r order by lower(r) loop
    exit when v_credit <= 0;
    v_take := least(upper(v_range) - lower(v_range), v_credit);
    v_row.watched := v_row.watched + int4multirange(int4range(lower(v_range), lower(v_range) + v_take));
    v_credit := v_credit - v_take;
    v_accepted := v_accepted + v_take;
  end loop;

  select coalesce(sum(upper(r) - lower(r)), 0)::integer into v_row.watched_seconds
    from unnest(v_row.watched) as r;

  update public.lesson_watch_progress w
     set mux_asset_id = v_row.mux_asset_id,
         duration_seconds = v_row.duration_seconds,
         watched = v_row.watched,
         watched_seconds = v_row.watched_seconds,
         last_position_seconds = v_position,
         credit_seconds = v_credit,
         heartbeat_count = v_row.heartbeat_count + 1,
         last_heartbeat_at = now()
   where w.user_id = v_uid and w.lesson_id = v_lesson.id;

  return query select v_row.watched_seconds, v_row.duration_seconds, v_required,
    round(100.0 * v_row.watched_seconds / v_row.duration_seconds, 2),
    v_row.watched_seconds >= v_required, v_accepted, v_position;
end;
$$;

-- ─── 4. RPC: completar una clase ────────────────────────────────────────────
-- Resultado (outcome):
--   completed          → completada ahora (y XP +25 si nunca se otorgó)
--   already_completed  → ya estaba (idempotente; nunca da XP otra vez)
--   upgraded           → era legacy/self_reported y ahora queda verificada
--   not_enough_watch   → clase con video Mux y < 85 % de segmentos únicos
-- Clases sin video Mux medible (enlace externo o sin video): se completan
-- como 'self_reported', igual que hoy. Nunca se desmarca una clase.
create or replace function public.complete_lesson(
  p_course_id text,
  p_module_id text,
  p_lesson_id text
)
returns table (
  outcome text,
  completion_source text,
  watched_percent numeric,
  required_percent integer,
  xp_awarded boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_required_pct constant integer := 85;
  c_lesson_xp    constant integer := 25;
  v_uid uuid := auth.uid();
  v_lesson record;
  v_trackable boolean;
  v_watched integer;
  v_watch_asset text;
  v_pct numeric;
  v_existing record;
  v_source text;
  v_outcome text;
  v_xp boolean;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.active = true) then
    raise exception 'Tu cuenta no está activa.' using errcode = '42501';
  end if;

  select l.id, l.published, l.video_status, l.video_provider, l.mux_asset_id, l.duration_seconds
    into v_lesson
    from public.academy_lessons l
   where l.course_id = p_course_id and l.module_id = p_module_id and l.lesson_id = p_lesson_id;
  if not found or v_lesson.published is not true then
    raise exception 'Clase no disponible.' using errcode = 'P0002';
  end if;

  -- Serializa completar la misma clase desde varias pestañas o dispositivos.
  perform pg_advisory_xact_lock(hashtextextended('complete_lesson:' || v_uid::text || ':' || v_lesson.id::text, 0));

  v_trackable := v_lesson.video_status = 'ready' and v_lesson.video_provider = 'mux'
    and v_lesson.mux_asset_id is not null and coalesce(v_lesson.duration_seconds, 0) > 0;

  select lp.status, lp.completion_source into v_existing
    from public.lesson_progress lp
   where lp.user_id = v_uid and lp.course_id = p_course_id and lp.module_id = p_module_id and lp.lesson_id = p_lesson_id;

  if v_trackable then
    select w.watched_seconds, w.mux_asset_id into v_watched, v_watch_asset
      from public.lesson_watch_progress w
     where w.user_id = v_uid and w.lesson_id = v_lesson.id;
    if v_watch_asset is distinct from v_lesson.mux_asset_id then
      v_watched := 0;
    end if;
    v_pct := round(100.0 * coalesce(v_watched, 0) / v_lesson.duration_seconds, 2);
    if coalesce(v_watched, 0) < ceil(v_lesson.duration_seconds * c_required_pct / 100.0) then
      return query select 'not_enough_watch'::text, v_existing.completion_source, v_pct, c_required_pct, false;
      return;
    end if;
    v_source := 'verified_watch';
  else
    v_source := 'self_reported';
    v_pct := null;
  end if;

  if v_existing.status = 'completed'
     and (v_existing.completion_source = 'verified_watch' or v_source = 'self_reported') then
    v_outcome := 'already_completed';
    v_source := v_existing.completion_source;
  else
    v_outcome := case when v_existing.status = 'completed' then 'upgraded' else 'completed' end;
    perform set_config('app.lesson_completion_rpc', 'on', true);
    insert into public.lesson_progress as lp (user_id, course_id, module_id, lesson_id, status, completed_at, completion_source, verified_percent)
    values (v_uid, p_course_id, p_module_id, p_lesson_id, 'completed', now(), v_source,
            case when v_source = 'verified_watch' then least(v_pct, 100) end)
    on conflict (user_id, course_id, module_id, lesson_id) do update
      set status = 'completed',
          completed_at = coalesce(lp.completed_at, now()),
          completion_source = excluded.completion_source,
          verified_percent = excluded.verified_percent;
    perform set_config('app.lesson_completion_rpc', 'off', true);
  end if;

  -- XP una sola vez por clase (el ledger ya contiene las clases marcadas antes).
  v_xp := public.award_xp_once(v_uid, 'academy_lesson', p_course_id || '/' || p_module_id || '/' || p_lesson_id, c_lesson_xp);

  return query select v_outcome, v_source, v_pct, c_required_pct, v_xp;
end;
$$;

-- ─── 5. Permisos mínimos ────────────────────────────────────────────────────
revoke execute on function public.record_lesson_watch(uuid, jsonb, integer) from public, anon;
revoke execute on function public.complete_lesson(text, text, text) from public, anon;
grant  execute on function public.record_lesson_watch(uuid, jsonb, integer) to authenticated;
grant  execute on function public.complete_lesson(text, text, text) to authenticated;
revoke execute on function public.guard_lesson_progress_source() from public, anon, authenticated, service_role;
