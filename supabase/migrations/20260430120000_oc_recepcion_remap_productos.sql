-- ============================================================
-- Fix: recepción de OCs migradas de Coda fallaba con violación
-- de NOT NULL en erp.movimientos_inventario.producto_id.
--
-- Contexto: las 169 OCs (y 14 activas) heredadas de Coda llegaron
-- con `producto_id = NULL` en las líneas — la captura era
-- descripción libre. Al ejecutar erp.oc_recibir_linea, el INSERT
-- en erp.movimientos_inventario violaba el constraint y el cliente
-- mostraba un toast genérico ("No pude guardar la recepción.")
-- porque PostgrestError no es instanceof Error.
--
-- Esta migración hace 3 cosas:
--   1. Crea los productos faltantes en erp.productos (RDB) para
--      las descripciones que no existían en el catálogo.
--   2. Re-mapea producto_id en `erp.ordenes_compra_detalle` y
--      `erp.requisiciones_detalle` por nombre exacto
--      (case-insensitive, trim) para todo el histórico RDB.
--   3. Endurece erp.oc_recibir_linea para fallar con mensaje
--      claro si producto_id sigue siendo NULL después de esto
--      (defensa en profundidad).
-- ============================================================

DO $remap$
DECLARE
  v_empresa_id uuid := 'e52ac307-9373-4115-b65e-1178f0c4e1aa';  -- RDB
  v_creados int;
  v_mapeados_oc int;
  v_mapeados_req int;
  v_pendientes_oc int;
  v_pendientes_req int;
