// Ensayo del procedimiento 202610170003 en PGlite (Postgres en memoria).
// NO se conecta a Supabase ni a ninguna base real.
//
// Uso, desde la raíz del repo (no modifica package.json):
//   npm i --no-save @electric-sql/pglite
//   node supabase/ops/202610170003_lock_lesson_progress_writes/tests/rehearsal.mjs
//
// Cada escenario se ejecuta en 4 combinaciones:
//   - modo "script": el archivo completo en una sola llamada (Postgres normal);
//   - modo "editor": como el SQL Editor de Supabase, cada sentencia en su
//     propia transacción e ignorando begin/commit del script (así se
//     reprodujo el incidente del 2026-10-17);
//   - con y sin los default privileges que Supabase da a anon/authenticated.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OPS = fileURLToPath(new URL('../', import.meta.url));
const MIG = fileURLToPath(new URL('../../../migrations/', import.meta.url));
const FIXTURE_INCIDENTE = fileURLToPath(new URL('./fixtures/02_apply_6815c7e_incidente.sql', import.meta.url));
const read = (path) => readFileSync(path, 'utf8');
const MIGRATION_0003 = read(MIG + '202610170003_lock_lesson_progress_writes.sql');

const results = [];
const check = (combo, name, ok, detail = '') => results.push({ combo, name, ok: Boolean(ok), detail: ok ? '' : String(detail).slice(0, 160) });

// Divide un script en sentencias respetando comentarios y bloques $$ … $$.
const splitSql = (sql) => {
  const out = []; let cur = ''; let i = 0; let inDollar = false; let inLine = false;
  while (i < sql.length) {
    if (!inDollar && !inLine && sql.startsWith('--', i)) inLine = true;
    if (inLine) { if (sql[i] === '\n') inLine = false; cur += sql[i++]; continue; }
    if (sql.startsWith('$$', i)) { inDollar = !inDollar; cur += '$$'; i += 2; continue; }
    if (!inDollar && sql[i] === ';') { out.push(cur); cur = ''; i++; continue; }
    cur += sql[i++];
  }
  out.push(cur);
  return out.map((x) => x.replace(/--.*$/gm, '').trim()).filter(Boolean);
};
const runEditor = async (db, sql) => {
  for (const st of splitSql(sql)) {
    if (/^(begin|commit)\b/i.test(st)) continue;
    await db.exec('begin');
    try { await db.exec(st); await db.exec('commit'); } catch (e) { await db.exec('rollback'); throw e; }
  }
};
const run = (db, sql, editor) => (editor ? runEditor(db, sql) : db.exec(sql));

const U = (c) => `00000000-0000-0000-0000-0000000000${c}`;
const [P, Q, R, A, F, D, E, G] = ['01', '02', '03', '0a', '0f', '0d', '0e', '09'].map(U);
const LESSON = 'set-method-foundations';

