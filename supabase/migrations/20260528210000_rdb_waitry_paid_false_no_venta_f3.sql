-- MIGRATION: rdb-waitry F3 — pedidos paid=false NO son venta ni descuentan inventario
--
-- CONTEXTO (caso "Movimientos duplicados" reportado por Pablo, RDB, mayo 2026):
--   El POS Waitry registra pedidos con pago Stripe FALLIDO (paid=false) como si
--   fueran ventas: aparecían en reportes/cortes y disparaban salidas de
--   inventario. Beto fijó la semántica: si paid=false el pedido queda como
--   "pago cero, venta no hecha" — se preserva el registro y el intento, pero NO
--   es venta, NO descuenta producto, NO hay salidas de inventario.
--   Detalle y trade-offs en ADR-035.
--
-- ALCANCE (vistas + triggers + backfill):
--   VISTAS — excluyen paid=false (semántica "no vendido"):
--     1. rdb.v_waitry_pedidos    — canónica financiera (paid + no superseded).
--     2. rdb.v_cortes_totales    — totales y conteo por corte.
--     3. rdb.v_cortes_productos  — desglose por producto del corte (path financiero).
--     4. Reportería producto/ventas (5 vistas que leían rdb.waitry_productos crudo,
--        sin join a pedidos): v_producto_metricas, v_producto_tendencia_semanal,
--        v_producto_ultima_venta, v_productos_tabla (CTE ultimo_precio_waitry) y
--        v_waitry_productos_categoria. Se les añade filtro paid vía EXISTS sobre
--        rdb.waitry_pedidos para que /rdb/productos y /rdb/ventas (por producto y
--        por categoría) no cuenten intentos fallidos como venta. Impacto medido:
--        137 líneas / 222 unidades / $15,656.80 en 85 pedidos paid=false.
--        Bloque marcado abajo como separable (alcance ampliado vs. core F3).
--   TRIGGERS:
--     5. erp.fn_trg_waitry_to_movimientos — no crea salida si el pedido no está
--        pagado (guard espejo del de cancelación).
--     6. erp.fn_trg_waitry_pedidos_cancel — borra salidas también cuando paid
--        pasa true→false (espejo de la cancelación).
--   BACKFILL:
--     7. Borra las salidas 'venta_waitry' ya creadas para pedidos paid=false
--        históricos → devuelve unidades al stock. Idempotente (un 2º run borra 0).
--
-- RETROACTIVO:
--   rdb.v_cortes_totales es vista (no materializada): el filtro paid corrige
--   TODOS los cortes históricos al recalcularse en cada lectura. Las columnas
--   congeladas erp.cortes_caja.total_* están sin uso (0/495 pobladas) → no
--   requieren backfill. Esto deroga WAITRY-DEDUP-4 (ADR-031) SOLO para F3, por
--   decisión explícita de Beto: "corregir todo retroactivo".
--
-- AUDITORÍA (que quede el registro):
--   rdb.v_waitry_pedidos_con_fantasmas (sin filtro paid) y la tabla base
--   rdb.waitry_pedidos siguen mostrando TODOS los pedidos — el intento de venta
--   fallido se preserva ahí. No se borra ningún pedido ni pago.
--
-- WEBHOOK (por qué el guard del trigger de productos basta para los flips):
--   supabase/functions/waitry-webhook upsertea waitry_pedidos (con paid) ANTES
--   de delete+insert de waitry_productos. El trigger de productos lee el paid ya
--   actualizado, así que:
--     · paid false→true (re-pago): productos se re-insertan → crea salidas. OK
--     · paid true→false: productos se re-insertan con paid=false → no crea, y el
--       trigger de pedidos borra las viejas. OK
--   El guard del trigger de pedidos es defensa en profundidad para un flip de
--   paid que NO venga por webhook (UPDATE manual).
--
-- NOTA: rdb.handle_sc_corte_on_open (typo 'order_cancelled' + sin filtro paid)
--   quedó FUERA de alcance: referencia rdb.cortes (relación inexistente) y es un
--   bug latente independiente — no participa en el cálculo de totales (eso lo
--   hace la vista). Se reporta aparte.

-- ───────────────────────── 1. Vista canónica ─────────────────────────
CREATE OR REPLACE VIEW rdb.v_waitry_pedidos
WITH (security_invoker = on)
AS
SELECT
  p.id,
  p.order_id,
  p.status,
  p.paid,
  p."timestamp",
  p.place_id,
  p.place_name,
  p.table_name,
  p.layout_name,
  p.total_amount,
  p.total_discount,
  p.service_charge,
  p.tax,
  p.external_delivery_id,
  p.notes,
  p.last_action_at,
  p.content_hash,
  p.created_at,
  p.updated_at,
  p.corte_id,
  p.table_id,
  p.superseded_by_order_id,
  FALSE AS es_fantasma
