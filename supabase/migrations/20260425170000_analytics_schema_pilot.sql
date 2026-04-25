-- ============================================================
-- analytics: schema piloto para Metabase / Superset / DuckDB
-- ============================================================
--
-- Objetivo
-- --------
-- Crear una capa "gold" de vistas materializadas (MVs) que sirven como
-- backend de un BI externo (Metabase self-hosted contra Supabase).
-- Aísla queries pesados de las tablas vivas y entrega numéricas listas
-- para graficar.
--
-- Decisiones
-- ----------
-- D1 — Schema dedicado `analytics`. No mezclar con `erp`/`dilesa`/`rdb`
--      para que el rol read-only del BI sólo tenga visibilidad acá.
-- D2 — Rol `analytics_reader` con LOGIN. Es el rol que Metabase usará.
--      Password se setea fuera de migración (1Password → ALTER ROLE).
-- D3 — MVs (no vistas normales) para evitar pegarle a las tablas vivas
--      en cada dashboard. Refresh se dispara con pg_cron (si disponible)
--      o manualmente vía analytics.refresh_all().
-- D4 — Las MVs NO respetan RLS (Postgres limitation). Eso es OK porque
--      el único consumidor inicial es Beto (admin). Para multi-tenant
--      futuro: filtrar en la propia MV por empresa_id ya está, basta
--      con que Metabase aplique filtro de sesión.
-- D5 — Solo 3 MVs piloto: cortes diarios, pipeline DILESA, ocupación
--      Playtomic. Probar valor antes de escalar. ROI > completitud.
-- D6 — Tags conceptuales como columnas (no enums) — flexible para que
--      Metabase agrupe sin tocar schema.
--
-- VERIFICADO contra SCHEMA_REF.md columna por columna:
--   erp.cortes_caja, erp.cortes_vouchers, erp.movimientos_caja,
--   dilesa.lotes, dilesa.proyectos, dilesa.fases_inventario,
--   dilesa.v_lotes_estatus,
--   playtomic.bookings, playtomic.v_ocupacion_diaria,
--   core.empresas.
--
-- Rollback
-- --------
--   DROP SCHEMA analytics CASCADE;
--   DROP ROLE analytics_reader;
-- ============================================================


-- ============================================================
-- 1) Schema y rol read-only
-- ============================================================
CREATE SCHEMA IF NOT EXISTS analytics;

COMMENT ON SCHEMA analytics IS
  'Capa gold para BI externo (Metabase/Superset/DuckDB). MVs refrescadas
   por pg_cron o manualmente vía analytics.refresh_all().';

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_reader') THEN
    CREATE ROLE analytics_reader LOGIN
      NOINHERIT
      CONNECTION LIMIT 5;
    COMMENT ON ROLE analytics_reader IS
      'Read-only para Metabase. Password se setea fuera de migración.
       GRANTs limitan visibilidad al schema analytics.';
  END IF;
END $do$;

GRANT USAGE ON SCHEMA analytics TO analytics_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics
  GRANT SELECT ON TABLES TO analytics_reader;


-- ============================================================
-- 2) MV — cortes diarios consolidados
-- ============================================================
-- Una fila por (fecha_operativa, empresa, caja). Junta totales del corte
-- con conteo y monto reportado de vouchers (chip 📎 fase 5).
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_corte_diario CASCADE;

