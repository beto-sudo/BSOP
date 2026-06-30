-- Metas editables por fase + vista de "vara" efectiva (DILESA · Ventas)
-- — iniciativa dilesa-fluidez-pipeline, Sprint 3.
--
-- Hasta S2 la "vara" contra la que se mide cada fase era la mediana histórica
-- (autocalibra, pero "todo lento parece normal"). S3 deja que Dirección fije una
-- META aspiracional por fase (en días); donde haya meta, sustituye a la mediana
-- como referencia del semáforo y de la banda de fluidez por venta.
--
-- 1. dilesa.fase_metas — una meta vigente por (empresa, fase). RLS: cualquiera de
--    la empresa la LEE; solo Dirección/admin la ESCRIBE (erp.fn_es_direccion, el
--    mismo gate que el presupuesto). Sin server action: la RLS basta.
-- 2. dilesa.v_fase_vara — el benchmark de S2a con la meta encima:
--    vara = COALESCE(meta, mediana). Único punto donde se resuelve el COALESCE;
--    lo consumen el radar y la banda de fluidez por venta.

BEGIN;

CREATE TABLE dilesa.fase_metas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  posicion int NOT NULL CHECK (posicion BETWEEN 1 AND 17),
  meta_dias numeric NOT NULL CHECK (meta_dias >= 0),
  activa boolean NOT NULL DEFAULT true,
  nota text,
  editado_por uuid REFERENCES core.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Una meta por fase y empresa (upsert por ON CONFLICT).
  UNIQUE (empresa_id, posicion)
);

CREATE INDEX dilesa_fase_metas_empresa_idx
  ON dilesa.fase_metas (empresa_id) WHERE activa;

CREATE TRIGGER dilesa_fase_metas_updated_at
  BEFORE UPDATE ON dilesa.fase_metas
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

ALTER TABLE dilesa.fase_metas ENABLE ROW LEVEL SECURITY;

-- Lee cualquiera con acceso a la empresa (la meta no es secreta).
CREATE POLICY fase_metas_select ON dilesa.fase_metas
  FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

-- Escribe SOLO Dirección/admin (gate DB, espejo del presupuesto).
CREATE POLICY fase_metas_write ON dilesa.fase_metas
  FOR ALL TO authenticated
  USING (erp.fn_es_direccion(empresa_id))
  WITH CHECK (erp.fn_es_direccion(empresa_id));

-- Vista "vara": el benchmark histórico con la meta editable encima.
CREATE OR REPLACE VIEW dilesa.v_fase_vara
WITH (security_invoker = true) AS
SELECT
  b.empresa_id,
  b.posicion,
  b.fase,
  b.mediana,
  b.p90,
  b.n,
  m.meta_dias AS meta,
  COALESCE(m.meta_dias, b.mediana) AS vara
FROM dilesa.v_fase_benchmark b
LEFT JOIN dilesa.fase_metas m
  ON m.empresa_id = b.empresa_id AND m.posicion = b.posicion AND m.activa;

COMMENT ON VIEW dilesa.v_fase_vara IS
  'Benchmark por fase con la meta editable encima: vara = COALESCE(meta, mediana). Radar + banda de fluidez (dilesa-fluidez-pipeline S3).';

-- Exponer tabla + vista nuevas vía PostgREST.
NOTIFY pgrst, 'reload schema';

COMMIT;
