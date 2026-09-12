-- Fase 3 de la migración de localStorage a Supabase: leads reales + sus
-- mensajes de conversación + seguimientos programados. Antes vivían en
-- 'real_leads_sessions' y 'follow_up_schedule' (localStorage), por lo que
-- ni el alumno los veía entre dispositivos ni el admin podía verlos nunca
-- para otro setter (ambas limitaciones documentadas en el código que esta
-- migración reemplaza).
--
-- Diseño relacional (decisión explícita del usuario): en vez de un campo
-- "conversacion" jsonb que crece sin límite dentro de la fila del lead
-- (mismo antipatrón que ya evitamos al no meter "messages" en
-- simulator_sessions), la conversación vive en su propia tabla
-- real_lead_messages, una fila por turno.

-- ─── real_leads ─────────────────────────────────────────────────────────────
create table public.real_leads (
  id uuid primary key default gen_random_uuid(),
  setter_id uuid not null references public.profiles (id) on delete cascade,
  -- A diferencia de simulator_sessions/analyses (project_id text, sin FK,
  -- para sobrevivir el borrado del proyecto como snapshot histórico puro),
  -- un lead real es trabajo ACTIVO fuertemente ligado a su proyecto — sí
  -- amerita una FK real. project_name igual se guarda congelado para poder
  -- seguir mostrando el lead con gracia si el proyecto se borra después
  -- (mismo patrón "(proyecto eliminado)" que ya usamos en Dashboard).
  project_id uuid references public.projects (id) on delete set null,
  project_name text,
  nombre text not null,
  origen text not null check (origen in ('Inbound', 'Outbound')),
  canal text not null check (canal in ('WhatsApp', 'Instagram DM', 'Comentario', 'Email', 'Otro')),
  dolor_principal text not null,
  nivel_consciencia text not null check (nivel_consciencia in (
    'No sabe que tiene un problema',
    'Sabe que tiene el problema',
    'Está buscando una solución',
    'Está evaluando opciones',
    'Listo para tomar acción'
  )),
  temperatura text not null check (temperatura in ('Frío', 'Tibio', 'Caliente')),
  notas_adicionales text not null default '',
  estado text not null default 'activo' check (estado in (
    'activo', 'agendado', 'no_show', 'cancelado', 'cerrado_ganado', 'cerrado_perdido', 'fantasma'
  )),
  ultimo_contacto timestamptz,
  alerta_fantasma boolean not null default false,
  -- metricas.total_turnos se recalcula desde real_lead_messages en cada
  -- escritura (ver funciones más abajo) en vez de confiar en que el cliente
  -- lo mantenga sincronizado a mano, como pasaba en el código legacy.
  metricas jsonb not null default '{"total_turnos":0,"nivel_interes_actual":0,"etapa_set_actual":"S","reactivaciones_enviadas":0,"apertura_generada":false}'::jsonb,
  -- Se queda embebido (no en tabla aparte): es 1-a-1 con el lead y no crece
  -- sin límite como la conversación, así que no amerita normalizarlo.
  briefing jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint real_leads_nombre_not_blank check (nullif(trim(nombre), '') is not null),
  constraint real_leads_dolor_not_blank check (nullif(trim(dolor_principal), '') is not null)
);

create index real_leads_setter_id_idx on public.real_leads (setter_id);
create index real_leads_project_id_idx on public.real_leads (project_id);

create trigger real_leads_set_updated_at
before update on public.real_leads
for each row execute function public.set_profile_updated_at();

-- ─── follow_ups ─────────────────────────────────────────────────────────────
create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  setter_id uuid not null references public.profiles (id) on delete cascade,
  lead_id uuid not null references public.real_leads (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  programado_para timestamptz not null,
  tipo_seguimiento text not null check (tipo_seguimiento in ('valor', 'angulo', 'reactivacion', 'confirmacion')),
  nota text not null default '',
  -- "vencido" es un estado DERIVADO (programado_para ya pasó y sigue
  -- pendiente) — se calcula al leer, nunca se escribe de vuelta a la fila,
  -- así se evita el side-effect de "leer reescribe localStorage" que tenía
  -- el checker legacy. La columna solo distingue pendiente vs. enviado.
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado')),
  ultima_interaccion text,
  dias_sin_respuesta integer not null default 0,
  temperatura_actual text,
  mensaje_generado jsonb,
  mensaje_enviado text,
  opcion_elegida integer,
  enviado_en timestamptz,
  resultado text,
  created_at timestamptz not null default now()
);

