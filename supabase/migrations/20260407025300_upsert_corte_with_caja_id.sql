
CREATE OR REPLACE FUNCTION waitry.upsert_corte(
  p_coda_id text,
  p_corte_nombre text,
  p_caja_nombre text,
  p_estado text DEFAULT NULL,
  p_turno text DEFAULT NULL,
  p_responsable_apertura text DEFAULT NULL,
  p_responsable_cierre text DEFAULT NULL,
  p_observaciones text DEFAULT NULL,
  p_efectivo_inicial numeric DEFAULT NULL,
  p_efectivo_contado numeric DEFAULT NULL,
  p_hora_inicio timestamptz DEFAULT NULL,
  p_hora_fin timestamptz DEFAULT NULL,
  p_fecha_operativa date DEFAULT NULL,
  p_tipo text DEFAULT 'normal'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
  v_caja_id uuid;
  v_result json;
BEGIN
  -- Resolve caja_id from name
  SELECT id INTO v_caja_id FROM caja.cajas WHERE nombre = p_caja_nombre LIMIT 1;

  -- Try to find existing row by coda_id
  SELECT id INTO v_id FROM caja.cortes WHERE coda_id = p_coda_id LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE caja.cortes SET
      corte_nombre         = COALESCE(p_corte_nombre, corte_nombre),
      caja_nombre          = COALESCE(p_caja_nombre, caja_nombre),
      caja_id              = COALESCE(v_caja_id, caja_id),
      estado               = COALESCE(p_estado, estado),
      turno                = COALESCE(p_turno, turno),
      responsable_apertura = COALESCE(p_responsable_apertura, responsable_apertura),
      responsable_cierre   = COALESCE(p_responsable_cierre, responsable_cierre),
      observaciones        = COALESCE(p_observaciones, observaciones),
      efectivo_inicial     = COALESCE(p_efectivo_inicial, efectivo_inicial),
      efectivo_contado     = COALESCE(p_efectivo_contado, efectivo_contado),
      hora_inicio          = COALESCE(p_hora_inicio, hora_inicio),
      hora_fin             = COALESCE(p_hora_fin, hora_fin),
      fecha_operativa      = COALESCE(p_fecha_operativa, fecha_operativa),
      tipo                 = COALESCE(p_tipo, tipo)
    WHERE id = v_id;

    SELECT json_build_object('action','updated','id',v_id,'corte_nombre',p_corte_nombre,'estado',p_estado) INTO v_result;
  ELSE
    INSERT INTO caja.cortes (
      coda_id, corte_nombre, caja_nombre, caja_id, estado, turno,
      responsable_apertura, responsable_cierre, observaciones,
      efectivo_inicial, efectivo_contado, hora_inicio, hora_fin,
      fecha_operativa, tipo
    ) VALUES (
      p_coda_id, p_corte_nombre, p_caja_nombre, v_caja_id, p_estado, p_turno,
      p_responsable_apertura, p_responsable_cierre, p_observaciones,
      p_efectivo_inicial, p_efectivo_contado, p_hora_inicio, p_hora_fin,
      p_fecha_operativa, p_tipo
    )
    RETURNING id INTO v_id;

    SELECT json_build_object('action','inserted','id',v_id,'corte_nombre',p_corte_nombre,'estado',p_estado) INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION waitry.upsert_corte TO service_role, anon, authenticated;
;
