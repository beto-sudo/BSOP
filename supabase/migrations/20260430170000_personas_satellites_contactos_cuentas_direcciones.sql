-- Crea tres tablas satélite de erp.personas para soportar:
--   1. erp.personas_contactos        — multi-contacto por persona (proveedor/empleado/cliente)
--   2. erp.personas_cuentas_bancarias — multi-cuenta bancaria por persona (FK opcional a core.bancos)
--   3. erp.personas_direcciones       — multi-dirección por persona (operativo/entrega/cobro/oficina;
--                                       el fiscal sigue viviendo en erp.personas_datos_fiscales)
--
-- Iniciativa: rdb-proveedores-data-completion (ver docs/planning/rdb-proveedores-data-completion.md).
-- Decisiones: ADR-028 (docs/adr/028_personas_satellites.md), reglas PS1-PS6.
--
-- Pasos:
--   1. CREATE TABLE para las 3 tablas, FKs, defaults, constraints.
--   2. Indexes (lookup por persona_id) + partial unique constraints (un solo
--      principal/vigente por persona y rol activo).
--   3. ENABLE RLS + 4 policies (SELECT/INSERT/UPDATE/DELETE) por tabla,
--      replicando el patrón de erp.personas_datos_fiscales.
--   4. Trigger BEFORE UPDATE para `updated_at` usando core.fn_set_updated_at.
--   5. NOTIFY pgrst para refrescar el cache de schema.

BEGIN;

-- =============================================================================
-- 1. erp.personas_contactos
-- =============================================================================
CREATE TABLE erp.personas_contactos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas(id),
  persona_id uuid NOT NULL REFERENCES erp.personas(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  puesto text,
  telefono text,
  email text,
  notas text,
  principal boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_personas_contactos_persona_id
  ON erp.personas_contactos (persona_id);

CREATE INDEX idx_personas_contactos_empresa_id
  ON erp.personas_contactos (empresa_id);

-- Solo un contacto principal activo por persona.
CREATE UNIQUE INDEX uq_personas_contactos_principal_activo
  ON erp.personas_contactos (persona_id)
  WHERE principal = true AND activo = true;

ALTER TABLE erp.personas_contactos ENABLE ROW LEVEL SECURITY;

CREATE POLICY erp_personas_contactos_select ON erp.personas_contactos
  FOR SELECT USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY erp_personas_contactos_insert ON erp.personas_contactos
  FOR INSERT WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY erp_personas_contactos_update ON erp.personas_contactos
  FOR UPDATE USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY erp_personas_contactos_delete ON erp.personas_contactos
  FOR DELETE USING (core.fn_is_admin());

CREATE TRIGGER trg_personas_contactos_updated_at
  BEFORE UPDATE ON erp.personas_contactos
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE erp.personas_contactos IS
  'Multi-contacto operativo por persona (proveedor/empleado/cliente). El contacto fiscal vive en erp.personas_datos_fiscales. ADR-028.';

-- =============================================================================
-- 2. erp.personas_cuentas_bancarias
-- =============================================================================
CREATE TABLE erp.personas_cuentas_bancarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas(id),
  persona_id uuid NOT NULL REFERENCES erp.personas(id) ON DELETE CASCADE,
  banco_id uuid REFERENCES core.bancos(id),
  banco_nombre text,
  numero_cuenta text,
  clabe text,
  tipo text,
  moneda text NOT NULL DEFAULT 'MXN',
  vigente boolean NOT NULL DEFAULT true,
  notas text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),

  -- Al menos uno de banco_id o banco_nombre debe estar.
  CONSTRAINT chk_pers_ctas_banco_present CHECK (
    banco_id IS NOT NULL OR (banco_nombre IS NOT NULL AND length(trim(banco_nombre)) > 0)
  ),
  -- Al menos uno de numero_cuenta o clabe debe estar.
  CONSTRAINT chk_pers_ctas_identificador_present CHECK (
    (numero_cuenta IS NOT NULL AND length(trim(numero_cuenta)) > 0)
    OR (clabe IS NOT NULL AND length(trim(clabe)) > 0)
  ),
  -- CLABE mexicana = 18 dígitos (cuando se proporcione).
  CONSTRAINT chk_pers_ctas_clabe_format CHECK (
    clabe IS NULL OR clabe ~ '^[0-9]{18}$'
  )
);

CREATE INDEX idx_personas_cuentas_bancarias_persona_id
  ON erp.personas_cuentas_bancarias (persona_id);

CREATE INDEX idx_personas_cuentas_bancarias_empresa_id
  ON erp.personas_cuentas_bancarias (empresa_id);

-- Solo una cuenta vigente por persona.
CREATE UNIQUE INDEX uq_personas_cuentas_bancarias_vigente
  ON erp.personas_cuentas_bancarias (persona_id)
  WHERE vigente = true;

ALTER TABLE erp.personas_cuentas_bancarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY erp_personas_cuentas_bancarias_select ON erp.personas_cuentas_bancarias
  FOR SELECT USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY erp_personas_cuentas_bancarias_insert ON erp.personas_cuentas_bancarias
  FOR INSERT WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY erp_personas_cuentas_bancarias_update ON erp.personas_cuentas_bancarias
  FOR UPDATE USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY erp_personas_cuentas_bancarias_delete ON erp.personas_cuentas_bancarias
  FOR DELETE USING (core.fn_is_admin());

CREATE TRIGGER trg_personas_cuentas_bancarias_updated_at
  BEFORE UPDATE ON erp.personas_cuentas_bancarias
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE erp.personas_cuentas_bancarias IS
  'Multi-cuenta bancaria de terceros (proveedor/empleado/cliente). NO confundir con erp.cuentas_bancarias (cuentas propias de la empresa con saldo). ADR-028.';

-- =============================================================================
-- 3. erp.personas_direcciones
-- =============================================================================
CREATE TABLE erp.personas_direcciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas(id),
  persona_id uuid NOT NULL REFERENCES erp.personas(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'operativo',
  calle text,
  num_ext text,
  num_int text,
  colonia text,
  cp text,
  municipio text,
  estado text,
  pais text NOT NULL DEFAULT 'México',
  referencia text,
  principal boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_pers_dirs_tipo CHECK (
    tipo IN ('operativo', 'entrega', 'cobro', 'oficina', 'otro')
  )
);

CREATE INDEX idx_personas_direcciones_persona_id
  ON erp.personas_direcciones (persona_id);

CREATE INDEX idx_personas_direcciones_empresa_id
  ON erp.personas_direcciones (empresa_id);

-- Solo una dirección principal activa por persona.
CREATE UNIQUE INDEX uq_personas_direcciones_principal_activo
  ON erp.personas_direcciones (persona_id)
  WHERE principal = true AND activo = true;

ALTER TABLE erp.personas_direcciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY erp_personas_direcciones_select ON erp.personas_direcciones
  FOR SELECT USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY erp_personas_direcciones_insert ON erp.personas_direcciones
  FOR INSERT WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY erp_personas_direcciones_update ON erp.personas_direcciones
  FOR UPDATE USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY erp_personas_direcciones_delete ON erp.personas_direcciones
  FOR DELETE USING (core.fn_is_admin());

CREATE TRIGGER trg_personas_direcciones_updated_at
  BEFORE UPDATE ON erp.personas_direcciones
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE erp.personas_direcciones IS
  'Multi-dirección operativa por persona. El domicilio fiscal vive en erp.personas_datos_fiscales (validado vía CSF). ADR-028.';

-- =============================================================================
-- Refresh PostgREST schema cache
-- =============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;