BEGIN
  -- ─── 1) Crear productos faltantes ──────────────────────────
  -- Para cada descripción DISTINCT (de OC + REQ) que NO tiene
  -- match exacto en erp.productos, insertar un nuevo producto
  -- con defaults (tipo='producto', unidad='pieza',
  -- inventariable=true, factor_consumo=1.0).
  WITH descs_oc AS (
    SELECT DISTINCT TRIM(d.descripcion) AS descripcion
    FROM erp.ordenes_compra_detalle d
    JOIN erp.ordenes_compra o ON o.id = d.orden_compra_id
    WHERE o.empresa_id = v_empresa_id
      AND d.producto_id IS NULL
      AND d.descripcion IS NOT NULL
      AND TRIM(d.descripcion) <> ''
  ),
  descs_req AS (
    SELECT DISTINCT TRIM(rd.descripcion) AS descripcion
    FROM erp.requisiciones_detalle rd
    JOIN erp.requisiciones r ON r.id = rd.requisicion_id
    WHERE r.empresa_id = v_empresa_id
      AND rd.producto_id IS NULL
      AND rd.descripcion IS NOT NULL
      AND TRIM(rd.descripcion) <> ''
  ),
  todas AS (
    SELECT descripcion FROM descs_oc
    UNION
    SELECT descripcion FROM descs_req
  ),
  faltantes AS (
    SELECT t.descripcion
    FROM todas t
    WHERE NOT EXISTS (
      SELECT 1 FROM erp.productos p
      WHERE p.empresa_id = v_empresa_id
        AND p.deleted_at IS NULL
        AND LOWER(TRIM(p.nombre)) = LOWER(t.descripcion)
    )
  )
  INSERT INTO erp.productos (empresa_id, nombre)
  SELECT v_empresa_id, descripcion
  FROM faltantes
  ORDER BY descripcion;

  GET DIAGNOSTICS v_creados = ROW_COUNT;
  RAISE NOTICE 'Productos creados (descripciones sin match previo): %', v_creados;

  -- ─── 2) Re-mapear ordenes_compra_detalle ───────────────────
  -- Match por nombre exacto, case-insensitive, trim. Si hay >1
  -- producto con el mismo nombre normalizado (ej. "Powerade Uva"),
  -- DISTINCT ON con ORDER BY id elige el más viejo determinísticamente.
  WITH match AS (
    SELECT DISTINCT ON (LOWER(TRIM(p.nombre)))
      LOWER(TRIM(p.nombre)) AS nombre_norm,
      p.id AS producto_id
    FROM erp.productos p
    WHERE p.empresa_id = v_empresa_id
      AND p.deleted_at IS NULL
    ORDER BY LOWER(TRIM(p.nombre)), p.id
  )
  UPDATE erp.ordenes_compra_detalle d
     SET producto_id = m.producto_id
    FROM erp.ordenes_compra o, match m
   WHERE d.orden_compra_id = o.id
     AND o.empresa_id = v_empresa_id
     AND d.producto_id IS NULL
     AND d.descripcion IS NOT NULL
     AND LOWER(TRIM(d.descripcion)) = m.nombre_norm;

  GET DIAGNOSTICS v_mapeados_oc = ROW_COUNT;
  RAISE NOTICE 'Líneas de OC re-mapeadas: %', v_mapeados_oc;

  -- ─── 3) Re-mapear requisiciones_detalle ────────────────────
  WITH match AS (
    SELECT DISTINCT ON (LOWER(TRIM(p.nombre)))
      LOWER(TRIM(p.nombre)) AS nombre_norm,
      p.id AS producto_id
    FROM erp.productos p
    WHERE p.empresa_id = v_empresa_id
      AND p.deleted_at IS NULL
    ORDER BY LOWER(TRIM(p.nombre)), p.id
  )
  UPDATE erp.requisiciones_detalle rd
     SET producto_id = m.producto_id
    FROM erp.requisiciones r, match m
   WHERE rd.requisicion_id = r.id
     AND r.empresa_id = v_empresa_id
     AND rd.producto_id IS NULL
     AND rd.descripcion IS NOT NULL
     AND LOWER(TRIM(rd.descripcion)) = m.nombre_norm;

  GET DIAGNOSTICS v_mapeados_req = ROW_COUNT;
  RAISE NOTICE 'Líneas de REQ re-mapeadas: %', v_mapeados_req;

  -- ─── 4) Verificar que no queden pendientes inesperados ─────
  SELECT COUNT(*) INTO v_pendientes_oc
  FROM erp.ordenes_compra_detalle d
  JOIN erp.ordenes_compra o ON o.id = d.orden_compra_id
  WHERE o.empresa_id = v_empresa_id
    AND d.producto_id IS NULL
    AND d.descripcion IS NOT NULL
    AND TRIM(d.descripcion) <> '';

  SELECT COUNT(*) INTO v_pendientes_req
  FROM erp.requisiciones_detalle rd
  JOIN erp.requisiciones r ON r.id = rd.requisicion_id
  WHERE r.empresa_id = v_empresa_id
    AND rd.producto_id IS NULL
    AND rd.descripcion IS NOT NULL
    AND TRIM(rd.descripcion) <> '';

  RAISE NOTICE 'Líneas OC sin producto_id tras remap: % | Líneas REQ sin producto_id tras remap: %',
    v_pendientes_oc, v_pendientes_req;
END $remap$;

-- ────────────────────────────────────────────────────────────────────
-- 5) Endurecer erp.oc_recibir_linea: guard de NULL producto_id
-- ────────────────────────────────────────────────────────────────────
-- Si por algún motivo (línea capturada manualmente sin producto)
-- v_producto_id sigue siendo NULL, fallar con mensaje claro
-- ANTES del INSERT a movimientos_inventario. Sin esto, el
-- usuario ve un constraint violation oscuro o (en el cliente
-- actual) un toast genérico.
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

  IF v_producto_id IS NULL THEN
    RAISE EXCEPTION 'Línea % no está ligada a un producto del catálogo. Liga la línea a un producto antes de capturar la recepción.', p_detalle_id
      USING ERRCODE = '22023',
            HINT = 'Edita la requisición/OC para seleccionar el producto del catálogo en esta partida.';
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
  'Registra cantidad recibida acumulada en una línea de OC. Genera movimientos_inventario por el delta y recalcula estado de la OC. Idempotente si delta=0. Falla claro si la línea no está ligada a producto del catálogo.';

GRANT EXECUTE ON FUNCTION erp.oc_recibir_linea(uuid, numeric, numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';
