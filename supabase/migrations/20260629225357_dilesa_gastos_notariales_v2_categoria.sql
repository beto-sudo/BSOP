-- ╭─ 20260629225357_dilesa_gastos_notariales_v2_categoria ─╮
-- Iniciativa dilesa-gastos-notariales · Rediseño v2 según el cotizador oficial
-- del notario (Excel "COTIZADOR NOTARIA 25 AÑO 2026"). Cambios vs v1:
--   • Tarifas POR CATEGORÍA de vivienda (interes_social / residencial_medio),
--     no únicas. Cada proyecto se clasifica (dilesa.proyectos.categoria_notarial).
--   • Conceptos nuevos del cotizador: valuación catastral = valor_catastral × %
--     (0.2% interés social / 0.18% residencial medio), forma ISAI municipal,
--     no-adeudo SIMAS, avalúo, CNPC. Copia certificada y plano = 1000.
--   • Topes superiores reales = 35,422 (compraventa >1,732,500 y apertura
--     >2,310,000), no 13,373/24,073.
--   • valor_catastral capturable por venta (input de la valuación catastral).
-- Validado al peso contra los 2 ejemplos del cotizador (LDE $922k→$44,333;
-- LDS $3.5M→$188,869). Config de referencia, no transaccional.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Categoría notarial del proyecto (qué cotizador aplica)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE dilesa.proyectos
  ADD COLUMN IF NOT EXISTS categoria_notarial text
  CHECK (categoria_notarial IN ('interes_social', 'residencial_medio'));

COMMENT ON COLUMN dilesa.proyectos.categoria_notarial IS
  'Tipo de vivienda para tarifas notariales: interes_social (cotizador LDE) o residencial_medio (LDS). Iniciativa dilesa-gastos-notariales.';

UPDATE dilesa.proyectos
SET categoria_notarial = CASE
    WHEN nombre IN ('Lomas del Sol', 'Lomas del Valle') THEN 'residencial_medio'
    ELSE 'interes_social'
  END
WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND categoria_notarial IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Valor catastral capturable por venta (alimenta la valuación catastral)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS valor_catastral numeric(16, 2);

