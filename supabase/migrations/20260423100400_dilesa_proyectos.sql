-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-1a — dilesa.proyectos
-- ════════════════════════════════════════════════════════════════════════════
--
-- Desarrollo formalizado. Hub central: recibe el material del anteproyecto
-- cuando se decide desarrollar, y desde aquí nacen lotes, construcciones,
-- inventario y comercialización (sprints dilesa-2+).
--
-- Este archivo también cierra el ciclo FK dilesa.anteproyectos.proyecto_id
-- agregando el REFERENCES ahora que `dilesa.proyectos` existe.
--
-- Ver supabase/adr/001_dilesa_schema.md §Backbone inmobiliario.

CREATE TABLE IF NOT EXISTS dilesa.proyectos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,

  -- Identidad
  nombre           text NOT NULL,
  codigo           text,
  terreno_id       uuid NOT NULL REFERENCES dilesa.terrenos(id) ON DELETE RESTRICT,
  anteproyecto_id  uuid REFERENCES dilesa.anteproyectos(id) ON DELETE SET NULL,
  tipo_proyecto_id uuid REFERENCES dilesa.tipo_proyecto(id) ON DELETE SET NULL,

  -- Planeación
  fase                  text,
  fecha_inicio          date,
  fecha_estimada_cierre date,

  -- Snapshot físico (replicado al convertir desde anteproyecto)
  area_vendible_m2     numeric(12,2),
  areas_verdes_m2      numeric(12,2),
  cantidad_lotes_total int,

  -- Financiero
  presupuesto_total numeric(16,2),
  inversion_total   numeric(16,2),

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

  CONSTRAINT proyectos_prioridad_check
    CHECK (prioridad IS NULL OR prioridad IN ('alta','media','baja')),
  CONSTRAINT proyectos_codigo_empresa_uk
    UNIQUE NULLS NOT DISTINCT (empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS dilesa_proyectos_empresa_idx
  ON dilesa.proyectos(empresa_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_proyectos_coda_row_idx
  ON dilesa.proyectos(empresa_id, coda_row_id) WHERE coda_row_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dilesa_proyectos_terreno_idx
  ON dilesa.proyectos(terreno_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_proyectos_anteproyecto_idx
  ON dilesa.proyectos(anteproyecto_id) WHERE anteproyecto_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_proyectos_responsable_idx
  ON dilesa.proyectos(responsable_id) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.proyectos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proyectos_select ON dilesa.proyectos;
CREATE POLICY proyectos_select ON dilesa.proyectos
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS proyectos_write ON dilesa.proyectos;
CREATE POLICY proyectos_write ON dilesa.proyectos
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_proyectos_updated_at ON dilesa.proyectos;
CREATE TRIGGER dilesa_proyectos_updated_at
  BEFORE UPDATE ON dilesa.proyectos
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.proyectos IS
  'Desarrollo formalizado. Nace vía "Convertir a Proyecto" desde anteproyecto; alimenta lotes/construcción/inventario/comercial.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Cerrar el ciclo: dilesa.anteproyectos.proyecto_id → dilesa.proyectos(id)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('dilesa.anteproyectos') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'anteproyectos_proyecto_id_fkey'
         AND conrelid = 'dilesa.anteproyectos'::regclass
     )
  THEN
    ALTER TABLE dilesa.anteproyectos
      ADD CONSTRAINT anteproyectos_proyecto_id_fkey
      FOREIGN KEY (proyecto_id) REFERENCES dilesa.proyectos(id) ON DELETE SET NULL;
  END IF;
END $$;
