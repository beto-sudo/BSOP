-- ════════════════════════════════════════════════════════════════════════════
-- Iniciativa dilesa-portafolio-activos · Sprint 1 — Demolición del schema v1
-- ════════════════════════════════════════════════════════════════════════════
--
-- Borra el schema `dilesa` v1 completo (heredado de la migración apurada
-- Coda→BSOP del 2026-04-23) para reconstruirlo desde cero en Sprint 2 con el
-- modelo Portafolio de Activos ↔ Proyectos.
--
-- Contexto y plan: docs/planning/dilesa-portafolio-activos.md
--
-- La data viva está en Coda. El contenido del schema v1 (87 filas: 26
-- terrenos, 12 prototipos, 11 anteproyectos, 8 proyectos, + refs y catálogos)
-- es un espejo del import batch del 2026-04-23 — NO captura productiva en
-- BSOP. Snapshot CSV defensivo tomado fuera del repo antes de aplicar.
--
-- Alcance verificado contra el catálogo de Postgres (pg_proc / pg_views /
-- pg_matviews / pg_constraint) el 2026-05-21:
--   • analytics.refresh_all()      — quitar mv_dilesa_pipeline del array
--   • analytics.mv_dilesa_pipeline — DROP (depende de dilesa.lotes/proyectos/…)
--   • analytics.metric_dictionary  — borrar la métrica dilesa_lote_dias_pipeline
--   • schema dilesa                — DROP CASCADE + recrear vacío
--   • core.modulos                 — borrar los 4 slugs de DILESA Inmobiliario
--     (permisos_rol y permisos_usuario_excepcion caen por FK ON DELETE CASCADE)
-- No hay otras vistas ni funciones cross-schema que referencien `dilesa`.

BEGIN;

-- ── 1) analytics.refresh_all(): quitar mv_dilesa_pipeline del array ──────────
-- Refresca las MVs piloto (posible cron cada 30 min). mv_dilesa_pipeline se
-- dropea abajo, así que sale del array para no romper el refresh. CREATE OR
-- REPLACE preserva GRANT/REVOKE/COMMENT existentes de la función.
CREATE OR REPLACE FUNCTION analytics.refresh_all()
RETURNS TABLE(mv_name text, refreshed_at timestamptz, duration_ms numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = analytics, pg_catalog
AS $$
DECLARE
  t0     timestamptz;
  m      text;
  mvs    text[] := ARRAY[
    'mv_corte_diario',
    'mv_playtomic_ocupacion'
  ];
BEGIN
  FOREACH m IN ARRAY mvs LOOP
    t0 := clock_timestamp();
    EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.%I', m);
    mv_name := m;
    refreshed_at := NOW();
    duration_ms := EXTRACT(MILLISECONDS FROM clock_timestamp() - t0);
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ── 2) Borrar la MV de pipeline y su métrica del diccionario ─────────────────
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_dilesa_pipeline CASCADE;
DELETE FROM analytics.metric_dictionary
WHERE metric_key = 'dilesa_lote_dias_pipeline';

-- ── 3) DROP del schema dilesa v1 completo ────────────────────────────────────
-- CASCADE borra el schema entero: 31 tablas (base + derivadas + catálogos),
-- 4 vistas y sus triggers. NO toca el schema `maquinaria` (creado junto en
-- 20260423100000 pero independiente y fuera de alcance de esta iniciativa).
DROP SCHEMA dilesa CASCADE;

-- ── 4) Recrear el schema dilesa vacío ────────────────────────────────────────
-- Idéntico a 20260423100000_dilesa_maquinaria_create_schemas.sql. El schema
-- queda existente y expuesto a PostgREST (el rol authenticator ya lo tiene en
-- pgrst.db_schemas). Sprint 2 crea las tablas del modelo nuevo dentro.
CREATE SCHEMA dilesa;
GRANT USAGE ON SCHEMA dilesa TO authenticated, service_role, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA dilesa
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA dilesa
  GRANT ALL ON TABLES TO service_role;
COMMENT ON SCHEMA dilesa IS
  'Dilesa real-estate domain. Schema v1 (espejo Coda) demolido 2026-05-21; reconstrucción Portafolio de Activos en curso — ver docs/planning/dilesa-portafolio-activos.md';

-- ── 5) core.modulos: borrar los 4 módulos de DILESA Inmobiliario v1 ──────────
-- Las filas hijas en core.permisos_rol y core.permisos_usuario_excepcion caen
-- automáticamente (ambas FK son ON DELETE CASCADE, verificado 2026-05-21).
DELETE FROM core.modulos
WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND slug IN (
    'dilesa.terrenos',
    'dilesa.prototipos',
    'dilesa.anteproyectos',
    'dilesa.proyectos'
  );

-- ── 6) Refrescar PostgREST ───────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

COMMIT;
