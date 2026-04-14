-- ─── Migration: erp.documentos ────────────────────────────────────────────────
-- Mueve el módulo Documentos de core → ERP.
--
-- Cambios:
--   1. ALTER erp.proveedores  → agrega columna `categoria TEXT` (clasifica notarías)
--   2. CREATE erp.documentos  → mismos campos de core.documentos
--                               + notario_proveedor_id UUID nullable (FK → erp.proveedores)
--                               + deleted_at TIMESTAMPTZ (soft-delete, consistente con ERP)
--   3. RLS (mismo patrón que core.documentos y otras tablas ERP)
--   4. INSERT ... SELECT desde core.documentos (preserva IDs, safe ON CONFLICT DO NOTHING)
--   5. COMMENT ON core.documentos marcándola DEPRECATED (sin borrar datos)

-- ─── 1. Categoría en erp.proveedores ─────────────────────────────────────────
-- Permite distinguir notarías del resto de proveedores.

ALTER TABLE erp.proveedores
  ADD COLUMN IF NOT EXISTS categoria TEXT;

COMMENT ON COLUMN erp.proveedores.categoria IS
  'Clasificación del proveedor. Ej: notaria, servicio, insumo, etc.';

-- ─── 2. Crear erp.documentos ──────────────────────────────────────────────────

CREATE TABLE erp.documentos (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           UUID        NOT NULL REFERENCES core.empresas(id),
  titulo               TEXT        NOT NULL,
  numero_documento     TEXT,
  tipo                 TEXT,
  fecha_emision        DATE,
  fecha_vencimiento    DATE,
  notaria              TEXT,
  -- Vínculo normalizado al catálogo de notarías en ERP.
  -- Nullable durante transición; se liga con migrate_dilesa_notarias.ts.
  notario_proveedor_id UUID        REFERENCES erp.proveedores(id),
  notas                TEXT,
  creado_por           UUID        REFERENCES core.usuarios(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ,
  deleted_at           TIMESTAMPTZ           -- soft-delete; la UI filtra WHERE deleted_at IS NULL
);

COMMENT ON TABLE erp.documentos IS
  'Escrituras, contratos y documentos legales. Fuente de verdad en ERP. '
  'Reemplaza core.documentos (ver migración 20260414000012).';

COMMENT ON COLUMN erp.documentos.notaria IS
  'Nombre libre de la notaría (transición). Normalizar vía notario_proveedor_id.';

COMMENT ON COLUMN erp.documentos.notario_proveedor_id IS
  'FK nullable a erp.proveedores (categoria=notaria). '
  'Se puebla ejecutando scripts/migrate_dilesa_notarias.ts + re-run de escrituras.';

-- Índices
CREATE INDEX erp_documentos_empresa_idx
  ON erp.documentos (empresa_id);

CREATE INDEX erp_documentos_tipo_idx
  ON erp.documentos (empresa_id, tipo);

CREATE INDEX erp_documentos_vencimiento_idx
  ON erp.documentos (empresa_id, fecha_vencimiento);

CREATE INDEX erp_documentos_notario_idx
  ON erp.documentos (notario_proveedor_id)
  WHERE notario_proveedor_id IS NOT NULL;

CREATE INDEX erp_documentos_activos_idx
  ON erp.documentos (empresa_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Trigger updated_at
DROP TRIGGER IF EXISTS erp_documentos_updated_at ON erp.documentos;
CREATE TRIGGER erp_documentos_updated_at
  BEFORE UPDATE ON erp.documentos
  FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ─── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE erp.documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erp_documentos_select" ON erp.documentos;
CREATE POLICY "erp_documentos_select"
  ON erp.documentos FOR SELECT TO authenticated
  USING (
    empresa_id IN (
      SELECT ue.empresa_id
      FROM core.usuarios_empresas ue
      JOIN core.usuarios u ON u.id = ue.usuario_id
      WHERE lower(u.email) = lower(auth.email())
        AND ue.activo = true
    )
  );

DROP POLICY IF EXISTS "erp_documentos_insert" ON erp.documentos;
CREATE POLICY "erp_documentos_insert"
  ON erp.documentos FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id IN (
      SELECT ue.empresa_id
      FROM core.usuarios_empresas ue
      JOIN core.usuarios u ON u.id = ue.usuario_id
      WHERE lower(u.email) = lower(auth.email())
        AND ue.activo = true
    )
  );

DROP POLICY IF EXISTS "erp_documentos_update" ON erp.documentos;
CREATE POLICY "erp_documentos_update"
  ON erp.documentos FOR UPDATE TO authenticated
  USING (
    empresa_id IN (
      SELECT ue.empresa_id
      FROM core.usuarios_empresas ue
      JOIN core.usuarios u ON u.id = ue.usuario_id
      WHERE lower(u.email) = lower(auth.email())
        AND ue.activo = true
    )
  );

-- ─── 4. Grants ────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE        ON erp.documentos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON erp.documentos TO service_role;

-- ─── 5. Copiar datos desde core.documentos ────────────────────────────────────
-- Preserva los UUIDs originales → los adjuntos de erp.adjuntos siguen apuntando
-- al mismo entidad_id sin necesidad de remapear.

INSERT INTO erp.documentos (
  id,
  empresa_id,
  titulo,
  numero_documento,
  tipo,
  fecha_emision,
  fecha_vencimiento,
  notaria,
  notario_proveedor_id,
  notas,
  creado_por,
  created_at,
  updated_at
)
SELECT
  id,
  empresa_id,
  titulo,
  numero_documento,
  tipo,
  fecha_emision,
  fecha_vencimiento,
  notaria,
  NULL AS notario_proveedor_id,  -- se liga después con migrate_dilesa_notarias.ts
  notas,
  creado_por,
  created_at,
  updated_at
FROM core.documentos
ON CONFLICT (id) DO NOTHING;

-- ─── 6. Deprecar core.documentos (sin borrar datos) ──────────────────────────

COMMENT ON TABLE core.documentos IS
  'DEPRECATED desde 2026-04-14 — usar erp.documentos. '
  'Tabla conservada para rollback y auditoría; no insertar registros nuevos. '
  'Ver migración 20260414000015_erp_documentos.sql.';

-- ─── Reload PostgREST ─────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
