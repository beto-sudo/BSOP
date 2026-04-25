-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-2a — dilesa.construccion_lote
-- ════════════════════════════════════════════════════════════════════════════
--
-- Seguimiento constructivo por unidad. Una construcción activa por lote;
-- si se demuele/reconstruye, la histórica se soft-deletea y se crea una
-- nueva fila.
--
-- contratista_principal_id se queda sin FK en este sprint — la tabla
-- dilesa.contratistas se crea en dilesa-3. Cuando exista, se cierra el ciclo
-- con un ALTER TABLE ADD CONSTRAINT envuelto en to_regclass guard.
--
-- Sin datos — la migración Coda → BSOP va en dilesa-2b.

CREATE TABLE IF NOT EXISTS dilesa.construccion_lote (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,

  -- Vínculos
  lote_id              uuid NOT NULL REFERENCES dilesa.lotes(id) ON DELETE RESTRICT,
  prototipo_id         uuid NOT NULL REFERENCES dilesa.prototipos(id) ON DELETE RESTRICT,
  etapa_construccion_id uuid REFERENCES dilesa.etapas_construccion(id) ON DELETE SET NULL,

  -- Tiempos
  fecha_inicio_obra      date,
  fecha_estimada_entrega date,
  fecha_real_entrega     date,

  -- Avance
  avance_pct numeric(5,2) NOT NULL DEFAULT 0,

  -- Contratista (FK diferida — dilesa.contratistas se crea en dilesa-3)
  contratista_principal_id uuid,

  -- Económicas
  presupuesto_asignado numeric(14,2),
  costo_acumulado      numeric(14,2) NOT NULL DEFAULT 0,

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

  CONSTRAINT construccion_lote_prioridad_check
    CHECK (prioridad IS NULL OR prioridad IN ('alta','media','baja')),
  CONSTRAINT construccion_lote_avance_pct_check
    CHECK (avance_pct >= 0 AND avance_pct <= 100),
  CONSTRAINT construccion_lote_fechas_check
    CHECK (fecha_real_entrega IS NULL
           OR fecha_inicio_obra IS NULL
           OR fecha_real_entrega >= fecha_inicio_obra)
);

-- UNIQUE parcial: una construcción activa por lote. Soft-deletes pueden
-- repetirse (histórico de demoliciones / reconstrucciones). También sirve
-- como índice de lookup por lote_id — no se duplica con un index extra.
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_construccion_lote_lote_activa_uk
  ON dilesa.construccion_lote(lote_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS dilesa_construccion_lote_empresa_idx
  ON dilesa.construccion_lote(empresa_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_construccion_lote_coda_row_idx
  ON dilesa.construccion_lote(empresa_id, coda_row_id) WHERE coda_row_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dilesa_construccion_lote_prototipo_idx
  ON dilesa.construccion_lote(prototipo_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_construccion_lote_etapa_idx
  ON dilesa.construccion_lote(etapa_construccion_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_construccion_lote_contratista_idx
  ON dilesa.construccion_lote(contratista_principal_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_construccion_lote_responsable_idx
  ON dilesa.construccion_lote(responsable_id) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.construccion_lote ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS construccion_lote_select ON dilesa.construccion_lote;
CREATE POLICY construccion_lote_select ON dilesa.construccion_lote
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS construccion_lote_write ON dilesa.construccion_lote;
CREATE POLICY construccion_lote_write ON dilesa.construccion_lote
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_construccion_lote_updated_at ON dilesa.construccion_lote;
CREATE TRIGGER dilesa_construccion_lote_updated_at
  BEFORE UPDATE ON dilesa.construccion_lote
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.construccion_lote IS
  'Seguimiento constructivo por lote. UNIQUE parcial (lote_id WHERE deleted_at IS NULL): una construcción activa por lote, histórico vía soft-delete. contratista_principal_id sin FK en dilesa-2a; FK a dilesa.contratistas se cierra en dilesa-3.';
