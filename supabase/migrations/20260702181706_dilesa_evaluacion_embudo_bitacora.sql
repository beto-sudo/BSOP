-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260702181706_dilesa_evaluacion_embudo_bitacora                  │
-- │                                                                    │
-- │  Iniciativa `dilesa-portafolio-predios` — S6 (Evaluación 2.0).    │
-- │  1. Etapas canónicas del embudo de compra de terrenos (CHECK en   │
-- │     activo_terreno.etapa; en prod TODAS venían NULL de Coda, así   │
-- │     que no hay normalización — se backfillean a 'detectado').      │
-- │  2. dilesa.activo_bitacora — bitácora append-only por activo       │
-- │     (regla dura de Beto: audit trail del embudo).                  │
-- │  3. Trigger: cambios de etapa/decisión en activo_terreno quedan    │
-- │     logueados automáticamente en la bitácora.                      │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Etapas canónicas del embudo
-- ─────────────────────────────────────────────────────────────────────

UPDATE dilesa.activo_terreno t
SET etapa = 'detectado'
FROM dilesa.activos a
WHERE a.id = t.activo_id AND a.deleted_at IS NULL
  AND a.estado = 'prospecto' AND t.etapa IS NULL;

ALTER TABLE dilesa.activo_terreno DROP CONSTRAINT IF EXISTS activo_terreno_etapa_check;
ALTER TABLE dilesa.activo_terreno ADD CONSTRAINT activo_terreno_etapa_check
  CHECK (etapa IS NULL OR etapa IN ('detectado', 'analisis', 'negociacion', 'decision'));

COMMENT ON COLUMN dilesa.activo_terreno.etapa IS
  'Etapa del embudo de compra: detectado → analisis → negociacion → decision. La salida del embudo es el ESTADO del activo (adquirido/descartado). NULL solo en terrenos que no están en evaluación. S6 dilesa-portafolio-predios.';

-- ─────────────────────────────────────────────────────────────────────
-- 2. Bitácora append-only por activo
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dilesa.activo_bitacora (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  activo_id uuid NOT NULL REFERENCES dilesa.activos (id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'nota' CHECK (tipo IN ('nota', 'etapa', 'decision', 'sistema')),
  texto text NOT NULL,
  creado_por uuid REFERENCES core.usuarios (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE dilesa.activo_bitacora IS
  'Bitácora append-only de un activo del portafolio (notas del embudo de compra, cambios de etapa/decisión vía trigger). Sin UPDATE/DELETE — audit trail. S6 dilesa-portafolio-predios.';

CREATE INDEX IF NOT EXISTS activo_bitacora_activo_idx
  ON dilesa.activo_bitacora (activo_id, created_at DESC);

ALTER TABLE dilesa.activo_bitacora ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activo_bitacora_select ON dilesa.activo_bitacora;
DROP POLICY IF EXISTS activo_bitacora_insert ON dilesa.activo_bitacora;
CREATE POLICY activo_bitacora_select ON dilesa.activo_bitacora FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT core.fn_current_empresa_ids()) OR core.fn_is_admin());
CREATE POLICY activo_bitacora_insert ON dilesa.activo_bitacora FOR INSERT TO authenticated
  WITH CHECK (empresa_id IN (SELECT core.fn_current_empresa_ids()) OR core.fn_is_admin());
-- Sin policies de UPDATE/DELETE: append-only.

-- ─────────────────────────────────────────────────────────────────────
-- 3. Trigger: cambios de etapa / decisión → bitácora automática
-- ─────────────────────────────────────────────────────────────────────

CREATE FUNCTION dilesa.fn_trg_terreno_embudo_bitacora()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = dilesa, public
AS $$
BEGIN
  IF NEW.etapa IS DISTINCT FROM OLD.etapa THEN
    INSERT INTO dilesa.activo_bitacora (empresa_id, activo_id, tipo, texto, creado_por)
    VALUES (NEW.empresa_id, NEW.activo_id, 'etapa',
            'Etapa: ' || COALESCE(OLD.etapa, '—') || ' → ' || COALESCE(NEW.etapa, '—'),
            (SELECT u.id FROM core.usuarios u WHERE u.id = auth.uid()));
  END IF;
  IF NEW.decision_actual IS DISTINCT FROM OLD.decision_actual THEN
    INSERT INTO dilesa.activo_bitacora (empresa_id, activo_id, tipo, texto, creado_por)
    VALUES (NEW.empresa_id, NEW.activo_id, 'decision',
            'Decisión: ' || COALESCE(OLD.decision_actual, '—') || ' → ' || COALESCE(NEW.decision_actual, '—'),
            (SELECT u.id FROM core.usuarios u WHERE u.id = auth.uid()));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dilesa_activo_terreno_embudo_bitacora ON dilesa.activo_terreno;
CREATE TRIGGER dilesa_activo_terreno_embudo_bitacora
  AFTER UPDATE ON dilesa.activo_terreno
  FOR EACH ROW EXECUTE FUNCTION dilesa.fn_trg_terreno_embudo_bitacora();

NOTIFY pgrst, 'reload schema';

COMMIT;
