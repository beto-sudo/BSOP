-- Expone el schema `health` a PostgREST (db_schemas) para que supabase-js
-- pueda hacer .schema('health').from('protocolo_*'). Hasta ahora `health`
-- vivía SIN exponer: el dashboard lo lee vía vistas shim en `public`. La
-- bitácora de protocolo (iniciativa salud-protocolo) lee health.protocolo_*
-- directamente, que requiere el schema expuesto. Autorizado por Beto.
-- Mismo patrón que erp/dilesa/playtomic/maquinaria_expose_schema.
--
-- Seguridad: las tablas protocolo_* tienen RLS deny-all + grants solo a
-- service_role → exponer el schema NO las hace accesibles a authenticated/anon.
-- Las health_* (métricas) ya eran accesibles vía las vistas public con los
-- mismos grants — exponer el schema no agrega superficie nueva.
-- Preserva exactamente la lista previa (pg_roles.rolconfig) + health.
ALTER ROLE authenticator
  SET pgrst.db_schemas = 'public, graphql_public, core, erp, rdb, playtomic, dilesa, maquinaria, health';

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
