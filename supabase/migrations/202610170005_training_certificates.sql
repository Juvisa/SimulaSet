-- Constancia de Formación Digital SET: emisión desde el servidor, código
-- único, registro auditable y verificación pública de autenticidad.
--
-- Qué acredita: la visualización registrada del recorrido formativo (las
-- cuatro clases obligatorias con completion_source = 'verified_watch' y
-- verified_percent >= 85). NO evalúa competencias ni es una certificación
-- profesional. No usa simulaciones.
--
-- Seguridad (mismo patrón que complete_lesson):
--   - ningún cliente escribe estas tablas; el alumno solo lee lo suyo;
--   - issue_training_certificate() toma la identidad de auth.uid(), vuelve a
--     comprobar las cuatro clases en la base y exige el consentimiento de
--     visibilidad pública vigente;
--   - las credenciales emitidas son inmutables: no se editan ni se borran,
--     solo se revocan (revoke_credential, sin acceso desde la API) y queda
--     constancia en credential_events;
--   - verify_credential() es pública (anon) y devuelve solo nombre, título,
--     emisor, fecha y estado: nunca el id de usuario, el email ni la evidencia.
--
-- Procedimiento, controles y rollback condicionado:
-- supabase/ops/202610170005_training_certificates/

-- ─── 1. Catálogo de credenciales (versionado) ──────────────────────────────
create table public.credential_definitions (
  code            text not null,
  version         integer not null,
  title           text not null,
  issuer          text not null,
  description     text not null,
  criteria        jsonb not null,
  consent_version text not null,
  consent_text    text not null,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),

  constraint credential_definitions_pkey primary key (code, version),
  constraint credential_definitions_code_check check (code ~ '^[a-z0-9_]{3,60}$'),
  constraint credential_definitions_version_check check (version > 0)
);

create unique index credential_definitions_one_active
  on public.credential_definitions (code) where active;

insert into public.credential_definitions (code, version, title, issuer, description, criteria, consent_version, consent_text)
values (
  'digital_set_training_certificate',
  1,
  'Constancia de Formación Digital SET',
  'DIGITAL SET',
  'Acredita la visualización registrada del recorrido formativo de Digital SET: las cuatro clases obligatorias, cada una vista al menos en un 85 % según el registro de visualización de SimulaSET. No evalúa competencias ni constituye una certificación profesional.',
  '{"completion_source": "verified_watch", "min_verified_percent": 85, "required_lessons": [
     {"course_id": "set-academy", "module_id": "week-01", "lesson_id": "set-method-foundations"},
     {"course_id": "set-academy", "module_id": "week-02", "lesson_id": "conversations-that-book-and-sell"},
     {"course_id": "set-academy", "module_id": "week-03", "lesson_id": "objections-and-follow-up"},
     {"course_id": "set-academy", "module_id": "week-04", "lesson_id": "opportunities-and-interviews"}]}'::jsonb,
  'publica_v1',
  'Acepto que mi nombre completo, el título de la constancia, el emisor, la fecha de emisión y su estado sean visibles para cualquier persona que tenga el enlace de verificación.'
);

-- ─── 2. Cuentas de prueba (sus constancias quedan marcadas como prueba) ────
create table public.credential_test_accounts (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  note          text not null,
  registered_by uuid not null references public.profiles (id),
  registered_at timestamptz not null default now(),

  constraint credential_test_accounts_note_check check (char_length(btrim(note)) between 3 and 300)
);

-- ─── 3. Credenciales emitidas ──────────────────────────────────────────────
create table public.issued_credentials (
  id                  uuid primary key default gen_random_uuid(),
  public_code         text not null,
  user_id             uuid not null references public.profiles (id) on delete restrict,
  definition_code     text not null,
  definition_version  integer not null,
  title               text not null,
  issuer              text not null,
  holder_name         text not null,
  evidence            jsonb not null,
  evidence_sha256     text not null,
  consent_version     text not null,
  consent_at          timestamptz not null,
  is_test             boolean not null default false,
  status              text not null default 'active',
  issued_at           timestamptz not null default now(),
  revoked_at          timestamptz,
  revoked_by          uuid references public.profiles (id),
  revoked_reason_code text,
  revoked_note        text,

  constraint issued_credentials_definition_fkey
    foreign key (definition_code, definition_version) references public.credential_definitions (code, version),
  constraint issued_credentials_public_code_unique unique (public_code),
  constraint issued_credentials_public_code_check
    check (public_code ~ '^DSF-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$'),
  constraint issued_credentials_holder_check check (char_length(btrim(holder_name)) between 1 and 200),
  constraint issued_credentials_sha_check check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  constraint issued_credentials_status_check check (status in ('active', 'revoked')),
  constraint issued_credentials_reason_check
    check (revoked_reason_code is null or revoked_reason_code in ('prueba', 'error_emision', 'solicitud_titular', 'fraude', 'otro')),
  constraint issued_credentials_revocation_check check (
    (status = 'active' and revoked_at is null and revoked_by is null and revoked_reason_code is null and revoked_note is null)
    or (status = 'revoked' and revoked_at is not null and revoked_by is not null and revoked_reason_code is not null)
  )
);

