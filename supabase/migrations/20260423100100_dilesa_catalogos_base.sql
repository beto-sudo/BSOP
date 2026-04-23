-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-0 — Catálogos base de dilesa (estructura vacía)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Crea los 9 catálogos base del dominio Dilesa. Todos siguen el mismo patrón:
--
--   - `empresa_id` nullable:
--       * NULL     → catálogo global (aplica a todas las empresas)
--       * UUID     → específico de esa empresa
--   - Soft-delete vía `deleted_at`
--   - `coda_row_id` para trazabilidad durante migración Coda→BSOP
--   - RLS por empresa (o global) vía helpers `core.fn_has_empresa` /
--     `core.fn_is_admin` definidos en migración 20260417220000.
--   - Trigger `core.fn_set_updated_at()` para mantener `updated_at`.
--
-- IMPORTANTE: este sprint NO carga datos — solo estructura. Los catálogos se
-- pueblan junto con su sprint de data (dilesa-1 en adelante) desde Coda.
--
-- Ver supabase/adr/001_dilesa_schema.md §Catálogos Dilesa.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. dilesa.clasificacion_inmobiliaria
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dilesa.clasificacion_inmobiliaria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES core.empresas(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  coda_row_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT clasificacion_inmobiliaria_codigo_empresa_uk
    UNIQUE NULLS NOT DISTINCT (empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS dilesa_clasificacion_inmobiliaria_empresa_idx
  ON dilesa.clasificacion_inmobiliaria(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_clasificacion_inmobiliaria_activo_idx
  ON dilesa.clasificacion_inmobiliaria(activo) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.clasificacion_inmobiliaria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clasificacion_inmobiliaria_select ON dilesa.clasificacion_inmobiliaria;
CREATE POLICY clasificacion_inmobiliaria_select ON dilesa.clasificacion_inmobiliaria
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      empresa_id IS NULL
      OR core.fn_has_empresa(empresa_id)
      OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS clasificacion_inmobiliaria_write ON dilesa.clasificacion_inmobiliaria;
CREATE POLICY clasificacion_inmobiliaria_write ON dilesa.clasificacion_inmobiliaria
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_clasificacion_inmobiliaria_updated_at ON dilesa.clasificacion_inmobiliaria;
CREATE TRIGGER dilesa_clasificacion_inmobiliaria_updated_at
  BEFORE UPDATE ON dilesa.clasificacion_inmobiliaria
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.clasificacion_inmobiliaria IS
  'Clasificación de activos inmobiliarios (residencial, comercial, industrial, etc.). empresa_id NULL = global.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. dilesa.tipo_proyecto
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dilesa.tipo_proyecto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES core.empresas(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  coda_row_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT tipo_proyecto_codigo_empresa_uk
    UNIQUE NULLS NOT DISTINCT (empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS dilesa_tipo_proyecto_empresa_idx
  ON dilesa.tipo_proyecto(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_tipo_proyecto_activo_idx
  ON dilesa.tipo_proyecto(activo) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.tipo_proyecto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tipo_proyecto_select ON dilesa.tipo_proyecto;
CREATE POLICY tipo_proyecto_select ON dilesa.tipo_proyecto
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      empresa_id IS NULL
      OR core.fn_has_empresa(empresa_id)
      OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS tipo_proyecto_write ON dilesa.tipo_proyecto;
CREATE POLICY tipo_proyecto_write ON dilesa.tipo_proyecto
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_tipo_proyecto_updated_at ON dilesa.tipo_proyecto;
CREATE TRIGGER dilesa_tipo_proyecto_updated_at
  BEFORE UPDATE ON dilesa.tipo_proyecto
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.tipo_proyecto IS
  'Tipología del desarrollo (fraccionamiento, edificio, usos mixtos, etc.). empresa_id NULL = global.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. dilesa.etapas_construccion
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dilesa.etapas_construccion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES core.empresas(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  coda_row_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT etapas_construccion_codigo_empresa_uk
    UNIQUE NULLS NOT DISTINCT (empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS dilesa_etapas_construccion_empresa_idx
  ON dilesa.etapas_construccion(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_etapas_construccion_activo_idx
  ON dilesa.etapas_construccion(activo) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.etapas_construccion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS etapas_construccion_select ON dilesa.etapas_construccion;
CREATE POLICY etapas_construccion_select ON dilesa.etapas_construccion
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      empresa_id IS NULL
      OR core.fn_has_empresa(empresa_id)
      OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS etapas_construccion_write ON dilesa.etapas_construccion;
CREATE POLICY etapas_construccion_write ON dilesa.etapas_construccion
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_etapas_construccion_updated_at ON dilesa.etapas_construccion;
CREATE TRIGGER dilesa_etapas_construccion_updated_at
  BEFORE UPDATE ON dilesa.etapas_construccion
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.etapas_construccion IS
  'Etapas del proceso constructivo por vivienda/lote (cimentación, estructura, acabados, entrega). empresa_id NULL = global.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. dilesa.tipo_trabajo
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dilesa.tipo_trabajo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES core.empresas(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  coda_row_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT tipo_trabajo_codigo_empresa_uk
    UNIQUE NULLS NOT DISTINCT (empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS dilesa_tipo_trabajo_empresa_idx
  ON dilesa.tipo_trabajo(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_tipo_trabajo_activo_idx
  ON dilesa.tipo_trabajo(activo) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.tipo_trabajo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tipo_trabajo_select ON dilesa.tipo_trabajo;
CREATE POLICY tipo_trabajo_select ON dilesa.tipo_trabajo
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      empresa_id IS NULL
      OR core.fn_has_empresa(empresa_id)
      OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS tipo_trabajo_write ON dilesa.tipo_trabajo;
CREATE POLICY tipo_trabajo_write ON dilesa.tipo_trabajo
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_tipo_trabajo_updated_at ON dilesa.tipo_trabajo;
CREATE TRIGGER dilesa_tipo_trabajo_updated_at
  BEFORE UPDATE ON dilesa.tipo_trabajo
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.tipo_trabajo IS
  'Tipos de trabajo en obra (albañilería, plomería, electricidad, etc.). empresa_id NULL = global.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. dilesa.fases_urbanizacion
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dilesa.fases_urbanizacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES core.empresas(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  coda_row_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT fases_urbanizacion_codigo_empresa_uk
    UNIQUE NULLS NOT DISTINCT (empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS dilesa_fases_urbanizacion_empresa_idx
  ON dilesa.fases_urbanizacion(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_fases_urbanizacion_activo_idx
  ON dilesa.fases_urbanizacion(activo) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.fases_urbanizacion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fases_urbanizacion_select ON dilesa.fases_urbanizacion;
CREATE POLICY fases_urbanizacion_select ON dilesa.fases_urbanizacion
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      empresa_id IS NULL
      OR core.fn_has_empresa(empresa_id)
      OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS fases_urbanizacion_write ON dilesa.fases_urbanizacion;
CREATE POLICY fases_urbanizacion_write ON dilesa.fases_urbanizacion
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_fases_urbanizacion_updated_at ON dilesa.fases_urbanizacion;
CREATE TRIGGER dilesa_fases_urbanizacion_updated_at
  BEFORE UPDATE ON dilesa.fases_urbanizacion
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.fases_urbanizacion IS
  'Fases del proceso de urbanización por lote (despalme, trazo, redes, pavimentación, etc.). empresa_id NULL = global.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. dilesa.fases_inventario
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dilesa.fases_inventario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES core.empresas(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  coda_row_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT fases_inventario_codigo_empresa_uk
    UNIQUE NULLS NOT DISTINCT (empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS dilesa_fases_inventario_empresa_idx
  ON dilesa.fases_inventario(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_fases_inventario_activo_idx
  ON dilesa.fases_inventario(activo) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.fases_inventario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fases_inventario_select ON dilesa.fases_inventario;
CREATE POLICY fases_inventario_select ON dilesa.fases_inventario
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      empresa_id IS NULL
      OR core.fn_has_empresa(empresa_id)
      OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS fases_inventario_write ON dilesa.fases_inventario;
CREATE POLICY fases_inventario_write ON dilesa.fases_inventario
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_fases_inventario_updated_at ON dilesa.fases_inventario;
CREATE TRIGGER dilesa_fases_inventario_updated_at
  BEFORE UPDATE ON dilesa.fases_inventario
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.fases_inventario IS
  'Fases del inventario de vivienda (disponible, apartada, vendida, escriturada, entregada, posventa). empresa_id NULL = global.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. dilesa.tipo_credito
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dilesa.tipo_credito (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES core.empresas(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  coda_row_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT tipo_credito_codigo_empresa_uk
    UNIQUE NULLS NOT DISTINCT (empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS dilesa_tipo_credito_empresa_idx
  ON dilesa.tipo_credito(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_tipo_credito_activo_idx
  ON dilesa.tipo_credito(activo) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.tipo_credito ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tipo_credito_select ON dilesa.tipo_credito;
CREATE POLICY tipo_credito_select ON dilesa.tipo_credito
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      empresa_id IS NULL
      OR core.fn_has_empresa(empresa_id)
      OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS tipo_credito_write ON dilesa.tipo_credito;
CREATE POLICY tipo_credito_write ON dilesa.tipo_credito
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_tipo_credito_updated_at ON dilesa.tipo_credito;
CREATE TRIGGER dilesa_tipo_credito_updated_at
  BEFORE UPDATE ON dilesa.tipo_credito
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.tipo_credito IS
  'Tipos de crédito aceptados por la desarrolladora (INFONAVIT, COFINAVIT, bancario, contado, etc.). empresa_id NULL = global.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. dilesa.tipo_deposito
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dilesa.tipo_deposito (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES core.empresas(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  coda_row_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT tipo_deposito_codigo_empresa_uk
    UNIQUE NULLS NOT DISTINCT (empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS dilesa_tipo_deposito_empresa_idx
  ON dilesa.tipo_deposito(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_tipo_deposito_activo_idx
  ON dilesa.tipo_deposito(activo) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.tipo_deposito ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tipo_deposito_select ON dilesa.tipo_deposito;
CREATE POLICY tipo_deposito_select ON dilesa.tipo_deposito
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      empresa_id IS NULL
      OR core.fn_has_empresa(empresa_id)
      OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS tipo_deposito_write ON dilesa.tipo_deposito;
CREATE POLICY tipo_deposito_write ON dilesa.tipo_deposito
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_tipo_deposito_updated_at ON dilesa.tipo_deposito;
CREATE TRIGGER dilesa_tipo_deposito_updated_at
  BEFORE UPDATE ON dilesa.tipo_deposito
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.tipo_deposito IS
  'Tipos de depósito recibidos de clientes (enganche, mensualidad, apartado, gastos, etc.). empresa_id NULL = global.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. dilesa.forma_pago
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dilesa.forma_pago (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES core.empresas(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  coda_row_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT forma_pago_codigo_empresa_uk
    UNIQUE NULLS NOT DISTINCT (empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS dilesa_forma_pago_empresa_idx
  ON dilesa.forma_pago(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_forma_pago_activo_idx
  ON dilesa.forma_pago(activo) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.forma_pago ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS forma_pago_select ON dilesa.forma_pago;
CREATE POLICY forma_pago_select ON dilesa.forma_pago
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      empresa_id IS NULL
      OR core.fn_has_empresa(empresa_id)
      OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS forma_pago_write ON dilesa.forma_pago;
CREATE POLICY forma_pago_write ON dilesa.forma_pago
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_forma_pago_updated_at ON dilesa.forma_pago;
CREATE TRIGGER dilesa_forma_pago_updated_at
  BEFORE UPDATE ON dilesa.forma_pago
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.forma_pago IS
  'Formas de pago aceptadas (efectivo, transferencia, cheque, tarjeta, etc.). empresa_id NULL = global.';
