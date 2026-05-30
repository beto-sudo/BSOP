-- Iniciativa `dilesa-proyectos-checklist-inline` Sprint 4D.
--
-- Modelo de versiones del plano del anteproyecto. Sprint 4B/4C dejó
-- todo el análisis financiero capturado, pero el plano sigue siendo
-- single-string en `dilesa.proyectos.plano_oficial_url` — eso sirve
-- para el desarrollo (1 plano definitivo) pero no captura las
-- iteraciones del anteproyecto.
--
-- Beto: "en este paso aún no tenemos el plano oficial, así que aquí
-- trabajamos con el plano del anteproyecto en el que puede haber
-- varias iteraciones".
--
-- Modelo:
--   - Cada versión es 1 row en `proyecto_planos` (metadatos).
--   - El archivo físico vive en `erp.adjuntos` con
--     `entidad_tipo='proyecto_plano'` y `entidad_id=<plano.id>`
--     (patrón canónico ADR-022 / `<FileAttachments>`).
--   - Solo 1 versión `vigente=true` por proyecto a la vez (índice
--     unique parcial lo enforcea — race condition imposible).
--   - `ai_analisis jsonb` queda preparado para Sprint 4E (Claude
--     Vision). Default NULL — no se llena hasta correr análisis AI.
--
-- RLS canónica DILESA:
--   - SELECT/INSERT/UPDATE: `fn_has_empresa(empresa_id)` o admin
--   - DELETE/soft-delete: solo admin global (preserva auditoría)

BEGIN;

CREATE TABLE IF NOT EXISTS dilesa.proyecto_planos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas(id),
  proyecto_id uuid NOT NULL REFERENCES dilesa.proyectos(id),
  version integer NOT NULL,
  descripcion text,
  vigente boolean NOT NULL DEFAULT false,
  ai_analisis jsonb,
  subido_por uuid REFERENCES core.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz,
  CONSTRAINT proyecto_planos_version_positiva CHECK (version > 0),
  CONSTRAINT proyecto_planos_version_uk UNIQUE (proyecto_id, version)
);

-- Índice unique parcial: solo 1 vigente por proyecto a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS proyecto_planos_vigente_uk
  ON dilesa.proyecto_planos (proyecto_id)
  WHERE vigente = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS proyecto_planos_proyecto_idx
  ON dilesa.proyecto_planos (proyecto_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS proyecto_planos_vigente_idx
  ON dilesa.proyecto_planos (proyecto_id, vigente) WHERE deleted_at IS NULL;

COMMENT ON TABLE dilesa.proyecto_planos IS
  'Sprint 4D. Versiones del plano del anteproyecto (iteraciones). El archivo físico vive en erp.adjuntos con entidad_tipo=proyecto_plano. Solo 1 vigente=true por proyecto, enforcing via índice unique parcial. ai_analisis jsonb reservado para Sprint 4E (Claude Vision).';

COMMENT ON COLUMN dilesa.proyecto_planos.version IS
  'Número de versión (1-based, ascendente). El server action incrementa al subir nueva.';
COMMENT ON COLUMN dilesa.proyecto_planos.vigente IS
  'Cuál versión es la "actual" — la que aparece en el header y la que se analiza con AI. Solo 1 puede estar vigente por proyecto (índice unique parcial).';
COMMENT ON COLUMN dilesa.proyecto_planos.ai_analisis IS
  'Sprint 4E: output JSON de Claude Vision con áreas extraídas, lotes, vialidades, recomendaciones. NULL = no analizado todavía.';

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE dilesa.proyecto_planos ENABLE ROW LEVEL SECURITY;

-- SELECT/INSERT/UPDATE: usuarios de la empresa o admin global.
CREATE POLICY proyecto_planos_select ON dilesa.proyecto_planos
  FOR SELECT USING (
    core.fn_is_admin() OR core.fn_has_empresa(empresa_id)
  );

CREATE POLICY proyecto_planos_insert ON dilesa.proyecto_planos
  FOR INSERT WITH CHECK (
    core.fn_is_admin() OR core.fn_has_empresa(empresa_id)
  );

CREATE POLICY proyecto_planos_update ON dilesa.proyecto_planos
  FOR UPDATE USING (
    core.fn_is_admin() OR core.fn_has_empresa(empresa_id)
  );

-- DELETE solo admin (consistente con resto de DILESA).
CREATE POLICY proyecto_planos_delete ON dilesa.proyecto_planos
  FOR DELETE USING (core.fn_is_admin());

NOTIFY pgrst, 'reload schema';

COMMIT;
