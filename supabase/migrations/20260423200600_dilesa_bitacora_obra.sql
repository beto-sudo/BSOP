-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-3a — dilesa.bitacora_obra
-- ════════════════════════════════════════════════════════════════════════════
--
-- Registro diario de campo por construccion_lote. Supervisor apunta clima,
-- personal presente, actividades, incidencias y materiales recibidos (jsonb).
-- Log append-only en la práctica — sin gestión ni estado derivado.
--
-- Sin datos — la migración Coda → BSOP va en dilesa-3b.

CREATE TABLE IF NOT EXISTS dilesa.bitacora_obra (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,

  -- Vínculo
  construccion_lote_id uuid NOT NULL
    REFERENCES dilesa.construccion_lote(id) ON DELETE CASCADE,

  -- Cuándo y quién
  fecha         date NOT NULL,
  supervisor_id uuid REFERENCES erp.empleados(id) ON DELETE SET NULL,

  -- Condiciones
  temperatura_c     numeric(5,2),
  condiciones_clima text,
  personal_presente int,

  -- Qué pasó
  actividades_realizadas text,
  incidencias            text,
  materiales_recibidos   jsonb,
  fotos_urls             text[],

  -- Técnicas
  coda_row_id text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE INDEX IF NOT EXISTS dilesa_bitacora_obra_empresa_idx
  ON dilesa.bitacora_obra(empresa_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_bitacora_obra_coda_row_idx
  ON dilesa.bitacora_obra(empresa_id, coda_row_id) WHERE coda_row_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dilesa_bitacora_obra_construccion_fecha_idx
  ON dilesa.bitacora_obra(construccion_lote_id, fecha) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_bitacora_obra_fecha_idx
  ON dilesa.bitacora_obra(fecha) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_bitacora_obra_supervisor_idx
  ON dilesa.bitacora_obra(supervisor_id) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.bitacora_obra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bitacora_obra_select ON dilesa.bitacora_obra;
CREATE POLICY bitacora_obra_select ON dilesa.bitacora_obra
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS bitacora_obra_write ON dilesa.bitacora_obra;
CREATE POLICY bitacora_obra_write ON dilesa.bitacora_obra
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_bitacora_obra_updated_at ON dilesa.bitacora_obra;
CREATE TRIGGER dilesa_bitacora_obra_updated_at
  BEFORE UPDATE ON dilesa.bitacora_obra
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.bitacora_obra IS
  'Registro diario de campo por construccion_lote (clima, personal, actividades, incidencias, materiales recibidos en jsonb). CASCADE desde construccion_lote.';