CREATE MATERIALIZED VIEW analytics.mv_corte_diario AS
WITH vouchers AS (
  SELECT
    corte_id,
    COUNT(*)::int                              AS vouchers_count,
    COALESCE(SUM(monto_reportado), 0)::numeric AS vouchers_monto_reportado,
    COALESCE(SUM(ocr_monto_sugerido), 0)::numeric AS vouchers_ocr_monto,
    AVG(ocr_confianza)::numeric                AS vouchers_ocr_confianza_avg
  FROM erp.cortes_vouchers
  GROUP BY corte_id
),
movs AS (
  SELECT
    corte_id,
    COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0)::numeric AS mov_ingresos,
    COALESCE(SUM(CASE WHEN tipo = 'egreso'  THEN monto ELSE 0 END), 0)::numeric AS mov_egresos,
    COUNT(*)::int                                                                AS mov_count
  FROM erp.movimientos_caja
  WHERE corte_id IS NOT NULL
  GROUP BY corte_id
)
SELECT
  c.id                                AS corte_id,
  c.empresa_id,
  e.slug                              AS empresa_slug,
  e.nombre                            AS empresa_nombre,
  c.fecha_operativa,
  c.caja_nombre,
  c.corte_nombre,
  c.tipo                              AS corte_tipo,
  c.estado                            AS corte_estado,
  c.cajero_id,
  c.efectivo_inicial,
  c.efectivo_contado,
  c.total_ventas,
  c.total_efectivo,
  c.total_tarjeta,
  c.total_transferencia,
  (COALESCE(c.total_efectivo,0) + COALESCE(c.total_tarjeta,0) + COALESCE(c.total_transferencia,0))::numeric AS total_consolidado,
  c.diferencia,
  CASE
    WHEN c.diferencia IS NULL THEN 'sin_diferencia'
    WHEN ABS(c.diferencia) < 1 THEN 'cuadrado'
    WHEN c.diferencia > 0     THEN 'sobrante'
    ELSE 'faltante'
  END                                 AS diferencia_tipo,
  COALESCE(v.vouchers_count, 0)               AS vouchers_count,
  COALESCE(v.vouchers_monto_reportado, 0)     AS vouchers_monto_reportado,
  COALESCE(v.vouchers_ocr_monto, 0)           AS vouchers_ocr_monto,
  v.vouchers_ocr_confianza_avg,
  -- gap voucher vs total tarjeta+transferencia (señal de algo incompleto)
  GREATEST(0, COALESCE(c.total_tarjeta,0) + COALESCE(c.total_transferencia,0) - COALESCE(v.vouchers_monto_reportado, 0))::numeric AS gap_vouchers_vs_terminal,
  COALESCE(m.mov_ingresos, 0)         AS mov_ingresos,
  COALESCE(m.mov_egresos, 0)          AS mov_egresos,
  COALESCE(m.mov_count, 0)            AS mov_count,
  c.abierto_at,
  c.cerrado_at,
  c.validado_at,
  EXTRACT(EPOCH FROM (COALESCE(c.cerrado_at, NOW()) - c.abierto_at))/3600.0 AS duracion_horas,
  c.created_at,
  c.updated_at,
  NOW()                               AS _refreshed_at
FROM erp.cortes_caja c
JOIN core.empresas e ON e.id = c.empresa_id
LEFT JOIN vouchers v ON v.corte_id = c.id
LEFT JOIN movs     m ON m.corte_id = c.id;

CREATE UNIQUE INDEX mv_corte_diario_pk
  ON analytics.mv_corte_diario(corte_id);
CREATE INDEX mv_corte_diario_fecha_empresa
  ON analytics.mv_corte_diario(fecha_operativa, empresa_id);
CREATE INDEX mv_corte_diario_empresa_estado
  ON analytics.mv_corte_diario(empresa_id, corte_estado);

COMMENT ON MATERIALIZED VIEW analytics.mv_corte_diario IS
  'Una fila por corte de caja con totales, diferencias categorizadas,
   métricas de vouchers (count/monto/OCR) y gap voucher-vs-terminal.
   Refresh: analytics.refresh_all() o pg_cron.';

GRANT SELECT ON analytics.mv_corte_diario TO analytics_reader;


-- ============================================================
-- 3) MV — pipeline DILESA por lote
-- ============================================================
-- Wraps v_lotes_estatus + timing entre fases. Una fila por lote.
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_dilesa_pipeline CASCADE;

