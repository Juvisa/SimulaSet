-- ADMIN · registrar una cuenta de prueba. Una sola sentencia.
-- Las constancias que esa cuenta emita DESPUÉS quedan marcadas como prueba
-- (is_test) y la verificación pública lo indica. Ejecutar ANTES de que la
-- cuenta de prueba emita su constancia. Se puede repetir sin riesgo.
-- Reemplazar los 3 valores <<…>>.
select public.register_credential_test_account(
  '<<EMAIL DE LA CUENTA DE PRUEBA>>',
  '<<NOTA (por ejemplo: cuenta de QA de Digital SET)>>',
  '<<EMAIL DEL ADMINISTRADOR QUE LA REGISTRA>>'
) as resultado;
