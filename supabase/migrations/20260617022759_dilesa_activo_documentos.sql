-- ╭─ 20260617022759_dilesa_activo_documentos ─╮
-- Iniciativa dilesa-portafolio-expediente · escrituras y documentos legales 1:N.
--
-- Tabla puente entre un activo del portafolio y los documentos legales
-- estructurados que ya viven en `erp.documentos` (escrituras con notaría,
-- folio, extracción IA, etc.). Decisión Beto 2026-06-16: 1:N — un predio puede
-- fraccionarse en varias escrituras y una escritura puede cubrir varios activos.
-- Espeja el patrón probado de `core.empresa_documentos`.
--
-- FK cross-schema dilesa→erp es válida; supabase-js NO embebe cross-schema, así
-- que la UI hace dos queries con .in() (ver memoria reference_supabase_cross_schema_fk).
--
-- Aditiva (tabla nueva + RLS). No toca datos existentes.

BEGIN;

CREATE TABLE IF NOT EXISTS dilesa.activo_documentos (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id   uuid        NOT NULL REFERENCES core.empresas (id),
  activo_id    uuid        NOT NULL REFERENCES dilesa.activos (id),
  documento_id uuid        NOT NULL REFERENCES erp.documentos (id),
  rol          text        NOT NULL DEFAULT 'escritura',
  es_principal boolean     NOT NULL DEFAULT false,
  notas        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  CONSTRAINT activo_documentos_uniq UNIQUE (activo_id, documento_id)
);

COMMENT ON TABLE dilesa.activo_documentos IS
  'Puente 1:N activo del portafolio ↔ documento legal (erp.documentos). rol: escritura/avaluo/contrato/otro. Un activo puede tener varias escrituras (fracciones) y una escritura cubrir varios activos.';

CREATE INDEX IF NOT EXISTS idx_activo_documentos_activo
  ON dilesa.activo_documentos (activo_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activo_documentos_documento
  ON dilesa.activo_documentos (documento_id) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.activo_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activo_documentos_select ON dilesa.activo_documentos;
CREATE POLICY activo_documentos_select ON dilesa.activo_documentos
  FOR SELECT USING (
    deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  );

DROP POLICY IF EXISTS activo_documentos_write ON dilesa.activo_documentos;
CREATE POLICY activo_documentos_write ON dilesa.activo_documentos
  FOR ALL USING (
    core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
  ) WITH CHECK (
    core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON dilesa.activo_documentos TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
