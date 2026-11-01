// Ensayo de la migración 202611020001 (seguridad de projects y project_setters)
// en PGlite (Postgres en memoria). NO se conecta a Supabase. Todos los datos
// son ficticios y las pruebas destructivas ocurren solo aquí.
//
// Uso, desde la raíz del repo (no modifica package.json):
//   npm i --no-save @electric-sql/pglite
//   node supabase/ops/202611020001_secure_projects_rls/tests/rehearsal.mjs
//
// Parte del ESTADO AUDITADO DE PRODUCCIÓN (2026-11-01): migraciones del repo +
// las políticas abiertas que tenía producción. Cada escenario corre en modo
// "script" y "editor" (como el SQL Editor), con y sin los default privileges
// de Supabase.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OPS = fileURLToPath(new URL('../', import.meta.url));
const MIG = fileURLToPath(new URL('../../../migrations/', import.meta.url));
const read = (path) => readFileSync(path, 'utf8');
const MIGRATION = read(MIG + '202611020001_secure_projects_rls.sql');
const ops = (file) => read(OPS + file);

const results = [];
const check = (combo, name, ok, detail = '') => results.push({ combo, name, ok: Boolean(ok), detail: ok ? '' : String(detail).slice(0, 240) });

// Divide un script en sentencias respetando comentarios y bloques $tag$ … $tag$.
const splitSql = (sql) => {
  const out = []; let cur = ''; let i = 0; let tag = null; let inLine = false; let inStr = false;
  while (i < sql.length) {
    if (!tag && !inStr && !inLine && sql.startsWith('--', i)) inLine = true;
    if (inLine) { if (sql[i] === '\n') inLine = false; cur += sql[i++]; continue; }
    if (!tag && sql[i] === "'") { inStr = !inStr; cur += sql[i++]; continue; }
    if (inStr) { cur += sql[i++]; continue; }
    const m = sql.slice(i).match(/^\$[A-Za-z_]*\$/);
    if (m) {
      if (!tag) tag = m[0]; else if (m[0] === tag) tag = null;
      cur += m[0]; i += m[0].length; continue;
    }
    if (!tag && sql[i] === ';') { out.push(cur); cur = ''; i++; continue; }
    cur += sql[i++];
  }
  out.push(cur);
  return out.map((x) => x.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
};
const runEditor = async (db, sql) => {
  for (const st of splitSql(sql)) {
    await db.exec('begin');
    try { await db.exec(st); await db.exec('commit'); } catch (e) { await db.exec('rollback'); throw e; }
  }
};
const run = (db, sql, editor) => (editor ? runEditor(db, sql) : db.exec(sql));
const attempt = async (fn) => { try { await fn(); return ''; } catch (e) { return e.message; } };

const U = (c) => `00000000-0000-0000-0000-0000000000${c}`;
const OWNER = U('01');    // dueña del proyecto
const SETTER = U('02');   // setter asignado por un admin
const OTHER = U('03');    // alumna ajena
const ADMIN = U('ad');
const P1 = '10000000-0000-0000-0000-000000000001'; // de la dueña, con la setter asignada
const P2 = '10000000-0000-0000-0000-000000000002'; // de la dueña (para borrarlo ella misma)
const P3 = '10000000-0000-0000-0000-000000000003'; // de la alumna ajena

// Políticas de producción según la auditoría (las del repo se sustituyen).
const PROD_STATE = `
  drop policy if exists "projects_select_assigned_or_admin" on public.projects;
  drop policy if exists "projects_insert_own_or_admin" on public.projects;
  drop policy if exists "projects_update_creator_or_admin" on public.projects;
  create policy "projects_select_authenticated" on public.projects for select to authenticated
    using ((created_by = auth.uid()) or (exists (select 1 from public.project_setters ps where ps.project_id = projects.id and ps.user_id = auth.uid())) or true);
  create policy "projects_insert_authenticated" on public.projects for insert to authenticated with check (true);
  create policy "projects_update_authenticated" on public.projects for update to authenticated
    using (created_by = auth.uid()) with check (created_by = auth.uid());
  create policy "project_setters_policy" on public.project_setters for all to authenticated using (true) with check (true);`;

async function setup({ defaults, prod = true }) {
  const db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role;`);
  if (defaults) await db.exec(`alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`);
  for (const f of ['202608270001_create_profiles_auth.sql', '202609020001_create_project_central.sql', '202609120002_fix_project_delete_policy.sql',
    '202609110001_create_project_value_assets.sql', '202609100001_create_simulator_sessions.sql', '202609130001_create_admin_feedback.sql', '202609130003_create_real_leads.sql']) await db.exec(read(MIG + f));
  if (prod) await db.exec(PROD_STATE);
  await db.exec(`insert into auth.users (id, email) values ('${OWNER}', 'duena@x'), ('${SETTER}', 'setter@x'), ('${OTHER}', 'ajena@x'), ('${ADMIN}', 'admin@x');
    update public.profiles set role = 'admin' where id = '${ADMIN}';
    insert into public.projects (id, created_by, name, price) values
      ('${P1}', '${OWNER}', 'Agenda Llena', '1.997 USD'), ('${P2}', '${OWNER}', 'Proyecto viejo', null), ('${P3}', '${OTHER}', 'Proyecto de la ajena', null);
    insert into public.project_setters (project_id, user_id, role, active) values ('${P1}', '${SETTER}', 'setter', true);
    insert into public.project_value_assets (project_id, user_id, title) values ('${P1}', '${OWNER}', 'Activo de la dueña'), ('${P2}', '${OWNER}', 'Activo del proyecto viejo');
    insert into public.real_leads (setter_id, project_id, project_name, nombre, origen, canal, dolor_principal, nivel_consciencia, temperatura)
      values ('${OWNER}', '${P1}', 'Agenda Llena', 'Lead de la dueña', 'Inbound', 'WhatsApp', 'Agenda vacía', 'Sabe que tiene el problema', 'Tibio'),
             ('${OTHER}', '${P1}', 'Agenda Llena', 'Lead de la ajena en un proyecto ajeno', 'Outbound', 'Email', 'Ninguno', 'Sabe que tiene el problema', 'Frío');
    insert into public.simulator_sessions (user_id, project_id, project_name, mode, average_score, scores) values
      ('${OTHER}', '${P1}', 'Agenda Llena', 'outbound', 70, '[7]'::jsonb),
      ('${SETTER}', '${P1}', 'Agenda Llena', 'outbound', 60, '[6]'::jsonb);`);
  const as = async (uid, sql, params = []) => {
    try {
      await db.exec('begin');
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid || '']);
      await db.exec(`set local role ${uid ? 'authenticated' : 'anon'}`);
      const r = await db.query(sql, params);
      await db.exec('commit');
      return { rows: r.rows, n: r.affectedRows ?? r.rows.length };
    } catch (e) { await db.exec('rollback'); return { error: e.message, rows: [], n: 0 }; }
  };
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  return { db, as, one };
}

// Crear como lo hace supabase-js con .insert().select() (PostgREST: INSERT … RETURNING en un CTE).
const PGRST_INSERT = `with pgrst_source as (
  insert into public.projects (id, name, created_by)
  select b.id, b.name, coalesce(b.created_by, auth.uid()) from json_populate_record(null::public.projects, $1::json) b
  returning public.projects.*)
select count(*)::int as n, coalesce(json_agg(pgrst_source.id), '[]') as body from pgrst_source`;
const POLICIES = `select string_agg(format('%s|%s|%s|%s|%s', tablename, policyname, cmd, coalesce(qual, ''), coalesce(with_check, '')), ';' order by tablename, policyname) as s
  from pg_policies where schemaname = 'public' and tablename in ('projects', 'project_setters')`;
const counts = async (one) => one(`select (select count(*)::int from public.projects where id = '${P1}') as p1,
  (select count(*)::int from public.project_value_assets where project_id = '${P1}') as activos_p1,
  (select count(*)::int from public.real_leads where project_id = '${P1}' and setter_id = '${OWNER}') as leads_p1`);

// Las consultas del frontend DESPLEGADO (src/utils/projects.js de main), con la forma de PostgREST.
const FRONT = {
  // getProjects: select … project_setters!inner(user_id, active) con filtros sobre la relación.
  list: `select p.id from public.projects p
         join lateral (select ps.user_id, ps.active from public.project_setters ps
                       where ps.project_id = p.id and ps.user_id = auth.uid() and ps.active = true) s on true
         order by p.id`,
  // updateProject: .update(...).eq('id').select(...).single()
  update: `with s as (update public.projects set promise = 'desde el frontend' where id = $1 returning *) select id from s`,
  // deleteProject: .delete().eq('id').select('id').maybeSingle() → sin fila = «No tienes permiso…»
  delete: `with s as (delete from public.projects where id = $1 returning id) select id from s`,
};

for (const editor of [false, true]) {
  for (const defaults of [false, true]) {
    const combo = `${editor ? 'editor' : 'script'}${defaults ? '+defaults' : ''}`;

    // ── ANTES: el estado auditado es vulnerable (el ensayo reproduce el problema) ──
    {
      const { as, one } = await setup({ defaults });
      let r = await as(OTHER, `select id from public.projects where id = $1`, [P1]);
      check(combo, 'ANTES · la ajena lee el proyecto de la dueña', r.rows.length === 1, JSON.stringify(r));
      r = await as(OTHER, `insert into public.project_setters (project_id, user_id) values ($1, $2)`, [P1, OTHER]);
      check(combo, 'ANTES · la ajena se asigna a sí misma', !r.error, r.error);
      r = await as(OTHER, `delete from public.projects where id = $1`, [P1]);
      const c = await counts(one);
      check(combo, 'ANTES · … y borra el proyecto, con sus activos en cascada y el lead desvinculado', r.n === 1 && c.p1 === 0 && c.activos_p1 === 0 && c.leads_p1 === 0, JSON.stringify({ r, c }));
      r = await as(OTHER, PGRST_INSERT, [JSON.stringify({ id: '20000000-0000-0000-0000-000000000001', name: 'Suplantado', created_by: OWNER })]);
      check(combo, 'ANTES · la ajena crea un proyecto a nombre de la dueña', !r.error && r.rows[0]?.n === 1, r.error);
      r = await as(ADMIN, `update public.projects set name = 'x' where id = $1`, [P3]);
      check(combo, 'ANTES · el admin no puede editar proyectos ajenos', r.n === 0, JSON.stringify(r));
    }

    // ── Aplicación ──
    const { db, as, one } = await setup({ defaults });
    const pre = (await one(ops('01_pre.sql'))).pre;
    check(combo, 'PRE: estado_auditado', pre.estado_auditado === true, JSON.stringify(pre.politicas));
    check(combo, 'PRE: conteos de impacto (1 setter no propietaria, 0 inactivas, 1 lead y 1 sesión sin acceso)',
      pre.impacto_setters_no_propietarias === 1 && pre.impacto_asignaciones_inactivas === 0
      && pre.impacto_leads_sin_acceso_al_proyecto === 1 && pre.impacto_sesiones_sin_acceso_al_proyecto === 1, JSON.stringify(pre));

    // ── COMPATIBILIDAD: aplicar la base ANTES de desplegar el frontend nuevo ──
    {
      const roles = { duena: OWNER, setter: SETTER, ajena: OTHER, admin: ADMIN };
      const before = await setup({ defaults });
      const listsBefore = {};
      for (const [k, uid] of Object.entries(roles)) listsBefore[k] = (await before.as(uid, FRONT.list)).rows.map((x) => x.id);
      const after = await setup({ defaults });
      await run(after.db, ops('02_apply.sql'), editor);
      const listsAfter = {};
      for (const [k, uid] of Object.entries(roles)) listsAfter[k] = (await after.as(uid, FRONT.list)).rows.map((x) => x.id);
      check(combo, 'frontend desplegado · «Mis Proyectos» muestra lo mismo a cada rol antes y después', JSON.stringify(listsBefore) === JSON.stringify(listsAfter), `${JSON.stringify(listsBefore)} ≠ ${JSON.stringify(listsAfter)}`);
      let x = await after.as(OWNER, FRONT.update, [P1]);
      check(combo, 'frontend desplegado · guardar el proyecto (dueña) devuelve la fila', x.rows.length === 1, JSON.stringify(x));
      x = await after.as(ADMIN, FRONT.update, [P3]);
      check(combo, 'frontend desplegado · el admin ahora sí puede guardar un proyecto ajeno', x.rows.length === 1, JSON.stringify(x));
      x = await after.as(SETTER, FRONT.delete, [P1]);
      check(combo, 'frontend desplegado · «Eliminar» de una setter: sin fila → muestra «No tienes permiso» y no borra nada', x.rows.length === 0 && !x.error && (await counts(after.one)).p1 === 1, JSON.stringify(x));
      x = await after.as(OWNER, FRONT.delete, [P2]);
      check(combo, 'frontend desplegado · «Eliminar» de la dueña funciona', x.rows.length === 1, JSON.stringify(x));
      x = await after.as(OTHER, PGRST_INSERT, [JSON.stringify({ id: '40000000-0000-0000-0000-000000000001', name: 'Nuevo' })]);
      check(combo, 'frontend desplegado · crear un proyecto (con .select()) funciona', !x.error && x.rows[0]?.n === 1, x.error);
    }
    const err = await attempt(() => run(db, ops('02_apply.sql'), editor));
    check(combo, '02_apply sin errores', !err, err);
    const post = (await one(ops('03_post.sql'))).post;
    check(combo, 'POST: todo_ok', post.todo_ok === true, JSON.stringify(post));
    check(combo, 'POST: datos idénticos (huella)', post.huella_datos === pre.huella_datos);

    // Mismo resultado que el archivo de la migración aplicado al estado auditado.
    {
      const ref = await setup({ defaults });
      await ref.db.exec(MIGRATION);
      check(combo, 'la migración y 02_apply dejan las mismas políticas', (await ref.one(POLICIES)).s === (await one(POLICIES)).s);
    }

    // ── DESPUÉS: lectura ──
    const sees = async (uid, id = P1) => (await as(uid, `select id from public.projects where id = $1`, [id])).rows.length === 1;
    check(combo, 'lectura · la dueña ve su proyecto', await sees(OWNER));
    check(combo, 'lectura · la setter asignada lo ve', await sees(SETTER));
    check(combo, 'lectura · la alumna ajena NO lo ve', !(await sees(OTHER)));
    check(combo, 'lectura · el admin lo ve', await sees(ADMIN));
    check(combo, 'lectura · la lista de la ajena solo trae sus proyectos', JSON.stringify((await as(OTHER, `select id from public.projects order by id`)).rows.map((x) => x.id)) === JSON.stringify([P3]));
    await as(ADMIN, `update public.project_setters set active = false where project_id = $1 and user_id = $2`, [P1, OWNER]);
    check(combo, 'lectura · la dueña lo ve aunque su asignación esté inactiva', await sees(OWNER));
    await as(ADMIN, `update public.project_setters set active = true where project_id = $1 and user_id = $2`, [P1, OWNER]);
    await as(ADMIN, `update public.project_setters set active = false where project_id = $1 and user_id = $2`, [P1, SETTER]);
    check(combo, 'lectura · una setter desactivada deja de verlo', !(await sees(SETTER)));
    await as(ADMIN, `update public.project_setters set active = true where project_id = $1 and user_id = $2`, [P1, SETTER]);

    // ── Creación ──
    let r = await as(OTHER, PGRST_INSERT, [JSON.stringify({ id: '30000000-0000-0000-0000-000000000001', name: 'Mío' })]);
    check(combo, 'crear · la alumna crea su proyecto con .insert().select() (sin fix/project-create-rls)', !r.error && r.rows[0]?.n === 1, r.error);
    check(combo, 'crear · el trigger la asigna a ella', (await one(`select count(*)::int as n from public.project_setters where project_id = '30000000-0000-0000-0000-000000000001' and user_id = '${OTHER}' and active`)).n === 1);
    r = await as(OTHER, PGRST_INSERT, [JSON.stringify({ id: '30000000-0000-0000-0000-000000000002', name: 'Suplantado', created_by: OWNER })]);
    check(combo, 'crear · NO puede crear a nombre de otra persona', /row-level security/.test(r.error || ''), JSON.stringify(r));
    r = await as(OTHER, `insert into public.projects (id, name, created_by) values ('30000000-0000-0000-0000-000000000003', 'Sin returning', '${OWNER}')`);
    check(combo, 'crear · ni sin RETURNING', /row-level security/.test(r.error || ''), JSON.stringify(r));
    r = await as(ADMIN, PGRST_INSERT, [JSON.stringify({ id: '30000000-0000-0000-0000-000000000004', name: 'Del admin para la dueña', created_by: OWNER })]);
    check(combo, 'crear · el admin crea un proyecto para la dueña (y queda asignada)', !r.error
      && (await one(`select count(*)::int as n from public.project_setters where project_id = '30000000-0000-0000-0000-000000000004' and user_id = '${OWNER}'`)).n === 1, r.error);

    // ── Edición ──
    const edit = async (uid, id = P1) => (await as(uid, `update public.projects set promise = 'editado' where id = $1`, [id])).n;
    check(combo, 'editar · la dueña edita', (await edit(OWNER)) === 1);
    check(combo, 'editar · la setter asignada NO edita', (await edit(SETTER)) === 0);
    check(combo, 'editar · la ajena NO edita', (await edit(OTHER)) === 0);
    check(combo, 'editar · el admin edita proyectos ajenos (B1 corregido)', (await edit(ADMIN)) === 1);
    r = await as(OWNER, `update public.projects set created_by = $2 where id = $1`, [P1, OTHER]);
    check(combo, 'editar · la dueña NO puede cederlo a otra persona', /row-level security/.test(r.error || ''), JSON.stringify(r));
    r = await as(SETTER, `update public.projects set created_by = $2 where id = $1`, [P1, SETTER]);
    check(combo, 'editar · la setter NO puede apropiarse del proyecto', r.n === 0 && (await one(`select created_by from public.projects where id = '${P1}'`)).created_by === OWNER, JSON.stringify(r));

    // ── project_setters ──
    r = await as(OTHER, `insert into public.project_setters (project_id, user_id) values ($1, $2)`, [P1, OTHER]);
    check(combo, 'asignaciones · la ajena NO puede asignarse', /row-level security/.test(r.error || ''), JSON.stringify(r));
    r = await as(SETTER, `insert into public.project_setters (project_id, user_id) values ($1, $2)`, [P1, OTHER]);
    check(combo, 'asignaciones · la setter NO puede asignar a otras', /row-level security/.test(r.error || ''), JSON.stringify(r));
    r = await as(OWNER, `insert into public.project_setters (project_id, user_id) values ($1, $2)`, [P1, OTHER]);
    check(combo, 'asignaciones · la dueña tampoco (solo admin, como en el repo)', /row-level security/.test(r.error || ''), JSON.stringify(r));
    r = await as(OTHER, `update public.project_setters set active = false where project_id = $1`, [P1]);
    check(combo, 'asignaciones · la ajena NO desactiva asignaciones ajenas', r.n === 0);
    r = await as(SETTER, `update public.project_setters set active = false where project_id = $1 and user_id = $2`, [P1, OWNER]);
    check(combo, 'asignaciones · la setter NO desactiva a la dueña', r.n === 0);
    r = await as(OTHER, `delete from public.project_setters where project_id = $1`, [P1]);
    check(combo, 'asignaciones · la ajena NO borra asignaciones', r.n === 0);
    r = await as(OTHER, `select project_id, user_id from public.project_setters`);
    check(combo, 'asignaciones · la ajena solo lee las suyas', r.rows.every((x) => x.user_id === OTHER), JSON.stringify(r.rows));
    r = await as(ADMIN, `insert into public.project_setters (project_id, user_id) values ($1, $2)`, [P3, SETTER]);
    const adminUpd = await as(ADMIN, `update public.project_setters set active = false where project_id = $1 and user_id = $2`, [P3, SETTER]);
    const adminDel = await as(ADMIN, `delete from public.project_setters where project_id = $1 and user_id = $2`, [P3, SETTER]);
    check(combo, 'asignaciones · el admin asigna, desactiva y borra', !r.error && adminUpd.n === 1 && adminDel.n === 1, `${r.error} ${adminUpd.n} ${adminDel.n}`);

    // ── Eliminación y ataque encadenado ──
    const before = await counts(one);
    await as(OTHER, `insert into public.project_setters (project_id, user_id) values ($1, $2)`, [P1, OTHER]);
    r = await as(OTHER, `delete from public.projects where id = $1`, [P1]);
    const after = await counts(one);
    check(combo, 'ataque encadenado · asignarse falla y borrar no afecta a nada', r.n === 0 && JSON.stringify(after) === JSON.stringify(before) && after.p1 === 1 && after.activos_p1 === 1 && after.leads_p1 === 1, JSON.stringify({ r, before, after }));
    r = await as(SETTER, `delete from public.projects where id = $1`, [P1]);
    check(combo, 'eliminar · la setter asignada NO elimina', r.n === 0 && (await counts(one)).p1 === 1);
    r = await as(OWNER, `delete from public.projects where id = $1`, [P2]);
    const p2 = await one(`select (select count(*)::int from public.projects where id = '${P2}') as p, (select count(*)::int from public.project_value_assets where project_id = '${P2}') as a`);
    check(combo, 'eliminar · la dueña elimina el suyo (y en cascada sus propios activos)', r.n === 1 && p2.p === 0 && p2.a === 0, JSON.stringify({ r, p2 }));
    r = await as(ADMIN, `delete from public.projects where id = $1`, [P3]);
    check(combo, 'eliminar · el admin elimina proyectos ajenos', r.n === 1);
    r = await as(OTHER, `select id from public.project_value_assets`);
    check(combo, 'acceso indirecto · los activos de la dueña siguen siendo invisibles para otras', r.rows.length === 0);
    r = await as(SETTER, `select id from public.real_leads`);
    check(combo, 'acceso indirecto · los leads de la dueña siguen siendo invisibles para la setter', r.rows.length === 0);

    // ── Repetir y estado inesperado ──
    const errAgain = await attempt(() => run(db, ops('02_apply.sql'), editor));
    check(combo, 'aplicar dos veces: ABORTADO (ya no es el estado auditado)', /ABORTADO: las políticas actuales no son las auditadas/.test(errAgain), errAgain);
    {
      const x = await setup({ defaults });
      await x.db.exec(`create policy "otra" on public.projects for select to authenticated using (false)`);
      const beforeSig = (await x.one(POLICIES)).s;
      const e = await attempt(() => run(x.db, ops('02_apply.sql'), editor));
      check(combo, 'estado distinto del auditado: ABORTADO sin cambiar nada', /ABORTADO/.test(e) && (await x.one(POLICIES)).s === beforeSig, e);
      const repo = await setup({ defaults, prod: false });
      const e2 = await attempt(() => run(repo.db, ops('02_apply.sql'), editor));
      check(combo, 'estado del repositorio (no el de producción): también ABORTA', /ABORTADO/.test(e2), e2);

      // Mismos nombres y comandos, condiciones distintas: también se detecta.
      const t = await setup({ defaults });
      await t.db.exec(`alter policy "projects_update_authenticated" on public.projects using (true)`);
      const preT = (await t.one(ops('01_pre.sql'))).pre;
      check(combo, 'condición cambiada (mismo nombre): 01_pre da estado_auditado = false y la señala',
        preT.estado_auditado === false && JSON.stringify(preT.diferencias).includes('projects_update_authenticated'), JSON.stringify(preT.diferencias));
      const sigT = (await t.one(POLICIES)).s;
      const eT = await attempt(() => run(t.db, ops('02_apply.sql'), editor));
      check(combo, 'condición cambiada (mismo nombre): 02_apply ABORTA sin cambiar nada', /ABORTADO: las políticas actuales no son las auditadas/.test(eT) && (await t.one(POLICIES)).s === sigT, eT);
      const r2 = await setup({ defaults });
      await r2.db.exec(`alter policy "project_setters_select_own_or_admin" on public.project_setters to public`);
      const eR = await attempt(() => run(r2.db, ops('02_apply.sql'), editor));
      check(combo, 'roles cambiados (mismo nombre y condición): 02_apply ABORTA', /ABORTADO/.test(eR), eR);
      const after = await setup({ defaults });
      await run(after.db, ops('02_apply.sql'), editor);
      await after.db.exec(`alter policy "projects_update_owner_or_admin" on public.projects using (true)`);
      const postT = (await after.one(ops('03_post.sql'))).post;
      check(combo, 'condición alterada después de aplicar: 03_post da todo_ok = false y la señala',
        postT.todo_ok === false && JSON.stringify(postT.diferencias).includes('projects_update_owner_or_admin'), JSON.stringify(postT));
    }

    // ── Emergencia nivel 2: reabrir solo la lectura ──
    {
      const em = await setup({ defaults });
      const sinCorreccion = await attempt(() => run(em.db, ops('05_emergencia_lectura.sql'), editor));
      check(combo, 'emergencia · sin la corrección aplicada: ABORTADO', /ABORTADO: la corrección/.test(sinCorreccion), sinCorreccion);
      await run(em.db, ops('02_apply.sql'), editor);
      const e5 = await attempt(() => run(em.db, ops('05_emergencia_lectura.sql'), editor));
      check(combo, 'emergencia · 05 sin errores', !e5, e5);
      check(combo, 'emergencia · la ajena vuelve a LEER el proyecto de la dueña', (await em.as(OTHER, `select id from public.projects where id = $1`, [P1])).rows.length === 1);
      const c0 = await counts(em.one);
      const asg = await em.as(OTHER, `insert into public.project_setters (project_id, user_id) values ($1, $2)`, [P1, OTHER]);
      const del = await em.as(OTHER, `delete from public.projects where id = $1`, [P1]);
      const upd = await em.as(OTHER, `update public.projects set name = 'x' where id = $1`, [P1]);
      const sup = await em.as(OTHER, PGRST_INSERT, [JSON.stringify({ id: '50000000-0000-0000-0000-000000000001', name: 'Suplantado', created_by: OWNER })]);
      check(combo, 'emergencia · el ataque encadenado sigue bloqueado (asignarse, borrar, editar, suplantar)',
        /row-level security/.test(asg.error || '') && del.n === 0 && upd.n === 0 && /row-level security/.test(sup.error || '')
        && JSON.stringify(await counts(em.one)) === JSON.stringify(c0), JSON.stringify({ asg, del, upd, sup }));
      const e6 = await attempt(() => run(em.db, ops('06_quitar_emergencia.sql'), editor));
      check(combo, 'emergencia · 06 vuelve al estado seguro (03_post todo_ok, la ajena ya no lee)', !e6 && (await em.one(ops('03_post.sql'))).post.todo_ok === true
        && (await em.as(OTHER, `select id from public.projects where id = $1`, [P1])).rows.length === 0, e6);
    }

    // ── Rollback ──
    {
      const rb = await setup({ defaults });
      const sigProd = (await rb.one(POLICIES)).s;
      const preRb = (await rb.one(ops('01_pre.sql'))).pre;
      await run(rb.db, ops('02_apply.sql'), editor);
      const eR = await attempt(() => run(rb.db, ops('04_rollback.sql'), editor));
      check(combo, '04_rollback sin errores', !eR, eR);
      check(combo, 'rollback: políticas idénticas a las auditadas', (await rb.one(POLICIES)).s === sigProd);
      const pre2 = (await rb.one(ops('01_pre.sql'))).pre;
      check(combo, 'rollback: estado_auditado y datos intactos', pre2.estado_auditado === true && pre2.huella_datos === preRb.huella_datos);
      const eR2 = await attempt(() => run(rb.db, ops('04_rollback.sql'), editor));
      check(combo, 'rollback repetible', !eR2 && (await rb.one(POLICIES)).s === sigProd, eR2);
      const back = await attempt(() => run(rb.db, ops('02_apply.sql'), editor));
      check(combo, 'se puede volver a aplicar después del rollback', !back && (await rb.one(ops('03_post.sql'))).post.todo_ok === true, back);
    }
  }
}

check('archivos', '02_apply.sql es una sola sentencia', splitSql(ops('02_apply.sql')).length === 1, splitSql(ops('02_apply.sql')).length);
for (const f of ['04_rollback.sql', '05_emergencia_lectura.sql', '06_quitar_emergencia.sql']) {
  check('archivos', `${f} es una sola sentencia`, splitSql(ops(f)).length === 1, splitSql(ops(f)).length);
}
// Solo lectura: Postgres rechazaría cualquier escritura dentro de una transacción READ ONLY.
{
  const ro = await setup({ defaults: false });
  const err = await attempt(async () => {
    await ro.db.exec('begin read only');
    try { await ro.db.query(ops('01_pre.sql')); await ro.db.query(ops('03_post.sql')); } finally { await ro.db.exec('rollback'); }
  });
  check('archivos', '01_pre.sql y 03_post.sql corren en una transacción READ ONLY', !err, err);
}

for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FALLA'} [${r.combo}] ${r.name}${r.ok ? '' : ` → ${r.detail}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones`);
process.exitCode = failed ? 1 : 0;