// Producción simulada: main + historial por épocas + fase 1 + actividad del
// frontend anterior después de la fase 1.
async function setup(defaults) {
  const db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;`);
  if (defaults) await db.exec(`alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`);
  for (const f of ['202608270001_create_profiles_auth.sql', '202609010002_create_lesson_progress.sql', '202609010003_create_academy_lessons.sql',
    '202609010004_seed_set_academy_weeks.sql', '202609090001_create_daily_missions.sql', '202609090004_create_rewards_system.sql',
    '202609110005_redeem_reward_rpc.sql', '202609140001_add_academy_video_url.sql']) await db.exec(read(MIG + f));
  await db.exec(`insert into auth.users (id, email) select id::uuid, id || '@x' from unnest(array['${[P, Q, R, A, F, D, E, G].join("','")}']) id;
    update public.academy_lessons set video_provider = 'mux', mux_asset_id = 'a1', mux_playback_id = 'p1', video_status = 'ready', duration_seconds = 1000
     where lesson_id = '${LESSON}';
    insert into public.lesson_progress (user_id, course_id, module_id, lesson_id, status, completed_at, created_at, updated_at) values
      ('${P}', 'set-academy', 'week-01', '${LESSON}', 'completed', '2026-09-05', '2026-09-05', '2026-09-05'),
      ('${Q}', 'set-academy', 'week-01', '${LESSON}', 'pending',   null,         '2026-09-05', '2026-09-06'),
      ('${R}', 'set-academy', 'week-01', '${LESSON}', 'pending',   null,         '2026-09-05', '2026-09-20'),
      ('${A}', 'set-academy', 'week-01', '${LESSON}', 'completed', '2026-09-20', '2026-09-20', '2026-09-20'),
      ('${F}', 'set-academy', 'week-01', '${LESSON}', 'completed', '2026-09-20', '2026-09-20', '2026-09-20');
    insert into public.user_streaks (user_id, total_xp, lifetime_xp) values
      ('${P}', 0, 0), ('${Q}', 0, 0), ('${R}', 0, 0), ('${A}', 25, 25), ('${F}', 0, 0), ('${D}', 0, 0), ('${E}', 0, 0), ('${G}', 0, 0);`);
  for (const f of ['202610170001_create_xp_ledger.sql', '202610170002_verified_lesson_progress.sql']) await db.exec(read(MIG + f));

  const as = async (uid, sql, params = []) => {
    try {
      await db.exec('begin');
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      await db.exec('set local role authenticated');
      const r = await db.query(sql, params);
      await db.exec('commit');
      return { rows: r.rows };
    } catch (e) { await db.exec('rollback'); return { error: e.message }; }
  };
  // Frontend anterior: upsert directo + addXp(25) desde el navegador (puede fallar).
  const oldMark = async (uid, status, xpOk = true) => {
    const r = await as(uid, `insert into public.lesson_progress (user_id, course_id, module_id, lesson_id, status, completed_at)
      values ($1, 'set-academy', 'week-01', '${LESSON}', $2, case when $2 = 'completed' then now() end)
      on conflict (user_id, course_id, module_id, lesson_id) do update set status = excluded.status, completed_at = excluded.completed_at`, [uid, status]);
    if (r.error) throw new Error('oldMark: ' + r.error);
    if (status === 'completed' && xpOk) await db.query(`update public.user_streaks set total_xp = total_xp + 25, lifetime_xp = lifetime_xp + 25 where user_id = $1`, [uid]);
  };
  await oldMark(D, 'completed');
  await oldMark(E, 'completed'); await oldMark(E, 'pending');
  await oldMark(G, 'completed', false);

  const lessonId = (await db.query(`select id from public.academy_lessons where lesson_id = '${LESSON}'`)).rows[0].id;
  const watch = (uid, s) => db.query(`insert into public.lesson_watch_progress (user_id, lesson_id, mux_asset_id, duration_seconds, watched, watched_seconds)
    values ($1, $2, 'a1', 1000, int4multirange(int4range(0, $3::int)), $3) on conflict (user_id, lesson_id) do update set watched = excluded.watched, watched_seconds = excluded.watched_seconds`, [uid, lessonId, s]);
  const complete = async (uid) => (await as(uid, `select * from public.complete_lesson('set-academy', 'week-01', '${LESSON}')`)).rows?.[0];
  const xp = async (uid) => (await db.query(`select total_xp from public.user_streaks where user_id = $1`, [uid])).rows[0].total_xp;
  const one = async (file) => Object.values((await db.query(read(OPS + file))).rows[0])[0];
  const ledgerCount = async () => Number((await db.query(`select count(*) n from public.xp_ledger`)).rows[0].n);
  return { db, as, watch, complete, xp, one, ledgerCount };
}

// Estado comparable de todo lo que la migración o el rollback pueden tocar.
const snapshot = async (db) => ({
  acl: (await db.query(`select coalesce(r.rolname, 'PUBLIC') as grantee, a.privilege_type
    from pg_class c cross join lateral aclexplode(c.relacl) a left join pg_roles r on r.oid = a.grantee
    where c.oid = 'public.lesson_progress'::regclass order by 1, 2`)).rows,
  policies: (await db.query(`select policyname, cmd, roles::text, qual, with_check from pg_policies
    where schemaname = 'public' and tablename = 'lesson_progress' order by 1`)).rows,
  ledger: (await db.query(`select user_id, source, source_ref, amount, backfilled from public.xp_ledger order by 1, 2, 3`)).rows,
  lessons: (await db.query(`select * from public.lesson_progress order by user_id, lesson_id`)).rows,
  xp: (await db.query(`select user_id, total_xp, lifetime_xp, current_streak, longest_streak from public.user_streaks order by user_id`)).rows,
});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Para comparar DOS bases distintas: las fechas generadas con now() al crear
// cada base difieren por milisegundos. Dentro de una misma base se compara todo.
const portable = (s) => ({ ...s, lessons: s.lessons.map(({ created_at, updated_at, completed_at, ...rest }) => ({ ...rest, completed: completed_at !== null })) });

// ── Comprobaciones estáticas (una vez) ──
{
  const applyStmts = splitSql(read(OPS + '02_apply.sql'));
  const rollbackStmts = splitSql(read(OPS + '04_rollback.sql'));
  check('estático', '02_apply.sql es UNA sola sentencia (bloque DO)', applyStmts.length === 1 && /^do \$\$/i.test(applyStmts[0]), applyStmts.length);
  check('estático', '04_rollback.sql es UNA sola sentencia (bloque DO)', rollbackStmts.length === 1 && /^do \$\$/i.test(rollbackStmts[0]), rollbackStmts.length);
  check('estático', '01_pre.sql y 03_post.sql son de una sola sentencia', splitSql(read(OPS + '01_pre.sql')).length === 1 && splitSql(read(OPS + '03_post.sql')).length === 1);
  const norm = (s) => s.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();
  const migStmts = splitSql(MIGRATION_0003).map(norm);
  const applyNorm = norm(read(OPS + '02_apply.sql'));
  check('estático', '02_apply.sql contiene literalmente las 4 sentencias de la migración 0003', migStmts.length === 4 && migStmts.every((st) => applyNorm.includes(st)), migStmts.length);
  check('estático', 'el fixture del incidente usa begin/commit y tabla temporal', /begin isolation level/.test(read(FIXTURE_INCIDENTE)) && /_antes/.test(read(FIXTURE_INCIDENTE)));
}

for (const editor of [false, true]) {
  for (const defaults of [false, true]) {
    const combo = `${editor ? 'editor' : 'script'}${defaults ? '+defaults' : ''}`;

    // ── 1. Migración 0003 y 02_apply producen exactamente el mismo estado ──
    {
      const m = await setup(defaults); const a = await setup(defaults);
      check(combo, 'punto de partida idéntico en ambas bases', same(portable(await snapshot(m.db)), portable(await snapshot(a.db))));
      const m0 = await snapshot(m.db); const a0 = await snapshot(a.db);
      await run(m.db, MIGRATION_0003, editor);
      await run(a.db, read(OPS + '02_apply.sql'), editor);
      const sm = await snapshot(m.db); const sa = await snapshot(a.db);
      check(combo, 'ninguno de los dos cambia lesson_progress (fechas incluidas)', same(sm.lessons, m0.lessons) && same(sa.lessons, a0.lessons));
      const pm = portable(sm); const pa = portable(sa);
      check(combo, 'EQUIVALENCIA: permisos, políticas, ledger, clases y XP idénticos tras migración vs 02_apply', same(pm, pa),
        JSON.stringify({ acl: same(pm.acl, pa.acl), pol: same(pm.policies, pa.policies), led: same(pm.ledger, pa.ledger), lp: same(pm.lessons, pa.lessons), xp: same(pm.xp, pa.xp) }));
      await run(m.db, MIGRATION_0003, editor);
      await run(a.db, read(OPS + '02_apply.sql'), editor);
      check(combo, 'EQUIVALENCIA tras repetir ambos (idempotencia)', same(await snapshot(m.db), sm) && same(await snapshot(a.db), sa));
    }

    const { db, watch, complete, xp, one, ledgerCount } = await setup(defaults);
    const s0 = await snapshot(db);

    // ── 2. PRE y diagnóstico de premiación ──
    const pre = await one('01_pre.sql');
    check(combo, 'PRE: fase 1 presente', pre.fase1_presente.complete_lesson && pre.fase1_presente.record_lesson_watch && pre.fase1_presente.trigger_guard);
    check(combo, 'PRE: sin_ledger = 3 (D, E, G)', pre.sin_ledger.filas === 3 && pre.sin_ledger.creadas_despues_fase1 === 3, JSON.stringify(pre.sin_ledger));
    check(combo, 'diagnóstico: nunca_premiada 2 · ambigua 1 · premiada_salvo_fallo 5 · fallos detectados 2', pre.premiacion.nunca_premiada.filas === 2
      && pre.premiacion.ambigua.filas === 1 && pre.premiacion.premiada_salvo_fallo.filas === 5
      && pre.premiacion.fallos_addxp_detectados.alumnos === 2, JSON.stringify(pre.premiacion));

    // ── 3. Aplicar ──
    await run(db, read(OPS + '02_apply.sql'), editor);
    const s1 = await snapshot(db);
    const post = await one('03_post.sql');
    check(combo, 'POST todo_ok', post.todo_ok === true, JSON.stringify(post.detalle));
    check(combo, 'XP idéntico (total, lifetime, rachas) para todos', same(s1.xp, s0.xp));
    check(combo, 'lesson_progress idéntico fila a fila', same(s1.lessons, s0.lessons));
    check(combo, 'ledger: exactamente +3 filas backfilled (D, E, G)', s1.ledger.length === s0.ledger.length + 3
      && s1.ledger.filter((x) => [D, E, G].includes(x.user_id) && x.backfilled).length === 3);

    // ── 4. Doble XP ──
    for (const u of [A, D, E, G, P]) await watch(u, 900);
    const res = {}; for (const u of [A, D, E, G, P]) res[u] = await complete(u);
    check(combo, 'verificar clases ya pagadas (A, D) o desmarcadas (E): sin XP extra', [A, D, E].every((u) => res[u]?.xp_awarded === false)
      && (await xp(A)) === 25 && (await xp(D)) === 25 && (await xp(E)) === 25);
    check(combo, 'repetir complete_lesson → already_completed, sin XP', (await complete(D))?.outcome === 'already_completed');
    check(combo, 'LIMITACIÓN documentada: G (addXp falló) y P (antes del XP) no reciben XP al verificar', res[G]?.xp_awarded === false && res[P]?.xp_awarded === false);

    // ── 5. Rollback exacto e idempotente ──
    const ledgerAfterApply = await ledgerCount();
    await run(db, read(OPS + '04_rollback.sql'), editor);
    const r1 = await snapshot(db);
    check(combo, 'ROLLBACK: permisos idénticos a los originales', same(r1.acl, s0.acl), JSON.stringify(r1.acl));
    check(combo, 'ROLLBACK: políticas idénticas a las originales (nombre, comando, roles, using, with check)', same(r1.policies, s0.policies), JSON.stringify(r1.policies));
    check(combo, 'ROLLBACK: conserva el ledger', (await ledgerCount()) === ledgerAfterApply);
    await run(db, read(OPS + '04_rollback.sql'), editor);
    const r2 = await snapshot(db);
    check(combo, 'ROLLBACK idempotente: repetirlo deja exactamente el mismo estado', same(r2, r1));
    {
      const fresh = await setup(defaults); const before = await snapshot(fresh.db);
      await run(fresh.db, read(OPS + '04_rollback.sql'), editor);
      const after = await snapshot(fresh.db);
      check(combo, 'ROLLBACK sobre una base sin migrar: no cambia nada', same(after, before));
    }
    await run(db, read(OPS + '02_apply.sql'), editor);
    check(combo, 're-aplicar tras rollback → todo_ok', (await one('03_post.sql')).todo_ok === true);

    // ── 6. Autoverificación (sabotaje dentro del bloque) ──
    await run(db, read(OPS + '04_rollback.sql'), editor);
    const beforeSabotage = await snapshot(db);
    const sabotage = read(OPS + '02_apply.sql').replace('  -- 2.', () => `  update public.user_streaks set total_xp = total_xp + 1 where user_id = '${A}';\n  -- 2.`);
    check(combo, 'sabotaje insertado dentro del bloque DO', sabotage.includes(`total_xp + 1 where user_id = '${A}';\n  -- 2.`));
    let abortMsg = '';
    try { await run(db, sabotage, editor); } catch (e) { abortMsg = e.message; }
    check(combo, 'un cambio de XP aborta y NO deja nada aplicado (ni permisos, ni ledger, ni XP)', /ABORTADO: el XP cambió/.test(abortMsg)
      && same(await snapshot(db), beforeSabotage), abortMsg);

    // ── 7. Incidente del 2026-10-17 (script anterior) ──
    {
      const inc = await setup(defaults); const before = await snapshot(inc.db);
      let msg = '';
      try { await run(inc.db, read(FIXTURE_INCIDENTE), editor); } catch (e) { msg = e.message; }
      const st = await snapshot(inc.db);
      if (editor) {
        check(combo, 'INCIDENTE reproducido: falla con "_antes" y deja aplicado el revoke', /_antes/.test(msg)
          && !st.acl.some((x) => x.grantee === 'authenticated' && ['INSERT', 'UPDATE'].includes(x.privilege_type)), msg);
        check(combo, 'INCIDENTE: XP y clases intactos', same(st.xp, before.xp) && same(st.lessons, before.lessons));
        await run(inc.db, read(OPS + '04_rollback.sql'), editor);
        const fixed = await snapshot(inc.db);
        check(combo, 'INCIDENTE: 04_rollback restaura permisos y políticas originales', same(fixed.acl, before.acl) && same(fixed.policies, before.policies));
      } else {
        check(combo, 'el script anterior SÍ funciona en Postgres normal (por eso el ensayo original no lo detectó)', msg === '', msg);
      }
    }
  }
}

console.table(results);
const failed = results.filter((x) => !x.ok).length;
console.log(failed ? `${failed} FALLAN` : `${results.length}/${results.length} OK`);
process.exit(failed ? 1 : 0);
