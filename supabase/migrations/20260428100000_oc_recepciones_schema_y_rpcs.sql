-- ============================================================
-- Sprint 1 — OC Recepciones: schema + RPCs
-- ============================================================
-- Iniciativa: oc-recepciones
-- Doc: docs/planning/oc-recepciones.md
--
-- Objetivo: cerrar el ciclo OC → Recepción → Inventario.
--
-- Hoy la UI sólo actualiza ordenes_compra.total al "recibir"; nunca
-- escribe en recepciones, recepciones_detalle ni movimientos_inventario.
-- Esta migración:
--
-- 1. Agrega columnas de estado y trazabilidad por línea de OC
--    (cantidad_recibida, cantidad_cancelada, precio_real con audit
--    de override, motivo_cancelacion).
-- 2. Agrega columnas de cierre a la cabecera de OC (estado,
--    total_a_pagar, cerrada_at, cerrada_por).
-- 3. Backfill del estado actual desde autorizada_at.
-- 4. RPCs transaccionales:
--      - erp.oc_recibir_linea: actualiza cantidad_recibida acumulada,
--        genera movimientos_inventario por el delta (positivo o
--        negativo si se corrige a la baja), recalcula estado de OC.
--      - erp.oc_cancelar_pendiente_linea: marca pendiente como
--        cancelado.
--      - erp.oc_cerrar_orden: cancela todo lo pendiente de las
--        líneas y congela total_a_pagar.
--    Las 3 funciones validan empresa con core.fn_has_empresa().
-- 5. Función helper erp.fn_oc_recalcular_estado para uso interno.
--
-- Decisión clave (ver doc de planning, "modelo = estado, no
-- evento"): las RPCs trabajan sobre el estado actual de la línea,
-- no insertan rows en erp.recepciones / erp.recepciones_detalle.
-- Esas tablas siguen vivas pero quedan sin uso desde la UI nueva
-- — son deuda a deprecar después.

-- ────────────────────────────────────────────────────────────────────
-- 1) Columnas nuevas en erp.ordenes_compra_detalle
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE erp.ordenes_compra_detalle
  ADD COLUMN IF NOT EXISTS cantidad_recibida numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cantidad_cancelada numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_real numeric,
  ADD COLUMN IF NOT EXISTS precio_modificado_por uuid REFERENCES core.usuarios(id),
  ADD COLUMN IF NOT EXISTS precio_modificado_at timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion text;

COMMENT ON COLUMN erp.ordenes_compra_detalle.cantidad_recibida IS
  'Acumulado de cantidad recibida para esta línea. 0 ≤ cantidad_recibida ≤ cantidad - cantidad_cancelada.';
COMMENT ON COLUMN erp.ordenes_compra_detalle.cantidad_cancelada IS
  'Cantidad de la línea declarada como ya-no-se-va-a-surtir. cantidad_recibida + cantidad_cancelada ≤ cantidad.';
COMMENT ON COLUMN erp.ordenes_compra_detalle.precio_real IS
  'Override de precio aplicado al recibir (sólo para gerentes). NULL = usa precio_unitario original.';
COMMENT ON COLUMN erp.ordenes_compra_detalle.precio_modificado_por IS
  'Usuario que aplicó el override de precio_real (audit).';
COMMENT ON COLUMN erp.ordenes_compra_detalle.precio_modificado_at IS
  'Timestamp del override de precio_real (audit).';
COMMENT ON COLUMN erp.ordenes_compra_detalle.motivo_cancelacion IS
  'Motivo capturado al cancelar el pendiente de la línea (cuando el proveedor ya no surte).';

ALTER TABLE erp.ordenes_compra_detalle
  DROP CONSTRAINT IF EXISTS oc_detalle_cantidades_validas;
ALTER TABLE erp.ordenes_compra_detalle
  ADD CONSTRAINT oc_detalle_cantidades_validas
  CHECK (
    cantidad_recibida >= 0
    AND cantidad_cancelada >= 0
    AND cantidad_recibida + cantidad_cancelada <= cantidad
  );

