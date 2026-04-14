-- ============================================================
-- Re-implement SC (Sin Corte) logic on erp.cortes_caja
-- Since erp.cortes_caja.tipo does not allow 'sin_corte', use tipo='especial'
-- and preserve the semantic in corte_nombre = 'Corte-SC-...'
-- ============================================================

CREATE OR REPLACE FUNCTION erp.handle_sc_corte_on_open()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, rdb, public
AS $$
DECLARE
  v_primer_huerfano   TIMESTAMPTZ;
  v_ultimo_huerfano   TIMESTAMPTZ;
  v_fecha_sc          DATE;
  v_base_nombre       TEXT;
  v_corte_nombre      TEXT;
  v_sufijo            INTEGER;
  v_sc_corte_id       UUID;
  v_count_huerfanos   INTEGER;
  v_ultimo_cierre     TIMESTAMPTZ;
BEGIN
  IF NEW.estado != 'abierto' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(cerrado_at), '1970-01-01'::TIMESTAMPTZ)
  INTO v_ultimo_cierre
  FROM erp.cortes_caja
  WHERE empresa_id = NEW.empresa_id
    AND id != NEW.id
    AND cerrado_at IS NOT NULL
    AND cerrado_at < NEW.abierto_at;

  SELECT COUNT(*), MIN("timestamp"), MAX("timestamp")
  INTO v_count_huerfanos, v_primer_huerfano, v_ultimo_huerfano
  FROM rdb.waitry_pedidos
  WHERE corte_id IS NULL
    AND status != 'order_cancelled'
    AND "timestamp" > v_ultimo_cierre
    AND "timestamp" < NEW.abierto_at;

  IF v_count_huerfanos = 0 OR v_primer_huerfano IS NULL THEN
    RETURN NEW;
  END IF;

  v_fecha_sc := (v_primer_huerfano AT TIME ZONE 'America/Matamoros')::DATE;
  v_base_nombre := 'Corte-SC-' || TO_CHAR(v_fecha_sc, 'YYYY-MM-DD');
  v_sufijo := 1;
  v_corte_nombre := v_base_nombre;

  WHILE EXISTS (
    SELECT 1 FROM erp.cortes_caja
    WHERE empresa_id = NEW.empresa_id
      AND corte_nombre = v_corte_nombre
  ) LOOP
    v_sufijo := v_sufijo + 1;
    v_corte_nombre := v_base_nombre || '-' || v_sufijo;
  END LOOP;

  INSERT INTO erp.cortes_caja (
    empresa_id,
    caja_nombre,
    corte_nombre,
    tipo,
    estado,
    efectivo_inicial,
    observaciones,
    fecha_operativa,
    abierto_at,
    cerrado_at
  ) VALUES (
    NEW.empresa_id,
    COALESCE(NEW.caja_nombre, 'Sin Corte'),
    v_corte_nombre,
    'especial',
    'cerrado',
    0,
    'Generado automáticamente por trigger al abrir ' || COALESCE(NEW.corte_nombre, NEW.id::TEXT),
    v_fecha_sc,
    v_primer_huerfano,
    v_ultimo_huerfano
  ) RETURNING id INTO v_sc_corte_id;

  UPDATE rdb.waitry_pedidos
  SET corte_id = v_sc_corte_id,
      updated_at = now()
  WHERE corte_id IS NULL
    AND status != 'order_cancelled'
    AND "timestamp" > v_ultimo_cierre
    AND "timestamp" < NEW.abierto_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sc_corte_on_open_erp ON erp.cortes_caja;

CREATE TRIGGER trg_sc_corte_on_open_erp
AFTER INSERT ON erp.cortes_caja
FOR EACH ROW
EXECUTE FUNCTION erp.handle_sc_corte_on_open();

NOTIFY pgrst, 'reload schema';
