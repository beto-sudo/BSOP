-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-1b — Expose dilesa + maquinaria to PostgREST
-- ════════════════════════════════════════════════════════════════════════════
--
-- Sprint dilesa-0 creó los schemas `dilesa` y `maquinaria` con GRANT USAGE,
-- pero **no** los agregó al setting `pgrst.db_schemas` del rol `authenticator`.
-- Resultado: el REST API (y por ende supabase-js) devuelve 406/"Invalid schema"
-- para cualquier request a estos schemas.
--
-- Este fix se aplica ahora (no en dilesa-0) porque es el sprint dilesa-1b el
-- primero que necesita acceso vía REST (scripts de migración Coda→BSOP usan
-- supabase-js). Mantenerlo como migración versionada asegura reproducibilidad
-- en `supabase db reset` y en entornos nuevos.
--
-- Valor explícito para evitar drift contra la config del dashboard. Incluye
-- los schemas que ya estaban expuestos (probados con curl el 2026-04-23):
--   public, graphql_public, core, erp, rdb, playtomic  → ya funcionaban
--   dilesa, maquinaria                                 → se agregan aquí

ALTER ROLE authenticator SET pgrst.db_schemas =
  'public, graphql_public, core, erp, rdb, playtomic, dilesa, maquinaria';

-- PostgREST necesita refrescar su cache de schemas y config para recoger el
-- cambio de rol. Ambos NOTIFY son idempotentes y baratos.
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