-- Una sola constancia activa por alumno y tipo.
create unique index issued_credentials_one_active
  on public.issued_credentials (user_id, definition_code) where status = 'active';
create index issued_credentials_user_idx on public.issued_credentials (user_id);

-- ─── 4. Auditoría (solo se agregan filas) ──────────────────────────────────
create table public.credential_events (
  id            bigint generated always as identity primary key,
  credential_id uuid not null references public.issued_credentials (id) on delete restrict,
  event         text not null,
  actor         uuid references public.profiles (id),
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),

  constraint credential_events_event_check check (event in ('issued', 'revoked'))
);

create index credential_events_credential_idx on public.credential_events (credential_id);

-- ─── 5. Inmutabilidad ──────────────────────────────────────────────────────
-- Las credenciales solo se crean desde issue_training_certificate() y solo
-- cambian para revocarse desde revoke_credential() (banderas de transacción,
-- mismo patrón que complete_lesson y redeem_reward). Nunca se borran.
create or replace function public.guard_issued_credentials()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' then
    if coalesce(current_setting('app.credential_issue', true), '') <> 'on' then
      raise exception 'Las credenciales solo se emiten desde el servidor.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(current_setting('app.credential_revoke', true), '') <> 'on' then
      raise exception 'Las credenciales emitidas son inmutables: solo pueden revocarse.' using errcode = '42501';
    end if;
    if old.status <> 'active' or new.status <> 'revoked'
       or (new.id, new.public_code, new.user_id, new.definition_code, new.definition_version, new.title, new.issuer,
           new.holder_name, new.evidence, new.evidence_sha256, new.consent_version, new.consent_at, new.is_test, new.issued_at)
          is distinct from
          (old.id, old.public_code, old.user_id, old.definition_code, old.definition_version, old.title, old.issuer,
           old.holder_name, old.evidence, old.evidence_sha256, old.consent_version, old.consent_at, old.is_test, old.issued_at) then
      raise exception 'La revocación solo puede cambiar el estado de una credencial activa.' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'Las credenciales emitidas no se borran: se revocan.' using errcode = '42501';
end;
$fn$;

create trigger issued_credentials_guard
before insert or update or delete on public.issued_credentials
for each row execute function public.guard_issued_credentials();

create trigger issued_credentials_guard_truncate
before truncate on public.issued_credentials
for each statement execute function public.guard_issued_credentials();

create or replace function public.guard_credential_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT'
     and (coalesce(current_setting('app.credential_issue', true), '') = 'on'
          or coalesce(current_setting('app.credential_revoke', true), '') = 'on') then
    return new;
  end if;
  raise exception 'La auditoría de credenciales solo admite nuevos eventos del servidor.' using errcode = '42501';
end;
$fn$;

create trigger credential_events_guard
before insert or update or delete on public.credential_events
for each row execute function public.guard_credential_events();

create trigger credential_events_guard_truncate
before truncate on public.credential_events
for each statement execute function public.guard_credential_events();

-- Una versión publicada no cambia de contenido; solo puede activarse o retirarse.
create or replace function public.guard_credential_definitions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'UPDATE'
     and (new.code, new.version, new.title, new.issuer, new.description, new.criteria, new.consent_version, new.consent_text, new.created_at)
         is not distinct from
         (old.code, old.version, old.title, old.issuer, old.description, old.criteria, old.consent_version, old.consent_text, old.created_at) then
    return new;
  end if;
  raise exception 'Una versión de credencial publicada no se modifica ni se borra: crea una versión nueva.' using errcode = '42501';
