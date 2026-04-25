-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-2a — dilesa.lotes
-- ════════════════════════════════════════════════════════════════════════════
--
-- Unidades físicas dentro de un proyecto. Granularidad de inventario
-- pre-comercial: cada lote tiene dimensiones, ubicación, fase de inventario,
-- y opcionalmente un prototipo asignado (cuando se decide qué se construye
-- ahí).
--
-- Un lote sin prototipo asignado puede venderse "a la medida" o quedarse en
-- reserva. Un lote con prototipo asignado entra al ciclo construcción
-- (dilesa.construccion_lote) y eventualmente al inventario comercial
-- (dilesa.inventario_vivienda — sprint dilesa-4).
--
-- Ver supabase/adr/001_dilesa_schema.md §Backbone inmobiliario.
-- Sin datos — la migración Coda → BSOP va en dilesa-2b.

CREATE TABLE IF NOT EXISTS dilesa.lotes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,

  -- Identidad / ubicación dentro del proyecto
  proyecto_id   uuid NOT NULL REFERENCES dilesa.proyectos(id) ON DELETE RESTRICT,
  manzana       text,
  numero_lote   text NOT NULL,                    -- "A-15", "L-001"

  -- Físicas
  superficie_m2 numeric(10,2),
  frente_m      numeric(10,2),
  fondo_m       numeric(10,2),
  colindancias  jsonb,                            -- {norte, sur, este, oeste}

  -- Geo
  coordenadas_lat numeric(10,6),
  coordenadas_lng numeric(10,6),

  -- Clasificación / asignación
  fase_inventario_id    uuid REFERENCES dilesa.fases_inventario(id) ON DELETE SET NULL,
  prototipo_asignado_id uuid REFERENCES dilesa.prototipos(id) ON DELETE SET NULL,
  tipo_uso              text,                     -- residencial, mixto, comercial, reserva

  -- Económica
  precio_lote numeric(14,2),                      -- venta sin construir

  notas text,

  -- Gestión estándar (flujo-maestro §6)
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

  CONSTRAINT lotes_prioridad_check
    CHECK (prioridad IS NULL OR prioridad IN ('alta','media','baja')),
  CONSTRAINT lotes_colindancias_es_objeto
    CHECK (colindancias IS NULL OR jsonb_typeof(colindancias) = 'object'),
  CONSTRAINT lotes_proyecto_manzana_numero_uk
    UNIQUE NULLS NOT DISTINCT (empresa_id, proyecto_id, manzana, numero_lote)
);

CREATE INDEX IF NOT EXISTS dilesa_lotes_empresa_idx
  ON dilesa.lotes(empresa_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_lotes_coda_row_idx
  ON dilesa.lotes(empresa_id, coda_row_id) WHERE coda_row_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dilesa_lotes_proyecto_idx
  ON dilesa.lotes(proyecto_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_lotes_fase_inventario_idx
  ON dilesa.lotes(fase_inventario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_lotes_prototipo_idx
  ON dilesa.lotes(prototipo_asignado_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_lotes_responsable_idx
  ON dilesa.lotes(responsable_id) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.lotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lotes_select ON dilesa.lotes;
CREATE POLICY lotes_select ON dilesa.lotes
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS lotes_write ON dilesa.lotes;
CREATE POLICY lotes_write ON dilesa.lotes
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_lotes_updated_at ON dilesa.lotes;
CREATE TRIGGER dilesa_lotes_updated_at
  BEFORE UPDATE ON dilesa.lotes
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.lotes IS
  'Unidades físicas dentro de un proyecto. Llave de negocio: (empresa_id, proyecto_id, manzana, numero_lote). prototipo_asignado_id opcional: si NULL el lote está libre o se vende como tierra; si NOT NULL alimenta el ciclo construcción/inventario.';