-- ────────────────────────────────────────────────────────────────────
-- 2) Columnas nuevas en erp.ordenes_compra
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE erp.ordenes_compra
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'borrador',
  ADD COLUMN IF NOT EXISTS total_a_pagar numeric,
  ADD COLUMN IF NOT EXISTS cerrada_at timestamptz,
  ADD COLUMN IF NOT EXISTS cerrada_por uuid REFERENCES core.usuarios(id);

COMMENT ON COLUMN erp.ordenes_compra.estado IS
  'Estado del flujo OC: borrador → enviada → parcial → cerrada (o cancelada). Mantenido por erp.fn_oc_recalcular_estado.';
COMMENT ON COLUMN erp.ordenes_compra.total_a_pagar IS
  'Total a pagar al proveedor (Σ cantidad_recibida × COALESCE(precio_real, precio_unitario)). Se congela al cerrar la OC. Hook para CxP futuro.';
COMMENT ON COLUMN erp.ordenes_compra.cerrada_at IS
  'Timestamp en que la OC pasó a estado cerrada o cancelada (audit).';
COMMENT ON COLUMN erp.ordenes_compra.cerrada_por IS
  'Usuario que cerró la OC (audit).';

ALTER TABLE erp.ordenes_compra
  DROP CONSTRAINT IF EXISTS oc_estado_valido;
ALTER TABLE erp.ordenes_compra
  ADD CONSTRAINT oc_estado_valido
  CHECK (estado IN ('borrador', 'enviada', 'parcial', 'cerrada', 'cancelada'));

-- ────────────────────────────────────────────────────────────────────
-- 3) Backfill del estado para OCs existentes
-- ────────────────────────────────────────────────────────────────────
-- Antes de esta iniciativa el estatus era decorativo (frontend lo
-- inferia desde autorizada_at). Backfill conservador:
--   - autorizada_at NOT NULL → 'enviada'
--   - autorizada_at NULL    → 'borrador'

UPDATE erp.ordenes_compra
   SET estado = CASE
                  WHEN autorizada_at IS NOT NULL THEN 'enviada'
                  ELSE 'borrador'
                END
 WHERE estado = 'borrador';

