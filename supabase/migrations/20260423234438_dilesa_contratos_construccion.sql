-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-3a — dilesa.contratos_construccion
-- ════════════════════════════════════════════════════════════════════════════
--
-- Contratos entre la desarrolladora y un contratista para una obra específica
-- (construccion_lote). Un lote puede tener múltiples contratos — típicamente
-- uno por especialidad/tipo de trabajo (albañilería, instalaciones, acabados).
--
-- Sin datos — la migración Coda → BSOP va en dilesa-3b.

CREATE TABLE IF NOT EXISTS dilesa.contratos_construccion (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,

  -- Vínculos
  contratista_id       uuid NOT NULL REFERENCES dilesa.contratistas(id) ON DELETE RESTRICT,
  construccion_lote_id uuid NOT NULL REFERENCES dilesa.construccion_lote(id) ON DELETE RESTRICT,
  tipo_trabajo_id      uuid REFERENCES dilesa.tipo_trabajo(id) ON DELETE SET NULL,

  -- Identificación
  codigo_contrato text,

  -- Tiempos
  fecha_firma                 date,
  fecha_inicio_estimada       date,
  fecha_terminacion_estimada  date,
  fecha_terminacion_real      date,

  -- Económicas
  monto_total          numeric(14,2),
  porcentaje_anticipo  numeric(5,2),

  -- Documentación
  archivo_contrato_url text,

  -- Estado
  estado text NOT NULL DEFAULT 'vigente',

  observaciones text,

  -- Gestión estándar
  etapa                 text,
  decision_actual       text,
  prioridad             text,
  responsable_id        uuid REFERENCES erp.empleados(id) ON DELETE SET NULL,
  fecha_ultima_revision date,
  siguiente_accion      text,

  -- Técnicas
  coda_row_id text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,

  CONSTRAINT contratos_construccion_prioridad_check
    CHECK (prioridad IS NULL OR prioridad IN ('alta','media','baja')),
  CONSTRAINT contratos_construccion_estado_check
    CHECK (estado IN ('vigente','cumplido','rescindido','suspendido','cancelado')),
  CONSTRAINT contratos_construccion_anticipo_check
    CHECK (porcentaje_anticipo IS NULL
           OR (porcentaje_anticipo >= 0 AND porcentaje_anticipo <= 100)),
  CONSTRAINT contratos_construccion_fechas_check
    CHECK (fecha_terminacion_real IS NULL
           OR fecha_firma IS NULL
           OR fecha_terminacion_real >= fecha_firma),
  CONSTRAINT contratos_construccion_codigo_empresa_uk
    UNIQUE NULLS NOT DISTINCT (empresa_id, codigo_contrato)
);

CREATE INDEX IF NOT EXISTS dilesa_contratos_construccion_empresa_idx
  ON dilesa.contratos_construccion(empresa_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_contratos_construccion_coda_row_idx
  ON dilesa.contratos_construccion(empresa_id, coda_row_id) WHERE coda_row_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dilesa_contratos_construccion_contratista_idx
  ON dilesa.contratos_construccion(contratista_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_contratos_construccion_construccion_idx
  ON dilesa.contratos_construccion(construccion_lote_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_contratos_construccion_tipo_trabajo_idx
  ON dilesa.contratos_construccion(tipo_trabajo_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_contratos_construccion_estado_idx
  ON dilesa.contratos_construccion(estado) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_contratos_construccion_responsable_idx
  ON dilesa.contratos_construccion(responsable_id) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.contratos_construccion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contratos_construccion_select ON dilesa.contratos_construccion;
CREATE POLICY contratos_construccion_select ON dilesa.contratos_construccion
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS contratos_construccion_write ON dilesa.contratos_construccion;
CREATE POLICY contratos_construccion_write ON dilesa.contratos_construccion
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_contratos_construccion_updated_at ON dilesa.contratos_construccion;
CREATE TRIGGER dilesa_contratos_construccion_updated_at
  BEFORE UPDATE ON dilesa.contratos_construccion
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.contratos_construccion IS
  'Contratos obra por (contratista, construccion_lote, tipo_trabajo). Un construccion_lote puede tener múltiples contratos (uno por especialidad). codigo_contrato único por empresa. Estado vigente/cumplido/rescindido/suspendido/cancelado.';
