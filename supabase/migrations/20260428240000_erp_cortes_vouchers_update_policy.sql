-- ────────────────────────────────────────────────────────────────────────────
-- erp.cortes_vouchers — habilitar UPDATE
--
-- La migración original (20260424184855) creó la tabla SIN policy de UPDATE
-- bajo el supuesto de que los vouchers serían inmutables (audit trail). En
-- el sprint siguiente (20260425153136) se agregaron columnas editables —
-- monto_reportado, banco_id, afiliacion, categoria, movimiento_caja_id —
-- para soportar el flujo de captura post-subida, pero quedó pendiente
-- crear la policy de UPDATE.
--
-- Síntoma: el server action `confirmarVoucher()` corre el UPDATE, RLS lo
-- bloquea silenciosamente (PostgREST devuelve 200 con 0 filas afectadas
-- cuando RLS rechaza el UPDATE — no error 4xx), supabase-js retorna sin
-- error, el toast del UI dice "Voucher actualizado" y el dato nunca se
-- persiste. Se ve directamente en producción como
-- `Σ Vouchers (3): $0.00 +3 s/cap` aún después de capturar montos.
--
-- Decisión: misma USING que SELECT — cualquier usuario con acceso a la
-- empresa puede confirmar/corregir un voucher (no se restringe a quien
-- subió, porque operativamente el manager suele confirmar lo del cajero).
-- Los campos inmutables (empresa_id, corte_id, uploaded_by, storage_path,
-- uploaded_at) los protege la app — no los manda en el .update().
-- ────────────────────────────────────────────────────────────────────────────

CREATE POLICY erp_cortes_vouchers_update ON erp.cortes_vouchers
  FOR UPDATE TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════ VERIFY ═══════════════════════════════════════
DO $$
DECLARE
  has_update_policy boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'erp'
       AND tablename  = 'cortes_vouchers'
       AND cmd        = 'UPDATE'
  ) INTO has_update_policy;

  IF NOT has_update_policy THEN
    RAISE EXCEPTION 'Policy de UPDATE no se creó en erp.cortes_vouchers';
  END IF;

  RAISE NOTICE 'OK: erp.cortes_vouchers ya admite UPDATE para usuarios con acceso a la empresa.';
END $$;