-- ────────────────────────────────────────────────────────────────────
-- 4) Función helper: recalcular estado de una OC
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION erp.fn_oc_recalcular_estado(p_orden_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_total_pedida numeric := 0;
  v_total_recibida numeric := 0;
  v_total_cancelada numeric := 0;
  v_autorizada_at timestamptz;
  v_estado_actual text;
  v_estado_nuevo text;
BEGIN
  SELECT
    COALESCE(SUM(cantidad), 0),
    COALESCE(SUM(cantidad_recibida), 0),
    COALESCE(SUM(cantidad_cancelada), 0)
    INTO v_total_pedida, v_total_recibida, v_total_cancelada
  FROM erp.ordenes_compra_detalle
  WHERE orden_compra_id = p_orden_id;

  SELECT autorizada_at, estado
    INTO v_autorizada_at, v_estado_actual
  FROM erp.ordenes_compra
  WHERE id = p_orden_id;

  IF v_estado_actual IN ('cerrada', 'cancelada') THEN
    RETURN;
  END IF;

  IF v_total_pedida = 0 THEN
    RETURN;
  END IF;

  IF v_total_recibida + v_total_cancelada >= v_total_pedida THEN
    IF v_total_recibida = 0 THEN
      v_estado_nuevo := 'cancelada';
    ELSE
      v_estado_nuevo := 'cerrada';
    END IF;
  ELSIF v_total_recibida > 0 OR v_total_cancelada > 0 THEN
    v_estado_nuevo := 'parcial';
  ELSE
    v_estado_nuevo := CASE WHEN v_autorizada_at IS NOT NULL THEN 'enviada' ELSE 'borrador' END;
  END IF;

  IF v_estado_nuevo IS DISTINCT FROM v_estado_actual THEN
    UPDATE erp.ordenes_compra
       SET estado = v_estado_nuevo,
           updated_at = now()
     WHERE id = p_orden_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION erp.fn_oc_recalcular_estado(uuid) IS
  'Recalcula erp.ordenes_compra.estado a partir de las cantidades de sus líneas. No tiene efecto en OCs ya cerradas o canceladas (terminal).';

-- ────────────────────────────────────────────────────────────────────
-- 5) Helper audit
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION erp.fn_oc_audit(
  p_empresa_id uuid,
  p_accion text,
  p_tabla text,
  p_registro_id uuid,
  p_datos_anteriores jsonb,
  p_datos_nuevos jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_usuario_id uuid;
BEGIN
  SELECT id INTO v_usuario_id
  FROM core.usuarios
  WHERE email = lower(coalesce(auth.jwt() ->> 'email', ''))
    AND activo = true
  LIMIT 1;

  INSERT INTO core.audit_log (
    empresa_id, usuario_id, accion, tabla, registro_id,
    datos_anteriores, datos_nuevos, created_at
  ) VALUES (
    p_empresa_id, v_usuario_id, p_accion, p_tabla, p_registro_id,
    p_datos_anteriores, p_datos_nuevos, now()
  );
END;
$$;

COMMENT ON FUNCTION erp.fn_oc_audit(uuid, text, text, uuid, jsonb, jsonb) IS
  'Helper interno para registrar entradas de audit_log desde las RPCs de oc-recepciones.';

-- ────────────────────────────────────────────────────────────────────
-- 6) RPC: erp.oc_recibir_linea
-- ────────────────────────────────────────────────────────────────────
-- Acumulado, no delta — el cliente envía "ya recibí 7 en total" y
-- el RPC calcula el delta vs cantidad_recibida actual e inserta el
-- movimiento de inventario correspondiente.
--
-- Si delta = 0 → idempotente, no hace nada.
-- Si delta > 0 → INSERT movimiento tipo 'entrada' con cantidad=delta.
-- Si delta < 0 → INSERT movimiento tipo 'ajuste' con cantidad=delta
--   (negativo). Sirve para corregir capturas erróneas; el trigger
--   trg_mantenimiento_inventario refleja la baja en stock.

