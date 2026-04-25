-- MIGRATION: Soft-deprecate Coda→BSOP sync shims
-- FECHA: 2026-04-24
-- CONTEXTO: RDB dejó de usar Coda como fuente de cortes.
-- Cron sync-cortes-5min ya fue apagado (cron.unschedule).
-- Este paso envuelve los shims con RAISE WARNING para detectar callers tardíos
-- antes del DROP definitivo (pendiente en PR futuro ~1-2 semanas).

BEGIN;

-- ========== FASE 0: INVENTORY ==========
DO $$
DECLARE
  n_cortes_coda int;
  n_movs_coda int;
BEGIN
  SELECT count(*) INTO n_cortes_coda
  FROM erp.cortes_caja
  WHERE observaciones ILIKE 'coda_id:%';

  SELECT count(*) INTO n_movs_coda
  FROM erp.movimientos_caja
  WHERE referencia LIKE 'i-%';

  RAISE NOTICE 'FASE 0 — cortes con coda_id en observaciones: %', n_cortes_coda;
  RAISE NOTICE 'FASE 0 — movimientos_caja con referencia i-%% (Coda): %', n_movs_coda;
  -- Esperado el 2026-04-24: 12 cortes y 415 movimientos. Si cambia, revisar antes de seguir.
END $$;

-- ========== FASE 1: SOFT DEPRECATE ==========
-- Estrategia: envolver la lógica existente con una NOTICE/WARNING visible en logs,
-- SIN cambiar el contrato (mismos parámetros y return type).
-- CREATE OR REPLACE re-usa el nombre, preserva los permisos y overloads.
-- Body original copiado tal cual desde pg_get_functiondef(oid) para no divergir.

CREATE OR REPLACE FUNCTION rdb.upsert_corte(
  p_coda_id text DEFAULT NULL::text,
  p_corte_nombre text DEFAULT NULL::text,
  p_caja_nombre text DEFAULT NULL::text,
  p_estado text DEFAULT NULL::text,
  p_turno text DEFAULT NULL::text,
  p_responsable_apertura text DEFAULT NULL::text,
  p_responsable_cierre text DEFAULT NULL::text,
  p_observaciones text DEFAULT NULL::text,
  p_efectivo_inicial numeric DEFAULT NULL::numeric,
  p_efectivo_contado numeric DEFAULT NULL::numeric,
  p_hora_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_hora_fin timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_fecha_operativa date DEFAULT NULL::date,
  p_tipo text DEFAULT 'normal'::text
)
RETURNS erp.cortes_caja
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'erp', 'rdb', 'public'
AS $fn$
DECLARE
  v_result     erp.cortes_caja;
  v_empresa_id UUID := 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid;
  v_estado     TEXT;