FROM rdb.waitry_pedidos p
WHERE p.superseded_by_order_id IS NULL
  AND p.paid IS TRUE;

COMMENT ON VIEW rdb.v_waitry_pedidos IS
  'Vista canónica de pedidos Waitry: excluye fantasmas (superseded_by_order_id, ADR-031) y pagos no completados (paid=false → venta no hecha, ADR-035). Default para todos los reads de UI/reportes/conciliación/inventario. Para auditoría con fantasmas + intentos fallidos, leer rdb.v_waitry_pedidos_con_fantasmas o la tabla base.';

GRANT SELECT ON rdb.v_waitry_pedidos TO authenticated, anon;

-- ───────────────────────── 2. Totales por corte ─────────────────────────
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
), pedidos_por_corte AS (
  SELECT waitry_pedidos.corte_id,
    count(*) AS total_pedidos
  FROM rdb.waitry_pedidos
  WHERE waitry_pedidos.corte_id IS NOT NULL
    AND waitry_pedidos.status <> 'order_canceled'::text
    AND waitry_pedidos.paid IS TRUE
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
  'Totales por corte de caja RDB (Waitry). Excluye pedidos cancelados y pagos no completados (paid=false, ADR-035). El filtro paid corrige retroactivamente todos los cortes al recalcularse en cada lectura.';

GRANT SELECT ON rdb.v_cortes_totales TO authenticated, anon;

-- ──────────── 3. Desglose por producto del corte (path financiero) ────────────
-- Ya hacía JOIN a waitry_pedidos: solo se añade el filtro paid (igual que el
-- status). Alimenta el detalle de corte en components/cortes/data.ts.
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
  GROUP BY wp.corte_id, wpp.product_id, wpp.product_name;

GRANT SELECT ON rdb.v_cortes_productos TO authenticated, anon;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. REPORTERÍA PRODUCTO/VENTAS — consistencia "no vendido" (SEPARABLE)      ║
-- ║                                                                            ║
-- ║ Estas 5 vistas leían rdb.waitry_productos crudo SIN join a pedidos, así    ║
-- ║ que contaban intentos fallidos (paid=false) como venta en /rdb/productos   ║
-- ║ y /rdb/ventas (por producto / por categoría). Se añade filtro paid vía     ║
-- ║ EXISTS sobre rdb.waitry_pedidos. Seguro: order_id es único en pedidos      ║
-- ║ (0 duplicados) y no hay líneas huérfanas (0), así que EXISTS no cambia     ║
-- ║ cardinalidad ni descarta filas legítimas; solo excluye las paid=false.     ║
-- ║                                                                            ║
-- ║ Es alcance AMPLIADO sobre el core F3 (canónica + cortes). Si se prefiere   ║
-- ║ la versión mínima, este bloque completo se puede omitir sin afectar las    ║
-- ║ capas 1-3 ni los triggers/backfill.                                        ║
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
                      WHERE pe.order_id = wp.order_id AND pe.paid IS TRUE))
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
                              WHERE pe.order_id = wp.order_id AND pe.paid IS TRUE))
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
                      WHERE pe.order_id = wp.order_id AND pe.paid IS TRUE))
  WHERE p.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid AND p.deleted_at IS NULL
  GROUP BY p.id, p.nombre, p.categoria_id, s.semana_inicio;

-- 4d. Tabla de productos (catálogo). Solo el CTE ultimo_precio_waitry lee
-- waitry_productos crudo; las columnas de venta vienen de v_producto_ultima_venta
-- (ya filtrada arriba). El "último precio" ahora refleja solo ventas reales.
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
                           WHERE pe.order_id = wp.order_id AND pe.paid IS TRUE))
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

-- 4e. Líneas de producto Waitry enriquecidas con categoría (ventas por
-- categoría / por producto). Passthrough fila-a-fila: se filtran las líneas de
-- pedidos paid=false vía WHERE EXISTS.
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
                   WHERE pe.order_id = wp.order_id AND pe.paid IS TRUE));

GRANT SELECT ON rdb.v_producto_ultima_venta TO authenticated, anon;
GRANT SELECT ON rdb.v_producto_metricas TO authenticated, anon;
GRANT SELECT ON rdb.v_producto_tendencia_semanal TO authenticated, anon;
GRANT SELECT ON rdb.v_productos_tabla TO authenticated, anon;
GRANT SELECT ON rdb.v_waitry_productos_categoria TO authenticated, anon;

-- ───────────── 5. Trigger productos → inventario (guard paid) ─────────────
-- Único cambio vs. versión previa: lee paid del pedido y NO crea salida si el
-- pedido no está pagado (igual que ya hacía con order_canceled).
CREATE OR REPLACE FUNCTION erp.fn_trg_waitry_to_movimientos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'erp', 'rdb', 'public'
AS $function$
DECLARE
  v_producto_id    UUID;
  v_parent_id      UUID;
  v_factor_consumo NUMERIC;
  v_empresa_id     UUID := 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid;
  v_almacen_id     UUID;
  v_order_status   TEXT;
  v_order_paid     BOOLEAN;
  v_receta_rows    INTEGER;
  r_insumo         RECORD;
