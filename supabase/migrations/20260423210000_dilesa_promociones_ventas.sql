-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-4a — dilesa.promociones_ventas
-- ════════════════════════════════════════════════════════════════════════════
--
-- Campañas comerciales con descuento configurable. Una promoción aplica
-- globalmente a toda la empresa (proyecto_id NULL) o a un proyecto específico
-- (proyecto_id NOT NULL). El descuento es XOR: porcentaje O monto fijo, nunca
-- ambos.
--
-- Se crea antes que dilesa.inventario_vivienda porque ésta última la referencia
-- (inv.promocion_id → promociones_ventas.id).
--
-- Sin datos — la migración Coda → BSOP va en dilesa-4b.

CREATE TABLE IF NOT EXISTS dilesa.promociones_ventas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,

  -- Identidad
  nombre       text NOT NULL,
  descripcion  text,

  -- Scope
  proyecto_id  uuid REFERENCES dilesa.proyectos(id) ON DELETE SET NULL,

  -- Descuento (XOR: uno u otro, nunca ambos)
  descuento_pct    numeric(5,2),
  descuento_monto  numeric(14,2),

  -- Vigencia
  fecha_inicio date,
  fecha_fin    date,

  -- Condiciones libres
  condiciones text,

  -- Activación
  activa boolean NOT NULL DEFAULT true,

  -- Técnicas (catálogo transaccional — sin columnas de gestión)
  coda_row_id text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,

  CONSTRAINT promociones_ventas_descuento_pct_rango_check
    CHECK (descuento_pct IS NULL OR (descuento_pct >= 0 AND descuento_pct <= 100)),
  CONSTRAINT promociones_ventas_descuento_monto_nonneg_check
    CHECK (descuento_monto IS NULL OR descuento_monto >= 0),
  CONSTRAINT promociones_ventas_descuento_xor_check
    CHECK (NOT (descuento_pct IS NOT NULL AND descuento_monto IS NOT NULL)),
  CONSTRAINT promociones_ventas_vigencia_check
    CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio),
  CONSTRAINT promociones_ventas_nombre_proyecto_uk
    UNIQUE NULLS NOT DISTINCT (empresa_id, nombre, proyecto_id)
);

CREATE INDEX IF NOT EXISTS dilesa_promociones_ventas_empresa_idx
  ON dilesa.promociones_ventas(empresa_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_promociones_ventas_coda_row_idx
  ON dilesa.promociones_ventas(empresa_id, coda_row_id) WHERE coda_row_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dilesa_promociones_ventas_proyecto_idx
  ON dilesa.promociones_ventas(proyecto_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_promociones_ventas_activa_idx
  ON dilesa.promociones_ventas(activa) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.promociones_ventas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promociones_ventas_select ON dilesa.promociones_ventas;
CREATE POLICY promociones_ventas_select ON dilesa.promociones_ventas
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS promociones_ventas_write ON dilesa.promociones_ventas;
CREATE POLICY promociones_ventas_write ON dilesa.promociones_ventas
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_promociones_ventas_updated_at ON dilesa.promociones_ventas;
CREATE TRIGGER dilesa_promociones_ventas_updated_at
  BEFORE UPDATE ON dilesa.promociones_ventas
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.promociones_ventas IS
  'Campañas comerciales con descuento_pct XOR descuento_monto. Scope global (proyecto_id NULL) o por proyecto. Vigencia opcional por fechas. Referenciada desde inventario_vivienda.promocion_id.';