COMMENT ON COLUMN dilesa.ventas.valor_catastral IS
  'Valor catastral del inmueble (del predial/CLG). Base de la valuación catastral notarial (× pct de la config). Iniciativa dilesa-gastos-notariales.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Config de gastos notariales: por categoría + conceptos nuevos del cotizador
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE dilesa.gastos_notariales_config
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS muni_forma_isai numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS muni_no_adeudo_simas numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS muni_valuacion_catastral_pct numeric(8, 5) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otros_avaluo numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otros_cnpc numeric(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN dilesa.gastos_notariales_config.categoria IS
  'interes_social | residencial_medio (qué cotizador). Iniciativa dilesa-gastos-notariales.';
COMMENT ON COLUMN dilesa.gastos_notariales_config.muni_valuacion_catastral_pct IS
  'Valuación catastral = valor_catastral × este pct (0.002 interés social, 0.0018 residencial medio).';

-- Limpiar la config v1 (única, sin categoría) — CASCADE borra su tabulador.
-- No hay FK desde ventas a config (el desglose es snapshot jsonb), seguro borrar.
DELETE FROM dilesa.gastos_notariales_config
  WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa');

-- Constraints: ahora la unicidad es por (empresa, categoría, año).
ALTER TABLE dilesa.gastos_notariales_config
  DROP CONSTRAINT IF EXISTS gastos_notariales_config_empresa_id_anio_key;
DROP INDEX IF EXISTS dilesa.uq_gastos_notariales_config_activa;
ALTER TABLE dilesa.gastos_notariales_config
  ADD CONSTRAINT gastos_notariales_config_empresa_categoria_anio_key UNIQUE (empresa_id, categoria, anio);
ALTER TABLE dilesa.gastos_notariales_config ALTER COLUMN categoria SET NOT NULL;
CREATE UNIQUE INDEX uq_gastos_notariales_config_activa
  ON dilesa.gastos_notariales_config (empresa_id, categoria)
  WHERE activa AND deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Seed de las 2 categorías (tarifas 2026 del cotizador del notario)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO dilesa.gastos_notariales_config (
  empresa_id, categoria, anio, activa, isai_pct,
  muni_certificacion_planos, muni_copias_fotostaticas, muni_forma_isai, muni_avaluo_previo,
  muni_valuacion_catastral_pct, muni_derechos, muni_no_adeudo_simas,
  otros_avaluo, otros_cnpc, otros_cnpr_por_derechohabiente, otros_aviso_definitivo,
  otros_forma_isai, otros_copia_certificada, otros_plano, otros_kinegrama,
  rp_clg, rp_aviso_preventivo, apertura_umbral_cuota_fija, apertura_cuota_fija, notas)
SELECT e.id, v.categoria, 2026, true, 0.03,
  v.cert, v.copias, v.forma_isai_muni, v.avaluo_previo,
  v.valuacion_pct, v.derechos, v.simas,
  v.avaluo, v.cnpc, 1000, 103,
  400, 1000, 1000, 200,
  575, 0, 820000, 765, v.notas
FROM core.empresas e
CROSS JOIN (VALUES
  -- interés social (cotizador LDE / Lomas de los Encinos)
  ('interes_social'::text, 165::numeric, 56::numeric, 0::numeric, 566::numeric, 0.002::numeric, 850::numeric, 0::numeric, 0::numeric, 0::numeric,
   'Cotizador LDE 2026 (interés social).'::text),
  -- residencial medio (cotizador LDS / Lomas del Sol y del Valle)
  ('residencial_medio', 271, 0, 450, 594, 0.0018, 1132, 300, 600, 0,
   'Cotizador LDS 2026 (residencial medio).')
) AS v(categoria, cert, copias, forma_isai_muni, avaluo_previo, valuacion_pct, derechos, simas, avaluo, cnpc, notas)
WHERE e.slug = 'dilesa';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Tabulador (compraventa + apertura) — mismo para ambas categorías, con los
--    topes reales del cotizador (35,422 arriba de los umbrales).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO dilesa.gastos_notariales_tabulador
  (config_id, empresa_id, tipo, orden, limite_inferior, limite_superior, valor_beneficio, valor_particular)
SELECT c.id, c.empresa_id, v.tipo, v.orden, v.inf, v.sup, v.benef, v.part
FROM dilesa.gastos_notariales_config c
JOIN core.empresas e ON e.id = c.empresa_id AND e.slug = 'dilesa'
CROSS JOIN (VALUES
  -- COMPRAVENTA (por valor de escrituración) — beneficio = columna DILESA
  ('compraventa'::text, 1, 0.01::numeric, 57750::numeric, 2683::numeric, 5345::numeric),
  ('compraventa', 2, 57750.01, 115500, 3351, 6682),
  ('compraventa', 3, 115500.01, 231000, 4019, 8018),
  ('compraventa', 4, 231000.01, 346500, 4683, 9354),
  ('compraventa', 5, 346500.01, 462000, 5355, 10690),
  ('compraventa', 6, 462000.01, 577500, 6023, 12027),
  ('compraventa', 7, 577500.01, 693000, 6692, 13363),
  ('compraventa', 8, 693000.01, 808500, 7360, 14699),
  ('compraventa', 9, 808500.01, 924000, 8028, 16036),
  ('compraventa', 10, 924000.01, 1039500, 8696, 17372),
  ('compraventa', 11, 1039500.01, 1155000, 9364, 18708),
  ('compraventa', 12, 1155000.01, 1386000, 10701, 21381),
  ('compraventa', 13, 1386000.01, 1559250, 11369, 22717),
  ('compraventa', 14, 1559250.01, 1617000, 12037, 24053),
  ('compraventa', 15, 1617000.01, 1732500, 12705, 25390),
  ('compraventa', 16, 1732500.01, NULL, 35422, 35422), -- tope superior real del cotizador
  -- APERTURA DE CRÉDITO (por monto de crédito) — beneficio = columna DILESA
  ('apertura', 1, 0.01, 57750, 1356, 1336.30),
  ('apertura', 2, 57750.01, 173250, 2693, 2672.60),
  ('apertura', 3, 173250.01, 288750, 4029, 4008.90),
  ('apertura', 4, 288750.01, 404250, 5365, 5345.20),
  ('apertura', 5, 404250.01, 519750, 6702, 6681.50),
  ('apertura', 6, 519750.01, 635250, 8038, 8017.80),
  ('apertura', 7, 635250.01, 750750, 9374, 9354.10),
  ('apertura', 8, 750750.01, 866250, 10710, 10690.40),
  ('apertura', 9, 866250.01, 981750, 12047, 12026.70),
  ('apertura', 10, 981750.01, 1097250, 13383, 13363.00),
  ('apertura', 11, 1097250.01, 1212750, 14719, 14699.30),
  ('apertura', 12, 1212750.01, 1328250, 16056, 16035.60),
  ('apertura', 13, 1328250.01, 1443750, 17392, 17371.90),
  ('apertura', 14, 1443750.01, 1559250, 18728, 18708.20),
  ('apertura', 15, 1559250.01, 1674750, 20065, 20044.50),
  ('apertura', 16, 1674750.01, 1732500, 21401, 21380.80),
  ('apertura', 17, 1732500.01, 1848000, 22737, 22717.10),
  ('apertura', 18, 1848000.01, 2310000, 24073, 24053.40),
  ('apertura', 19, 2310000.01, NULL, 35422, 35422) -- tope superior real del cotizador
) AS v(tipo, orden, inf, sup, benef, part)
WHERE c.anio = 2026
ON CONFLICT (config_id, tipo, orden) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
