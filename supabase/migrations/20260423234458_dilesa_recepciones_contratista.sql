-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-3a — dilesa.recepciones_contratista
-- ════════════════════════════════════════════════════════════════════════════
--
-- Entregas formales de obra por parte del contratista al supervisor. Log de
-- recepciones parciales/totales con evidencias y monto recibido. Transaccional
-- — sin columnas de gestión.
--
-- Sin datos — la migración Coda → BSOP va en dilesa-3b.

CREATE TABLE IF NOT EXISTS dilesa.recepciones_contratista (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,

  -- Vínculo
  contrato_construccion_id uuid NOT NULL
    REFERENCES dilesa.contratos_construccion(id) ON DELETE CASCADE,

  -- Recepción
  fecha_recepcion date NOT NULL,
  tipo_recepcion  text NOT NULL DEFAULT 'parcial',
  avance_pct      numeric(5,2),
  monto_recibido  numeric(14,2),

  -- Supervisor y evidencias
  supervisor_id   uuid REFERENCES erp.empleados(id) ON DELETE SET NULL,
  observaciones   text,
  evidencias_urls text[],

  -- Técnicas
  coda_row_id text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,

  CONSTRAINT recepciones_contratista_tipo_check
    CHECK (tipo_recepcion IN ('parcial','total','conformidad','observada')),
  CONSTRAINT recepciones_contratista_avance_check
    CHECK (avance_pct IS NULL OR (avance_pct >= 0 AND avance_pct <= 100))
);

CREATE INDEX IF NOT EXISTS dilesa_recepciones_contratista_empresa_idx
  ON dilesa.recepciones_contratista(empresa_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_recepciones_contratista_coda_row_idx
  ON dilesa.recepciones_contratista(empresa_id, coda_row_id) WHERE coda_row_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dilesa_recepciones_contratista_contrato_idx
  ON dilesa.recepciones_contratista(contrato_construccion_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_recepciones_contratista_fecha_idx
  ON dilesa.recepciones_contratista(fecha_recepcion) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_recepciones_contratista_supervisor_idx
  ON dilesa.recepciones_contratista(supervisor_id) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.recepciones_contratista ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recepciones_contratista_select ON dilesa.recepciones_contratista;
CREATE POLICY recepciones_contratista_select ON dilesa.recepciones_contratista
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS recepciones_contratista_write ON dilesa.recepciones_contratista;
CREATE POLICY recepciones_contratista_write ON dilesa.recepciones_contratista
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_recepciones_contratista_updated_at ON dilesa.recepciones_contratista;
CREATE TRIGGER dilesa_recepciones_contratista_updated_at
  BEFORE UPDATE ON dilesa.recepciones_contratista
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.recepciones_contratista IS
  'Log de entregas formales del contratista al supervisor por contrato. Transaccional — sin gestión. CASCADE desde contratos_construccion.';
