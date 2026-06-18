-- ╭─ 20260617215833_dilesa_cuadratura_columnas_desglose ─╮
-- Sprint 2 de la iniciativa dilesa-cuadratura-sobreprecio (ADR-045): columnas
-- nuevas para DESGLOSAR la cuadratura de gastos de escrituración. Hoy la
-- promoción y el sobreprecio se mezclan en `descuento_*`, lo que subestima la
-- utilidad de DILESA. Estas columnas separan los conceptos. DDL pura (columnas
-- nullable): NO mueve dinero ni toca datos existentes — el backfill va aparte.
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión).

BEGIN;

-- Cadena de formación del precio (congelada al asignar; ADR-045 §D3):
--   precio_base + incremento_credito + sobreprecio_adicionales = valor_escrituracion
ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS precio_base numeric,
  ADD COLUMN IF NOT EXISTS incremento_credito numeric,
  ADD COLUMN IF NOT EXISTS sobreprecio_adicionales numeric,
  ADD COLUMN IF NOT EXISTS promocion_gastos_monto numeric;

COMMENT ON COLUMN dilesa.ventas.precio_base IS
  'Precio base de asignación, congelado al asignar (no el genérico vigente del prototipo). Cadena de precio: precio_base + incremento_credito + sobreprecio_adicionales = valor_escrituracion. ADR-045.';
COMMENT ON COLUMN dilesa.ventas.incremento_credito IS
  'Incremento por tipo de crédito embebido en el precio (+6% FOVISSSTE/IMSS via tipos_credito.costo_venta_adicional_pct), congelado al asignar. ADR-045.';
COMMENT ON COLUMN dilesa.ventas.sobreprecio_adicionales IS
  'Sobreprecio por productos adicionales que el crédito paga y fondea gastos de escrituración (no le cuesta a DILESA). Antes mezclado en descuento_*. ADR-045.';
COMMENT ON COLUMN dilesa.ventas.promocion_gastos_monto IS
  'Monto de la promoción/bono de gastos de escrituración aplicada (de dilesa.promociones por prototipo, via promocion_id), congelado al asignar. Es costo de DILESA. Antes mezclado en descuento_gastos_escrituracion. ADR-045.';

-- Recarga el cache de PostgREST (columnas nuevas en tabla referenciada por embeds).
NOTIFY pgrst, 'reload schema';

COMMIT;