BEGIN
  RAISE WARNING '[DEPRECATED] rdb.upsert_corte llamado (coda_id=%). RDB ya no usa Coda. Planificado DROP tras 2 semanas sin callers.', p_coda_id;

  v_estado := CASE LOWER(COALESCE(p_estado, ''))
    WHEN 'cerrado' THEN 'cerrado'
    WHEN 'abierto' THEN 'abierto'
    WHEN 'validado' THEN 'validado'
    WHEN 'cancelado' THEN 'cancelado'
    ELSE CASE WHEN p_hora_fin IS NOT NULL THEN 'cerrado' ELSE 'abierto' END
  END;

  -- First try by coda_id embedded in observaciones
  IF p_coda_id IS NOT NULL THEN
    SELECT * INTO v_result
    FROM erp.cortes_caja c
    WHERE c.empresa_id = v_empresa_id
      AND COALESCE(c.observaciones, '') ILIKE '%' || 'coda_id:' || p_coda_id || '%'
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT 1;
  END IF;

  -- Fallback to natural key
  IF v_result.id IS NULL THEN
    SELECT * INTO v_result
    FROM erp.cortes_caja c
    WHERE c.empresa_id = v_empresa_id
      AND c.caja_nombre IS NOT DISTINCT FROM p_caja_nombre
      AND c.fecha_operativa IS NOT DISTINCT FROM p_fecha_operativa
      AND c.abierto_at IS NOT DISTINCT FROM p_hora_inicio
      AND c.cerrado_at IS NOT DISTINCT FROM p_hora_fin
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT 1;
  END IF;

  IF v_result.id IS NOT NULL THEN
    UPDATE erp.cortes_caja c
    SET corte_nombre     = COALESCE(p_corte_nombre, c.corte_nombre),
        caja_nombre      = COALESCE(p_caja_nombre, c.caja_nombre),
        tipo             = COALESCE(NULLIF(p_tipo, ''), c.tipo),
        estado           = COALESCE(v_estado, c.estado),
        efectivo_inicial = COALESCE(p_efectivo_inicial, c.efectivo_inicial),
        efectivo_contado = COALESCE(p_efectivo_contado, c.efectivo_contado),
        observaciones    = CASE
          WHEN p_coda_id IS NOT NULL AND COALESCE(c.observaciones, '') NOT ILIKE '%' || 'coda_id:' || p_coda_id || '%'
            THEN trim(both ' ' from concat_ws(' | ', NULLIF(c.observaciones, ''), 'coda_id:' || p_coda_id))
          ELSE COALESCE(NULLIF(p_observaciones, ''), c.observaciones)
        END,
        fecha_operativa  = COALESCE(p_fecha_operativa, c.fecha_operativa),
        abierto_at       = COALESCE(p_hora_inicio, c.abierto_at),
        cerrado_at       = COALESCE(p_hora_fin, c.cerrado_at),
        updated_at       = now()
    WHERE c.id = v_result.id
    RETURNING * INTO v_result;
  ELSE
    INSERT INTO erp.cortes_caja (
      empresa_id, caja_nombre, corte_nombre, tipo, estado,
      efectivo_inicial, efectivo_contado, observaciones,
      fecha_operativa, abierto_at, cerrado_at
    ) VALUES (
      v_empresa_id,
      p_caja_nombre,
      COALESCE(p_corte_nombre, 'Corte-' || COALESCE(p_caja_nombre, 'Sin Caja')),
      COALESCE(NULLIF(CASE WHEN p_tipo = 'sin_corte' THEN 'normal' ELSE p_tipo END, ''), 'normal'),
      v_estado,
      COALESCE(p_efectivo_inicial, 0),
      p_efectivo_contado,
      trim(both ' ' from concat_ws(' | ', NULLIF(p_observaciones, ''), CASE WHEN p_coda_id IS NOT NULL THEN 'coda_id:' || p_coda_id END)),
      p_fecha_operativa,
      p_hora_inicio,
      p_hora_fin
    )
    RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION rdb.upsert_movimiento(
  p_coda_id text DEFAULT NULL::text,
  p_corte_nombre text DEFAULT NULL::text,
  p_fecha_hora timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_tipo text DEFAULT NULL::text,
  p_monto numeric DEFAULT NULL::numeric,
  p_nota text DEFAULT NULL::text,
  p_registrado_por text DEFAULT NULL::text
)
RETURNS erp.movimientos_caja
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'erp', 'rdb', 'public'
AS $fn$
DECLARE
  v_result       erp.movimientos_caja;
  v_empresa_id   uuid := 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid;  -- Rincón del Bosque
  v_corte_id     uuid;
  v_tipo         text;
  v_tipo_detalle text;
  v_concepto     text;
BEGIN
  RAISE WARNING '[DEPRECATED] rdb.upsert_movimiento llamado (coda_id=%). RDB ya no usa Coda. Planificado DROP tras 2 semanas sin callers.', p_coda_id;

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
$fn$;

COMMENT ON FUNCTION rdb.upsert_corte(
  text, text, text, text, text, text, text, text, numeric, numeric,
  timestamptz, timestamptz, date, text
) IS 'DEPRECATED 2026-04-24 — RDB migrado a captura nativa de cortes. RAISE WARNING al ser llamada. DROP planeado ~2026-05-08 si no hay callers.';

COMMENT ON FUNCTION rdb.upsert_movimiento(
  text, text, timestamptz, text, numeric, text, text
) IS 'DEPRECATED 2026-04-24 — RDB migrado a captura nativa de cortes. RAISE WARNING al ser llamada. DROP planeado ~2026-05-08 si no hay callers.';

-- ========== FASE 2: VERIFICATION ==========
DO $$
DECLARE
  n_warnings_configurados int;
BEGIN
  SELECT count(*) INTO n_warnings_configurados
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'rdb'
    AND p.proname IN ('upsert_corte','upsert_movimiento')
    AND pg_get_functiondef(p.oid) ILIKE '%DEPRECATED%';

  IF n_warnings_configurados <> 2 THEN
    RAISE EXCEPTION 'FASE 2 FAIL — esperaba 2 funciones con marca DEPRECATED, encontré %', n_warnings_configurados;
  END IF;

  RAISE NOTICE 'FASE 2 OK — 2 shims marcadas DEPRECATED correctamente.';
END $$;

COMMIT;
