-- ╭─ 20260625201752_dilesa_fn_corregir_avaluo_venta ─╮
-- Permite corregir el avalúo (monto + fecha) de una venta DILESA cuya Fase 5
-- ya está cerrada, SIN tocar el pipeline (no inserta `venta_fases`, no regresa
-- la venta). Caso real: el valuador emite un avalúo corregido después de que la
-- fase cerró; hasta hoy la única vía era "Regresar a fase…" (destructiva).
--
-- `monto_avaluo` es un dato financiero. Igual que el descuento (decisión Beto
-- 2026-06-15, mig 20260616020428), `dilesa.ventas` no pasa por ningún auditor,
-- así que el cambio va por una RPC SECURITY DEFINER que registra anterior/nuevo
-- en core.audit_log (autor vía email del JWT) en vez de un UPDATE plano sin
-- rastro. Gate: admin global O rol en la empresa de la venta (admin nunca
-- bloqueado — política Beto 2026-06-10). El PDF corregido NO pasa por aquí: se
-- versiona por su cuenta en `erp.adjuntos` (subida colaborativa con uploaded_by).
--
-- Aditiva: 1 función nueva. No cambia datos.

BEGIN;

CREATE OR REPLACE FUNCTION dilesa.fn_corregir_avaluo_venta(
  p_venta_id uuid,
  p_monto_avaluo numeric,
  p_fecha_avaluo_cerrado date DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, dilesa, core, public
AS $$
DECLARE
  v_empresa_id uuid;
  v_usuario_id uuid;
  v_old jsonb;
  v_new jsonb;
BEGIN
  SELECT empresa_id INTO v_empresa_id
  FROM dilesa.ventas
  WHERE id = p_venta_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Venta % no encontrada o borrada', p_venta_id USING ERRCODE = '22023';
  END IF;

  -- Gate de empresa (admin nunca bloqueado — política Beto 2026-06-10).
  IF NOT core.fn_is_admin() AND NOT core.fn_has_empresa(v_empresa_id) THEN
    RAISE EXCEPTION 'Sin permiso para la empresa de la venta' USING ERRCODE = '42501';
  END IF;

  IF p_monto_avaluo IS NULL OR p_monto_avaluo <= 0 THEN
    RAISE EXCEPTION 'El monto del avalúo debe ser mayor a cero' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'monto_avaluo', monto_avaluo,
    'fecha_avaluo_cerrado', fecha_avaluo_cerrado
  ) INTO v_old
  FROM dilesa.ventas
  WHERE id = p_venta_id;

  UPDATE dilesa.ventas SET
    monto_avaluo = p_monto_avaluo,
    fecha_avaluo_cerrado = coalesce(p_fecha_avaluo_cerrado, fecha_avaluo_cerrado),
    updated_at = now()
  WHERE id = p_venta_id;

  SELECT jsonb_build_object(
    'monto_avaluo', monto_avaluo,
    'fecha_avaluo_cerrado', fecha_avaluo_cerrado
  ) INTO v_new
  FROM dilesa.ventas
  WHERE id = p_venta_id;

  -- Auditoría: solo si cambió algo (patrón fn_venta_auditar_descuentos).
  IF v_old IS DISTINCT FROM v_new THEN
    SELECT id INTO v_usuario_id
    FROM core.usuarios
    WHERE email = lower(coalesce(auth.jwt() ->> 'email', ''))
      AND activo = true
    LIMIT 1;

    INSERT INTO core.audit_log (
      empresa_id, usuario_id, accion, tabla, registro_id,
      datos_anteriores, datos_nuevos, created_at
    ) VALUES (
      v_empresa_id, v_usuario_id, 'venta_avaluo_corregido', 'dilesa.ventas', p_venta_id,
      v_old, v_new || jsonb_build_object('motivo', p_motivo), now()
    );
  END IF;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION dilesa.fn_corregir_avaluo_venta(uuid, numeric, date, text) IS
  'Corrige el avalúo (monto + fecha) de una venta con Fase 5 ya cerrada, sin tocar el pipeline; audita anterior/nuevo en core.audit_log. Gate: admin O rol en la empresa.';

GRANT EXECUTE ON FUNCTION dilesa.fn_corregir_avaluo_venta(uuid, numeric, date, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
