-- ADMIN · revocar una constancia (auditado). Una sola sentencia.
-- No borra nada: la constancia pasa a "revocada", la verificación pública lo
-- muestra y queda un evento con el administrador, el motivo y la nota.
-- Motivos: prueba | error_emision | solicitud_titular | fraude | otro
--   (con "fraude" el alumno no puede volver a emitirla por sí mismo).
-- Reemplazar los 4 valores <<…>>.
select public.revoke_credential(
  '<<CÓDIGO, por ejemplo DSF-XXXX-XXXX-XXXX-XXXX>>',
  '<<MOTIVO>>',
  '<<NOTA: por qué se revoca>>',
  '<<EMAIL DEL ADMINISTRADOR QUE REVOCA>>'
) as resultado;
