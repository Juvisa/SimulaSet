-- SET Passport · comprobación previa al despliegue en producción (E1).
-- SOLO LECTURA. Confirma que las migraciones del pasaporte ya están aplicadas
-- (202610130001_create_setter_passports y 202610160001_passport_professional_profile)
-- con los permisos esperados. todo_ok debe ser true antes del merge a main.
-- Si falta algún objeto, el valor correspondiente sale en false (sin error).
with obj as (
  select to_regclass('public.setter_passports') as passports,
         to_regclass('public.passport_ai_generations') as generations,
         to_regprocedure('public.passport_ai_reserve(uuid)') as reserve,
         to_regprocedure('public.passport_ai_finish(uuid,uuid,boolean,integer,integer)') as finish,
         to_regprocedure('public.passport_ai_quota(uuid)') as quota
), cols as (
  select count(*) filter (where column_name in ('headline', 'summary', 'timezone', 'languages', 'skills', 'tools', 'niches',
                                                'experience_track', 'experiences', 'preferred_roles', 'work_modes', 'opportunity_notes')) as n
  from information_schema.columns where table_schema = 'public' and table_name = 'setter_passports'
), chk as (
  select
    obj.passports is not null                                                                   as tabla_setter_passports,
    cols.n = 12                                                                                 as columnas_bloques_1_y_3,
    coalesce((select relrowsecurity from pg_class where oid = obj.passports), false)            as rls_setter_passports,
    case when obj.passports is null then false
         else not has_table_privilege('anon', obj.passports, 'select') end                      as anon_sin_acceso,
    case when cols.n < 12 then false
         else has_table_privilege('authenticated', obj.passports, 'select')
              and has_column_privilege('authenticated', obj.passports, 'headline', 'update')
              and has_column_privilege('authenticated', obj.passports, 'experiences', 'update')
              and not has_column_privilege('authenticated', obj.passports, 'updated_at', 'update')
              and not has_table_privilege('authenticated', obj.passports, 'delete') end         as permisos_alumno_por_columna,
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'setter_passports'
       and policyname in ('setter_passports_select_own_or_admin', 'setter_passports_insert_own_active',
                          'setter_passports_update_own_active')) = 3                            as politicas,
    case when obj.generations is null then false
         else not has_table_privilege('authenticated', obj.generations, 'select') end           as cuota_ia_privada,
    obj.reserve is not null and obj.finish is not null and obj.quota is not null                as funciones_cuota,
    case when obj.reserve is null then false
         else not has_function_privilege('authenticated', obj.reserve, 'execute')
              and not has_function_privilege('anon', obj.reserve, 'execute')
              and has_function_privilege('service_role', obj.reserve, 'execute') end            as cuota_solo_servidor
  from obj, cols
)
select json_build_object(
  'todo_ok', tabla_setter_passports and columnas_bloques_1_y_3 and rls_setter_passports and anon_sin_acceso
             and permisos_alumno_por_columna and politicas and cuota_ia_privada and funciones_cuota and cuota_solo_servidor,
  'detalle', row_to_json(chk)
) as check_set_passport
from chk;
