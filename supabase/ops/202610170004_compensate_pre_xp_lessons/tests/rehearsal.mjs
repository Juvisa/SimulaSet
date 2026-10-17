// Ensayo de la compensación 202610170004 en PGlite (Postgres en memoria).
// NO se conecta a Supabase ni a ninguna base real.
//
// Uso, desde la raíz del repo (no modifica package.json):
//   npm i --no-save @electric-sql/pglite
//   node supabase/ops/202610170004_compensate_pre_xp_lessons/tests/rehearsal.mjs
//
// Cada escenario se ejecuta en modo "script" (archivo completo) y en modo
// "editor" (como el SQL Editor de Supabase: cada sentencia en su propia
// transacción), con y sin los default privileges de Supabase.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OPS = fileURLToPath(new URL('../', import.meta.url));
const MIG = fileURLToPath(new URL('../../../migrations/', import.meta.url));
const read = (path) => readFileSync(path, 'utf8');
const MIGRATION_0004 = read(MIG + '202610170004_xp_adjustments.sql');

const results = [];
const check = (combo, name, ok, detail = '') => results.push({ combo, name, ok: Boolean(ok), detail: ok ? '' : String(detail).slice(0, 160) });

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
const attempt = async (db, sql, editor) => { try { await run(db, sql, editor); return ''; } catch (e) { return e.message; } };

const U = (c) => `00000000-0000-0000-0000-0000000000${c}`;
const [P, Q, A, ADM, OLD, S] = ['01', '02', '0a', 'ad', 'a0', '05'].map(U);
const ADMIN_EMAIL = 'admin@digitalset.test';
const LESSON = 'set-method-foundations';

// Producción simulada después de la fase 3: P y Q marcaron antes del XP de
// clases (nunca premiadas), A sí cobró; un admin activo, uno inactivo y un setter.
async function setup({ defaults, with0003 = true, with0004 = true, editor = false }) {
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
  await db.exec(`insert into auth.users (id, email) values ('${P}','p@x'),('${Q}','q@x'),('${A}','a@x'),('${ADM}','${ADMIN_EMAIL}'),('${OLD}','old@digitalset.test'),('${S}','setter@x');
    update public.profiles set email = u.email, name = 'Usuario ' || right(u.id::text, 2) from auth.users u where u.id = profiles.id;
    update public.profiles set role = 'admin', name = 'Admin Digital SET' where id = '${ADM}';
    update public.profiles set role = 'admin', active = false where id = '${OLD}';
    update public.academy_lessons set video_provider = 'mux', mux_asset_id = 'a1', mux_playback_id = 'p1', video_status = 'ready', duration_seconds = 1000
     where lesson_id = '${LESSON}';
    insert into public.lesson_progress (user_id, course_id, module_id, lesson_id, status, completed_at, created_at, updated_at) values
      ('${P}', 'set-academy', 'week-01', '${LESSON}', 'completed', '2026-09-05', '2026-09-05', '2026-09-05'),
      ('${Q}', 'set-academy', 'week-02', 'w2', 'completed', '2026-09-07', '2026-09-07', '2026-09-07'),
      ('${A}', 'set-academy', 'week-01', '${LESSON}', 'completed', '2026-09-20', '2026-09-20', '2026-09-20');
    insert into public.user_streaks (user_id, total_xp, lifetime_xp) values ('${P}', 100, 300), ('${Q}', 0, 40), ('${A}', 25, 25);`);
  for (const f of ['202610170001_create_xp_ledger.sql', '202610170002_verified_lesson_progress.sql']) await db.exec(read(MIG + f));
  if (with0003) await db.exec(read(MIG + '202610170003_lock_lesson_progress_writes.sql'));
  if (with0004) await run(db, MIGRATION_0004, editor);

  const as = async (uid, sql) => {
    try {
      await db.exec('begin');
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      await db.exec('set local role authenticated');
      const r = await db.query(sql);
      await db.exec('commit');
      return { rows: r.rows };
    } catch (e) { await db.exec('rollback'); return { error: e.message }; }
  };
  const one = async (file) => Object.values((await db.query(read(OPS + file))).rows[0])[0];
  const xp = async (uid) => (await db.query(`select total_xp, lifetime_xp from public.user_streaks where user_id = $1`, [uid])).rows[0];
  const lessonId = (await db.query(`select id from public.academy_lessons where lesson_id = '${LESSON}'`)).rows[0].id;
  const watch = (uid, s) => db.query(`insert into public.lesson_watch_progress (user_id, lesson_id, mux_asset_id, duration_seconds, watched, watched_seconds)
    values ($1, $2, 'a1', 1000, int4multirange(int4range(0, $3::int)), $3) on conflict (user_id, lesson_id) do update set watched = excluded.watched, watched_seconds = excluded.watched_seconds`, [uid, lessonId, s]);
  return { db, as, one, xp, watch };
}
const snap = async (db) => JSON.stringify({
  xp: (await db.query(`select user_id, total_xp, lifetime_xp, current_streak, longest_streak from public.user_streaks order by user_id`)).rows,
  ledger: (await db.query(`select user_id, source, source_ref, amount, backfilled from public.xp_ledger order by 1, 2, 3`)).rows,
  lessons: (await db.query(`select * from public.lesson_progress order by user_id, lesson_id`)).rows,
  batches: (await db.query(`select count(*)::int n from pg_tables where tablename = 'xp_adjustment_batches'`)).rows[0].n
    ? (await db.query(`select batch_code, approved_by, rows_awarded from public.xp_adjustment_batches order by 1`)).rows : null,
});
const fill = (sql, v) => sql
  .replace("'<<EMAIL DEL ADMINISTRADOR QUE APRUEBA>>'", `'${v.email ?? ADMIN_EMAIL}'`)
  .replace("'<<REFERENCIA DE LA APROBACIÓN (dónde y cuándo)>>'", `'${v.reference ?? 'Aprobado por dirección, 2026-10-17'}'`)
  .replace("'<<CLASES>>'", `'${v.clases}'`).replace("'<<FINGERPRINT>>'", `'${v.fingerprint}'`);

