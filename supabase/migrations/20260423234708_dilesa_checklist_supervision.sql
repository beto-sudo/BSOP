-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-3a — dilesa.checklist_supervision
-- ════════════════════════════════════════════════════════════════════════════
--
-- Instancia de inspección ejecutada: (construccion_lote, checklist_maestro,
-- fecha). Resultado global aprobado / aprobado_con_observaciones / rechazado
-- / pendiente. El detalle por item va en checklist_supervision_resultados.
--
-- checklist_maestro_id usa ON DELETE RESTRICT: no permitimos borrar un
-- checklist maestro que tiene historial de supervisión.
--
-- Sin datos — la migración Coda → BSOP va en dilesa-3b.

CREATE TABLE IF NOT EXISTS dilesa.checklist_supervision (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,

  -- Vínculos
  construccion_lote_id uuid NOT NULL
    REFERENCES dilesa.construccion_lote(id) ON DELETE CASCADE,
  checklist_maestro_id uuid NOT NULL
    REFERENCES dilesa.checklist_maestro(id) ON DELETE RESTRICT,

  -- Ejecución
  fecha_inspeccion date NOT NULL,
  supervisor_id    uuid REFERENCES erp.empleados(id) ON DELETE SET NULL,
  resultado        text NOT NULL,
  observaciones_generales text,

  -- Técnicas
  coda_row_id text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,

  CONSTRAINT checklist_supervision_resultado_check
    CHECK (resultado IN ('aprobado','aprobado_con_observaciones','rechazado','pendiente'))
);

CREATE INDEX IF NOT EXISTS dilesa_checklist_supervision_empresa_idx
  ON dilesa.checklist_supervision(empresa_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_checklist_supervision_coda_row_idx
  ON dilesa.checklist_supervision(empresa_id, coda_row_id) WHERE coda_row_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dilesa_checklist_supervision_construccion_idx
  ON dilesa.checklist_supervision(construccion_lote_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_checklist_supervision_checklist_idx
  ON dilesa.checklist_supervision(checklist_maestro_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_checklist_supervision_fecha_idx
  ON dilesa.checklist_supervision(fecha_inspeccion) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.checklist_supervision ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checklist_supervision_select ON dilesa.checklist_supervision;
CREATE POLICY checklist_supervision_select ON dilesa.checklist_supervision
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS checklist_supervision_write ON dilesa.checklist_supervision;
CREATE POLICY checklist_supervision_write ON dilesa.checklist_supervision
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_checklist_supervision_updated_at ON dilesa.checklist_supervision;
CREATE TRIGGER dilesa_checklist_supervision_updated_at
  BEFORE UPDATE ON dilesa.checklist_supervision
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.checklist_supervision IS
  'Inspección ejecutada sobre un construccion_lote aplicando un checklist_maestro. Resultado global (aprobado / aprobado_con_observaciones / rechazado / pendiente). Detalle por item en checklist_supervision_resultados.';