CREATE MATERIALIZED VIEW analytics.mv_dilesa_pipeline AS
SELECT
  l.id                                AS lote_id,
  l.empresa_id,
  e.slug                              AS empresa_slug,
  l.proyecto_id,
  p.nombre                            AS proyecto_nombre,
  p.codigo                            AS proyecto_codigo,
  p.fase                              AS proyecto_fase,
  l.manzana,
  l.numero_lote,
  l.superficie_m2,
  l.precio_lote,
  l.tipo_uso,
  l.etapa,
  l.coordenadas_lat,
  l.coordenadas_lng,
  fi.codigo                           AS fase_inventario_codigo,
  fi.nombre                           AS fase_inventario_nombre,
  fi.orden                            AS fase_inventario_orden,
  l.prototipo_asignado_id,
  pr.nombre                           AS prototipo_nombre,
  -- estatus unificado calculado por v_lotes_estatus (urbanizando/construyendo/etc)
  vle.estatus_unificado,
  vle.urbanizacion_avance_pct,
  vle.construccion_avance_pct,
  vle.fecha_inicio_obra,
  vle.fecha_estimada_entrega,
  vle.fecha_real_entrega,
  vle.presupuesto_asignado,
  vle.costo_acumulado,
  CASE
    WHEN vle.presupuesto_asignado IS NULL OR vle.presupuesto_asignado = 0 THEN NULL
    ELSE (vle.costo_acumulado / vle.presupuesto_asignado)::numeric
  END                                 AS costo_vs_presupuesto_pct,
  -- timing
  p.fecha_inicio                      AS proyecto_fecha_inicio,
  p.fecha_estimada_cierre             AS proyecto_fecha_cierre,
  CASE
    WHEN p.fecha_inicio IS NOT NULL
    THEN (CURRENT_DATE - p.fecha_inicio)
    ELSE NULL
  END                                 AS dias_desde_inicio_proyecto,
  NOW()                               AS _refreshed_at
FROM dilesa.lotes l
JOIN core.empresas e         ON e.id = l.empresa_id
JOIN dilesa.proyectos p      ON p.id = l.proyecto_id
LEFT JOIN dilesa.fases_inventario fi ON fi.id = l.fase_inventario_id
LEFT JOIN dilesa.prototipos pr       ON pr.id = l.prototipo_asignado_id
LEFT JOIN dilesa.v_lotes_estatus vle ON vle.id = l.id;

CREATE UNIQUE INDEX mv_dilesa_pipeline_pk
  ON analytics.mv_dilesa_pipeline(lote_id);
CREATE INDEX mv_dilesa_pipeline_empresa_proyecto
  ON analytics.mv_dilesa_pipeline(empresa_id, proyecto_id);
CREATE INDEX mv_dilesa_pipeline_fase
  ON analytics.mv_dilesa_pipeline(fase_inventario_codigo);

COMMENT ON MATERIALIZED VIEW analytics.mv_dilesa_pipeline IS
  'Una fila por lote DILESA con proyecto, fase de inventario, prototipo,
   coordenadas, % urbanización/construcción y timing del proyecto.';

GRANT SELECT ON analytics.mv_dilesa_pipeline TO analytics_reader;


-- ============================================================
-- 4) MV — ocupación Playtomic (cancha × hora × día)
-- ============================================================
-- Wraps playtomic.v_ocupacion_diaria + atributos de resource para
-- heatmaps de ocupación.
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_playtomic_ocupacion CASCADE;

CREATE MATERIALIZED VIEW analytics.mv_playtomic_ocupacion AS
WITH base AS (
  SELECT
    b.resource_id,
    b.resource_name,
    b.sport_id,
    DATE(b.booking_start AT TIME ZONE 'America/Matamoros') AS fecha,
    EXTRACT(HOUR FROM b.booking_start AT TIME ZONE 'America/Matamoros')::int AS hora,
    EXTRACT(ISODOW FROM b.booking_start AT TIME ZONE 'America/Matamoros')::int AS dia_semana,
    COUNT(*) FILTER (WHERE NOT b.is_canceled)::int  AS reservas,
    COUNT(*) FILTER (WHERE b.is_canceled)::int      AS cancelaciones,
    SUM(b.duration_min) FILTER (WHERE NOT b.is_canceled)::int AS minutos_reservados,
    SUM(b.price_amount) FILTER (WHERE NOT b.is_canceled)::numeric AS revenue
  FROM playtomic.bookings b
  WHERE b.booking_start IS NOT NULL
  GROUP BY 1, 2, 3, 4, 5, 6
)
SELECT
  resource_id,
  resource_name,
  sport_id,
  fecha,
  hora,
  dia_semana,
  reservas,
  cancelaciones,
  minutos_reservados,
  COALESCE(revenue, 0) AS revenue,
  -- ocupación normalizada: 60 min por hora-canasta = 100%
  LEAST(1.0, COALESCE(minutos_reservados, 0) / 60.0)::numeric AS ocupacion_pct,
  NOW() AS _refreshed_at
