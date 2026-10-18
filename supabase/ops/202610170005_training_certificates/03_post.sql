-- POST · solo lectura. todo_ok debe ser true.
with tablas(t) as (
  values ('public.credential_definitions'::regclass), ('public.credential_test_accounts'::regclass),
         ('public.issued_credentials'::regclass), ('public.credential_events'::regclass)
), chk as (
  select
    (select bool_and(c.relrowsecurity) from pg_class c join tablas on tablas.t = c.oid)               as rls_activa,
    not exists (select 1 from pg_class c join tablas on tablas.t = c.oid cross join lateral aclexplode(c.relacl) x
                where x.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
                  and (x.grantee = 0 or x.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))) as sin_escritura_de_clientes,
    (select count(*) from public.credential_definitions
      where code = 'digital_set_training_certificate' and version = 1 and active
        and title = 'Constancia de Formación Digital SET' and issuer = 'DIGITAL SET'
        and jsonb_array_length(criteria->'required_lessons') = 4) = 1                              as definicion_v1,
    (select count(*) from pg_trigger
      where tgname in ('issued_credentials_guard', 'issued_credentials_guard_truncate', 'credential_events_guard',
                       'credential_events_guard_truncate', 'credential_definitions_guard')) = 5          as triggers_de_inmutabilidad,
    has_function_privilege('authenticated', 'public.issue_training_certificate(text)', 'execute')
      and not has_function_privilege('anon', 'public.issue_training_certificate(text)', 'execute')    as emision_solo_alumnos,
    has_function_privilege('authenticated', 'public.get_training_certificate_status()', 'execute')     as estado_para_alumnos,
    has_function_privilege('anon', 'public.verify_credential(text)', 'execute')                        as verificacion_publica,
    not has_function_privilege('authenticated', 'public.revoke_credential(text,text,text,text)', 'execute')
      and not has_function_privilege('anon', 'public.revoke_credential(text,text,text,text)', 'execute')
      and not has_function_privilege('authenticated', 'public.register_credential_test_account(text,text,text)', 'execute')
      and not has_function_privilege('authenticated', 'public.evaluate_training_certificate(uuid)', 'execute') as admin_sin_acceso_api
)
select json_build_object(
  'todo_ok', rls_activa and sin_escritura_de_clientes and definicion_v1 and triggers_de_inmutabilidad
             and emision_solo_alumnos and estado_para_alumnos and verificacion_publica and admin_sin_acceso_api,
  'detalle', row_to_json(chk),
  'constancias_emitidas', (select count(*) from public.issued_credentials),
  -- Comparar con el PRE: la migración no toca datos existentes.
  'referencia', json_build_object(
    'lesson_progress', (select count(*) from public.lesson_progress),
    'xp_total', (select coalesce(sum(total_xp), 0) from public.user_streaks),
    'xp_lifetime', (select coalesce(sum(lifetime_xp), 0) from public.user_streaks))
) as post_0005
from chk;
