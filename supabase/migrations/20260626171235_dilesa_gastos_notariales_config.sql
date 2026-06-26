-- ╭─ 20260626171235_dilesa_gastos_notariales_config ─╮
-- Iniciativa dilesa-gastos-notariales · Sprint 1 · schema + seed.
-- Config editable de los gastos notariales de DILESA: cuotas fijas + parámetros
-- (config) y los 2 tabuladores escalonados (compraventa por valor de
-- escrituración; apertura de crédito por monto de crédito). Reemplaza el cálculo
-- manual del notario en Excel — permite calcularlo en BSOP y solo confirmarlo.
-- Tarifas vigentes 2026 del notario que atiende >90% de la escrituración (Memo,
-- Lic. Guillermo Nicolás López Elizondo). Se actualizan cada enero desde la UI.
--
-- Aditivo puro: 2 tablas nuevas + seed idempotente robusto a Preview (JOIN a
-- core.empresas + ON CONFLICT). No afecta datos existentes ni otras empresas.
-- NO toca cuadratura ni precio (línea roja de la iniciativa).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Config — cuotas fijas + parámetros, una fila por (empresa, año)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dilesa.gastos_notariales_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  -- Año de vigencia de las tarifas (el notario las actualiza cada enero).
  anio integer NOT NULL,
  -- La config que usa el cálculo. Índice parcial único garantiza una sola activa.
  activa boolean NOT NULL DEFAULT true,

  -- Municipio
  isai_pct numeric(6, 4) NOT NULL DEFAULT 0.03, -- ISAI = isai_pct × valor escrituración
  muni_certificacion_planos numeric(12, 2) NOT NULL DEFAULT 165,
  muni_copias_fotostaticas numeric(12, 2) NOT NULL DEFAULT 56,
  muni_avaluo_previo numeric(12, 2) NOT NULL DEFAULT 566,
  muni_valuacion_catastral numeric(12, 2) NOT NULL DEFAULT 1200,
  muni_derechos numeric(12, 2) NOT NULL DEFAULT 850,

  -- Registro Público
  rp_clg numeric(12, 2) NOT NULL DEFAULT 575, -- certificado de libertad de gravamen
  rp_aviso_preventivo numeric(12, 2) NOT NULL DEFAULT 0, -- con Memo va incluido en el CLG
  -- Apertura de crédito: cuota fija hasta el umbral; arriba entra el tabulador.
  apertura_umbral_cuota_fija numeric(14, 2) NOT NULL DEFAULT 820000,
  apertura_cuota_fija numeric(12, 2) NOT NULL DEFAULT 765,

  -- Otros
  otros_cnpr_por_derechohabiente numeric(12, 2) NOT NULL DEFAULT 1000,
  otros_aviso_definitivo numeric(12, 2) NOT NULL DEFAULT 103,
  otros_forma_isai numeric(12, 2) NOT NULL DEFAULT 400,
  otros_copia_certificada numeric(12, 2) NOT NULL DEFAULT 1500,
  otros_plano numeric(12, 2) NOT NULL DEFAULT 1200,
  otros_kinegrama numeric(12, 2) NOT NULL DEFAULT 200,

  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (empresa_id, anio)
);

COMMENT ON TABLE dilesa.gastos_notariales_config IS
  'Cuotas fijas + parámetros de gastos notariales por empresa/año. Iniciativa dilesa-gastos-notariales.';

-- Una sola config activa por empresa (la vigente que usa el cálculo).
CREATE UNIQUE INDEX IF NOT EXISTS uq_gastos_notariales_config_activa
  ON dilesa.gastos_notariales_config (empresa_id)
  WHERE activa AND deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tabulador — filas escalonadas de compraventa y apertura de crédito
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dilesa.gastos_notariales_tabulador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES dilesa.gastos_notariales_config (id) ON DELETE CASCADE,
  -- empresa_id denormalizado para RLS set-membership directo (= config.empresa_id).
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  -- 'compraventa' indexa por valor de escrituración; 'apertura' por monto de crédito.
  tipo text NOT NULL CHECK (tipo IN ('compraventa', 'apertura')),
  orden integer NOT NULL,
  limite_inferior numeric(14, 2) NOT NULL,
  limite_superior numeric(14, 2), -- NULL = sin tope (último escalón)
  -- valor_beneficio: ningún derechohabiente con propiedad (beneficio 50%).
  -- valor_particular: algún derechohabiente con propiedad (cuota plena).
  -- En 'apertura' el caso >umbral es ambiguo en la hoja del notario (PARTICULAR /
  -- CONSTRU / DILESA); se seedea beneficio=CONSTRU, particular=PARTICULAR y queda
  -- editable — pendiente confirmar con Memo (ver planning doc).
  valor_beneficio numeric(12, 2) NOT NULL,
  valor_particular numeric(12, 2) NOT NULL,
  UNIQUE (config_id, tipo, orden)
);

COMMENT ON TABLE dilesa.gastos_notariales_tabulador IS
  'Tabuladores escalonados (compraventa, apertura de crédito) de gastos notariales. Iniciativa dilesa-gastos-notariales.';

CREATE INDEX IF NOT EXISTS idx_gastos_notariales_tabulador_config
  ON dilesa.gastos_notariales_tabulador (config_id, tipo, orden);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trigger updated_at (config)
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS dilesa_gastos_notariales_config_updated_at ON dilesa.gastos_notariales_config;
CREATE TRIGGER dilesa_gastos_notariales_config_updated_at BEFORE UPDATE ON dilesa.gastos_notariales_config
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Grants + RLS (aislamiento por empresa, set-membership — evita el timeout
--    por-fila de fn_has_empresa, ver reference_rls_fn_has_empresa_per_row)
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON dilesa.gastos_notariales_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON dilesa.gastos_notariales_tabulador TO authenticated;