FROM base;

CREATE UNIQUE INDEX mv_playtomic_ocupacion_pk
  ON analytics.mv_playtomic_ocupacion(resource_id, fecha, hora);
CREATE INDEX mv_playtomic_ocupacion_fecha
  ON analytics.mv_playtomic_ocupacion(fecha);
CREATE INDEX mv_playtomic_ocupacion_sport
  ON analytics.mv_playtomic_ocupacion(sport_id, fecha);

COMMENT ON MATERIALIZED VIEW analytics.mv_playtomic_ocupacion IS
  'Ocupación por (cancha, fecha, hora) en TZ America/Matamoros. Reservas,
   cancelaciones, minutos, revenue, % ocupación contra hora completa.';

GRANT SELECT ON analytics.mv_playtomic_ocupacion TO analytics_reader;


-- ============================================================
-- 5) Función refresh_all + diccionario de métricas
-- ============================================================
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
    'mv_dilesa_pipeline',
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

COMMENT ON FUNCTION analytics.refresh_all() IS
  'Refresca las 3 MVs piloto en orden. CONCURRENTLY para no bloquear
   lecturas. Si está pg_cron, agendar:
     SELECT cron.schedule(''analytics-refresh'', ''*/30 * * * *'',
       ''SELECT analytics.refresh_all()'');';

REVOKE ALL ON FUNCTION analytics.refresh_all() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.refresh_all() TO authenticated;

-- Dictionary de métricas (catálogo en DB para que Metabase lo lea)
CREATE TABLE IF NOT EXISTS analytics.metric_dictionary (
  metric_key   text PRIMARY KEY,
  display_name text NOT NULL,
  descripcion  text NOT NULL,
  formula      text,
  source_mv    text,
  unidad       text,
  owner        text,
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  updated_at   timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE analytics.metric_dictionary IS
  'Definición canónica de métricas. Una fila = una métrica con su
   fórmula. Evita que cada dashboard mida diferente.';

GRANT SELECT ON analytics.metric_dictionary TO analytics_reader;

INSERT INTO analytics.metric_dictionary (metric_key, display_name, descripcion, formula, source_mv, unidad, owner) VALUES
  ('corte_diferencia_abs',     'Diferencia absoluta de corte', 'Faltante o sobrante absoluto del corte vs ventas registradas.', 'ABS(diferencia)', 'mv_corte_diario', 'MXN', 'beto'),
  ('corte_gap_vouchers',       'Gap vouchers vs terminal',     'Diferencia entre tarjeta+transferencia del corte y vouchers reportados. >0 = faltan vouchers.', 'GREATEST(0, total_tarjeta + total_transferencia - vouchers_monto_reportado)', 'mv_corte_diario', 'MXN', 'beto'),
  ('dilesa_lote_dias_pipeline','Días en pipeline (lote)',      'Días desde inicio del proyecto del lote.',                                                  'CURRENT_DATE - proyecto_fecha_inicio', 'mv_dilesa_pipeline', 'días', 'beto'),
  ('playtomic_ocupacion_pct',  'Ocupación %',                  'Minutos reservados / 60 (cap 100%) por (cancha, fecha, hora).',                             'LEAST(1, minutos_reservados/60.0)', 'mv_playtomic_ocupacion', '%', 'beto')
ON CONFLICT (metric_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  descripcion  = EXCLUDED.descripcion,
  formula      = EXCLUDED.formula,
  source_mv    = EXCLUDED.source_mv,
  unidad       = EXCLUDED.unidad,
  owner        = EXCLUDED.owner,
  updated_at   = NOW();


-- ============================================================
-- 6) Refresh inicial (si las tablas fuente tienen datos)
-- ============================================================
-- CONCURRENTLY no se puede en el primer refresh, va plain.
DO $do$
BEGIN
  REFRESH MATERIALIZED VIEW analytics.mv_corte_diario;
  REFRESH MATERIALIZED VIEW analytics.mv_dilesa_pipeline;
  REFRESH MATERIALIZED VIEW analytics.mv_playtomic_ocupacion;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Refresh inicial saltado (%). Correr analytics.refresh_all() después de aplicar.', SQLERRM;
END $do$;
