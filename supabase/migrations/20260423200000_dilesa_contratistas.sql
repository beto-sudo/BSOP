-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-3a — dilesa.contratistas
-- ════════════════════════════════════════════════════════════════════════════
--
-- Directorio de contratistas de obra. La identidad (nombre, RFC, contacto)
-- vive en erp.personas vía persona_id; esta tabla agrega atributos específicos
-- del dominio constructivo (especialidad, convenio, calificación).
--
-- Sin datos — la migración Coda → BSOP va en dilesa-3b.

CREATE TABLE IF NOT EXISTS dilesa.contratistas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,

  -- Identidad base
  persona_id   uuid NOT NULL REFERENCES erp.personas(id) ON DELETE RESTRICT,
  codigo       text,

  -- Operación
  especialidad               text,
  tipo_trabajo_principal_id  uuid REFERENCES dilesa.tipo_trabajo(id) ON DELETE SET NULL,
  calificacion               numeric(3,2),
  convenio_vigente           boolean NOT NULL DEFAULT false,
  fecha_alta                 date,
  observaciones              text,

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

  CONSTRAINT contratistas_prioridad_check
    CHECK (prioridad IS NULL OR prioridad IN ('alta','media','baja')),
  CONSTRAINT contratistas_calificacion_check
    CHECK (calificacion IS NULL OR (calificacion >= 0 AND calificacion <= 5)),
  CONSTRAINT contratistas_codigo_empresa_uk
    UNIQUE NULLS NOT DISTINCT (empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS dilesa_contratistas_empresa_idx
  ON dilesa.contratistas(empresa_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_contratistas_coda_row_idx
  ON dilesa.contratistas(empresa_id, coda_row_id) WHERE coda_row_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dilesa_contratistas_persona_idx
  ON dilesa.contratistas(persona_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_contratistas_tipo_trabajo_idx
  ON dilesa.contratistas(tipo_trabajo_principal_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_contratistas_responsable_idx
  ON dilesa.contratistas(responsable_id) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.contratistas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contratistas_select ON dilesa.contratistas;
CREATE POLICY contratistas_select ON dilesa.contratistas
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS contratistas_write ON dilesa.contratistas;
CREATE POLICY contratistas_write ON dilesa.contratistas
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_contratistas_updated_at ON dilesa.contratistas;
CREATE TRIGGER dilesa_contratistas_updated_at
  BEFORE UPDATE ON dilesa.contratistas
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.contratistas IS
  'Directorio de contratistas. Identidad en erp.personas; aquí viven atributos de obra (especialidad, convenio, calificación). codigo único por empresa. Cierra el ciclo con construccion_lote.contratista_principal_id vía migración posterior.';
