-- Iniciativa p2p-cancelaciones · Fase 1 — patrón base + cancelar estimación de obra.
--
-- Patrón canónico de cancelación (D1: cancelar con motivo, registro VISIBLE):
--   cancelada_at / cancelada_por / motivo_cancelacion  +  creado_por (gating D2).
-- Mismo `cancelada_at` que ya usa erp.facturas → consistente.
--
-- Un registro con cancelada_at IS NOT NULL está cancelado: se muestra con badge y se
-- EXCLUYE de los cálculos de saldo (la app suma `cancelada_at IS NULL`).
--
-- ADITIVO: 4 columnas nullable; no toca filas existentes. Las estimaciones históricas
-- quedan con creado_por = NULL → solo un admin podrá cancelarlas (D2).

ALTER TABLE dilesa.obra_estimaciones
  ADD COLUMN IF NOT EXISTS creado_por uuid,
  ADD COLUMN IF NOT EXISTS cancelada_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelada_por uuid,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion text;

-- creado_por se llena solo en altas nuevas (no depende del cliente).
CREATE OR REPLACE FUNCTION dilesa.fn_obra_estimacion_set_creado_por()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.creado_por IS NULL THEN
    NEW.creado_por := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_obra_estimacion_creado_por ON dilesa.obra_estimaciones;
CREATE TRIGGER trg_obra_estimacion_creado_por
  BEFORE INSERT ON dilesa.obra_estimaciones
  FOR EACH ROW EXECUTE FUNCTION dilesa.fn_obra_estimacion_set_creado_por();

-- Cancelar una estimación con motivo. Reglas:
--   · gating (D2): admin O quien la capturó (creado_por = auth.uid()).
--   · bloqueo (D3): no debe tener factura de CxP activa (cancela la factura primero).
CREATE OR REPLACE FUNCTION dilesa.obra_estimacion_cancelar(
  p_estimacion_id uuid,
  p_motivo text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = dilesa, erp, core, public
AS $$
DECLARE
  v_est dilesa.obra_estimaciones%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_est FROM dilesa.obra_estimaciones WHERE id = p_estimacion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estimación no encontrada';
  END IF;
  IF v_est.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'La estimación está eliminada';
  END IF;
  IF v_est.cancelada_at IS NOT NULL THEN
    RAISE EXCEPTION 'La estimación ya está cancelada';
  END IF;
  IF coalesce(btrim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'El motivo de cancelación es obligatorio';
  END IF;

  IF NOT (core.fn_is_admin() OR v_est.creado_por = v_uid) THEN
    RAISE EXCEPTION 'Solo un administrador o quien capturó la estimación puede cancelarla';
  END IF;

  IF EXISTS (
    SELECT 1 FROM erp.facturas f
    WHERE f.obra_estimacion_id = p_estimacion_id
      AND f.cancelada_at IS NULL
  ) THEN
    RAISE EXCEPTION 'La estimación ya fue emitida a Cuentas por Pagar. Cancela primero la factura ligada.';
  END IF;

  UPDATE dilesa.obra_estimaciones
    SET cancelada_at = now(),
        cancelada_por = v_uid,
        motivo_cancelacion = btrim(p_motivo),
        updated_at = now()
    WHERE id = p_estimacion_id;
END;
$$;

GRANT EXECUTE ON FUNCTION dilesa.obra_estimacion_cancelar(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