ALTER TABLE dilesa.gastos_notariales_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE dilesa.gastos_notariales_tabulador ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pred text := '(empresa_id IN (SELECT core.fn_current_empresa_ids()) OR core.fn_is_admin())';
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['gastos_notariales_config', 'gastos_notariales_tabulador'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON dilesa.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_insert ON dilesa.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_update ON dilesa.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_delete ON dilesa.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_select ON dilesa.%1$s FOR SELECT TO authenticated USING %2$s', t, pred);
    EXECUTE format('CREATE POLICY %1$s_insert ON dilesa.%1$s FOR INSERT TO authenticated WITH CHECK %2$s', t, pred);
    EXECUTE format('CREATE POLICY %1$s_update ON dilesa.%1$s FOR UPDATE TO authenticated USING %2$s WITH CHECK %2$s', t, pred);
    EXECUTE format('CREATE POLICY %1$s_delete ON dilesa.%1$s FOR DELETE TO authenticated USING %2$s', t, pred);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Seed — tarifas 2026 de Memo para DILESA (idempotente, robusto a Preview:
--    si la empresa 'dilesa' no existe, los JOIN devuelven 0 filas y no rompe)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO dilesa.gastos_notariales_config (empresa_id, anio, activa, notas)
SELECT id, 2026, true,
  'Tarifas 2026 del notario Memo (Lic. Guillermo Nicolás López Elizondo, Distrito Notarial Río Grande). Defaults de columna = valores del correo del 25-jun-2026.'
FROM core.empresas WHERE slug = 'dilesa'
ON CONFLICT (empresa_id, anio) DO NOTHING;

-- Tabulador de compraventa (por valor de escrituración): beneficio (sin
-- propiedad) / particular (con propiedad).
INSERT INTO dilesa.gastos_notariales_tabulador
  (config_id, empresa_id, tipo, orden, limite_inferior, limite_superior, valor_beneficio, valor_particular)
SELECT c.id, c.empresa_id, 'compraventa', v.orden, v.inf, v.sup, v.benef, v.part
FROM dilesa.gastos_notariales_config c
JOIN core.empresas e ON e.id = c.empresa_id AND e.slug = 'dilesa'
CROSS JOIN (VALUES
  (1, 0.01::numeric, 57750::numeric, 2683::numeric, 5345::numeric),
  (2, 57750.01, 115500, 3351, 6682),
  (3, 115500.01, 231000, 4019, 8018),
  (4, 231000.01, 346500, 4683, 9354),
  (5, 346500.01, 462000, 5355, 10690),
  (6, 462000.01, 577500, 6023, 12027),
  (7, 577500.01, 693000, 6692, 13363),
  (8, 693000.01, 808500, 7360, 14699),
  (9, 808500.01, 924000, 8028, 16036),
  (10, 924000.01, 1039500, 8696, 17372),
  (11, 1039500.01, 1155000, 9364, 18708),
  (12, 1155000.01, 1386000, 10701, 21381),
  (13, 1386000.01, 1559250, 11369, 22717),
  (14, 1559250.01, 1617000, 12037, 24053),
  (15, 1617000.01, 1732500, 12705, 25390),
  (16, 1732500.01, NULL, 13373, 26726)
) AS v(orden, inf, sup, benef, part)
WHERE c.anio = 2026
ON CONFLICT (config_id, tipo, orden) DO NOTHING;

-- Tabulador de apertura de crédito (por monto de crédito): beneficio=CONSTRU
-- (50%) / particular=PARTICULAR (cuota plena). Solo aplica cuando el crédito
-- supera apertura_umbral_cuota_fija; abajo se cobra apertura_cuota_fija.
INSERT INTO dilesa.gastos_notariales_tabulador
  (config_id, empresa_id, tipo, orden, limite_inferior, limite_superior, valor_beneficio, valor_particular)
SELECT c.id, c.empresa_id, 'apertura', v.orden, v.inf, v.sup, v.benef, v.part
FROM dilesa.gastos_notariales_config c
JOIN core.empresas e ON e.id = c.empresa_id AND e.slug = 'dilesa'
CROSS JOIN (VALUES
  (1, 0.01::numeric, 57750::numeric, 678.15::numeric, 1336.30::numeric),
  (2, 57750.01, 173250, 1346.30, 2672.60),
  (3, 173250.01, 288750, 2014.45, 4008.90),
  (4, 288750.01, 404250, 2682.60, 5345.20),
  (5, 404250.01, 519750, 3350.75, 6681.50),
  (6, 519750.01, 635250, 4018.90, 8017.80),
  (7, 635250.01, 750750, 4687.05, 9354.10),
  (8, 750750.01, 866250, 5355.20, 10690.40),
  (9, 866250.01, 981750, 6023.35, 12026.70),
  (10, 981750.01, 1097250, 6691.50, 13363.00),
  (11, 1097250.01, 1212750, 7359.65, 14699.30),
  (12, 1212750.01, 1328250, 8027.80, 16035.60),
  (13, 1328250.01, 1443750, 8695.95, 17371.90),
  (14, 1443750.01, 1559250, 9364.10, 18708.20),
  (15, 1559250.01, 1674750, 10032.25, 20044.50),
  (16, 1674750.01, 1732500, 10700.40, 21380.80),
  (17, 1732500.01, 1848000, 11368.55, 22717.10),
  (18, 1848000.01, 2310000, 12036.70, 24053.40)
) AS v(orden, inf, sup, benef, part)
WHERE c.anio = 2026
ON CONFLICT (config_id, tipo, orden) DO NOTHING;

-- Recarga el cache de PostgREST (tablas nuevas expuestas vía supabase-js):
NOTIFY pgrst, 'reload schema';

COMMIT;