// ── Estático ──
for (const f of ['01_pre.sql', '02_apply.sql', '03_post.sql', '04_rollback_schema.sql']) {
  check('estático', `${f} es UNA sola sentencia`, splitSql(read(OPS + f)).length === 1, splitSql(read(OPS + f)).length);
}
check('estático', 'la migración 0004 no contiene insert/update/delete de datos', !/\b(insert into|update public\.|delete from)\b/i.test(MIGRATION_0004.replace(/--.*$/gm, '')));

for (const editor of [false, true]) {
  for (const defaults of [false, true]) {
    const combo = `${editor ? 'editor' : 'script'}${defaults ? '+defaults' : ''}`;
    const APPLY = read(OPS + '02_apply.sql');

    // La migración 0004 no modifica datos.
    {
      const m = await setup({ defaults, with0004: false });
      const before = await snap(m.db);
      await run(m.db, MIGRATION_0004, editor);
      const after = JSON.parse(await snap(m.db));
      const b = JSON.parse(before);
      check(combo, 'migración 0004: XP, ledger y clases intactos', JSON.stringify(after.xp) === JSON.stringify(b.xp)
        && JSON.stringify(after.ledger) === JSON.stringify(b.ledger) && JSON.stringify(after.lessons) === JSON.stringify(b.lessons));
    }

    const { db, as, one, xp, watch } = await setup({ defaults, editor });
    const pre = await one('01_pre.sql');
    check(combo, 'PRE: requisitos 0003 y 0004 aplicados', pre.requisitos.migracion_0003_aplicada && pre.requisitos.migracion_0004_aplicada, JSON.stringify(pre.requisitos));
    check(combo, 'PRE: 2 clases, 2 alumnos, 50 XP, lote no aplicado', pre.resumen.clases === 2 && pre.resumen.alumnos === 2
      && pre.resumen.xp_a_otorgar === 50 && pre.resumen.lote_ya_aplicado === false, JSON.stringify(pre.resumen));
    check(combo, 'PRE: lista solo administradores activos', pre.administradores_activos.length === 1 && pre.administradores_activos[0].email === ADMIN_EMAIL,
      JSON.stringify(pre.administradores_activos));
    const fp = pre.resumen.fingerprint;
    const s0 = await snap(db);

    // Abortos sin efectos.
    const aborts = [
      ['sin reemplazar valores', APPLY, /faltan valores/],
      ['aprobador que es setter', fill(APPLY, { email: 'setter@x', clases: 2, fingerprint: fp }), /no es un administrador activo/],
      ['aprobador admin inactivo', fill(APPLY, { email: 'old@digitalset.test', clases: 2, fingerprint: fp }), /no es un administrador activo/],
      ['aprobador inexistente', fill(APPLY, { email: 'nadie@x', clases: 2, fingerprint: fp }), /no es un administrador activo/],
      ['fingerprint distinto', fill(APPLY, { clases: 2, fingerprint: '0'.repeat(32) }), /la selección cambió/],
      ['número de clases distinto', fill(APPLY, { clases: 3, fingerprint: fp }), /la selección cambió/],
    ];
    for (const [name, sql, re] of aborts) {
      const m = await attempt(db, sql, editor);
      check(combo, `aborta sin cambios: ${name}`, re.test(m) && (await snap(db)) === s0, m);
    }

    // Aplicación correcta.
    const before = { P: await xp(P), Q: await xp(Q), A: await xp(A) };
    const ok = await attempt(db, fill(APPLY, { email: ' Admin@DigitalSet.test ', clases: 2, fingerprint: fp }), editor);
    check(combo, 'aplicación correcta (email sin distinguir mayúsculas ni espacios)', ok === '', ok);
    const after = { P: await xp(P), Q: await xp(Q), A: await xp(A) };
    check(combo, 'P y Q: +25 en total_xp y lifetime_xp; A sin cambios', after.P.total_xp === before.P.total_xp + 25 && after.P.lifetime_xp === before.P.lifetime_xp + 25
      && after.Q.total_xp === before.Q.total_xp + 25 && after.Q.lifetime_xp === before.Q.lifetime_xp + 25
      && JSON.stringify(after.A) === JSON.stringify(before.A), JSON.stringify({ before, after }));
    const post = await one('03_post.sql');
    check(combo, 'POST todo_ok', post.todo_ok === true, JSON.stringify(post));
    const lote = (await db.query(`select approved_by, approved_by_email, approval_reference, applied_by_session from public.xp_adjustment_batches`)).rows[0];
    check(combo, 'TRAZABILIDAD: aprobador = id del perfil admin real, email tomado del perfil, referencia y sesión guardadas',
      lote.approved_by === ADM && lote.approved_by_email === ADMIN_EMAIL && lote.approval_reference.length > 5 && lote.applied_by_session.length > 0, JSON.stringify(lote));
    check(combo, 'clases intactas', JSON.stringify(JSON.parse(await snap(db)).lessons) === JSON.stringify(JSON.parse(s0).lessons));

    // Idempotencia.
    const s1 = await snap(db);
    const again = await attempt(db, fill(APPLY, { clases: 2, fingerprint: fp }), editor);
    check(combo, 'IDEMPOTENTE: repetir no cambia nada', again === '' && (await snap(db)) === s1, again);

    // Inmutabilidad del lote, incluso para el rol que ejecuta el SQL Editor.
    for (const [name, sql] of [['update', `update public.xp_adjustment_batches set rows_awarded = 99`],
      ['delete', `delete from public.xp_adjustment_batches`], ['truncate', `truncate public.xp_adjustment_batches`]]) {
      const m = await attempt(db, sql, editor);
      check(combo, `lote inmutable: ${name} rechazado`, /inmutable/.test(m) && (await snap(db)) === s1, m);
    }
    const forged = await attempt(db, `insert into public.xp_adjustment_batches (batch_code, reason, criteria, approved_by, approved_by_email, approval_reference, rows_awarded, xp_per_row, fingerprint)
      values ('lote_falso', 'motivo inventado aquí', 'criterio inventado', '${S}', 'x', 'referencia', 1, 25, '${'0'.repeat(32)}')`, editor);
    check(combo, 'no se puede registrar un lote con un aprobador que no es admin', /administrador activo/.test(forged), forged);

    // Clientes.
    const ins = await as(P, `insert into public.xp_adjustment_batches (batch_code, reason, criteria, approved_by, approved_by_email, approval_reference, rows_awarded, xp_per_row, fingerprint)
      values ('hack_batch', 'me regalo xp por favor', 'criterio cualquiera', '${ADM}', 'x', 'referencia', 1, 25, '${'0'.repeat(32)}')`);
    check(combo, 'un alumno no puede crear lotes', Boolean(ins.error), JSON.stringify(ins));
    const selS = await as(P, `select count(*)::int as n from public.xp_adjustment_batches`);
    check(combo, 'un alumno no ve los lotes', selS.rows?.[0]?.n === 0 || Boolean(selS.error), JSON.stringify(selS));
    const selA = await as(ADM, `select count(*)::int as n from public.xp_adjustment_batches`);
    check(combo, 'el admin sí ve el lote', selA.rows?.[0]?.n === 1, JSON.stringify(selA));
    const aw = await as(P, `select public.award_xp_once(auth.uid(), 'xp_adjustment', 'hack', 1000)`);
    check(combo, 'un alumno no puede llamar award_xp_once', Boolean(aw.error), JSON.stringify(aw));
    const led = await as(P, `insert into public.xp_ledger (user_id, source, source_ref, amount) values (auth.uid(), 'xp_adjustment', 'hack', 1000)`);
    check(combo, 'un alumno no puede escribir en el ledger', Boolean(led.error), JSON.stringify(led));

    // Interacción con la fase 3.
    await watch(P, 900);
    const r = await as(P, `select * from public.complete_lesson('set-academy', 'week-01', '${LESSON}')`);
    check(combo, 'P verifica su clase después: sin XP adicional', r.rows?.[0]?.xp_awarded === false && (await xp(P)).total_xp === before.P.total_xp + 25, JSON.stringify(r));

    // Rollback de esquema.
    const rb = await attempt(db, read(OPS + '04_rollback_schema.sql'), editor);
    check(combo, 'rollback de esquema aborta si ya hay compensaciones', /ya hay compensaciones/.test(rb) && (await one('03_post.sql')).todo_ok === true, rb);
    {
      const f = await setup({ defaults, editor });
      const fb = await snap(f.db);
      await run(f.db, read(OPS + '04_rollback_schema.sql'), editor);
      const reqs = (await f.one('01_pre.sql')).requisitos;
      const rejected = await attempt(f.db, `insert into public.xp_ledger (user_id, source, source_ref, amount) values ('${P}', 'xp_adjustment', 'x', 1)`, false);
      check(combo, 'rollback de esquema sin lotes: quita tabla y fuente, sin tocar datos', reqs.migracion_0004_aplicada === false
        && /xp_ledger_source_check/.test(rejected) && JSON.stringify(JSON.parse(await snap(f.db)).xp) === JSON.stringify(JSON.parse(fb).xp), rejected);
      const twice = await attempt(f.db, read(OPS + '04_rollback_schema.sql'), editor);
      check(combo, 'rollback de esquema repetible', twice === '' || /does not exist/.test(twice), twice);
    }

    // Requisitos previos.
    {
      const n3 = await setup({ defaults, with0003: false, editor });
      const p3 = await n3.one('01_pre.sql');
      const m = await attempt(n3.db, fill(APPLY, { clases: 2, fingerprint: p3.resumen.fingerprint }), editor);
      check(combo, 'sin la 0003 aplicada: PRE lo indica y el apply aborta sin cambios', p3.requisitos.migracion_0003_aplicada === false
        && /202610170003 no está aplicada/.test(m), m);
      const n4 = await setup({ defaults, with0004: false, editor });
      const b4 = await snap(n4.db);
      const m4 = await attempt(n4.db, fill(APPLY, { clases: 2, fingerprint: (await n4.one('01_pre.sql')).resumen.fingerprint }), editor);
      check(combo, 'sin la 0004: el apply falla y no deja nada aplicado', m4 !== '' && (await snap(n4.db)) === b4, m4);
    }
  }
}

console.table(results);
const failed = results.filter((x) => !x.ok).length;
console.log(failed ? `${failed} FALLAN` : `${results.length}/${results.length} OK`);
process.exit(failed ? 1 : 0);
