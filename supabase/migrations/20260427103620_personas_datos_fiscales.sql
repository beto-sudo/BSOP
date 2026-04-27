-- ============================================================
-- Iniciativa: proveedores-csf-ai (Sprint 1.A — modelo DB)
-- ADR: supabase/adr/007_personas_datos_fiscales.md
--
-- Migración aditiva:
--   1) Agrega columna `tipo_persona` a erp.personas (default 'fisica')
--   2) Crea tabla anexa `erp.personas_datos_fiscales` (1:1 con personas)
--   3) RLS por empresa siguiendo el patrón core.fn_has_empresa / fn_is_admin
--   4) Trigger updated_at
--
-- Sin breaking changes: filas existentes en erp.personas reciben
-- tipo_persona='fisica' por default. Tabla nueva está vacía hasta que
-- el flujo de extract-csf empiece a poblarla.
-- ============================================================


-- ============================================================
-- 1) Columna tipo_persona en erp.personas
-- ============================================================
ALTER TABLE erp.personas
  ADD COLUMN IF NOT EXISTS tipo_persona text NOT NULL DEFAULT 'fisica'
    CHECK (tipo_persona IN ('fisica', 'moral'));

COMMENT ON COLUMN erp.personas.tipo_persona IS
  'Tipo de persona fiscal. ''fisica'' (default) o ''moral''. Define tratamiento UI: '
  'apellidos solo para físicas, razon_social solo para morales, validación RFC '
  '(13 chars físicas, 12 chars morales).';


-- ============================================================
-- 2) Tabla anexa erp.personas_datos_fiscales
-- ============================================================
CREATE TABLE IF NOT EXISTS erp.personas_datos_fiscales (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                  uuid NOT NULL REFERENCES core.empresas(id),
  persona_id                  uuid NOT NULL UNIQUE
                                REFERENCES erp.personas(id) ON DELETE CASCADE,

  -- Identidad fiscal
  razon_social                text,
  nombre_comercial            text,

  -- Régimen
  regimen_fiscal_codigo       text,
  regimen_fiscal_nombre       text,
  regimenes_adicionales       jsonb,

  -- Domicilio fiscal estructurado
  domicilio_calle             text,
  domicilio_num_ext           text,
  domicilio_num_int           text,
  domicilio_colonia           text,
  domicilio_cp                text,
  domicilio_municipio         text,
  domicilio_estado            text,
  domicilio_pais              text DEFAULT 'México',

  -- Obligaciones fiscales
  obligaciones                jsonb,

  -- Trazabilidad de la CSF vigente
  csf_adjunto_id              uuid REFERENCES erp.adjuntos(id),
  csf_fecha_emision           date,
  fecha_inicio_operaciones    date,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE erp.personas_datos_fiscales IS
  'Datos fiscales de personas (CSF parseada). 1:1 con erp.personas. '
  'Solo se crea row cuando hay CSF cargada — personas sin CSF no tienen fila aquí. '
  'Histórico de CSFs vive en erp.adjuntos (entidad_tipo=''persona'', rol=''csf''); '
  'csf_adjunto_id apunta a la vigente.';

CREATE INDEX IF NOT EXISTS idx_personas_datos_fiscales_empresa
  ON erp.personas_datos_fiscales (empresa_id);


-- ============================================================
-- 3) Trigger updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION erp.fn_set_updated_at_personas_datos_fiscales()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_updated_at_personas_datos_fiscales
  ON erp.personas_datos_fiscales;
CREATE TRIGGER trg_set_updated_at_personas_datos_fiscales
  BEFORE UPDATE ON erp.personas_datos_fiscales
  FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at_personas_datos_fiscales();


-- ============================================================
-- 4) RLS por empresa
-- ============================================================
ALTER TABLE erp.personas_datos_fiscales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_personas_datos_fiscales_select
  ON erp.personas_datos_fiscales;
CREATE POLICY erp_personas_datos_fiscales_select
  ON erp.personas_datos_fiscales FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP POLICY IF EXISTS erp_personas_datos_fiscales_insert
  ON erp.personas_datos_fiscales;
CREATE POLICY erp_personas_datos_fiscales_insert
  ON erp.personas_datos_fiscales FOR INSERT TO authenticated
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP POLICY IF EXISTS erp_personas_datos_fiscales_update
  ON erp.personas_datos_fiscales;
CREATE POLICY erp_personas_datos_fiscales_update
  ON erp.personas_datos_fiscales FOR UPDATE TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP POLICY IF EXISTS erp_personas_datos_fiscales_delete
  ON erp.personas_datos_fiscales;
CREATE POLICY erp_personas_datos_fiscales_delete
  ON erp.personas_datos_fiscales FOR DELETE TO authenticated
  USING (core.fn_is_admin());