end;
$fn$;

create trigger credential_definitions_guard
before update or delete on public.credential_definitions
for each row execute function public.guard_credential_definitions();

-- ─── 6. Permisos ───────────────────────────────────────────────────────────
alter table public.credential_definitions enable row level security;
alter table public.credential_test_accounts enable row level security;
alter table public.issued_credentials enable row level security;
alter table public.credential_events enable row level security;

revoke all on table public.credential_definitions, public.credential_test_accounts,
  public.issued_credentials, public.credential_events from public, anon, authenticated;

-- El catálogo es público (título, emisor, criterio).
create policy "credential_definitions_select_all"
on public.credential_definitions for select to anon, authenticated using (true);
grant select on table public.credential_definitions to anon, authenticated;

-- Cada alumno ve sus credenciales; el admin, todas. Nadie escribe.
create policy "issued_credentials_select_own_or_admin"
on public.issued_credentials for select to authenticated
using (user_id = auth.uid() or public.is_admin());
grant select on table public.issued_credentials to authenticated;

create policy "credential_events_select_admin"
on public.credential_events for select to authenticated using (public.is_admin());
grant select on table public.credential_events to authenticated;

create policy "credential_test_accounts_select_admin"
on public.credential_test_accounts for select to authenticated using (public.is_admin());
grant select on table public.credential_test_accounts to authenticated;

-- ─── 7. Evaluación (interna) ───────────────────────────────────────────────
create or replace function public.evaluate_training_certificate(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_def public.credential_definitions;
  v_lessons jsonb;
  v_eligible boolean;
begin
  select * into v_def from public.credential_definitions
   where code = 'digital_set_training_certificate' and active;
  if not found then
    raise exception 'No hay una definición activa de la constancia.' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'course_id', req.item->>'course_id',
           'module_id', req.item->>'module_id',
           'lesson_id', req.item->>'lesson_id',
           'title', coalesce(al.title, req.item->>'lesson_id'),
           'status', coalesce(lp.status, 'pending'),
           'completion_source', lp.completion_source,
           'verified_percent', lp.verified_percent,
           'completed_at', lp.completed_at,
           'ok', coalesce(lp.status = 'completed'
                          and lp.completion_source = v_def.criteria->>'completion_source'
                          and lp.verified_percent >= (v_def.criteria->>'min_verified_percent')::numeric, false))
           order by req.ord), '[]'::jsonb),
         coalesce(bool_and(coalesce(lp.status = 'completed'
                          and lp.completion_source = v_def.criteria->>'completion_source'
                          and lp.verified_percent >= (v_def.criteria->>'min_verified_percent')::numeric, false)), false)
    into v_lessons, v_eligible
    from jsonb_array_elements(v_def.criteria->'required_lessons') with ordinality as req(item, ord)
    left join public.lesson_progress lp
      on lp.user_id = p_user_id
     and lp.course_id = req.item->>'course_id'
     and lp.module_id = req.item->>'module_id'
     and lp.lesson_id = req.item->>'lesson_id'
    left join public.academy_lessons al
      on al.course_id = req.item->>'course_id'
     and al.module_id = req.item->>'module_id'
     and al.lesson_id = req.item->>'lesson_id';

  return jsonb_build_object(
    'definition', jsonb_build_object(
      'code', v_def.code, 'version', v_def.version, 'title', v_def.title, 'issuer', v_def.issuer,
      'description', v_def.description, 'consent_version', v_def.consent_version, 'consent_text', v_def.consent_text,
      'criteria', v_def.criteria),
    'lessons', v_lessons,
    'eligible', v_eligible and jsonb_array_length(v_lessons) > 0
  );
end;
$fn$;

-- Vista pública mínima de una credencial (la usan las funciones de abajo).
create or replace function public.credential_public_view(p_credential public.issued_credentials)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select jsonb_build_object(
    'public_code', p_credential.public_code,
    'title', p_credential.title,
    'issuer', p_credential.issuer,
    'holder_name', p_credential.holder_name,
    'issued_at', p_credential.issued_at,
    'status', p_credential.status,
    'revoked_at', p_credential.revoked_at,
    'is_test', p_credential.is_test,
    'description', (select d.description from public.credential_definitions d
                     where d.code = p_credential.definition_code and d.version = p_credential.definition_version)
  )