create index follow_ups_setter_id_idx on public.follow_ups (setter_id);
create index follow_ups_lead_id_idx on public.follow_ups (lead_id);
create index follow_ups_pendientes_idx on public.follow_ups (setter_id, programado_para) where estado = 'pendiente';

-- ─── real_lead_messages ─────────────────────────────────────────────────────
create table public.real_lead_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.real_leads (id) on delete cascade,
  tipo text not null check (tipo in ('lead', 'setter_enviado', 'setter_sugerido_no_enviado')),
  mensaje text not null,
  -- Contrato "SET Core v1 Beta" (o el formato legacy "set_engine_v1" en
  -- mensajes históricos) — se guarda como jsonb crudo sin validar estructura
  -- a nivel de base de datos; la validación de forma ya la hace
  -- utils/setEngine.js del lado del cliente antes de llegar aquí.
  analisis_ia jsonb,
  formato text,
  recurso_id text,
  follow_up_id uuid references public.follow_ups (id) on delete set null,
  opcion_elegida integer,
  created_at timestamptz not null default now()
);

create index real_lead_messages_lead_id_idx on public.real_lead_messages (lead_id, created_at);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Cambio de comportamiento deliberado: a diferencia de la limitación
-- documentada en el código legacy ("el admin nunca puede ver leads de OTRO
-- setter"), aquí sí se le da a un admin visibilidad completa vía is_admin(),
-- igual que ya tiene sobre simulator_sessions/analyses.
alter table public.real_leads enable row level security;
alter table public.follow_ups enable row level security;
alter table public.real_lead_messages enable row level security;

create policy "real_leads_select_own_or_admin"
on public.real_leads for select to authenticated
using (setter_id = auth.uid() or public.is_admin());

create policy "real_leads_insert_own"
on public.real_leads for insert to authenticated
with check (setter_id = auth.uid());

create policy "real_leads_update_own_or_admin"
on public.real_leads for update to authenticated
using (setter_id = auth.uid() or public.is_admin())
with check (setter_id = auth.uid() or public.is_admin());

create policy "follow_ups_select_own_or_admin"
on public.follow_ups for select to authenticated
using (setter_id = auth.uid() or public.is_admin());

create policy "follow_ups_insert_own"
on public.follow_ups for insert to authenticated
with check (setter_id = auth.uid());

create policy "follow_ups_update_own"
on public.follow_ups for update to authenticated
using (setter_id = auth.uid())
with check (setter_id = auth.uid());

-- Acceso a los mensajes se resuelve vía el lead dueño (no hay setter_id
-- directo en esta tabla), mismo patrón que project_setters -> projects.
create policy "real_lead_messages_select_own_or_admin"
on public.real_lead_messages for select to authenticated
using (
  public.is_admin()
  or exists (select 1 from public.real_leads rl where rl.id = real_lead_messages.lead_id and rl.setter_id = auth.uid())
);

create policy "real_lead_messages_insert_own"
on public.real_lead_messages for insert to authenticated
with check (
  exists (select 1 from public.real_leads rl where rl.id = real_lead_messages.lead_id and rl.setter_id = auth.uid())
);

revoke all on table public.real_leads from anon, authenticated;
revoke all on table public.follow_ups from anon, authenticated;
revoke all on table public.real_lead_messages from anon, authenticated;

grant select, insert, update on table public.real_leads to authenticated;
grant select, insert, update on table public.follow_ups to authenticated;
grant select, insert on table public.real_lead_messages to authenticated;

-- ─── Cierre del acople pendiente con admin_feedback ─────────────────────────
-- admin_feedback.lead_ref_id se creó sin FK en la fase 1 porque real_leads
-- todavía no existía (comentario explícito en esa migración). Ahora sí.
alter table public.admin_feedback
  add constraint admin_feedback_lead_ref_fkey
  foreign key (lead_ref_id) references public.real_leads (id) on delete cascade;
