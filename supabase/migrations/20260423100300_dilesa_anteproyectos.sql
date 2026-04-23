-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-1a — dilesa.anteproyectos
-- ════════════════════════════════════════════════════════════════════════════
--
-- Puente entre la oportunidad de tierra y la decisión de desarrollar. Aquí
-- vive el análisis financiero (área, lotes, infraestructura, estado) y las
-- referencias a prototipos con los que se modela la viabilidad.
--
-- Los cálculos derivados (aprovechamiento, promedios de prototipos, utilidad,
-- margen) se exponen vía `dilesa.v_anteproyectos_analisis` — ver migración
-- 20260423100800. Así se recalculan dinámicamente cuando cambian los
-- prototipos de referencia o el terreno asociado.
--
-- La FK `proyecto_id` se agrega en la siguiente migración (100400) porque
-- `dilesa.proyectos` aún no existe al correr ésta.
--
-- Fuente de dominio:
--   /mnt/DILESA/knowledge/modules/anteproyectos-deep-dive.md §3

CREATE TABLE IF NOT EXISTS dilesa.anteproyectos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,

  -- Identidad
  nombre            text NOT NULL,
  clave_interna     text,
  terreno_id        uuid NOT NULL REFERENCES dilesa.terrenos(id) ON DELETE RESTRICT,
  tipo_proyecto_id  uuid REFERENCES dilesa.tipo_proyecto(id) ON DELETE SET NULL,
  fecha_inicio      date,
  plano_lotificacion_url text,

  -- Inputs físicos
  area_vendible_m2                   numeric(12,2),
  areas_verdes_m2                    numeric(12,2),
  cantidad_lotes                     int,
  infraestructura_cabecera_inversion numeric(14,2),

  -- Estado del flujo
  estado text NOT NULL DEFAULT 'en_analisis',

  -- Transición a proyecto (auditoría)
  convertido_a_proyecto_en  timestamptz,
  convertido_a_proyecto_por uuid REFERENCES erp.empleados(id) ON DELETE SET NULL,
  proyecto_id               uuid,  -- FK se añade en migración 100400

  -- Gestión estándar (flujo-maestro §6)
  etapa                 text,
  decision_actual       text,
  prioridad             text,
  responsable_id        uuid REFERENCES erp.empleados(id) ON DELETE SET NULL,
  fecha_ultima_revision date,
  siguiente_accion      text,
  motivo_no_viable      text,
  notas                 text,

  -- Cálculo local (solo depende de columnas propias)
  lote_promedio_m2 numeric(12,2) GENERATED ALWAYS AS (
    CASE
      WHEN COALESCE(cantidad_lotes, 0) = 0 THEN NULL
      ELSE area_vendible_m2 / cantidad_lotes
    END
  ) STORED,

  -- Técnicas
  coda_row_id  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,

  CONSTRAINT anteproyectos_estado_check CHECK (estado IN (
    'en_analisis',
    'en_tramite',
    'en_due_diligence',
    'pausado',
    'no_viable',
    'convertido_a_proyecto'
  )),
  CONSTRAINT anteproyectos_prioridad_check
    CHECK (prioridad IS NULL OR prioridad IN ('alta','media','baja')),
  CONSTRAINT anteproyectos_convertido_requiere_proyecto CHECK (
    estado <> 'convertido_a_proyecto' OR proyecto_id IS NOT NULL
  ),
  CONSTRAINT anteproyectos_clave_interna_empresa_uk
    UNIQUE NULLS NOT DISTINCT (empresa_id, clave_interna)
);

CREATE INDEX IF NOT EXISTS dilesa_anteproyectos_empresa_idx
  ON dilesa.anteproyectos(empresa_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_anteproyectos_coda_row_idx
  ON dilesa.anteproyectos(empresa_id, coda_row_id) WHERE coda_row_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dilesa_anteproyectos_terreno_idx
  ON dilesa.anteproyectos(terreno_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_anteproyectos_proyecto_idx
  ON dilesa.anteproyectos(proyecto_id) WHERE proyecto_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_anteproyectos_estado_idx
  ON dilesa.anteproyectos(empresa_id, estado) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_anteproyectos_responsable_idx
  ON dilesa.anteproyectos(responsable_id) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.anteproyectos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anteproyectos_select ON dilesa.anteproyectos;
CREATE POLICY anteproyectos_select ON dilesa.anteproyectos
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS anteproyectos_write ON dilesa.anteproyectos;
CREATE POLICY anteproyectos_write ON dilesa.anteproyectos
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_anteproyectos_updated_at ON dilesa.anteproyectos;
CREATE TRIGGER dilesa_anteproyectos_updated_at
  BEFORE UPDATE ON dilesa.anteproyectos
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.anteproyectos IS
  'Evaluación y análisis financiero pre-proyecto. Cálculos derivados en vista v_anteproyectos_analisis.';
COMMENT ON COLUMN dilesa.anteproyectos.proyecto_id IS
  'Proyecto materializado tras conversión. FK añadida en migración 100400.';
