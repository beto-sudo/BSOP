-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-1a — dilesa.terrenos
-- ════════════════════════════════════════════════════════════════════════════
--
-- Activos raíz pre-desarrollo. Portafolio vivo de tierra: ofrecida, en
-- análisis, en negociación, adquirida, descartada, en radar.
--
-- Columnas derivadas del documento operativo:
--   /mnt/DILESA/knowledge/modules/terrenos-columnas-definitivas.md (38 cols)
--
-- Ver supabase/adr/001_dilesa_schema.md §Backbone inmobiliario y §Convenciones.
-- Este sprint NO carga datos — la migración desde Coda va en dilesa-1b.

CREATE TABLE IF NOT EXISTS dilesa.terrenos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,

  -- A. Identidad
  nombre            text NOT NULL,
  clave_interna     text,
  tipo              text,
  area_terreno_m2   numeric(12,2),
  areas_afectacion_m2 numeric(12,2),
  objetivo          text,
  numero_escritura  text,
  fecha_captura     timestamptz NOT NULL DEFAULT now(),

  -- B. Ubicación
  municipio             text,
  zona_sector           text,
  direccion_referencia  text,

  -- C. Contacto
  nombre_propietario    text,
  telefono_propietario  text,
  nombre_corredor       text,
  telefono_corredor     text,

  -- D. Económica
  precio_solicitado_m2    numeric(14,2),
  precio_ofertado_m2      numeric(14,2),
  valor_interno_estimado  numeric(14,2),
  valor_objetivo_compra   numeric(14,2),

  -- E. Gestión y seguimiento
  origen               text,
  estatus_propiedad    text,
  etapa                text,
  decision_actual      text,
  prioridad            text,
  responsable_id       uuid REFERENCES erp.empleados(id) ON DELETE SET NULL,
  fecha_ultima_revision date,
  siguiente_accion     text,

  -- F. Cálculos (columnas generadas — fuente única, sin drift)
  areas_aprovechables_m2 numeric(12,2) GENERATED ALWAYS AS (
    COALESCE(area_terreno_m2, 0) - COALESCE(areas_afectacion_m2, 0)
  ) STORED,
  valor_predio numeric(16,2) GENERATED ALWAYS AS (
    COALESCE(area_terreno_m2, 0) * COALESCE(precio_solicitado_m2, 0)
  ) STORED,
  valor_total_oferta numeric(16,2) GENERATED ALWAYS AS (
    COALESCE(area_terreno_m2, 0) * COALESCE(precio_ofertado_m2, 0)
  ) STORED,
  -- %Diferencia Solicitado vs Oferta = (solicitado - ofertado) / solicitado
  pct_diferencia_solicitado_oferta numeric(8,4) GENERATED ALWAYS AS (
    CASE
      WHEN COALESCE(precio_solicitado_m2, 0) = 0 THEN NULL
      ELSE (precio_solicitado_m2 - COALESCE(precio_ofertado_m2, 0)) / precio_solicitado_m2
    END
  ) STORED,
  -- Precio x M² Aprovechable NO es GENERATED porque depende de otra columna
  -- generada (areas_aprovechables_m2). Se expone vía vista si se necesita.

  -- H. Documentos
  imagen_zcu_url     text,
  archivo_kmz_url    text,
  pdf_escritura_url  text,
  documentos         jsonb NOT NULL DEFAULT '[]'::jsonb,
  notas              text,

  -- Técnicas
  coda_row_id  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,

  CONSTRAINT terrenos_prioridad_check
    CHECK (prioridad IS NULL OR prioridad IN ('alta','media','baja')),
  CONSTRAINT terrenos_clave_interna_empresa_uk
    UNIQUE NULLS NOT DISTINCT (empresa_id, clave_interna),
  CONSTRAINT terrenos_documentos_es_array
    CHECK (jsonb_typeof(documentos) = 'array')
);

CREATE INDEX IF NOT EXISTS dilesa_terrenos_empresa_idx
  ON dilesa.terrenos(empresa_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_terrenos_coda_row_idx
  ON dilesa.terrenos(empresa_id, coda_row_id) WHERE coda_row_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dilesa_terrenos_responsable_idx
  ON dilesa.terrenos(responsable_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_terrenos_estatus_propiedad_idx
  ON dilesa.terrenos(empresa_id, estatus_propiedad) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.terrenos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS terrenos_select ON dilesa.terrenos;
CREATE POLICY terrenos_select ON dilesa.terrenos
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS terrenos_write ON dilesa.terrenos;
CREATE POLICY terrenos_write ON dilesa.terrenos
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_terrenos_updated_at ON dilesa.terrenos;
CREATE TRIGGER dilesa_terrenos_updated_at
  BEFORE UPDATE ON dilesa.terrenos
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.terrenos IS
  'Portafolio vivo de tierra: ofrecida, en análisis, en negociación, adquirida, descartada, en radar. Feeds anteproyectos.terreno_id. Ver terrenos-columnas-definitivas.md.';
