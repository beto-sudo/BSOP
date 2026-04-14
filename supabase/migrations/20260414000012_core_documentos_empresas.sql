-- ─── Migration: core.documentos + core.empresas header_url ──────────────────
-- Adds the Documentos module to BSOP:
--   1. Alter core.empresas → add header_url (TEXT) for print headers
--   2. Create core.documentos table
--   3. RLS on core.documentos (same empresa_id pattern as erp.tasks)
--   4. Seed DILESA empresa if not present

-- ─── 1. Alter core.empresas ───────────────────────────────────────────────────

ALTER TABLE core.empresas
  ADD COLUMN IF NOT EXISTS logo_url   TEXT,
  ADD COLUMN IF NOT EXISTS header_url TEXT;

-- ─── 2. Create core.documentos ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core.documentos (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         UUID        NOT NULL REFERENCES core.empresas(id),
  titulo             TEXT        NOT NULL,
  numero_documento   TEXT,
  tipo               TEXT,
  fecha_emision      DATE,
  fecha_vencimiento  DATE,
  notaria            TEXT,
  notas              TEXT,
  creado_por         UUID        REFERENCES core.usuarios(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS core_documentos_empresa_idx
  ON core.documentos (empresa_id);

CREATE INDEX IF NOT EXISTS core_documentos_tipo_idx
  ON core.documentos (empresa_id, tipo);

CREATE INDEX IF NOT EXISTS core_documentos_vencimiento_idx
  ON core.documentos (empresa_id, fecha_vencimiento);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION core.fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS core_documentos_updated_at ON core.documentos;
CREATE TRIGGER core_documentos_updated_at
  BEFORE UPDATE ON core.documentos
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

-- ─── 3. Enable RLS on core.documentos ────────────────────────────────────────

ALTER TABLE core.documentos ENABLE ROW LEVEL SECURITY;

-- SELECT: user can only see documents for their empresas
DROP POLICY IF EXISTS "documentos_select" ON core.documentos;
CREATE POLICY "documentos_select"
  ON core.documentos FOR SELECT TO authenticated
  USING (
    empresa_id IN (
      SELECT ue.empresa_id
      FROM core.usuarios_empresas ue
      JOIN core.usuarios u ON u.id = ue.usuario_id
      WHERE lower(u.email) = lower(auth.email())
        AND ue.activo = true
    )
  );

-- INSERT: user can insert for their empresas
DROP POLICY IF EXISTS "documentos_insert" ON core.documentos;
CREATE POLICY "documentos_insert"
  ON core.documentos FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id IN (
      SELECT ue.empresa_id
      FROM core.usuarios_empresas ue
      JOIN core.usuarios u ON u.id = ue.usuario_id
      WHERE lower(u.email) = lower(auth.email())
        AND ue.activo = true
    )
  );

-- UPDATE: user can update for their empresas
DROP POLICY IF EXISTS "documentos_update" ON core.documentos;
CREATE POLICY "documentos_update"
  ON core.documentos FOR UPDATE TO authenticated
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

GRANT SELECT, INSERT, UPDATE ON core.documentos TO authenticated;
GRANT SELECT, UPDATE ON core.empresas TO authenticated;

-- ─── 5. Seed DILESA empresa ───────────────────────────────────────────────────

INSERT INTO core.empresas (nombre, slug, activa)
VALUES ('Desarrollo Inmobiliario Los Encinos S.A. de C.V.', 'dilesa', true)
ON CONFLICT (slug) DO NOTHING;

-- ─── Reload PostgREST ─────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
