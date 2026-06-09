-- ╭─ 20260609204834_dilesa_cuadratura_inputs ─╮
-- Sprint 2 (dilesa-ventas-expediente) — entradas de la cuadratura.
--
-- (Aplicada a prod vía MCP apply_migration por drift de historial heredado
--  de RUV; versión = ledger remoto.)
--
-- Para que el motor de cuadratura (lib/dilesa/cuadratura.ts) compute exacto en
-- vez de aproximar, capturamos/importamos las entradas que hoy faltan:
--   - los 4 buckets de descuento otorgado (hoy solo existe el total),
--   - el apoyo de Infonavit a gastos de escrituración (por tipo de crédito),
--   - el tope de descuento autorizado (Promociones Ventas).
--
-- Aditiva: 6 columnas numeric nullable en dilesa.ventas. Sin RBAC (el panel de
-- Cuadratura vive dentro de dilesa.ventas, ya gobernado).

BEGIN;

ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS descuento_precio numeric,
  ADD COLUMN IF NOT EXISTS descuento_equipamiento numeric,
  ADD COLUMN IF NOT EXISTS descuento_gastos_escrituracion numeric,
  ADD COLUMN IF NOT EXISTS descuento_nota_credito numeric,
  ADD COLUMN IF NOT EXISTS apoyo_infonavit numeric,
  ADD COLUMN IF NOT EXISTS descuento_maximo_autorizado numeric;

COMMENT ON COLUMN dilesa.ventas.descuento_precio IS
  'Descuento otorgado al precio (Coda: "Descuento Otorgado Precio"). Bucket de Descuento Otorgado Total.';
COMMENT ON COLUMN dilesa.ventas.descuento_equipamiento IS
  'Descuento otorgado en equipamiento (Coda: "Descuento Otorgado Equipamiento").';
COMMENT ON COLUMN dilesa.ventas.descuento_gastos_escrituracion IS
  'Descuento otorgado en gastos de escrituración (Coda: "Descuento Otorgado Gastos Escrituración").';
COMMENT ON COLUMN dilesa.ventas.descuento_nota_credito IS
  'Descuento otorgado vía nota de crédito (Coda: "Descuento Otorgado Nota de Credito").';
COMMENT ON COLUMN dilesa.ventas.apoyo_infonavit IS
  'Apoyo del Infonavit a gastos de escrituración, según tipo de crédito (Coda: "Apoyo Escrituración Infonavit"). Entra al cálculo del cheque a notaría.';
COMMENT ON COLUMN dilesa.ventas.descuento_maximo_autorizado IS
  'Tope de descuento autorizado por promociones (Coda: "Descuento máximo Autorizado").';

NOTIFY pgrst, 'reload schema';

COMMIT;
