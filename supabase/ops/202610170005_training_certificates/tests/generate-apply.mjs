// Genera 02_apply.sql a partir de la migración 202610170005: el mismo texto,
// dentro de un único bloque DO con comprobaciones finales. Ejecutar tras
// cambiar la migración: node supabase/ops/202610170005_training_certificates/tests/generate-apply.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

import { fileURLToPath } from 'node:url';
const WT = fileURLToPath(new URL('../../../../', import.meta.url));
const mig = readFileSync(WT + 'supabase/migrations/202610170005_training_certificates.sql', 'utf8');
const body = mig.slice(mig.indexOf('-- ─── 1.'));
// Sin reindentar: el texto de las funciones debe quedar idéntico al de la migración.
const indented = body.trimEnd();

const out = `-- APLICAR · migración 202610170005 (Constancia de Formación Digital SET).
--
-- Es UNA sola sentencia (bloque DO): Postgres la aplica entera o nada, sin
-- depender de cómo el SQL Editor de Supabase agrupe las sentencias (ver el
-- incidente de la 0003). Contiene exactamente el texto de
-- supabase/migrations/202610170005_training_certificates.sql (generado; no
-- editar a mano) más comprobaciones finales. Si ya estaba aplicada, avisa y
-- no cambia nada. Solo crea objetos nuevos: no modifica datos existentes.
do $apply$
begin
  if to_regclass('public.issued_credentials') is not null then
    raise notice 'La migración 202610170005 ya estaba aplicada: no se hizo ningún cambio.';
    return;
  end if;
  perform set_config('lock_timeout', '5s', true);

${indented}

  -- ─── Autoverificación ───────────────────────────────────────────────────
  if (select count(*) from public.credential_definitions where code = 'digital_set_training_certificate' and active) <> 1
     or (select jsonb_array_length(criteria->'required_lessons') from public.credential_definitions
          where code = 'digital_set_training_certificate' and active) <> 4 then
    raise exception 'ABORTADO: la definición de la constancia no quedó bien sembrada';
  end if;
  if exists (select 1 from pg_class c cross join lateral aclexplode(c.relacl) x
             where c.oid in ('public.credential_definitions'::regclass, 'public.credential_test_accounts'::regclass,
                             'public.issued_credentials'::regclass, 'public.credential_events'::regclass)
               and x.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
               and (x.grantee = 0 or x.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))) then
    raise exception 'ABORTADO: algún cliente puede escribir en las tablas de credenciales';
  end if;
  if has_function_privilege('anon', 'public.issue_training_certificate(text)', 'execute')
     or has_function_privilege('authenticated', 'public.revoke_credential(text,text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.register_credential_test_account(text,text,text)', 'execute')
     or not has_function_privilege('anon', 'public.verify_credential(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.issue_training_certificate(text)', 'execute') then
    raise exception 'ABORTADO: permisos de ejecución inesperados';
  end if;
end
$apply$;
`;
mkdirSync(WT + 'supabase/ops/202610170005_training_certificates', { recursive: true });
writeFileSync(WT + 'supabase/ops/202610170005_training_certificates/02_apply.sql', out);
console.log('02_apply.sql generado,', out.split('\n').length, 'líneas');