BEGIN
  SELECT id INTO v_almacen_id FROM erp.almacenes WHERE empresa_id = v_empresa_id LIMIT 1;
  IF v_almacen_id IS NULL THEN RETURN NULL; END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM erp.movimientos_inventario
    WHERE referencia_tipo = 'venta_waitry' AND referencia_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT status, paid INTO v_order_status, v_order_paid
  FROM rdb.waitry_pedidos WHERE order_id = NEW.order_id;

  -- Venta no concretada (cancelada o pago no completado): sin salida de inventario.
  IF v_order_status = 'order_canceled' OR v_order_paid IS NOT TRUE THEN
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

-- ──────── 6. Trigger pedidos: borra salidas en cancel o paid→false ────────
-- Generaliza el trigger de cancelación: también borra salidas cuando paid pasa
-- de true a no-true. La recreación (no-true → true) la cubre el webhook.
CREATE OR REPLACE FUNCTION erp.fn_trg_waitry_pedidos_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'erp', 'rdb', 'public'
AS $function$
BEGIN
  IF (NEW.status = 'order_canceled' AND OLD.status <> 'order_canceled')
     OR (NEW.paid IS NOT TRUE AND OLD.paid IS DISTINCT FROM NEW.paid) THEN
    DELETE FROM erp.movimientos_inventario
    WHERE referencia_tipo = 'venta_waitry'
      AND referencia_id IN (SELECT id FROM rdb.waitry_productos WHERE order_id = NEW.order_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- ─────────── 7. BACKFILL: revertir inventario de pedidos paid=false ───────────
-- Devuelve al stock las unidades descontadas por salidas de pedidos no pagados.
-- Idempotente: un segundo run borra 0 filas.
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
      AND pe.paid IS NOT TRUE
  ), del AS (
    DELETE FROM erp.movimientos_inventario
    WHERE id IN (SELECT id FROM objetivo)
    RETURNING cantidad
  )
  SELECT COUNT(*), COALESCE(SUM(cantidad), 0) INTO v_borrados, v_unidades FROM del;

  RAISE NOTICE 'F3 backfill inventario: % movimientos borrados, % unidades devueltas al stock',
    v_borrados, v_unidades;
END;
$$;

-- ───────────────────────── Verificación inline ─────────────────────────
-- Invariantes que deben cumplirse post-migración. Triviales en Preview (DB
-- vacía): 0 filas en ambos lados → ambos pasan.
DO $$
DECLARE
  v_paid_false_en_view integer;
  v_salidas_paid_false integer;
  v_cat_paid_false     integer;
  v_total integer;
BEGIN
  SELECT COUNT(*) INTO v_total FROM rdb.waitry_pedidos;

  -- Invariante 1: la vista canónica no expone ningún pedido paid<>true.
  SELECT COUNT(*) INTO v_paid_false_en_view
  FROM rdb.v_waitry_pedidos WHERE paid IS NOT TRUE;
  IF v_paid_false_en_view <> 0 THEN
    RAISE EXCEPTION 'v_waitry_pedidos expone % pedidos paid<>true', v_paid_false_en_view;
  END IF;

  -- Invariante 2: no quedan salidas de inventario de pedidos paid<>true.
  SELECT COUNT(*) INTO v_salidas_paid_false
  FROM erp.movimientos_inventario mi
    JOIN rdb.waitry_productos wp ON wp.id = mi.referencia_id
    JOIN rdb.waitry_pedidos pe   ON pe.order_id = wp.order_id
  WHERE mi.referencia_tipo = 'venta_waitry' AND pe.paid IS NOT TRUE;
  IF v_salidas_paid_false <> 0 THEN
    RAISE EXCEPTION 'Quedan % salidas de inventario de pedidos paid<>true', v_salidas_paid_false;
  END IF;

  -- Invariante 3: la reportería (passthrough por categoría) no expone líneas de
  -- pedidos paid<>true. Valida el filtro EXISTS del bloque 4.
  SELECT COUNT(*) INTO v_cat_paid_false
  FROM rdb.v_waitry_productos_categoria vc
    JOIN rdb.waitry_pedidos pe ON pe.order_id = vc.order_id
  WHERE pe.paid IS NOT TRUE;
  IF v_cat_paid_false <> 0 THEN
    RAISE EXCEPTION 'v_waitry_productos_categoria expone % líneas de pedidos paid<>true', v_cat_paid_false;
  END IF;

  RAISE NOTICE 'F3 OK: vista canónica + reportería limpias, 0 salidas de pedidos no pagados (% pedidos totales)',
    v_total;
END;
$$;

NOTIFY pgrst, 'reload schema';
