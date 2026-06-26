-- ╭─ 20260626175720_dilesa_ventas_gastos_notariales_propiedad ─╮
-- Iniciativa dilesa-gastos-notariales · Sprint 3 · integración fase 8.
-- Dos columnas en dilesa.ventas para el cálculo de gastos notariales:
--   tiene_propiedad: ¿algún derechohabiente ya tiene propiedad a su nombre?
--     (elige la columna del tabulador de compraventa: con propiedad = cuota
--      plena; sin propiedad = beneficio 50%). Default false (el caso común).
--   gastos_notariales_desglose: snapshot jsonb del desglose calculado al cerrar
--     la dictaminación (auditoría: congela cómo se llegó al monto, aunque las
--     tarifas cambien después). Patrón espejo de desglose_precio.
--
-- Aditivo puro: 2 columnas nullable, no reescriben la tabla ni afectan otras
-- empresas. NO toca cuadratura ni precio (línea roja de la iniciativa).

BEGIN;

ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS tiene_propiedad boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gastos_notariales_desglose jsonb;

COMMENT ON COLUMN dilesa.ventas.tiene_propiedad IS
  '¿Algún derechohabiente ya tiene propiedad a su nombre? Elige la columna del tabulador de compraventa de gastos notariales. Iniciativa dilesa-gastos-notariales.';
COMMENT ON COLUMN dilesa.ventas.gastos_notariales_desglose IS
  'Snapshot del desglose de gastos notariales calculado al cerrar la dictaminación (auditoría). Iniciativa dilesa-gastos-notariales.';

-- Recarga el cache de PostgREST (columnas nuevas expuestas vía supabase-js):
NOTIFY pgrst, 'reload schema';

COMMIT;