$fn$;

-- ─── 8. Estado para el alumno ──────────────────────────────────────────────
create or replace function public.get_training_certificate_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_eval jsonb;
  v_active public.issued_credentials;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;
  v_eval := public.evaluate_training_certificate(v_uid);
  select * into v_active from public.issued_credentials
   where user_id = v_uid and definition_code = 'digital_set_training_certificate' and status = 'active';
  return v_eval || jsonb_build_object(
    'credential', case when v_active.id is null then null else public.credential_public_view(v_active) end,
    'blocked', exists (select 1 from public.issued_credentials
                        where user_id = v_uid and definition_code = 'digital_set_training_certificate'
                          and status = 'revoked' and revoked_reason_code = 'fraude')
  );
end;
$fn$;

-- ─── 9. Emisión ────────────────────────────────────────────────────────────
create or replace function public.issue_training_certificate(p_consent_version text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_profile record;
  v_eval jsonb;
  v_existing public.issued_credentials;
  v_new public.issued_credentials;
  v_evidence jsonb;
  v_hex text;
  v_code text;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;
  select p.id, p.name, p.role, p.active into v_profile from public.profiles p where p.id = v_uid;
  if not found or v_profile.active is not true or v_profile.role <> 'setter' then
    raise exception 'Solo un alumno activo puede emitir su constancia.' using errcode = '42501';
  end if;

  -- Serializa emisiones simultáneas del mismo alumno (varias pestañas).
  perform pg_advisory_xact_lock(hashtextextended('issue_training_certificate:' || v_uid::text, 0));

  select * into v_existing from public.issued_credentials
   where user_id = v_uid and definition_code = 'digital_set_training_certificate' and status = 'active';
  if found then
    return jsonb_build_object('outcome', 'already_issued', 'credential', public.credential_public_view(v_existing));
  end if;

  if exists (select 1 from public.issued_credentials
              where user_id = v_uid and definition_code = 'digital_set_training_certificate'
                and status = 'revoked' and revoked_reason_code = 'fraude') then
    return jsonb_build_object('outcome', 'blocked');
  end if;

  v_eval := public.evaluate_training_certificate(v_uid);

  if p_consent_version is distinct from v_eval->'definition'->>'consent_version' then
    return jsonb_build_object('outcome', 'consent_required');
  end if;
  if not (v_eval->>'eligible')::boolean then
    return jsonb_build_object('outcome', 'not_eligible', 'lessons', v_eval->'lessons');
  end if;
  if char_length(btrim(coalesce(v_profile.name, ''))) = 0 then
    return jsonb_build_object('outcome', 'name_required');
  end if;

  v_evidence := jsonb_build_object(
    'definition', jsonb_build_object('code', v_eval->'definition'->>'code', 'version', (v_eval->'definition'->>'version')::integer),
    'criteria', v_eval->'definition'->'criteria',
    'lessons', (select jsonb_agg(jsonb_build_object(
                  'course_id', l->>'course_id', 'module_id', l->>'module_id', 'lesson_id', l->>'lesson_id',
                  'completion_source', l->>'completion_source', 'verified_percent', (l->>'verified_percent')::numeric,
                  'completed_at', l->>'completed_at'))
                from jsonb_array_elements(v_eval->'lessons') l),
    'evaluated_at', now()
  );

  loop
    v_hex := upper(replace(gen_random_uuid()::text, '-', ''));
    v_code := 'DSF-' || substr(v_hex, 1, 4) || '-' || substr(v_hex, 5, 4) || '-' || substr(v_hex, 9, 4) || '-' || substr(v_hex, 13, 4);
    exit when not exists (select 1 from public.issued_credentials where public_code = v_code);
  end loop;

  perform set_config('app.credential_issue', 'on', true);
  insert into public.issued_credentials (
    public_code, user_id, definition_code, definition_version, title, issuer, holder_name,
    evidence, evidence_sha256, consent_version, consent_at, is_test
  ) values (
    v_code, v_uid, v_eval->'definition'->>'code', (v_eval->'definition'->>'version')::integer,
    v_eval->'definition'->>'title', v_eval->'definition'->>'issuer', btrim(v_profile.name),
    v_evidence, encode(sha256(convert_to(v_evidence::text, 'UTF8')), 'hex'), p_consent_version, now(),
    exists (select 1 from public.credential_test_accounts t where t.user_id = v_uid)
  ) returning * into v_new;
  insert into public.credential_events (credential_id, event, actor, detail)
  values (v_new.id, 'issued', v_uid, jsonb_build_object('consent_version', p_consent_version, 'is_test', v_new.is_test));
  perform set_config('app.credential_issue', 'off', true);

  return jsonb_build_object('outcome', 'issued', 'credential', public.credential_public_view(v_new));
end;
$fn$;

-- ─── 10. Verificación pública ──────────────────────────────────────────────
create or replace function public.verify_credential(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_credential public.issued_credentials;
begin
  if v_code !~ '^DSF-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$' then
    return jsonb_build_object('found', false);
  end if;
  select * into v_credential from public.issued_credentials where public_code = v_code;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object('found', true) || public.credential_public_view(v_credential);
end;
$fn$;

-- ─── 11. Operaciones de administración (solo SQL Editor) ───────────────────
-- Sin acceso desde la API: el aprobador se identifica por el email de un
-- administrador activo y queda registrado como actor.
create or replace function public.revoke_credential(p_code text, p_reason_code text, p_note text, p_admin_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_admin uuid;
  v_credential public.issued_credentials;
begin
  select p.id into v_admin from public.profiles p
   where lower(p.email) = lower(btrim(p_admin_email)) and p.role = 'admin' and p.active = true;
  if v_admin is null then
    raise exception 'ABORTADO: % no es un administrador activo.', p_admin_email;
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'ABORTADO: la nota de revocación es obligatoria.';
  end if;
  select * into v_credential from public.issued_credentials where public_code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'ABORTADO: no existe la credencial %.', p_code;
  end if;
  if v_credential.status = 'revoked' then
    return jsonb_build_object('outcome', 'already_revoked', 'credential', public.credential_public_view(v_credential));
  end if;

  perform set_config('app.credential_revoke', 'on', true);
  update public.issued_credentials
     set status = 'revoked', revoked_at = now(), revoked_by = v_admin,
         revoked_reason_code = p_reason_code, revoked_note = btrim(p_note)
   where id = v_credential.id
  returning * into v_credential;
  insert into public.credential_events (credential_id, event, actor, detail)
  values (v_credential.id, 'revoked', v_admin, jsonb_build_object('reason_code', p_reason_code, 'note', btrim(p_note)));
  perform set_config('app.credential_revoke', 'off', true);

  return jsonb_build_object('outcome', 'revoked', 'credential', public.credential_public_view(v_credential));
end;
$fn$;

create or replace function public.register_credential_test_account(p_user_email text, p_note text, p_admin_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_admin uuid;
  v_user uuid;
begin
  select p.id into v_admin from public.profiles p
   where lower(p.email) = lower(btrim(p_admin_email)) and p.role = 'admin' and p.active = true;
  if v_admin is null then
    raise exception 'ABORTADO: % no es un administrador activo.', p_admin_email;
  end if;
  select p.id into v_user from public.profiles p where lower(p.email) = lower(btrim(p_user_email));
  if v_user is null then
    raise exception 'ABORTADO: no existe un perfil con el email %.', p_user_email;
  end if;
  insert into public.credential_test_accounts (user_id, note, registered_by)
  values (v_user, btrim(p_note), v_admin)
  on conflict (user_id) do nothing;
  return jsonb_build_object('outcome', 'registered', 'user_id', v_user);
end;
$fn$;

-- ─── 12. Permisos de ejecución ─────────────────────────────────────────────
revoke execute on function public.guard_issued_credentials() from public, anon, authenticated, service_role;
revoke execute on function public.guard_credential_events() from public, anon, authenticated, service_role;
revoke execute on function public.guard_credential_definitions() from public, anon, authenticated, service_role;
revoke execute on function public.evaluate_training_certificate(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.credential_public_view(public.issued_credentials) from public, anon, authenticated, service_role;
revoke execute on function public.revoke_credential(text, text, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.register_credential_test_account(text, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.get_training_certificate_status() from public, anon;
revoke execute on function public.issue_training_certificate(text) from public, anon;
revoke execute on function public.verify_credential(text) from public;
grant execute on function public.get_training_certificate_status() to authenticated;
grant execute on function public.issue_training_certificate(text) to authenticated;
grant execute on function public.verify_credential(text) to anon, authenticated;
