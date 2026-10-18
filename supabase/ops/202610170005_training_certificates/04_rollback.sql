-- ROLLBACK CONDICIONADO de 202610170005 · una sola sentencia (bloque DO).
--
-- Solo retira la migración si NO se ha emitido ninguna constancia (ni
-- siquiera de prueba): una credencial emitida es un registro real que no se
-- borra, se revoca (06_revoke_credential.sql). Si ya hay constancias, aborta
-- sin cambiar nada; en ese caso el camino es revertir solo el frontend.
-- Se puede repetir sin riesgo.
do $$
begin
  if to_regclass('public.issued_credentials') is null then
    raise notice 'La migración 202610170005 no está aplicada: no hay nada que revertir.';
    return;
  end if;
  if exists (select 1 from public.issued_credentials) then
    raise exception 'ABORTADO: ya hay constancias emitidas; no se borran (revócalas si hace falta)';
  end if;

  perform set_config('lock_timeout', '5s', true);
  drop function if exists public.issue_training_certificate(text);
  drop function if exists public.get_training_certificate_status();
  drop function if exists public.verify_credential(text);
  drop function if exists public.revoke_credential(text, text, text, text);
  drop function if exists public.register_credential_test_account(text, text, text);
  drop function if exists public.credential_public_view(public.issued_credentials);
  drop function if exists public.evaluate_training_certificate(uuid);
  drop table public.credential_events;
  drop table public.issued_credentials;
  drop table public.credential_test_accounts;
  drop table public.credential_definitions;
  drop function if exists public.guard_issued_credentials();
  drop function if exists public.guard_credential_events();
  drop function if exists public.guard_credential_definitions();
end $$;
