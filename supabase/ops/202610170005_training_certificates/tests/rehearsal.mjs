// Ensayo de la migración 202610170005 (Constancia de Formación Digital SET)
// en PGlite (Postgres en memoria). NO se conecta a Supabase.
//
// Uso, desde la raíz del repo (no modifica package.json):
//   npm i --no-save @electric-sql/pglite
//   node supabase/ops/202610170005_training_certificates/tests/rehearsal.mjs
//
// Cada escenario corre en modo "script" (archivo completo) y "editor" (como el
// SQL Editor de Supabase: cada sentencia en su propia transacción), con y sin
// los default privileges de Supabase. Las clases se verifican de verdad:
// registrando visualización y llamando a complete_lesson() como el alumno.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OPS = fileURLToPath(new URL('../', import.meta.url));
const MIG = fileURLToPath(new URL('../../../migrations/', import.meta.url));
const read = (path) => readFileSync(path, 'utf8');
const MIGRATION = read(MIG + '202610170005_training_certificates.sql');
const ops = (file) => read(OPS + file);

const results = [];
const check = (combo, name, ok, detail = '') => results.push({ combo, name, ok: Boolean(ok), detail: ok ? '' : String(detail).slice(0, 180) });

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
    if (/^(begin|commit)\b/i.test(st)) continue;
    await db.exec('begin');
    try { await db.exec(st); await db.exec('commit'); } catch (e) { await db.exec('rollback'); throw e; }
  }
};
const run = (db, sql, editor) => (editor ? runEditor(db, sql) : db.exec(sql));
const attempt = async (fn) => { try { await fn(); return ''; } catch (e) { return e.message; } };

const U = (c) => `00000000-0000-0000-0000-0000000000${c}`;
const S1 = U('01'); // 4 clases verificadas
const S2 = U('02'); // 3 verificadas + 1 legacy
const S3 = U('03'); // 4 legacy (antes del control)
const SX = U('04'); // 4 verificadas pero cuenta inactiva
const T = U('0e');  // cuenta de prueba, 4 verificadas
const ADM = U('ad');
const ADMIN_EMAIL = 'admin@digitalset.test';
const LESSONS = [
  ['week-01', 'set-method-foundations'], ['week-02', 'conversations-that-book-and-sell'],
  ['week-03', 'objections-and-follow-up'], ['week-04', 'opportunities-and-interviews'],
];

async function setup({ defaults }) {
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
  await db.exec(`insert into auth.users (id, email) values ('${S1}','s1@x'),('${S2}','s2@x'),('${S3}','s3@x'),('${SX}','sx@x'),('${T}','qa@digitalset.test'),('${ADM}','${ADMIN_EMAIL}');
    update public.profiles set email = u.email, name = 'Alumna ' || right(u.id::text, 2) from auth.users u where u.id = profiles.id;
    update public.profiles set name = 'María José Pérez' where id = '${S1}';
    update public.profiles set role = 'admin', name = 'Admin Digital SET' where id = '${ADM}';
    ${LESSONS.map(([m, l], i) => `update public.academy_lessons set video_provider = 'mux', mux_asset_id = 'a${i}', mux_playback_id = 'p${i}', video_status = 'ready', duration_seconds = 1000 where module_id = '${m}' and lesson_id = '${l}';`).join('\n')}
    insert into public.lesson_progress (user_id, course_id, module_id, lesson_id, status, completed_at) values
      ${LESSONS.map(([m, l]) => `('${S3}', 'set-academy', '${m}', '${l}', 'completed', '2026-09-20')`).join(',\n')},
      ('${S2}', 'set-academy', 'week-04', 'opportunities-and-interviews', 'completed', '2026-09-20');
    insert into public.user_streaks (user_id, total_xp, lifetime_xp) values ('${S1}', 10, 10), ('${S2}', 20, 20);`);
  for (const f of ['202610170001_create_xp_ledger.sql', '202610170002_verified_lesson_progress.sql', '202610170003_lock_lesson_progress_writes.sql']) await db.exec(read(MIG + f));

  const as = async (uid, sql, params = []) => {
    try {
      await db.exec('begin');
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid || '']);
      await db.exec(`set local role ${uid ? 'authenticated' : 'anon'}`);
      const r = await db.query(sql, params);
      await db.exec('commit');
      return { rows: r.rows };
    } catch (e) { await db.exec('rollback'); return { error: e.message }; }
  };
  const lessonIds = {};
  for (const [m, l] of LESSONS) lessonIds[l] = (await db.query(`select id from public.academy_lessons where module_id = $1 and lesson_id = $2`, [m, l])).rows[0].id;
  // Verificación real: visualización registrada + complete_lesson() como el alumno.
  const verifyLesson = async (uid, [m, l], seconds = 900) => {
    const i = LESSONS.findIndex((x) => x[1] === l);
    await db.query(`insert into public.lesson_watch_progress (user_id, lesson_id, mux_asset_id, duration_seconds, watched, watched_seconds)
      values ($1, $2, $3, 1000, int4multirange(int4range(0, $4::int)), $4)
      on conflict (user_id, lesson_id) do update set watched = excluded.watched, watched_seconds = excluded.watched_seconds`, [uid, lessonIds[l], `a${i}`, seconds]);
    const r = await as(uid, `select * from public.complete_lesson('set-academy', $1, $2)`, [m, l]);
    if (r.error) throw new Error('complete_lesson: ' + r.error);
    return r.rows[0];
  };
  for (const lesson of LESSONS) { await verifyLesson(S1, lesson); await verifyLesson(T, lesson); await verifyLesson(SX, lesson); }
  for (const lesson of LESSONS.slice(0, 3)) await verifyLesson(S2, lesson);
  await db.exec(`update public.profiles set active = false where id = '${SX}'`);
  return { db, as, verifyLesson };
}

