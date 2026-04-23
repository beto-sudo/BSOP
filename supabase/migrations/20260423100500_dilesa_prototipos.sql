-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-1a — dilesa.prototipos
-- ════════════════════════════════════════════════════════════════════════════
--
-- Catálogo maestro de productos habitacionales. Define costo unitario por
-- vivienda y valor comercial base. Se usa como referencia:
--
--   • en `dilesa.anteproyectos_prototipos_referencia` — para proyectar
--     utilidad/margen de un anteproyecto vía promedio de prototipos
--   • en `dilesa.fraccionamiento_prototipo` — para comercializar cantidades
--     específicas dentro de un proyecto con precio override opcional
--
-- Sobrecarga operativa (expediente técnico de 17 planos + métricas de stock
-- y velocidad) se queda FUERA en sprints posteriores — ver
--   /mnt/DILESA/knowledge/modules/prototipos-deep-dive.md §5.4.
--
-- Aquí dejamos el catálogo maestro compacto: identidad, dimensiones,
-- clasificación, valor comercial y costos unitarios.

CREATE TABLE IF NOT EXISTS dilesa.prototipos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,

  -- Identidad
  nombre text NOT NULL,
  codigo text,
  clasificacion_inmobiliaria_id uuid
    REFERENCES dilesa.clasificacion_inmobiliaria(id) ON DELETE SET NULL,

  -- Dimensiones
  superficie_construida_m2 numeric(10,2),
  superficie_lote_min_m2   numeric(10,2),
  recamaras                int,
  banos                    numeric(3,1),

  -- Valor comercial
  valor_comercial numeric(14,2),

  -- Costos unitarios por vivienda
  costo_urbanizacion     numeric(14,2),
  costo_materiales       numeric(14,2),
  costo_mano_obra        numeric(14,2),
  costo_registro_ruv     numeric(14,2),
  seguro_calidad         numeric(14,2),
  costo_comercializacion numeric(14,2),

  -- Derivado local
  costo_total_unitario numeric(16,2) GENERATED ALWAYS AS (
    COALESCE(costo_urbanizacion, 0)
    + COALESCE(costo_materiales, 0)
    + COALESCE(costo_mano_obra, 0)
    + COALESCE(costo_registro_ruv, 0)
    + COALESCE(seguro_calidad, 0)
    + COALESCE(costo_comercializacion, 0)
  ) STORED,

  -- Documentos
  plano_arquitectonico_url text,
  imagen_principal_url     text,
  notas                    text,

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

  CONSTRAINT prototipos_prioridad_check
    CHECK (prioridad IS NULL OR prioridad IN ('alta','media','baja')),
  CONSTRAINT prototipos_codigo_empresa_uk
    UNIQUE NULLS NOT DISTINCT (empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS dilesa_prototipos_empresa_idx
  ON dilesa.prototipos(empresa_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_prototipos_coda_row_idx
  ON dilesa.prototipos(empresa_id, coda_row_id) WHERE coda_row_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dilesa_prototipos_clasificacion_idx
  ON dilesa.prototipos(clasificacion_inmobiliaria_id) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.prototipos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prototipos_select ON dilesa.prototipos;
CREATE POLICY prototipos_select ON dilesa.prototipos
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS prototipos_write ON dilesa.prototipos;
CREATE POLICY prototipos_write ON dilesa.prototipos
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_prototipos_updated_at ON dilesa.prototipos;
CREATE TRIGGER dilesa_prototipos_updated_at
  BEFORE UPDATE ON dilesa.prototipos
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.prototipos IS
  'Catálogo maestro de productos habitacionales. costo_total_unitario es GENERATED (suma de los 6 costos unitarios).';
