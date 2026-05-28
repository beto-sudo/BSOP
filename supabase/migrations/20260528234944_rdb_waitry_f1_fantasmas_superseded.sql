-- MIGRATION: rdb-waitry F1 — fantasmas (superseded) NO son venta + ventana de detección 48h
--
-- CONTEXTO (follow-up de ADR-031 fantasmas y ADR-035/F3 paid; "F1" del triage de mayo 2026):
--   El POS Waitry duplica pedidos (mismo external_delivery_id + total + items). ADR-031
--   instaló una heurística (rdb.detect_waitry_fantasma) que marca el duplicado en
--   `superseded_by_order_id`, pero con DOS limitaciones que este F1 cierra:
--
--   (A) Ventana de 15 min: 23 grupos de duplicados idénticos quedan fuera del cap
--       (spread 17 min – 5.9 h) → 24 pedidos extra ($6,678) se cuentan como venta.
--       Fix: ampliar la ventana de detección a 48 h (el ancla real es
--       external_delivery_id + total + items signature; la ventana solo evita
--       reutilización del ID a muy largo plazo — los duplicados reales caen <6 h).
--
--   (B) ADR-031 marcó pero NO propagó: solo rdb.v_waitry_pedidos filtra `superseded`.
--       v_cortes_totales, v_cortes_productos, las 5 vistas de reportería y el trigger
--       de inventario NO lo filtran → los 40 fantasmas ya marcados (+ los 23 nuevos)
--       SIGUEN inflando cortes, reportería e inventario. Medido en prod: 40 superseded
--       contables en 30 cortes ($8,415), 42 salidas de inventario sin revertir; + 23
--       nuevos ($6,678, 30 salidas). Total a sanear: ~$15,093 en cortes, ~72 salidas.
--
--   Semántica (Beto, "corregir TODO retroactivo", igual que F3): un fantasma es un
--   duplicado del POS — NO es una segunda venta, NO descuenta inventario, NO cuenta en
--   cortes/reportería. El registro crudo se preserva (auditoría).
--   Detalle y trade-offs en ADR-036.
--
-- ALCANCE (espejo exacto de F3, con `superseded_by_order_id IS NULL` en vez de `paid`):
--   1. rdb.detect_waitry_fantasma — ventana 15 min → 48 h.
--   2-8. Las 7 vistas que F3 tocó por `paid` ahora también excluyen `superseded`:
--        v_cortes_totales, v_cortes_productos, v_producto_ultima_venta,
--        v_producto_metricas, v_producto_tendencia_semanal, v_productos_tabla,
--        v_waitry_productos_categoria. (v_waitry_pedidos ya filtraba superseded.)
--   9. erp.fn_trg_waitry_to_movimientos — guard: no crea salida si el pedido está
--      superseded (espejo del guard de cancel/paid).
--   10. erp.fn_trg_waitry_pedidos_cancel — borra salidas también cuando el pedido pasa
--       a superseded (NULL → no-NULL). El trigger dispara AFTER UPDATE (cualquier col).
--   11. Re-backfill de detección con ventana 48 h → marca los 23 grupos nuevos.
--   12. Backfill de inventario one-shot → borra TODAS las salidas de pedidos superseded
--       (los 40 viejos + 23 nuevos). Idempotente (un 2º run borra 0).
--
-- RETROACTIVO:
--   v_cortes_totales no es materializada → el filtro `superseded` corrige los 30 cortes
--   históricos al recalcularse en cada lectura. Esto DEROGA WAITRY-DEDUP-4 (ADR-031)
--   por decisión explícita de Beto: un fantasma nunca fue una segunda venta real, así
--   que corregir cortes cerrados enmienda un dato erróneo (y exonera faltantes de
--   cajera de ~$4,193 cash que el duplicado había inflado en efectivo_esperado).
--
-- AUDITORÍA:
--   rdb.v_waitry_pedidos_con_fantasmas (sin filtro) y la tabla base siguen mostrando
--   TODOS los pedidos. No se borra ni muta ningún pedido/pago crudo.

