-- rdb.upsert_movimiento
--
-- Shim en el schema `rdb` para que el Edge Function `sync-cortes` pueda
-- POSTear movimientos sin cambios (usa Accept-Profile: rdb).
-- Internamente escribe a erp.movimientos_caja con el mismo patrón que
-- rdb.upsert_corte escribe a erp.cortes_caja.
--
-- Idempotente: usa `referencia = p_coda_id` como natural key.
-- Cuando cortes se abran nativamente en BSOP esta función se puede DROP.

CREATE OR REPLACE FUNCTION rdb.upsert_movimiento(
  p_coda_id        text        DEFAULT NULL,
  p_corte_nombre   text        DEFAULT NULL,
  p_fecha_hora     timestamptz DEFAULT NULL,
  p_tipo           text        DEFAULT NULL,
  p_monto          numeric     DEFAULT NULL,
  p_nota           text        DEFAULT NULL,
  p_registrado_por text        DEFAULT NULL
)
RETURNS erp.movimientos_caja
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'erp', 'rdb', 'public'
AS $function$
DECLARE
  v_result       erp.movimientos_caja;
  v_empresa_id   uuid := 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid;  -- Rincón del Bosque
  v_corte_id     uuid;
  v_tipo         text;
  v_tipo_detalle text;
  v_concepto     text;
BEGIN
  -- 1. Mapear tipo direccional (CHECK constraint: entrada/salida/fondo/devolucion)
  v_tipo := CASE lower(trim(coalesce(p_tipo, '')))
    WHEN 'aporta efectivo' THEN 'entrada'
    WHEN 'fondo'           THEN 'fondo'
    WHEN 'fondo inicial'   THEN 'fondo'
    WHEN 'devolucion'      THEN 'devolucion'
    WHEN 'devolución'      THEN 'devolucion'
    ELSE 'salida'  -- caja negra, retiro efectivo, repartidor, proveedor, propina, y cualquier otro → salida
  END;

  -- 2. Normalizar tipo a snake_case para tipo_detalle
  v_tipo_detalle := CASE lower(trim(coalesce(p_tipo, '')))
    WHEN 'caja negra'       THEN 'caja_negra'
    WHEN 'retiro efectivo'  THEN 'retiro_efectivo'
    WHEN 'repartidor'       THEN 'repartidor'
    WHEN 'aporta efectivo'  THEN 'aporta_efectivo'
    WHEN 'propina'          THEN 'propina'
    WHEN 'proveedor'        THEN 'proveedor'
    WHEN ''                 THEN NULL
    ELSE lower(regexp_replace(trim(p_tipo), '\s+', '_', 'g'))
  END;

  -- 3. Concepto = nota tal cual (el tipo original vive en tipo_detalle; el nombre en realizado_por_nombre)
  v_concepto := NULLIF(trim(coalesce(p_nota, '')), '');

  -- 4. Resolver corte_id por corte_nombre
  IF p_corte_nombre IS NOT NULL AND trim(p_corte_nombre) <> '' THEN
    SELECT id INTO v_corte_id
    FROM erp.cortes_caja
    WHERE empresa_id = v_empresa_id
      AND corte_nombre = p_corte_nombre
    ORDER BY created_at DESC, id DESC
    LIMIT 1;
  END IF;

  -- 5. Idempotencia: buscar por coda_id en referencia
  IF p_coda_id IS NOT NULL THEN
    SELECT * INTO v_result
    FROM erp.movimientos_caja
    WHERE empresa_id = v_empresa_id
      AND referencia = p_coda_id
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_result.id IS NOT NULL THEN
    -- UPDATE existente
    UPDATE erp.movimientos_caja
    SET corte_id             = COALESCE(v_corte_id, corte_id),
        tipo                 = v_tipo,
        tipo_detalle         = COALESCE(v_tipo_detalle, tipo_detalle),
        monto                = COALESCE(p_monto, monto),
        concepto             = COALESCE(v_concepto, concepto),
        realizado_por_nombre = COALESCE(p_registrado_por, realizado_por_nombre),
        created_at           = COALESCE(p_fecha_hora, created_at)
    WHERE id = v_result.id
    RETURNING * INTO v_result;
  ELSE
    -- INSERT nuevo
    INSERT INTO erp.movimientos_caja (
      empresa_id,
      corte_id,
      tipo,
      tipo_detalle,
      monto,
      concepto,
      referencia,
      realizado_por_nombre,
      created_at
    ) VALUES (
      v_empresa_id,
      v_corte_id,
      v_tipo,
      v_tipo_detalle,
      p_monto,
      v_concepto,
      p_coda_id,
      NULLIF(trim(coalesce(p_registrado_por, '')), ''),
      COALESCE(p_fecha_hora, NOW())
    )
    RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END;
$function$;

-- Grants para que PostgREST + service_role puedan invocarla
GRANT EXECUTE ON FUNCTION rdb.upsert_movimiento(text, text, timestamptz, text, numeric, text, text)
  TO service_role, authenticated;