const json = async (db, sql) => Object.values((await db.query(sql)).rows[0])[0];
const schemaSnapshot = async (db) => JSON.stringify({
  columns: (await db.query(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
    where table_schema = 'public' and table_name in ('credential_definitions','credential_test_accounts','issued_credentials','credential_events')
    order by 1, 2`)).rows,
  acl: (await db.query(`select relname, relacl::text, relrowsecurity from pg_class
    where relname in ('credential_definitions','credential_test_accounts','issued_credentials','credential_events') order by 1`)).rows,
  policies: (await db.query(`select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies
    where tablename in ('credential_definitions','credential_test_accounts','issued_credentials','credential_events') order by 1, 2`)).rows,
  functions: (await db.query(`select proname, pg_get_function_identity_arguments(oid) args, proacl::text, prosecdef, md5(prosrc) src
    from pg_proc where pronamespace = 'public'::regnamespace and proname in ('guard_issued_credentials','guard_credential_events',
    'guard_credential_definitions','evaluate_training_certificate','credential_public_view','get_training_certificate_status',
    'issue_training_certificate','verify_credential','revoke_credential','register_credential_test_account') order by 1`)).rows,
  triggers: (await db.query(`select tgname, tgrelid::regclass::text from pg_trigger where tgname like '%credential%' order by 1`)).rows,
  indexes: (await db.query(`select indexdef from pg_indexes where tablename in ('credential_definitions','credential_test_accounts','issued_credentials','credential_events') order by 1`)).rows,
  definitions: (await db.query(`select code, version, title, issuer, description, criteria, consent_version, consent_text, active from public.credential_definitions order by 1, 2`)).rows,
});
const dataSnapshot = async (db) => JSON.stringify({
  lessons: (await db.query(`select * from public.lesson_progress order by user_id, module_id, lesson_id`)).rows,
  xp: (await db.query(`select user_id, total_xp, lifetime_xp from public.user_streaks order by 1`)).rows,
  ledger: (await db.query(`select user_id, source, source_ref, amount from public.xp_ledger order by 1, 2, 3`)).rows,
});
const credSnapshot = async (db) => JSON.stringify((await db.query(`select * from public.issued_credentials order by issued_at, public_code`)).rows);

// ── Estático ──
for (const f of ['01_pre.sql', '02_apply.sql', '03_post.sql', '04_rollback.sql', '05_register_test_account.sql', '06_revoke_credential.sql']) {
  const n = splitSql(ops(f)).length;
  check('estático', `${f} es UNA sola sentencia`, n === 1, n);
}
{
  const norm = (s) => s.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();
  const migStmts = splitSql(MIGRATION).map(norm);
  const applyNorm = norm(ops('02_apply.sql'));
  const missing = migStmts.filter((st) => !applyNorm.includes(st));
  check('estático', `02_apply.sql contiene literalmente las ${migStmts.length} sentencias de la migración`, migStmts.length > 40 && missing.length === 0, missing[0]);
  const writes = migStmts.filter((st) => /^(insert|update|delete)\b/i.test(st));
  check('estático', 'la migración solo escribe datos en su propio catálogo (1 insert en credential_definitions)',
    writes.length === 1 && /^insert into public\.credential_definitions/i.test(writes[0]), writes.map((w) => w.slice(0, 60)).join(' | '));
}

for (const editor of [false, true]) {
  for (const defaults of [false, true]) {
    const combo = `${editor ? 'editor' : 'script'}${defaults ? '+defaults' : ''}`;

    // ── 1. Migración y 02_apply dejan el mismo esquema, sin tocar datos ──
    {
      const m = await setup({ defaults }); const a = await setup({ defaults });
      const d0 = await dataSnapshot(m.db);
      await run(m.db, MIGRATION, editor);
      await run(a.db, ops('02_apply.sql'), editor);
      const sm = await schemaSnapshot(m.db); const sa = await schemaSnapshot(a.db);
      check(combo, 'EQUIVALENCIA: columnas, permisos, RLS, políticas, funciones, triggers, índices y definición idénticos', sm === sa);
      check(combo, 'la migración no cambia clases, XP ni ledger', (await dataSnapshot(m.db)) === d0);
      let again = '';
      try { await run(a.db, ops('02_apply.sql'), editor); } catch (e) { again = e.message; }
      check(combo, 'repetir 02_apply: avisa y no cambia nada', again === '' && (await schemaSnapshot(a.db)) === sa, again);
    }

    const { db, as, verifyLesson } = await setup({ defaults });
    const pre = await json(db, ops('01_pre.sql'));
    check(combo, 'PRE: requisitos en true', Object.values(pre.requisitos).every(Boolean), JSON.stringify(pre.requisitos));
    check(combo, 'PRE: 3 alumnos con 4 clases verificadas (S1, T, SX), 1 con 3 (S2); S3 legacy no cuenta',
      pre.alumnos_por_clases_verificadas.con_4 === 3 && pre.alumnos_por_clases_verificadas.con_3 === 1, JSON.stringify(pre.alumnos_por_clases_verificadas));
    const d0 = await dataSnapshot(db);
    await run(db, ops('02_apply.sql'), editor);
    const post = await json(db, ops('03_post.sql'));
    check(combo, 'POST todo_ok', post.todo_ok === true, JSON.stringify(post.detalle));
    check(combo, 'POST: referencias iguales al PRE', JSON.stringify(post.referencia) === JSON.stringify(pre.referencia));
    check(combo, 'PRE posterior: objetos_0005_ausentes = false', (await json(db, ops('01_pre.sql'))).requisitos.objetos_0005_ausentes === false);

    // ── 2. El navegador no puede escribir nada ──
    const fakeEvidence = `'{}'::jsonb, '${'a'.repeat(64)}'`;
    for (const [name, sql] of [
      ['insertar una credencial', `insert into public.issued_credentials (public_code, user_id, definition_code, definition_version, title, issuer, holder_name, evidence, evidence_sha256, consent_version, consent_at) values ('DSF-AAAA-AAAA-AAAA-AAAA', auth.uid(), 'digital_set_training_certificate', 1, 'x', 'y', 'z', ${fakeEvidence}, 'publica_v1', now())`],
      ['modificar la definición', `update public.credential_definitions set criteria = '{}'::jsonb`],
      ['insertar un evento', `insert into public.credential_events (credential_id, event) values (gen_random_uuid(), 'issued')`],
      ['marcarse como cuenta de prueba', `insert into public.credential_test_accounts (user_id, note, registered_by) values (auth.uid(), 'yo mismo', auth.uid())`],
      ['revocar', `select public.revoke_credential('DSF-AAAA-AAAA-AAAA-AAAA', 'otro', 'intento', '${ADMIN_EMAIL}')`],
      ['registrar cuenta de prueba', `select public.register_credential_test_account('s1@x', 'nota de prueba', '${ADMIN_EMAIL}')`],
      ['evaluar a otro alumno', `select public.evaluate_training_certificate('${T}')`],
    ]) {
      const r = await as(S1, sql);
      check(combo, `alumno NO puede: ${name}`, Boolean(r.error), JSON.stringify(r));
    }
    check(combo, 'anónimo NO puede emitir ni ver estado', Boolean((await as(null, `select public.issue_training_certificate('publica_v1')`)).error)
      && Boolean((await as(null, `select public.get_training_certificate_status()`)).error));

    // ── 3. Elegibilidad ──
    const st2 = (await as(S2, `select public.get_training_certificate_status() as s`)).rows[0].s;
    check(combo, 'S2 (3 verificadas + 1 legacy): no elegible, 3 clases ok', st2.eligible === false && st2.lessons.filter((l) => l.ok).length === 3, JSON.stringify(st2.lessons));
    check(combo, 'S2 emitir → not_eligible', (await as(S2, `select public.issue_training_certificate('publica_v1') as r`)).rows[0].r.outcome === 'not_eligible');
    const st3 = (await as(S3, `select public.get_training_certificate_status() as s`)).rows[0].s;
    check(combo, 'S3 (solo legacy): 0 clases ok, no elegible', st3.eligible === false && st3.lessons.every((l) => !l.ok));
    const st1 = (await as(S1, `select public.get_training_certificate_status() as s`)).rows[0].s;
    check(combo, 'S1: elegible, 4 clases ok con título, sin credencial', st1.eligible === true && st1.lessons.length === 4
      && st1.lessons.every((l) => l.ok && l.title && l.verified_percent >= 85) && st1.credential === null, JSON.stringify(st1));
    check(combo, 'estado incluye título, emisor y texto de consentimiento', st1.definition.title === 'Constancia de Formación Digital SET'
      && st1.definition.issuer === 'DIGITAL SET' && /enlace de verificación/.test(st1.definition.consent_text));

    // ── 4. Consentimiento y emisión ──
    for (const v of ['', 'publica_v0']) {
      const r = (await as(S1, `select public.issue_training_certificate($1) as r`, [v])).rows[0].r;
      check(combo, `sin consentimiento vigente ("${v}") → consent_required`, r.outcome === 'consent_required', JSON.stringify(r));
    }
    const nullConsent = (await as(S1, `select public.issue_training_certificate(null) as r`)).rows[0].r;
    check(combo, 'consentimiento nulo → consent_required', nullConsent.outcome === 'consent_required');
    const xpBefore = await dataSnapshot(db);
    const issued = (await as(S1, `select public.issue_training_certificate('publica_v1') as r`)).rows[0].r;
    check(combo, 'S1 emite → issued con código DSF-XXXX-XXXX-XXXX-XXXX', issued.outcome === 'issued'
      && /^DSF-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(issued.credential.public_code), JSON.stringify(issued));
    const code = issued.credential.public_code;
    const row = (await db.query(`select *, encode(sha256(convert_to(evidence::text, 'UTF8')), 'hex') = evidence_sha256 as sha_ok from public.issued_credentials where public_code = $1`, [code])).rows[0];
    check(combo, 'registro: titular, título, emisor, consentimiento, no es prueba', row.holder_name === 'María José Pérez'
      && row.title === 'Constancia de Formación Digital SET' && row.issuer === 'DIGITAL SET' && row.consent_version === 'publica_v1' && row.is_test === false);
    check(combo, 'evidencia congelada: 4 clases verified_watch ≥ 85 y hash SHA-256 correcto', row.sha_ok === true
      && row.evidence.lessons.length === 4 && row.evidence.lessons.every((l) => l.completion_source === 'verified_watch' && Number(l.verified_percent) >= 85));
    check(combo, 'auditoría: evento issued con actor = alumno', Number((await db.query(`select count(*) n from public.credential_events where credential_id = $1 and event = 'issued' and actor = $2`, [row.id, S1])).rows[0].n) === 1);
    check(combo, 'emitir no cambia clases, XP ni ledger', (await dataSnapshot(db)) === xpBefore);
    const again = (await as(S1, `select public.issue_training_certificate('publica_v1') as r`)).rows[0].r;
    check(combo, 'IDEMPOTENTE: emitir otra vez → already_issued, mismo código, 1 fila', again.outcome === 'already_issued' && again.credential.public_code === code
      && Number((await db.query(`select count(*) n from public.issued_credentials where user_id = $1`, [S1])).rows[0].n) === 1);
    const st1b = (await as(S1, `select public.get_training_certificate_status() as s`)).rows[0].s;
    check(combo, 'estado muestra la credencial activa', st1b.credential?.public_code === code && st1b.credential.status === 'active');
    await db.exec(`update public.profiles set name = 'Otro Nombre' where id = '${S1}'`);
    check(combo, 'cambiar el nombre del perfil no altera la constancia', (await db.query(`select holder_name from public.issued_credentials where public_code = $1`, [code])).rows[0].holder_name === 'María José Pérez');

    // ── 5. Verificación pública ──
    const v = (await as(null, `select public.verify_credential($1) as v`, [`  ${code.toLowerCase()} `])).rows[0].v;
    check(combo, 'anónimo verifica (minúsculas y espacios): nombre, título, emisor, fecha, estado', v.found === true && v.holder_name === 'María José Pérez'
      && v.title === 'Constancia de Formación Digital SET' && v.issuer === 'DIGITAL SET' && v.status === 'active' && v.issued_at && v.is_test === false, JSON.stringify(v));
    check(combo, 'la verificación NO expone user_id, email, evidencia ni hash', !JSON.stringify(v).includes(S1) && !('user_id' in v) && !('evidence' in v)
      && !('evidence_sha256' in v) && !JSON.stringify(v).includes('s1@x'));
    for (const bad of ['DSF-0000-0000-0000-0000', 'xyz', '', "DSF-' or 1=1 --"]) {
      const r = (await as(null, `select public.verify_credential($1) as v`, [bad])).rows[0].v;
      check(combo, `código inexistente o inválido ("${bad}") → found false`, r.found === false);
    }
    check(combo, 'otro alumno no ve la fila de S1 (RLS)', (await as(S2, `select count(*)::int n from public.issued_credentials`)).rows[0].n === 0);

    // ── 6. Inmutabilidad (incluso desde el SQL Editor) ──
    const c0 = await credSnapshot(db);
    for (const [name, sql] of [
      ['editar el nombre', `update public.issued_credentials set holder_name = 'Falso'`],
      ['activar una revocada / cambiar estado', `update public.issued_credentials set status = 'revoked', revoked_at = now(), revoked_by = '${ADM}', revoked_reason_code = 'otro'`],
      ['borrar', `delete from public.issued_credentials`],
      ['vaciar', `truncate public.issued_credentials cascade`],
      ['borrar eventos', `delete from public.credential_events`],
      ['cambiar el criterio publicado', `update public.credential_definitions set criteria = '{}'::jsonb`],
    ]) {
      const m = await attempt(() => run(db, sql, editor));
      check(combo, `inmutable: ${name} rechazado`, m !== '' && (await credSnapshot(db)) === c0, m);
    }

    // ── 7. Cuentas no autorizadas ──
    check(combo, 'cuenta inactiva no puede emitir', Boolean((await as(SX, `select public.issue_training_certificate('publica_v1')`)).error));
    check(combo, 'el admin no emite constancias para sí', Boolean((await as(ADM, `select public.issue_training_certificate('publica_v1')`)).error));

    // ── 8. Cuenta de prueba ──
    const reg = await attempt(() => run(db, ops('05_register_test_account.sql').replace('<<EMAIL DE LA CUENTA DE PRUEBA>>', 'QA@digitalset.test')
      .replace('<<NOTA (por ejemplo: cuenta de QA de Digital SET)>>', 'Cuenta de QA').replace('<<EMAIL DEL ADMINISTRADOR QUE LA REGISTRA>>', ADMIN_EMAIL), editor));
    check(combo, '05: registrar cuenta de prueba', reg === '', reg);
    const badReg = await attempt(() => db.query(`select public.register_credential_test_account('qa@digitalset.test', 'nota', 's1@x')`));
    check(combo, '05: aborta si quien registra no es admin', /no es un administrador activo/.test(badReg), badReg);
    const tIssued = (await as(T, `select public.issue_training_certificate('publica_v1') as r`)).rows[0].r;
    check(combo, 'la constancia de la cuenta de prueba queda marcada como prueba', tIssued.outcome === 'issued' && tIssued.credential.is_test === true);
    const tv = (await as(null, `select public.verify_credential($1) as v`, [tIssued.credential.public_code])).rows[0].v;
    check(combo, 'la verificación pública indica que es de prueba', tv.is_test === true);

    // ── 9. Revocación auditada ──
    const revokeSql = (c, reason, email) => ops('06_revoke_credential.sql').replace('<<CÓDIGO, por ejemplo DSF-XXXX-XXXX-XXXX-XXXX>>', c)
      .replace('<<MOTIVO>>', reason).replace('<<NOTA: por qué se revoca>>', 'Revocación de prueba de QA').replace('<<EMAIL DEL ADMINISTRADOR QUE REVOCA>>', email);
    const before = await credSnapshot(db);
    const badRev = await attempt(() => run(db, revokeSql(tIssued.credential.public_code, 'prueba', 's1@x'), editor));
    check(combo, '06: aborta si quien revoca no es admin, sin cambios', /no es un administrador activo/.test(badRev) && (await credSnapshot(db)) === before, badRev);
    const rev = await attempt(() => run(db, revokeSql(tIssued.credential.public_code, 'prueba', ADMIN_EMAIL), editor));
    check(combo, '06: revocar la constancia de prueba', rev === '', rev);
    const tv2 = (await as(null, `select public.verify_credential($1) as v`, [tIssued.credential.public_code])).rows[0].v;
    check(combo, 'verificación muestra "revoked" con fecha', tv2.status === 'revoked' && tv2.revoked_at);
    check(combo, 'auditoría: evento revoked con actor = admin, motivo y nota', Number((await db.query(`select count(*) n from public.credential_events e
      join public.issued_credentials c on c.id = e.credential_id where c.public_code = $1 and e.event = 'revoked' and e.actor = $2
      and e.detail->>'reason_code' = 'prueba'`, [tIssued.credential.public_code, ADM])).rows[0].n) === 1);
    const revAgain = await attempt(() => run(db, revokeSql(tIssued.credential.public_code, 'prueba', ADMIN_EMAIL), editor));
    check(combo, 'revocar dos veces: sin error ni evento extra', revAgain === '' && Number((await db.query(`select count(*) n from public.credential_events where event = 'revoked'`)).rows[0].n) === 1);
    const tNew = (await as(T, `select public.issue_training_certificate('publica_v1') as r`)).rows[0].r;
    check(combo, 'tras revocar por prueba se puede volver a emitir (código nuevo); la revocada se conserva', tNew.outcome === 'issued'
      && tNew.credential.public_code !== tIssued.credential.public_code
      && Number((await db.query(`select count(*) n from public.issued_credentials where user_id = $1`, [T])).rows[0].n) === 2);
    await run(db, revokeSql(code, 'fraude', ADMIN_EMAIL), editor);
    const blocked = (await as(S1, `select public.issue_training_certificate('publica_v1') as r`)).rows[0].r;
    const stBlocked = (await as(S1, `select public.get_training_certificate_status() as s`)).rows[0].s;
    check(combo, 'revocada por fraude: el alumno no puede volver a emitirla', blocked.outcome === 'blocked' && stBlocked.blocked === true && stBlocked.credential === null);

    // ── 10. Rollback condicionado ──
    const withCreds = await schemaSnapshot(db);
    const rb = await attempt(() => run(db, ops('04_rollback.sql'), editor));
    check(combo, 'rollback ABORTA si hay constancias emitidas, sin cambios', /ya hay constancias emitidas/.test(rb) && (await schemaSnapshot(db)) === withCreds, rb);
    {
      const f = await setup({ defaults });
      const fd = await dataSnapshot(f.db);
      await run(f.db, ops('02_apply.sql'), editor);
      await run(f.db, ops('04_rollback.sql'), editor);
      const p = await json(f.db, ops('01_pre.sql'));
      check(combo, 'rollback sin constancias: retira todo y deja los datos intactos', p.requisitos.objetos_0005_ausentes === true
        && (await dataSnapshot(f.db)) === fd && Number((await f.db.query(`select count(*) n from pg_proc where proname like '%credential%' or proname like '%training_certificate%'`)).rows[0].n) === 0);
      const twice = await attempt(() => run(f.db, ops('04_rollback.sql'), editor));
      check(combo, 'rollback repetible', twice === '', twice);
      await run(f.db, ops('02_apply.sql'), editor);
      check(combo, 're-aplicar tras rollback → POST todo_ok', (await json(f.db, ops('03_post.sql'))).todo_ok === true);
    }
    check(combo, 'datos de clases, XP y ledger nunca cambiaron', (await dataSnapshot(db)) === d0);
  }
}

console.table(results);
const failed = results.filter((x) => !x.ok).length;
console.log(failed ? `${failed} FALLAN` : `${results.length}/${results.length} OK`);
process.exit(failed ? 1 : 0);