-- ───────────── 1. Heurística: ampliar ventana de detección 15 min → 48 h ─────────────
CREATE OR REPLACE FUNCTION rdb.detect_waitry_fantasma(p_order_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  WITH target AS (
    SELECT
      p.order_id,
      p.external_delivery_id,
      p.total_amount,
      p."timestamp" AS ts,
      p.paid,
      p.status,
      rdb.waitry_items_signature(p.order_id) AS items_sig
    FROM rdb.waitry_pedidos p
    WHERE p.order_id = p_order_id
  )
  SELECT p2.order_id
  FROM target t
  JOIN rdb.waitry_pedidos p2
    ON p2.order_id <> t.order_id
   AND p2.external_delivery_id = t.external_delivery_id
   AND p2.total_amount = t.total_amount
   AND p2.paid = TRUE
   AND (
     p2."timestamp" < t.ts
     OR (p2."timestamp" = t.ts AND p2.order_id < t.order_id)
   )
   AND (t.ts - p2."timestamp") <= INTERVAL '48 hours'
  WHERE t.paid = TRUE
    AND t.external_delivery_id IS NOT NULL
    AND COALESCE(t.status, '') NOT ILIKE '%cancel%'
    AND COALESCE(p2.status, '') NOT ILIKE '%cancel%'
    AND rdb.waitry_items_signature(p2.order_id) = t.items_sig
  ORDER BY p2."timestamp" DESC, p2.order_id DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION rdb.detect_waitry_fantasma(text) IS
  'Devuelve el order_id canónico si p_order_id es un fantasma del bug de Waitry; NULL si no. Heurística: external_delivery_id + total + items signature + span <= 48h (ampliado de 15min en ADR-036/F1), ambos no-cancelados y pagados.';

-- ───────────────────────── 2. Totales por corte ─────────────────────────
-- Espejo de F3: además de `paid`, ahora excluye fantasmas (`superseded`).
CREATE OR REPLACE VIEW rdb.v_cortes_totales
WITH (security_invoker = on)
AS
WITH pagos_por_corte AS (
  SELECT ped.corte_id,
    lower(p.payment_method) AS method,
    p.amount
  FROM rdb.waitry_pedidos ped
    JOIN rdb.waitry_pagos p ON p.order_id = ped.order_id
  WHERE ped.corte_id IS NOT NULL
    AND ped.status <> 'order_canceled'::text
    AND ped.paid IS TRUE
    AND ped.superseded_by_order_id IS NULL
), pedidos_por_corte AS (
  SELECT waitry_pedidos.corte_id,
    count(*) AS total_pedidos
  FROM rdb.waitry_pedidos
  WHERE waitry_pedidos.corte_id IS NOT NULL
    AND waitry_pedidos.status <> 'order_canceled'::text
    AND waitry_pedidos.paid IS TRUE
    AND waitry_pedidos.superseded_by_order_id IS NULL
  GROUP BY waitry_pedidos.corte_id
), movimientos_por_corte AS (
  SELECT movimientos_caja.corte_id,
    sum(
      CASE
        WHEN movimientos_caja.tipo = 'entrada'::text THEN movimientos_caja.monto
        ELSE 0::numeric
      END) AS total_depositos,
    sum(
      CASE
        WHEN movimientos_caja.tipo = 'salida'::text THEN movimientos_caja.monto
        ELSE 0::numeric
      END) AS total_retiros
  FROM erp.movimientos_caja
  WHERE movimientos_caja.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
  GROUP BY movimientos_caja.corte_id
)
SELECT c.id AS corte_id,
  c.empresa_id,
  c.caja_nombre,
  c.estado,
  c.abierto_at AS hora_inicio,
  c.cerrado_at AS hora_fin,
  c.efectivo_inicial,
  COALESCE(sum(
    CASE
      WHEN pp.method = 'cash'::text THEN pp.amount
      ELSE 0::numeric
    END), 0::numeric) AS ingresos_efectivo,
  COALESCE(sum(
    CASE
      WHEN pp.method ~~ 'credit_card%'::text OR pp.method = 'pos'::text THEN pp.amount
      ELSE 0::numeric
    END), 0::numeric) AS ingresos_tarjeta,
  COALESCE(sum(
    CASE
      WHEN pp.method = 'stripe'::text THEN pp.amount
      ELSE 0::numeric
    END), 0::numeric) AS ingresos_stripe,
  COALESCE(sum(
    CASE
      WHEN pp.method = 'other'::text THEN pp.amount
      ELSE 0::numeric
    END), 0::numeric) AS ingresos_transferencias,
  COALESCE(sum(pp.amount), 0::numeric) AS total_ingresos,
  COALESCE(m.total_depositos, 0::numeric) AS depositos,
  COALESCE(m.total_retiros, 0::numeric) AS retiros,
  c.efectivo_inicial + COALESCE(sum(
    CASE
      WHEN pp.method = 'cash'::text THEN pp.amount
      ELSE 0::numeric
    END), 0::numeric) + COALESCE(m.total_depositos, 0::numeric) - COALESCE(m.total_retiros, 0::numeric) AS efectivo_esperado,
  COALESCE(pc.total_pedidos, 0::bigint) AS pedidos_count,
  c.fecha_operativa
FROM erp.cortes_caja c
  LEFT JOIN pagos_por_corte pp ON pp.corte_id = c.id
  LEFT JOIN pedidos_por_corte pc ON pc.corte_id = c.id
  LEFT JOIN movimientos_por_corte m ON m.corte_id = c.id
WHERE c.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
GROUP BY c.id, c.empresa_id, c.caja_nombre, c.estado, c.abierto_at, c.cerrado_at, c.efectivo_inicial, m.total_depositos, m.total_retiros, pc.total_pedidos, c.fecha_operativa;

COMMENT ON VIEW rdb.v_cortes_totales IS
  'Totales por corte de caja RDB (Waitry). Excluye cancelados, pagos no completados (paid=false, ADR-035) y fantasmas (superseded_by_order_id, ADR-031/ADR-036). Vista no-materializada → corrige retroactivamente todos los cortes al recalcularse en cada lectura.';

GRANT SELECT ON rdb.v_cortes_totales TO authenticated, anon;

-- ──────────── 3. Desglose por producto del corte (path financiero) ────────────
CREATE OR REPLACE VIEW rdb.v_cortes_productos
WITH (security_invoker = true)
AS
 SELECT wp.corte_id,
    wpp.product_id,
    wpp.product_name AS producto_nombre,
    sum(wpp.quantity) AS cantidad_vendida,
    sum(COALESCE(wpp.total_price, wpp.unit_price * wpp.quantity, 0::numeric)) AS importe_total
   FROM rdb.waitry_productos wpp
     JOIN rdb.waitry_pedidos wp ON wp.order_id = wpp.order_id
  WHERE wp.corte_id IS NOT NULL
    AND wp.status IS DISTINCT FROM 'order_canceled'::text
    AND wp.paid IS TRUE
    AND wp.superseded_by_order_id IS NULL
  GROUP BY wp.corte_id, wpp.product_id, wpp.product_name;

GRANT SELECT ON rdb.v_cortes_productos TO authenticated, anon;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. REPORTERÍA PRODUCTO/VENTAS — excluir fantasmas (espejo de F3)           ║
-- ║ Las 5 vistas leen rdb.waitry_productos crudo; el EXISTS sobre pedidos      ║
-- ║ que F3 añadió por `paid` ahora también exige `superseded_by_order_id NULL`.║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 4a. Última venta por producto (también alimenta v_productos_tabla).
CREATE OR REPLACE VIEW rdb.v_producto_ultima_venta
WITH (security_invoker = on)
AS
 SELECT p.id AS producto_id,
    max(wp.created_at) AS ultima_venta_at,
    count(wp.id) AS total_ventas,
    COALESCE(sum(wp.quantity), 0::numeric) AS total_unidades_vendidas,
    COALESCE(sum(wp.total_price), 0::numeric) AS total_importe_vendido
   FROM erp.productos p
     LEFT JOIN rdb.waitry_productos wp ON wp.product_id = p.codigo
       AND (EXISTS ( SELECT 1 FROM rdb.waitry_pedidos pe
                      WHERE pe.order_id = wp.order_id AND pe.paid IS TRUE
                        AND pe.superseded_by_order_id IS NULL))
  WHERE p.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid AND p.deleted_at IS NULL
  GROUP BY p.id;

-- 4b. Métricas por producto (unidades/importe 30-90d, última venta) — análisis.
CREATE OR REPLACE VIEW rdb.v_producto_metricas
WITH (security_invoker = on)
AS
 WITH ventas AS (
         SELECT p_1.id AS producto_id,
            sum(
                CASE
                    WHEN wp.created_at > (now() - '30 days'::interval) THEN wp.quantity
                    ELSE 0::numeric
                END) AS unidades_30d,
            sum(
                CASE
                    WHEN wp.created_at > (now() - '30 days'::interval) THEN wp.total_price
                    ELSE 0::numeric
                END) AS importe_30d,
            sum(
                CASE
                    WHEN wp.created_at > (now() - '90 days'::interval) THEN wp.quantity
                    ELSE 0::numeric
                END) AS unidades_90d,
            sum(
                CASE
                    WHEN wp.created_at > (now() - '90 days'::interval) THEN wp.total_price
                    ELSE 0::numeric
                END) AS importe_90d,
            max(wp.created_at) AS ultima_venta_at
           FROM erp.productos p_1
             LEFT JOIN rdb.waitry_productos wp ON wp.product_id = p_1.codigo
               AND (EXISTS ( SELECT 1 FROM rdb.waitry_pedidos pe
                              WHERE pe.order_id = wp.order_id AND pe.paid IS TRUE
                                AND pe.superseded_by_order_id IS NULL))
          WHERE p_1.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid AND p_1.deleted_at IS NULL
          GROUP BY p_1.id
        )
 SELECT p.id,
    p.nombre,
    p.codigo,
    p.activo,
    p.inventariable,
    c.id AS categoria_id,
    c.nombre AS categoria_nombre,
    c.color AS categoria_color,
    pp.costo,
    pp.precio_venta,
        CASE
            WHEN pp.precio_venta IS NULL OR pp.precio_venta = 0::numeric THEN NULL::numeric
            ELSE round((pp.precio_venta - COALESCE(pp.costo, 0::numeric)) / pp.precio_venta * 100::numeric, 1)
        END AS margen_pct,
    COALESCE(stk.cantidad_total, 0::numeric) AS stock_actual,
    round(COALESCE(stk.cantidad_total, 0::numeric) * COALESCE(pp.costo, 0::numeric), 2) AS valor_stock,
    COALESCE(v.unidades_30d, 0::numeric) AS unidades_30d,
    round(COALESCE(v.importe_30d, 0::numeric), 2) AS importe_30d,
    COALESCE(v.unidades_90d, 0::numeric) AS unidades_90d,
    round(COALESCE(v.importe_90d, 0::numeric), 2) AS importe_90d,
    v.ultima_venta_at,
        CASE
            WHEN v.ultima_venta_at IS NULL THEN 9999
            ELSE EXTRACT(day FROM now() - v.ultima_venta_at)::integer
        END AS dias_sin_venta,
    round(COALESCE(v.importe_30d, 0::numeric) - COALESCE(v.unidades_30d, 0::numeric) * COALESCE(pp.costo, 0::numeric), 2) AS utilidad_30d
   FROM erp.productos p
     LEFT JOIN erp.categorias_producto c ON c.id = p.categoria_id
     LEFT JOIN erp.productos_precios pp ON pp.producto_id = p.id AND pp.vigente = true
     LEFT JOIN ( SELECT inventario.producto_id,
            sum(inventario.cantidad) AS cantidad_total
           FROM erp.inventario
          GROUP BY inventario.producto_id) stk ON stk.producto_id = p.id
     LEFT JOIN ventas v ON v.producto_id = p.id
  WHERE p.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid AND p.deleted_at IS NULL;

-- 4c. Tendencia semanal por producto (últimas ~12 semanas).
CREATE OR REPLACE VIEW rdb.v_producto_tendencia_semanal
WITH (security_invoker = on)
AS
 WITH semanas AS (
         SELECT generate_series(date_trunc('week'::text, now() - '77 days'::interval), date_trunc('week'::text, now()), '7 days'::interval)::date AS semana_inicio
        )
 SELECT p.id AS producto_id,
    p.nombre,
    p.categoria_id,
    s.semana_inicio,
    COALESCE(sum(wp.quantity), 0::numeric) AS unidades,
    round(COALESCE(sum(wp.total_price), 0::numeric), 2) AS importe
   FROM erp.productos p
     CROSS JOIN semanas s
     LEFT JOIN rdb.waitry_productos wp ON wp.product_id = p.codigo
       AND wp.created_at >= s.semana_inicio
       AND wp.created_at < (s.semana_inicio + '7 days'::interval)
       AND (EXISTS ( SELECT 1 FROM rdb.waitry_pedidos pe
                      WHERE pe.order_id = wp.order_id AND pe.paid IS TRUE
                        AND pe.superseded_by_order_id IS NULL))
  WHERE p.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid AND p.deleted_at IS NULL
  GROUP BY p.id, p.nombre, p.categoria_id, s.semana_inicio;

-- 4d. Tabla de productos (catálogo) — CTE ultimo_precio_waitry.
CREATE OR REPLACE VIEW rdb.v_productos_tabla
WITH (security_invoker = true)
AS
 WITH ultimo_costo_oc AS (
         SELECT DISTINCT ON (ocd.producto_id) ocd.producto_id,
            COALESCE(ocd.precio_real, ocd.precio_unitario)::numeric(14,2) AS costo
           FROM erp.ordenes_compra_detalle ocd
             JOIN erp.ordenes_compra oc ON oc.id = ocd.orden_compra_id
          WHERE ocd.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid AND oc.estado <> 'cancelada'::text AND oc.deleted_at IS NULL AND ocd.producto_id IS NOT NULL AND COALESCE(ocd.precio_real, ocd.precio_unitario) IS NOT NULL
          ORDER BY ocd.producto_id, (COALESCE(oc.cerrada_at, oc.autorizada_at, ocd.created_at)) DESC
        ), ultimo_precio_waitry AS (
         SELECT DISTINCT ON (wp.product_id) wp.product_id,
            wp.unit_price AS precio
           FROM rdb.waitry_productos wp
          WHERE wp.product_id IS NOT NULL AND wp.unit_price IS NOT NULL AND wp.unit_price > 0::numeric
            AND (EXISTS ( SELECT 1 FROM rdb.waitry_pedidos pe
                           WHERE pe.order_id = wp.order_id AND pe.paid IS TRUE
                             AND pe.superseded_by_order_id IS NULL))
          ORDER BY wp.product_id, wp.created_at DESC
        )
 SELECT p.id,
    p.codigo,
    p.nombre,
    p.descripcion,
    p.tipo,
    p.unidad,
    p.activo,
    p.inventariable,
    p.created_at,
    p.updated_at,
    c.id AS categoria_id,
    c.nombre AS categoria_nombre,
    c.color AS categoria_color,
    uc.costo AS ultimo_costo,
    upw.precio AS ultimo_precio_venta,
        CASE
            WHEN upw.precio IS NULL OR upw.precio = 0::numeric THEN NULL::numeric
            WHEN uc.costo IS NULL THEN NULL::numeric
            ELSE round((upw.precio - uc.costo) / upw.precio * 100::numeric, 1)
        END AS margen_pct,
    COALESCE(stk.cantidad_total, 0::numeric) AS stock_actual,
    uv.ultima_venta_at,
    COALESCE(uv.total_unidades_vendidas, 0::numeric) AS total_unidades_vendidas
   FROM erp.productos p
     LEFT JOIN erp.categorias_producto c ON c.id = p.categoria_id
     LEFT JOIN ultimo_costo_oc uc ON uc.producto_id = p.id
     LEFT JOIN ultimo_precio_waitry upw ON upw.product_id = p.codigo
     LEFT JOIN ( SELECT inventario.producto_id,
            sum(inventario.cantidad) AS cantidad_total
           FROM erp.inventario
          GROUP BY inventario.producto_id) stk ON stk.producto_id = p.id
     LEFT JOIN rdb.v_producto_ultima_venta uv ON uv.producto_id = p.id
  WHERE p.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid AND p.deleted_at IS NULL;

-- 4e. Líneas de producto Waitry enriquecidas con categoría (ventas por categoría / producto).
CREATE OR REPLACE VIEW rdb.v_waitry_productos_categoria
WITH (security_invoker = on)
AS
 WITH cat_productos AS (
         SELECT DISTINCT ON (p.codigo) p.codigo,
            p.id AS producto_id,
            p.categoria_id
           FROM erp.productos p
          WHERE p.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid AND p.deleted_at IS NULL AND p.codigo IS NOT NULL AND p.codigo <> ''::text
          ORDER BY p.codigo, p.activo DESC, p.updated_at DESC NULLS LAST, p.created_at DESC, p.id
        )
 SELECT wp.id,
    wp.order_id,
    wp.product_id,
    wp.product_name,
    wp.quantity,
    wp.unit_price,
    wp.total_price,
    wp.created_at,
    cp.producto_id AS producto_catalogo_id,
    c.id AS categoria_id,
    c.nombre AS categoria_nombre,
    c.color AS categoria_color,
    c.orden AS categoria_orden
   FROM rdb.waitry_productos wp
     LEFT JOIN cat_productos cp ON cp.codigo = wp.product_id
     LEFT JOIN erp.categorias_producto c ON c.id = cp.categoria_id
  WHERE (EXISTS ( SELECT 1 FROM rdb.waitry_pedidos pe
                   WHERE pe.order_id = wp.order_id AND pe.paid IS TRUE
                     AND pe.superseded_by_order_id IS NULL));

GRANT SELECT ON rdb.v_producto_ultima_venta TO authenticated, anon;
GRANT SELECT ON rdb.v_producto_metricas TO authenticated, anon;
GRANT SELECT ON rdb.v_producto_tendencia_semanal TO authenticated, anon;
GRANT SELECT ON rdb.v_productos_tabla TO authenticated, anon;
GRANT SELECT ON rdb.v_waitry_productos_categoria TO authenticated, anon;

-- ───────────── 9. Trigger productos → inventario (guard superseded) ─────────────
-- Añade el guard de fantasma al de cancel/paid (F3): un pedido superseded no descuenta.
CREATE OR REPLACE FUNCTION erp.fn_trg_waitry_to_movimientos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'erp', 'rdb', 'public'
AS $function$
DECLARE
  v_producto_id      UUID;
  v_parent_id        UUID;
  v_factor_consumo   NUMERIC;
  v_empresa_id       UUID := 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid;
  v_almacen_id       UUID;
  v_order_status     TEXT;
  v_order_paid       BOOLEAN;
  v_order_superseded TEXT;
  v_receta_rows      INTEGER;
  r_insumo           RECORD;
BEGIN
  SELECT id INTO v_almacen_id FROM erp.almacenes WHERE empresa_id = v_empresa_id LIMIT 1;
  IF v_almacen_id IS NULL THEN RETURN NULL; END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM erp.movimientos_inventario
    WHERE referencia_tipo = 'venta_waitry' AND referencia_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT status, paid, superseded_by_order_id
    INTO v_order_status, v_order_paid, v_order_superseded
  FROM rdb.waitry_pedidos WHERE order_id = NEW.order_id;

  -- Venta no concretada (cancelada, pago no completado o fantasma): sin salida.
  IF v_order_status = 'order_canceled' OR v_order_paid IS NOT TRUE OR v_order_superseded IS NOT NULL THEN
    DELETE FROM erp.movimientos_inventario
    WHERE referencia_tipo = 'venta_waitry' AND referencia_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT id, parent_id, factor_consumo
    INTO v_producto_id, v_parent_id, v_factor_consumo
  FROM erp.productos
  WHERE codigo = NEW.product_id AND empresa_id = v_empresa_id
  LIMIT 1;

  IF v_producto_id IS NULL THEN RETURN NEW; END IF;

  DELETE FROM erp.movimientos_inventario
  WHERE referencia_tipo = 'venta_waitry' AND referencia_id = NEW.id;

  SELECT COUNT(*) INTO v_receta_rows
  FROM erp.producto_receta
  WHERE producto_venta_id = v_producto_id AND empresa_id = v_empresa_id;

  IF v_receta_rows > 0 THEN
    FOR r_insumo IN
      SELECT insumo_id, cantidad
      FROM erp.producto_receta
      WHERE producto_venta_id = v_producto_id AND empresa_id = v_empresa_id
    LOOP
      INSERT INTO erp.movimientos_inventario
        (empresa_id, producto_id, almacen_id, tipo_movimiento, cantidad,
         referencia_tipo, referencia_id, notas, created_at)
      VALUES
        (v_empresa_id, r_insumo.insumo_id, v_almacen_id, 'salida',
         NEW.quantity * r_insumo.cantidad, 'venta_waitry', NEW.id,
         'Venta Waitry Order: ' || NEW.order_id || ' (receta)',
         COALESCE(NEW.created_at, now()));
    END LOOP;
    RETURN NEW;
  END IF;

  INSERT INTO erp.movimientos_inventario
    (empresa_id, producto_id, almacen_id, tipo_movimiento, cantidad,
     referencia_tipo, referencia_id, notas, created_at)
  VALUES
    (v_empresa_id, COALESCE(v_parent_id, v_producto_id), v_almacen_id, 'salida',
     NEW.quantity * COALESCE(v_factor_consumo, 1.0), 'venta_waitry', NEW.id,
     'Venta Waitry Order: ' || NEW.order_id || ' (legacy)',
     COALESCE(NEW.created_at, now()));

  RETURN NEW;
END;
$function$;

-- ──────── 10. Trigger pedidos: borra salidas en cancel, paid→false o →superseded ────────
CREATE OR REPLACE FUNCTION erp.fn_trg_waitry_pedidos_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'erp', 'rdb', 'public'
AS $function$
BEGIN
  IF (NEW.status = 'order_canceled' AND OLD.status <> 'order_canceled')
     OR (NEW.paid IS NOT TRUE AND OLD.paid IS DISTINCT FROM NEW.paid)
     OR (NEW.superseded_by_order_id IS NOT NULL AND OLD.superseded_by_order_id IS NULL) THEN
    DELETE FROM erp.movimientos_inventario
    WHERE referencia_tipo = 'venta_waitry'
      AND referencia_id IN (SELECT id FROM rdb.waitry_productos WHERE order_id = NEW.order_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- ───────────── 11. Re-backfill de detección con ventana 48h (marca los 23) ─────────────
-- SQL nativo (sin loops): pre-computa firmas una vez y hace self-join. El UPDATE de
-- superseded dispara trg_waitry_pedidos_cancel_movimientos (AFTER UPDATE) → borra
-- inventario de cada fantasma recién marcado (el §12 cubre el resto, idempotente).
WITH item_sig AS (
  SELECT
    pr.order_id,
    md5(string_agg(
      pr.product_id::text || ':' || pr.quantity::text,
      '|' ORDER BY pr.product_id::text, pr.quantity::text
    )) AS sig
  FROM rdb.waitry_productos pr
  GROUP BY pr.order_id
),
qualifying AS (
  SELECT
    p.order_id,
    p.external_delivery_id,
    p.total_amount,
    p."timestamp" AS ts,
    COALESCE(s.sig, md5('')) AS items_sig
  FROM rdb.waitry_pedidos p
  LEFT JOIN item_sig s ON s.order_id = p.order_id
  WHERE p.paid = TRUE
    AND p.external_delivery_id IS NOT NULL
    AND COALESCE(p.status, '') NOT ILIKE '%cancel%'
),
canonical_match AS (
  SELECT DISTINCT ON (t.order_id)
    t.order_id AS fantasma_id,
    p2.order_id AS canonical_id
  FROM qualifying t
  JOIN qualifying p2
    ON p2.order_id <> t.order_id
   AND p2.external_delivery_id = t.external_delivery_id
   AND p2.total_amount = t.total_amount
   AND p2.items_sig = t.items_sig
   AND (
     p2.ts < t.ts
     OR (p2.ts = t.ts AND p2.order_id < t.order_id)
   )
   AND (t.ts - p2.ts) <= INTERVAL '48 hours'
  ORDER BY t.order_id, p2.ts DESC, p2.order_id DESC
)
UPDATE rdb.waitry_pedidos w
   SET superseded_by_order_id = m.canonical_id
  FROM canonical_match m
 WHERE w.order_id = m.fantasma_id
   AND w.superseded_by_order_id IS DISTINCT FROM m.canonical_id;

-- ───────────── 12. BACKFILL inventario: revertir salidas de fantasmas ─────────────
-- Borra TODAS las salidas 'venta_waitry' de pedidos superseded (40 viejos + 23 nuevos).
-- Idempotente: un 2º run borra 0 filas.
DO $$
DECLARE
  v_borrados integer;
  v_unidades numeric;
BEGIN
  WITH objetivo AS (
    SELECT mi.id
    FROM erp.movimientos_inventario mi
      JOIN rdb.waitry_productos wp ON wp.id = mi.referencia_id
      JOIN rdb.waitry_pedidos pe   ON pe.order_id = wp.order_id
    WHERE mi.referencia_tipo = 'venta_waitry'
      AND pe.superseded_by_order_id IS NOT NULL
  ), del AS (
    DELETE FROM erp.movimientos_inventario
    WHERE id IN (SELECT id FROM objetivo)
    RETURNING cantidad
  )
  SELECT COUNT(*), COALESCE(SUM(cantidad), 0) INTO v_borrados, v_unidades FROM del;

  RAISE NOTICE 'F1 backfill inventario: % movimientos borrados, % unidades devueltas al stock',
    v_borrados, v_unidades;
END;
$$;

-- ───────────────────────── Verificación inline ─────────────────────────
-- Triviales en Preview (DB vacía): 0 en todos lados → pasan.
DO $$
DECLARE
  v_marcados            integer;
  v_salidas_superseded  integer;
  v_cat_superseded      integer;
BEGIN
  SELECT COUNT(*) INTO v_marcados FROM rdb.waitry_pedidos WHERE superseded_by_order_id IS NOT NULL;

  -- Invariante 1: no quedan salidas de inventario de pedidos superseded.
  SELECT COUNT(*) INTO v_salidas_superseded
  FROM erp.movimientos_inventario mi
    JOIN rdb.waitry_productos wp ON wp.id = mi.referencia_id
    JOIN rdb.waitry_pedidos pe   ON pe.order_id = wp.order_id
  WHERE mi.referencia_tipo = 'venta_waitry' AND pe.superseded_by_order_id IS NOT NULL;
  IF v_salidas_superseded <> 0 THEN
    RAISE EXCEPTION 'F1: quedan % salidas de inventario de fantasmas', v_salidas_superseded;
  END IF;

  -- Invariante 2: la reportería por categoría no expone líneas de fantasmas.
  SELECT COUNT(*) INTO v_cat_superseded
  FROM rdb.v_waitry_productos_categoria vc
    JOIN rdb.waitry_pedidos pe ON pe.order_id = vc.order_id
  WHERE pe.superseded_by_order_id IS NOT NULL;
  IF v_cat_superseded <> 0 THEN
    RAISE EXCEPTION 'F1: v_waitry_productos_categoria expone % líneas de fantasmas', v_cat_superseded;
  END IF;

  RAISE NOTICE 'F1 OK: % fantasmas marcados, 0 salidas de inventario de fantasmas, reportería limpia',
    v_marcados;
END;
$$;

NOTIFY pgrst, 'reload schema';
