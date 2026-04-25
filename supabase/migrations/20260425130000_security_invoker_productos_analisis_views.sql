-- Sprint 4E §1 — security_invoker = on en las 5 vistas de productos analisis.
--
-- Síntoma
-- -------
-- Security advisor reporta 5 ERRORs del lint `security_definer_view` para:
--   rdb.v_categoria_resumen
--   rdb.v_producto_metricas
--   rdb.v_producto_tendencia_semanal
--   rdb.v_producto_ultima_venta
--   rdb.v_productos_tabla
--
-- Las vistas vienen de los migrations
--   20260425035021_productos_categorias_y_limpieza.sql  (v_producto_ultima_venta, v_productos_tabla)
--   20260425041401_productos_analisis_views.sql         (v_producto_metricas, v_producto_tendencia_semanal, v_categoria_resumen)
-- que las crearon como views default (sin reloptions). En Postgres eso
-- equivale a SECURITY DEFINER (corre con privilegios del owner =
-- postgres = superuser), bypassando RLS de las tablas subyacentes.
--
-- Fix
-- ---
-- ALTER VIEW … SET (security_invoker = on). Mismo idiom que aplicó
-- 20260417213252_views_security_invoker.sql al resto del catálogo de
-- vistas. Las RLS de las tablas subyacentes se evalúan con el rol del
-- caller, no del owner.
--
-- Tablas subyacentes (verificado RLS habilitada en las 5 — 2026-04-25):
--   erp.productos, erp.categorias_producto, erp.productos_precios,
--   erp.inventario, rdb.waitry_productos
--
-- Effect funcional
-- ----------------
--   admin     → no cambio (fn_is_admin = TRUE)
--   user RDB  → no cambio (fn_has_empresa('e52ac307-…') = TRUE)
--   user otro → ahora ve 0 rows (antes leak SECURITY DEFINER → bypass RLS)
--
-- Rollback
-- --------
-- ALTER VIEW … RESET (security_invoker). Restaura el bug.

DO $do$
DECLARE
  v text;
  views text[] := ARRAY[
    'v_categoria_resumen',
    'v_producto_metricas',
    'v_producto_tendencia_semanal',
    'v_producto_ultima_venta',
    'v_productos_tabla'
  ];
BEGIN
  FOREACH v IN ARRAY views LOOP
    -- to_regclass para reproducible-from-zero (Preview Branch / dev local)
    IF to_regclass('rdb.'||v) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER VIEW rdb.%I SET (security_invoker = on)', v);
  END LOOP;
END $do$;
