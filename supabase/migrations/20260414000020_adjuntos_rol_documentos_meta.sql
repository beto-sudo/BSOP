-- ─── Migration: adjuntos.rol + documentos.subtipo_meta ────────────────────────
-- 1. Add `rol` to erp.adjuntos to distinguish document_principal / imagen_referencia / anexo
-- 2. Add `subtipo_meta` JSONB to erp.documentos for type-specific metadata
--    e.g. Escritura: { numero_escritura, fecha_escritura, volumen }
--         Contrato: { parte_a, parte_b, vigencia_meses }
--         Seguro: { numero_poliza, aseguradora, cobertura }

-- ─── 1. erp.adjuntos.rol ─────────────────────────────────────────────────────

ALTER TABLE erp.adjuntos
  ADD COLUMN IF NOT EXISTS rol TEXT NOT NULL DEFAULT 'anexo';

COMMENT ON COLUMN erp.adjuntos.rol IS
  'Rol lógico del adjunto: documento_principal, imagen_referencia, anexo.';

CREATE INDEX IF NOT EXISTS erp_adjuntos_rol_idx
  ON erp.adjuntos (entidad_tipo, entidad_id, rol);

-- ─── 2. erp.documentos.subtipo_meta ──────────────────────────────────────────

ALTER TABLE erp.documentos
  ADD COLUMN IF NOT EXISTS subtipo_meta JSONB;

COMMENT ON COLUMN erp.documentos.subtipo_meta IS
  'Campos específicos del tipo de documento en formato JSON. '
  'Escritura: {numero_escritura, fecha_escritura, volumen}. '
  'Contrato: {parte_a, parte_b, vigencia_meses}. '
  'Seguro: {numero_poliza, aseguradora, cobertura}. '
  'Otro: libre.';

-- ─── Grants ───────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON erp.adjuntos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON erp.adjuntos TO service_role;

-- ─── Reload PostgREST ─────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
