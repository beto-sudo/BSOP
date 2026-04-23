-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-1a — dilesa.fraccionamiento_prototipo (M:N)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Relación proyecto ↔ prototipo con información comercial específica: cuántas
-- unidades se van a comercializar en ese proyecto y a qué precio efectivo
-- (override opcional sobre `prototipos.valor_comercial`).
--
-- Dif vs M:N referencia: ésta representa la decisión comercial firme (qué
-- se va a vender y cuánto), la otra es solo referencia analítica.

CREATE TABLE IF NOT EXISTS dilesa.fraccionamiento_prototipo (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  proyecto_id  uuid NOT NULL REFERENCES dilesa.proyectos(id) ON DELETE CASCADE,
  prototipo_id uuid NOT NULL REFERENCES dilesa.prototipos(id) ON DELETE RESTRICT,

  cantidad_unidades int NOT NULL DEFAULT 0,
  precio_venta      numeric(14,2),
  notas             text,

  coda_row_id text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,

  CONSTRAINT fraccionamiento_prototipo_cantidad_no_negativa
    CHECK (cantidad_unidades >= 0),
  CONSTRAINT fraccionamiento_prototipo_uk
    UNIQUE (proyecto_id, prototipo_id)
);

CREATE INDEX IF NOT EXISTS dilesa_fraccionamiento_prototipo_empresa_idx
  ON dilesa.fraccionamiento_prototipo(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_fraccionamiento_prototipo_proyecto_idx
  ON dilesa.fraccionamiento_prototipo(proyecto_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_fraccionamiento_prototipo_proto_idx
  ON dilesa.fraccionamiento_prototipo(prototipo_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_fraccionamiento_prototipo_coda_row_idx
  ON dilesa.fraccionamiento_prototipo(empresa_id, coda_row_id)
  WHERE coda_row_id IS NOT NULL;

ALTER TABLE dilesa.fraccionamiento_prototipo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fraccionamiento_prototipo_select
  ON dilesa.fraccionamiento_prototipo;
CREATE POLICY fraccionamiento_prototipo_select
  ON dilesa.fraccionamiento_prototipo
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS fraccionamiento_prototipo_write
  ON dilesa.fraccionamiento_prototipo;
CREATE POLICY fraccionamiento_prototipo_write
  ON dilesa.fraccionamiento_prototipo
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_fraccionamiento_prototipo_updated_at
  ON dilesa.fraccionamiento_prototipo;
CREATE TRIGGER dilesa_fraccionamiento_prototipo_updated_at
  BEFORE UPDATE ON dilesa.fraccionamiento_prototipo
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.fraccionamiento_prototipo IS
  'M:N proyecto↔prototipo comercial. precio_venta override opcional sobre prototipos.valor_comercial.';
