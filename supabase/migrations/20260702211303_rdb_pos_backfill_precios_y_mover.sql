-- ╭─ 20260702211303_rdb_pos_backfill_precios_y_mover ─╮
-- rdb-pos-propio · S2.5 — (1) backfill de precios de venta RDB desde el
-- último precio cobrado en Waitry (criterio aprobado por Beto 2026-07-02:
-- solo pisa precios vigentes en $0/null, nunca los 94 reales) y
-- (2) RPC fn_pos_mover_cuenta para reubicar cuentas abiertas con auditoría.
-- Robusta a Preview: JOINs contra datos existentes ⇒ no-op en DB vacía.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Backfill de precios: último unit_price > 0 de una venta Waitry pagada.
-- -----------------------------------------------------------------------------
WITH ultimo AS (
  SELECT DISTINCT ON (p.id)
    p.id AS producto_id, p.empresa_id, wprod.unit_price
  FROM erp.productos p
  JOIN rdb.waitry_productos wprod ON wprod.product_id = p.codigo
  JOIN rdb.waitry_pedidos ped ON ped.order_id = wprod.order_id
  JOIN core.empresas e ON e.id = p.empresa_id AND e.slug = 'rdb'
  WHERE wprod.unit_price > 0
    AND ped.paid IS TRUE
    AND ped.superseded_by_order_id IS NULL
  ORDER BY p.id, wprod.created_at DESC
)
UPDATE erp.productos_precios pp
SET precio_venta = u.unit_price
FROM ultimo u
WHERE pp.producto_id = u.producto_id
  AND pp.vigente
  AND COALESCE(pp.precio_venta, 0) = 0;

-- Productos con precio Waitry pero SIN fila de precio vigente: crearla.
WITH ultimo AS (
  SELECT DISTINCT ON (p.id)
    p.id AS producto_id, p.empresa_id, wprod.unit_price
  FROM erp.productos p
  JOIN rdb.waitry_productos wprod ON wprod.product_id = p.codigo
  JOIN rdb.waitry_pedidos ped ON ped.order_id = wprod.order_id
  JOIN core.empresas e ON e.id = p.empresa_id AND e.slug = 'rdb'
  WHERE wprod.unit_price > 0
    AND ped.paid IS TRUE
    AND ped.superseded_by_order_id IS NULL
  ORDER BY p.id, wprod.created_at DESC
)
INSERT INTO erp.productos_precios (empresa_id, producto_id, precio_venta, vigente)
SELECT u.empresa_id, u.producto_id, u.unit_price, true
FROM ultimo u
WHERE NOT EXISTS (
  SELECT 1 FROM erp.productos_precios pp
  WHERE pp.producto_id = u.producto_id AND pp.vigente
);

-- -----------------------------------------------------------------------------
-- 2) RPC: mover una cuenta abierta de ubicación (la gente se mueve por el
--    club). Solo cuentas abiertas/en_cobro; queda en el audit trail.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rdb.fn_pos_mover_cuenta(
  p_cuenta_id uuid, p_pin text, p_ubicacion text, p_client_action_id uuid
) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'rdb', 'public'
AS $$
DECLARE
  v_c        rdb.pos_cuentas%ROWTYPE;
  v_empleado uuid;
BEGIN
  IF rdb.fn_pos_accion_ya_procesada(p_client_action_id) THEN RETURN; END IF;
  SELECT * INTO v_c FROM rdb.pos_cuentas WHERE id = p_cuenta_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'POS: cuenta inexistente'; END IF;
  IF v_c.estado NOT IN ('abierta', 'en_cobro') THEN
    RAISE EXCEPTION 'POS: la cuenta está % — no se puede mover', v_c.estado;
  END IF;

  v_empleado := rdb.fn_pos_resolver_operador(v_c.empresa_id, p_pin);

  UPDATE rdb.pos_cuentas SET ubicacion = p_ubicacion WHERE id = p_cuenta_id;

  PERFORM rdb.fn_pos_log_evento(v_c.empresa_id, 'cuenta_movida', v_empleado,
    v_c.estacion_id, p_cuenta_id, NULL, NULL,
    jsonb_build_object('ubicacion', v_c.ubicacion),
    jsonb_build_object('ubicacion', p_ubicacion), NULL, NULL, p_client_action_id);
END;
$$;

REVOKE ALL ON FUNCTION rdb.fn_pos_mover_cuenta(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rdb.fn_pos_mover_cuenta(uuid, text, text, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
