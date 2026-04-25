-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-2a — dilesa.urbanizacion_lote
-- ════════════════════════════════════════════════════════════════════════════
--
-- Seguimiento del acondicionamiento urbano por lote y por fase de
-- urbanización (despalme, trazo, redes, pavimentación, etc.). Cada combinación
-- (lote, fase) es un registro: avance, fechas, evidencias.
--
-- Diseño: 1 fila por (lote, fase). El UI consume un join LATERAL o pivot
-- según necesidad. La vista dilesa.v_lotes_estatus consolida el avance
-- agregado por lote.
--
-- Sin datos — la migración Coda → BSOP va en dilesa-2b.

CREATE TABLE IF NOT EXISTS dilesa.urbanizacion_lote (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,

  -- Vínculo
  lote_id              uuid NOT NULL REFERENCES dilesa.lotes(id) ON DELETE CASCADE,
  fase_urbanizacion_id uuid REFERENCES dilesa.fases_urbanizacion(id) ON DELETE SET NULL,

  -- Tiempos
  fecha_inicio       date,
  fecha_terminacion  date,

  -- Avance
  avance_pct numeric(5,2) NOT NULL DEFAULT 0,

  -- Evidencia
  evidencias_urls text[],
  observaciones   text,

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

  CONSTRAINT urbanizacion_lote_prioridad_check
    CHECK (prioridad IS NULL OR prioridad IN ('alta','media','baja')),
  CONSTRAINT urbanizacion_lote_avance_pct_check
    CHECK (avance_pct >= 0 AND avance_pct <= 100),
  CONSTRAINT urbanizacion_lote_fechas_check
    CHECK (fecha_terminacion IS NULL
           OR fecha_inicio IS NULL
           OR fecha_terminacion >= fecha_inicio),
  CONSTRAINT urbanizacion_lote_lote_fase_uk
    UNIQUE NULLS NOT DISTINCT (lote_id, fase_urbanizacion_id)
);

CREATE INDEX IF NOT EXISTS dilesa_urbanizacion_lote_empresa_idx
  ON dilesa.urbanizacion_lote(empresa_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_urbanizacion_lote_coda_row_idx
  ON dilesa.urbanizacion_lote(empresa_id, coda_row_id) WHERE coda_row_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dilesa_urbanizacion_lote_lote_idx
  ON dilesa.urbanizacion_lote(lote_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_urbanizacion_lote_fase_idx
  ON dilesa.urbanizacion_lote(fase_urbanizacion_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_urbanizacion_lote_responsable_idx
  ON dilesa.urbanizacion_lote(responsable_id) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.urbanizacion_lote ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS urbanizacion_lote_select ON dilesa.urbanizacion_lote;
CREATE POLICY urbanizacion_lote_select ON dilesa.urbanizacion_lote
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS urbanizacion_lote_write ON dilesa.urbanizacion_lote;
CREATE POLICY urbanizacion_lote_write ON dilesa.urbanizacion_lote
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_urbanizacion_lote_updated_at ON dilesa.urbanizacion_lote;
CREATE TRIGGER dilesa_urbanizacion_lote_updated_at
  BEFORE UPDATE ON dilesa.urbanizacion_lote
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.urbanizacion_lote IS
  'Avance de urbanización por lote × fase. Único por (lote_id, fase_urbanizacion_id). evidencias_urls apunta a Storage. ON DELETE CASCADE desde lotes — el histórico vive con el lote.';
