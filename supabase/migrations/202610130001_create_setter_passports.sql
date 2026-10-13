-- SET Passport — bloque 1: perfil profesional DECLARADO por el setter.
--
-- Esta tabla guarda SOLO información autodeclarada (titular, resumen,
-- ubicación, disponibilidad, idiomas, habilidades, herramientas, nichos).
-- NO guarda evidencia de entrenamiento: SET Score (profiles.set_score),
-- simulaciones válidas y nivel de práctica se leen siempre de sus fuentes
-- oficiales y nunca se copian aquí. Tampoco hay credenciales, certificados
-- ni enlaces públicos en este bloque.
--
-- Privacidad: privado por diseño. Solo el propietario lee y escribe; el admin
-- solo lee (sin insert/update/delete). Sin ningún grant a `anon`. Cuando
-- exista el enlace público, se expondrá vía una función con lista blanca de
-- campos, no abriendo esta tabla.
--
-- Solo crea objetos nuevos: no modifica tablas existentes ni borra datos.
-- Revertir: drop table public.setter_passports; drop function
-- public.passport_text_array_ok, public.passport_languages_ok,
-- public.set_setter_passports_updated_at.

-- Validadores reutilizables para las restricciones CHECK (las subconsultas
-- no se permiten directamente en un CHECK, sí dentro de una función inmutable).
create or replace function public.passport_text_array_ok(arr text[], max_items integer, max_len integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(arr) <= max_items
    and not exists (
      select 1 from unnest(arr) as item
      where item is null
         or char_length(btrim(item)) = 0
         or char_length(item) > max_len
    );
$$;

-- languages = [{"language": "Español", "level": "nativo"}, ...]
create or replace function public.passport_languages_ok(langs jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(langs) = 'array'
    and jsonb_array_length(langs) <= 10
    and not exists (
      select 1 from jsonb_array_elements(langs) as item
      where jsonb_typeof(item) <> 'object'
         or jsonb_typeof(item -> 'language') is distinct from 'string'
         or char_length(btrim(item ->> 'language')) = 0
         or char_length(item ->> 'language') > 40
         or (item ->> 'level') is null
         or (item ->> 'level') not in ('basico', 'intermedio', 'avanzado', 'nativo')
    );
$$;

create table public.setter_passports (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  headline text,
  summary text,
  country text,
  city text,
  timezone text,
  availability text,
  hours_per_week integer,
  open_to_opportunities boolean not null default false,
  languages jsonb not null default '[]'::jsonb,
  skills text[] not null default '{}',
  tools text[] not null default '{}',
  niches text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint setter_passports_headline_check
    check (headline is null or char_length(headline) between 1 and 120),
  constraint setter_passports_summary_check
    check (summary is null or char_length(summary) between 1 and 1200),
  constraint setter_passports_country_check
    check (country is null or char_length(country) between 1 and 80),
  constraint setter_passports_city_check
    check (city is null or char_length(city) between 1 and 80),
  constraint setter_passports_timezone_check
    check (timezone is null or char_length(timezone) between 1 and 64),
  constraint setter_passports_availability_check
    check (availability is null or availability in ('full_time', 'part_time', 'freelance', 'not_available')),
  constraint setter_passports_hours_check
    check (hours_per_week is null or hours_per_week between 1 and 80),
  constraint setter_passports_languages_check
    check (public.passport_languages_ok(languages)),
  constraint setter_passports_skills_check
    check (public.passport_text_array_ok(skills, 20, 60)),
  constraint setter_passports_tools_check
    check (public.passport_text_array_ok(tools, 20, 60)),
  constraint setter_passports_niches_check
    check (public.passport_text_array_ok(niches, 10, 60))
);

create or replace function public.set_setter_passports_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger setter_passports_set_updated_at
before update on public.setter_passports
for each row
execute function public.set_setter_passports_updated_at();

alter table public.setter_passports enable row level security;

-- Lectura: propietario o admin (acceso administrativo de solo lectura).
create policy "setter_passports_select_own_or_admin"
on public.setter_passports
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

-- Escritura: solo el propietario y solo con perfil activo (mismo criterio que
-- profiles_update_own_active). El admin no crea ni edita datos declarados.
create policy "setter_passports_insert_own_active"
on public.setter_passports
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.active = true)
);

create policy "setter_passports_update_own_active"
on public.setter_passports
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.active = true)
);

-- Sin policy ni grant de DELETE: el registro se elimina solo en cascada con
-- el perfil. Grants por columna: el cliente no puede escribir created_at ni
-- updated_at (los gestionan el default y el trigger).
-- Se revoca también a PUBLIC: anon y authenticated heredan de PUBLIC, así que
-- cualquier privilegio a nivel de tabla concedido a PUBLIC (por default
-- privileges o manualmente) anularía los grants por columna de abajo.
revoke all on table public.setter_passports from public, anon, authenticated;
grant select on table public.setter_passports to authenticated;
grant insert (
  user_id, headline, summary, country, city, timezone, availability,
  hours_per_week, open_to_opportunities, languages, skills, tools, niches
) on table public.setter_passports to authenticated;
grant update (
  headline, summary, country, city, timezone, availability,
  hours_per_week, open_to_opportunities, languages, skills, tools, niches
) on table public.setter_passports to authenticated;

-- Validadores: puros, inmutables, SIN security definer y sin acceso a tablas,
-- así que no permiten escalar privilegios. Aun así se quita el EXECUTE por
-- defecto (PUBLIC) para que `anon` no pueda invocarlos vía /rpc, y se otorga
-- solo a los roles que escriben en la tabla (las CHECK se evalúan con los
-- privilegios de quien inserta/actualiza). El dueño (postgres) conserva el
-- acceso.
revoke execute on function public.passport_text_array_ok(text[], integer, integer) from public, anon;
revoke execute on function public.passport_languages_ok(jsonb) from public, anon;
grant execute on function public.passport_text_array_ok(text[], integer, integer) to authenticated, service_role;
grant execute on function public.passport_languages_ok(jsonb) to authenticated, service_role;

-- Función del trigger: Postgres solo comprueba EXECUTE al crear el trigger,
-- no cada vez que se dispara, así que quitar el EXECUTE por defecto no afecta
-- a los UPDATE de authenticated. Se revoca a PUBLIC y anon para que no quede
-- invocable de forma directa por roles sin sesión.
revoke execute on function public.set_setter_passports_updated_at() from public, anon;
