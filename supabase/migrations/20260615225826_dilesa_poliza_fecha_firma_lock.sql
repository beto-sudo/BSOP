-- ╭─ 20260615225826_dilesa_poliza_fecha_firma_lock ─╮
-- Póliza de Garantía: la fecha del documento es la fecha de firma (Fase 10),
-- no la de impresión. Una vez expedida la póliza (o cerrada la Fase 10) la
-- fecha de firma queda bloqueada — solo Dirección/Admin puede reprogramarla.
--
-- Contexto: la Póliza de Garantía se expide al programar la firma y se lleva
-- al expediente del notario para firmarse en la escrituración. El documento
-- legal debe llevar la fecha de la firma de escritura (dilesa.ventas
-- .fecha_firma_programada), y esa fecha no debe moverse una vez que el
-- documento se imprimió o la fase se cerró: si se reimprime, sale la misma.
--
-- Cambios:
--   1. dilesa.ventas.poliza_garantia_expedida_at — sello de la 1.ª expedición
--      del PDF de la póliza (lo pone el route GET al renderizar).
--   2. Trigger BEFORE UPDATE: bloquea cambios a fecha/hora de firma cuando la
--      póliza ya se expidió o la Fase 10 está cerrada, salvo Dirección/Admin
--      (erp.fn_es_direccion — mismo gate que el resto del gobierno DILESA).

BEGIN;

-- ── 1. Sello de expedición de la póliza ──────────────────────────────────
ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS poliza_garantia_expedida_at timestamptz;

COMMENT ON COLUMN dilesa.ventas.poliza_garantia_expedida_at IS
  'Fecha/hora de la primera expedición del PDF de la Póliza de Garantía. Lo sella el route GET al renderizar; una vez sellado, la fecha de firma queda bloqueada (reimpresión = misma fecha). NULL = aún no se ha expedido.';

-- ── 2. Trigger guard: bloqueo de la fecha de firma post-expedición ────────
-- Congelada = póliza ya expedida O Fase 10 ya cerrada. En ese estado, cambiar
-- fecha_firma_programada / hora_firma_programada exige rol Dirección o admin
-- (erp.fn_es_direccion = espejo SQL de EffectiveUser.direccionEmpresaIds).
-- SECURITY DEFINER para leer venta_fases sin depender de la RLS del caller;
-- auth.uid() se preserva (lo aporta el JWT de la sesión, no el owner).
CREATE OR REPLACE FUNCTION dilesa.fn_lock_fecha_firma_poliza()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = dilesa, erp, core, public
AS $$
DECLARE
  v_fase10_cerrada boolean;
BEGIN
  -- Solo intervenimos si el UPDATE realmente mueve la fecha/hora de firma.
  IF NEW.fecha_firma_programada IS NOT DISTINCT FROM OLD.fecha_firma_programada
     AND NEW.hora_firma_programada IS NOT DISTINCT FROM OLD.hora_firma_programada THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM dilesa.venta_fases vf
    WHERE vf.venta_id = NEW.id
      AND vf.posicion = 10
      AND vf.deleted_at IS NULL
  ) INTO v_fase10_cerrada;

  -- Solo gobernamos a usuarios autenticados (la UI). Los backends de servicio
  -- (service_role / postgres → auth.uid() NULL) siguen libres para backfills y
  -- correcciones de datos; anon ya queda fuera por la RLS de escritura.
  IF (OLD.poliza_garantia_expedida_at IS NOT NULL OR v_fase10_cerrada) THEN
    IF auth.uid() IS NOT NULL AND NOT erp.fn_es_direccion(NEW.empresa_id) THEN
      RAISE EXCEPTION
        'La fecha de firma está bloqueada: la Póliza de Garantía ya se expidió o la Fase 10 se cerró. Solo Dirección puede reprogramar la firma.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION dilesa.fn_lock_fecha_firma_poliza IS
  'Bloquea cambios a la fecha/hora de firma una vez expedida la Póliza de Garantía o cerrada la Fase 10; override Dirección/admin (erp.fn_es_direccion).';

DROP TRIGGER IF EXISTS trg_lock_fecha_firma_poliza ON dilesa.ventas;
CREATE TRIGGER trg_lock_fecha_firma_poliza
  BEFORE UPDATE ON dilesa.ventas
  FOR EACH ROW
  WHEN (
    OLD.fecha_firma_programada IS DISTINCT FROM NEW.fecha_firma_programada
    OR OLD.hora_firma_programada IS DISTINCT FROM NEW.hora_firma_programada
  )
  EXECUTE FUNCTION dilesa.fn_lock_fecha_firma_poliza();

NOTIFY pgrst, 'reload schema';

COMMIT;