CREATE OR REPLACE FUNCTION erp.oc_recibir_linea(
  p_detalle_id uuid,
  p_cantidad_recibida_total numeric,
  p_costo_unitario numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid;
  v_orden_id uuid;
  v_producto_id uuid;
  v_cantidad_pedida numeric;
  v_cantidad_recibida_actual numeric;
  v_cantidad_cancelada numeric;
  v_precio_real numeric;
  v_precio_unitario numeric;
  v_almacen_id uuid;
  v_delta numeric;
  v_costo numeric;
  v_tipo_mov text;
  v_estado_oc text;
BEGIN
  IF p_cantidad_recibida_total IS NULL OR p_cantidad_recibida_total < 0 THEN
    RAISE EXCEPTION 'cantidad_recibida_total debe ser >= 0 (recibido: %)', p_cantidad_recibida_total
      USING ERRCODE = '22023';
  END IF;

  SELECT
    d.empresa_id, d.orden_compra_id, d.producto_id,
    d.cantidad, d.cantidad_recibida, d.cantidad_cancelada,
    d.precio_real, d.precio_unitario,
    o.estado
    INTO
    v_empresa_id, v_orden_id, v_producto_id,
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

  SELECT id INTO v_almacen_id
  FROM erp.almacenes
  WHERE empresa_id = v_empresa_id
  LIMIT 1;

  IF v_almacen_id IS NULL THEN
    RAISE EXCEPTION 'Empresa % no tiene almacén configurado', v_empresa_id USING ERRCODE = '22023';
  END IF;

  v_costo := COALESCE(p_costo_unitario, v_precio_real, v_precio_unitario);

  IF v_delta > 0 THEN
    v_tipo_mov := 'entrada';
  ELSE
    v_tipo_mov := 'ajuste';
  END IF;

  INSERT INTO erp.movimientos_inventario (
    empresa_id, producto_id, almacen_id, tipo_movimiento,
    cantidad, costo_unitario, referencia_tipo, referencia_id,
    notas
  ) VALUES (
    v_empresa_id, v_producto_id, v_almacen_id, v_tipo_mov,
    v_delta, v_costo, 'oc_recepcion', v_orden_id,
    CASE
      WHEN v_delta > 0 THEN 'Recepción línea ' || p_detalle_id::text
      ELSE 'Ajuste recepción línea ' || p_detalle_id::text
    END
  );

  UPDATE erp.ordenes_compra_detalle
     SET cantidad_recibida = p_cantidad_recibida_total
   WHERE id = p_detalle_id;

  PERFORM erp.fn_oc_recalcular_estado(v_orden_id);

  PERFORM erp.fn_oc_audit(
    v_empresa_id,
    'oc_recibir_linea',
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
    'cantidad_recibida_total', p_cantidad_recibida_total,
    'delta_aplicado', v_delta,
    'costo_unitario_aplicado', v_costo
  );
END;
$$;

COMMENT ON FUNCTION erp.oc_recibir_linea(uuid, numeric, numeric) IS
  'Registra cantidad recibida acumulada en una línea de OC. Genera movimientos_inventario por el delta y recalcula estado de la OC. Idempotente si delta=0.';

GRANT EXECUTE ON FUNCTION erp.oc_recibir_linea(uuid, numeric, numeric) TO authenticated;

-- ────────────────────────────────────────────────────────────────────
-- 7) RPC: erp.oc_cancelar_pendiente_linea
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION erp.oc_cancelar_pendiente_linea(
  p_detalle_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid;
  v_orden_id uuid;
  v_cantidad_pedida numeric;
  v_cantidad_recibida numeric;
  v_cantidad_cancelada_anterior numeric;
  v_cantidad_cancelada_nueva numeric;
  v_estado_oc text;
BEGIN
  SELECT
    d.empresa_id, d.orden_compra_id,
    d.cantidad, d.cantidad_recibida, d.cantidad_cancelada,
    o.estado
    INTO
    v_empresa_id, v_orden_id,
    v_cantidad_pedida, v_cantidad_recibida, v_cantidad_cancelada_anterior,
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
    RAISE EXCEPTION 'OC % está en estado terminal % — no se pueden cancelar más líneas', v_orden_id, v_estado_oc
      USING ERRCODE = '22023';
  END IF;

  v_cantidad_cancelada_nueva := v_cantidad_pedida - v_cantidad_recibida;

  IF v_cantidad_cancelada_nueva = v_cantidad_cancelada_anterior THEN
    RETURN jsonb_build_object(
      'detalle_id', p_detalle_id,
      'cantidad_cancelada', v_cantidad_cancelada_nueva,
      'mensaje', 'sin cambio (línea ya cubierta)'
    );
  END IF;

  UPDATE erp.ordenes_compra_detalle
     SET cantidad_cancelada = v_cantidad_cancelada_nueva,
         motivo_cancelacion = COALESCE(p_motivo, motivo_cancelacion)
   WHERE id = p_detalle_id;

  PERFORM erp.fn_oc_recalcular_estado(v_orden_id);

  PERFORM erp.fn_oc_audit(
    v_empresa_id,
    'oc_cancelar_pendiente_linea',
    'erp.ordenes_compra_detalle',
    p_detalle_id,
    jsonb_build_object('cantidad_cancelada', v_cantidad_cancelada_anterior),
    jsonb_build_object(
      'cantidad_cancelada', v_cantidad_cancelada_nueva,
      'motivo', p_motivo
    )
  );

  RETURN jsonb_build_object(
    'detalle_id', p_detalle_id,
    'orden_compra_id', v_orden_id,
    'cantidad_cancelada', v_cantidad_cancelada_nueva
  );
END;
$$;

COMMENT ON FUNCTION erp.oc_cancelar_pendiente_linea(uuid, text) IS
  'Marca como cancelado el pendiente de una línea (cantidad - cantidad_recibida). Recalcula estado de la OC.';

GRANT EXECUTE ON FUNCTION erp.oc_cancelar_pendiente_linea(uuid, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────
-- 8) RPC: erp.oc_cerrar_orden
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION erp.oc_cerrar_orden(
  p_orden_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid;
  v_estado_actual text;
  v_total_recibida numeric;
  v_total_a_pagar numeric;
  v_estado_final text;
  v_usuario_id uuid;
BEGIN
  SELECT empresa_id, estado
    INTO v_empresa_id, v_estado_actual
  FROM erp.ordenes_compra
  WHERE id = p_orden_id
  FOR UPDATE;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'OC % no encontrada', p_orden_id USING ERRCODE = '22023';
  END IF;

  IF NOT core.fn_has_empresa(v_empresa_id) THEN
    RAISE EXCEPTION 'Sin permiso para empresa %', v_empresa_id USING ERRCODE = '42501';
  END IF;

  IF v_estado_actual IN ('cerrada', 'cancelada') THEN
    RETURN jsonb_build_object(
      'orden_compra_id', p_orden_id,
      'estado', v_estado_actual,
      'mensaje', 'OC ya está en estado terminal (idempotente)'
    );
  END IF;

  UPDATE erp.ordenes_compra_detalle
     SET cantidad_cancelada = cantidad - cantidad_recibida,
         motivo_cancelacion = COALESCE(motivo_cancelacion, p_motivo)
   WHERE orden_compra_id = p_orden_id
     AND cantidad_recibida + cantidad_cancelada < cantidad;

  SELECT
    COALESCE(SUM(cantidad_recibida), 0),
    COALESCE(SUM(cantidad_recibida * COALESCE(precio_real, precio_unitario)), 0)
    INTO v_total_recibida, v_total_a_pagar
  FROM erp.ordenes_compra_detalle
  WHERE orden_compra_id = p_orden_id;

  IF v_total_recibida = 0 THEN
    v_estado_final := 'cancelada';
  ELSE
    v_estado_final := 'cerrada';
  END IF;

  SELECT id INTO v_usuario_id
  FROM core.usuarios
  WHERE email = lower(coalesce(auth.jwt() ->> 'email', ''))
    AND activo = true
  LIMIT 1;

  UPDATE erp.ordenes_compra
     SET estado = v_estado_final,
         total_a_pagar = v_total_a_pagar,
         cerrada_at = now(),
         cerrada_por = v_usuario_id,
         updated_at = now()
   WHERE id = p_orden_id;

  PERFORM erp.fn_oc_audit(
    v_empresa_id,
    'oc_cerrar_orden',
    'erp.ordenes_compra',
    p_orden_id,
    jsonb_build_object('estado', v_estado_actual),
    jsonb_build_object(
      'estado', v_estado_final,
      'total_a_pagar', v_total_a_pagar,
      'motivo', p_motivo
    )
  );

  RETURN jsonb_build_object(
    'orden_compra_id', p_orden_id,
    'estado', v_estado_final,
    'total_a_pagar', v_total_a_pagar,
    'total_recibida', v_total_recibida
  );
END;
$$;

COMMENT ON FUNCTION erp.oc_cerrar_orden(uuid, text) IS
  'Cierra una OC: cancela todo lo pendiente y congela total_a_pagar (Σ cantidad_recibida × precio). Estado terminal: cerrada (con recepciones) o cancelada (sin recepciones). Idempotente si ya está cerrada/cancelada.';

GRANT EXECUTE ON FUNCTION erp.oc_cerrar_orden(uuid, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────
-- 9) Índice de soporte para queries por estado
-- ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS erp_ordenes_compra_estado_idx
  ON erp.ordenes_compra (empresa_id, estado);

-- Fin Sprint 1
