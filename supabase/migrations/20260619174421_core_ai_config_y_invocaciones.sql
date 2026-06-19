-- ╭─ 20260619174421_core_ai_config_y_invocaciones ─╮
-- Iniciativa registro-ia · Sprint 2 — capa DB de IA.
--   core.ai_config        override del modelo por uso (editable; surte sin
--                         redeploy vía resolveModel() con cache + fail-open).
--   core.ai_invocaciones  log de cada llamada de IA (modelo, proceso, empresa,
--                         tokens, costo estimado) → dashboard de costo/uso.
-- Escritas/leídas por el servidor con service_role (el wrapper lib/ai y, en el
-- Sprint 3, la UI vía route handler). RLS deny-all a anon/authenticated.

BEGIN;

-- ─── core.ai_config ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.ai_config (
  uso_id          text PRIMARY KEY,
  modelo          text NOT NULL,
  nota            text,
  actualizado_por uuid REFERENCES core.usuarios (id),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE core.ai_config IS
  'Override del modelo por uso de IA (iniciativa registro-ia). Vacío = usar el default del registry en código (lib/ai/registry.ts). resolveModel() lo lee con cache de 60s + fail-open al default.';
COMMENT ON COLUMN core.ai_config.uso_id IS
  'Id del uso en lib/ai/registry.ts (ej. dilesa-pld-informe). Sin FK: el catálogo vive en código.';

-- ─── core.ai_invocaciones ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.ai_invocaciones (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uso_id             text NOT NULL,
  modelo             text NOT NULL,
  proveedor          text NOT NULL,
  empresa            text,                          -- slug del registry (cross/dilesa/…)
  tokens_in          integer NOT NULL DEFAULT 0,
  tokens_out         integer NOT NULL DEFAULT 0,
  costo_estimado_usd numeric(12, 6) NOT NULL DEFAULT 0,
  exito              boolean NOT NULL DEFAULT true,
  error              text,
  duracion_ms        integer,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE core.ai_invocaciones IS
  'Log de cada invocación de IA (iniciativa registro-ia): modelo, proceso, empresa, tokens y costo estimado. Los tokens son factuales (del usage de la API); el costo se deriva del pricing en lib/ai/pricing.ts.';

CREATE INDEX IF NOT EXISTS ai_invocaciones_uso_fecha_idx
  ON core.ai_invocaciones (uso_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_invocaciones_fecha_idx
  ON core.ai_invocaciones (created_at DESC);

-- ─── RLS deny-all + perímetro anon ───────────────────────────────────────────
ALTER TABLE core.ai_config       ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.ai_invocaciones ENABLE ROW LEVEL SECURITY;

-- Sin policies permisivas: deny-all a anon/authenticated. service_role (el
-- wrapper server-side) bypassa RLS. La UI del Sprint 3 leerá vía route handler
-- con el admin client. Perímetro consistente con blindaje-financiero.
REVOKE ALL ON core.ai_config       FROM anon, authenticated;
REVOKE ALL ON core.ai_invocaciones FROM anon, authenticated;

-- Recarga el cache de PostgREST (tablas nuevas):
NOTIFY pgrst, 'reload schema';

COMMIT;
