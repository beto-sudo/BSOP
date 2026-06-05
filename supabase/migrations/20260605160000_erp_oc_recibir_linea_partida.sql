-- RPC de recepción constructora-first: `erp.oc_recibir_linea_partida`.
--
-- Iniciativa `dilesa-compras` · Sprint 2 Fase C. Variante de
-- `erp.oc_recibir_linea` (que usa RDB) para el modelo constructora (D7/D11/D13):
-- la línea se ancla a una **partida** (no a producto) y la recepción **devenga
-- contra la partida** — solo actualiza `cantidad_recibida` (lo que alimenta
-- `ejercido` en `erp.v_partida_control`) + recalcula estado + audita. NO toca
-- inventario (`movimientos_inventario`) ni requiere almacén.
--
-- RPC NUEVA (no se modifica `oc_recibir_linea`) para aislar el riesgo del
-- inventario de RDB en prod (D13). Mismos guards de permiso/estado/cantidad e
-- idempotencia que la original. Reversible: `DROP FUNCTION ...`.

CREATE OR REPLACE FUNCTION erp.oc_recibir_linea_partida(
  p_detalle_id uuid,
  p_cantidad_recibida_total numeric,
  p_costo_unitario numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_empresa_id uuid;
  v_orden_id uuid;
  v_partida_id uuid;
  v_cantidad_pedida numeric;
  v_cantidad_recibida_actual numeric;
  v_cantidad_cancelada numeric;
  v_precio_real numeric;
  v_precio_unitario numeric;
  v_delta numeric;
  v_costo numeric;
  v_estado_oc text;
BEGIN
  IF p_cantidad_recibida_total IS NULL OR p_cantidad_recibida_total < 0 THEN
    RAISE EXCEPTION 'cantidad_recibida_total debe ser >= 0 (recibido: %)', p_cantidad_recibida_total
      USING ERRCODE = '22023';
  END IF;

  SELECT
    d.empresa_id, d.orden_compra_id, d.partida_id,
    d.cantidad, d.cantidad_recibida, d.cantidad_cancelada,
    d.precio_real, d.precio_unitario,
    o.estado
    INTO
    v_empresa_id, v_orden_id, v_partida_id,
    v_cantidad_pedida, v_cantidad_recibida_actual, v_cantidad_cancelada,
    v_precio_real, v_precio_unitario,
    v_estado_oc
  FROM erp.ordenes_compra_detalle d
  JOIN erp.ordenes_compra o ON o.id = d.orden_compra_id
  WHERE d.id = p_detalle_id
  FOR UPDATE OF d;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Línea de OC % no encontrada', p_detalle_id USING ERRCODE = '22023';
  END IF;

  IF NOT core.fn_has_empresa(v_empresa_id) THEN
    RAISE EXCEPTION 'Sin permiso para empresa %', v_empresa_id USING ERRCODE = '42501';
  END IF;

  IF v_estado_oc IN ('cerrada', 'cancelada') THEN
    RAISE EXCEPTION 'OC % está en estado terminal % — no se pueden registrar más recepciones', v_orden_id, v_estado_oc
      USING ERRCODE = '22023';
  END IF;

  -- Constructora (D12): la línea se ancla a partida, NO a producto.
  IF v_partida_id IS NULL THEN
    RAISE EXCEPTION 'Línea % no está ligada a una partida de presupuesto.', p_detalle_id
      USING ERRCODE = '22023',
            HINT = 'Edita la OC para anclar la línea a una partida del presupuesto.';
  END IF;

  IF p_cantidad_recibida_total + v_cantidad_cancelada > v_cantidad_pedida THEN
    RAISE EXCEPTION 'cantidad_recibida_total (%) + cantidad_cancelada (%) excede cantidad pedida (%)',
      p_cantidad_recibida_total, v_cantidad_cancelada, v_cantidad_pedida
      USING ERRCODE = '22023';
  END IF;

  v_delta := p_cantidad_recibida_total - v_cantidad_recibida_actual;

  IF v_delta = 0 THEN
    RETURN jsonb_build_object(
      'detalle_id', p_detalle_id,
      'cantidad_recibida_total', p_cantidad_recibida_total,
      'delta_aplicado', 0,
      'mensaje', 'sin cambio (idempotente)'
    );
  END IF;

  v_costo := COALESCE(p_costo_unitario, v_precio_real, v_precio_unitario);

  -- Devenga contra la partida: solo actualiza cantidad_recibida (alimenta
  -- erp.v_partida_control.ejercido). SIN movimientos_inventario, sin almacén.
  UPDATE erp.ordenes_compra_detalle
     SET cantidad_recibida = p_cantidad_recibida_total
   WHERE id = p_detalle_id;

  PERFORM erp.fn_oc_recalcular_estado(v_orden_id);

  PERFORM erp.fn_oc_audit(
    v_empresa_id,
    'oc_recibir_linea_partida',
    'erp.ordenes_compra_detalle',
    p_detalle_id,
    jsonb_build_object('cantidad_recibida', v_cantidad_recibida_actual),
    jsonb_build_object(
      'cantidad_recibida', p_cantidad_recibida_total,
      'delta', v_delta,
      'costo_unitario', v_costo
    )
  );

  RETURN jsonb_build_object(
    'detalle_id', p_detalle_id,
    'orden_compra_id', v_orden_id,
    'partida_id', v_partida_id,
    'cantidad_recibida_total', p_cantidad_recibida_total,
    'delta_aplicado', v_delta,
    'costo_unitario_aplicado', v_costo
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION erp.oc_recibir_linea_partida(uuid, numeric, numeric) TO authenticated;
