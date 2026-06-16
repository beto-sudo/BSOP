-- ╭─ 20260616013308_dilesa_ventas_desglose_precio_snapshot ─╮
-- Congela el desglose de precio de cada venta al ASIGNARSE, para que una venta
-- ya asignada nunca se re-tarife en vivo con fn_calcular_precio_venta (que
-- aplica exención ZCU + sobreprecio del crédito, ej. Fovissste +6%).
-- Regla Beto 2026-06-15: las ventas/asignaciones anteriores NO se modifican;
-- las reglas nuevas solo aplican a las próximas asignaciones.
--
-- 1. dilesa.ventas.desglose_precio jsonb — snapshot del cálculo al asignar.
--    · Ventas nuevas: el objeto completo de fn_calcular_precio_venta
--      (componentes_detallados = true).
--    · Históricas (backfill): SOLO el total de contrato (precio_asignacion) +
--      valor_comercial (componentes_detallados = false). No se re-derivan los
--      componentes porque no se capturaron en Coda; re-derivarlos volvería a
--      aplicar las reglas nuevas — justo lo que hay que evitar.
--
-- 2. Backfill SIN ARITMÉTICA: copia directa de precio_asignacion (vino de Coda
--    "Precio De Asignación" o lo congeló BSOP al asignar). NO usa
--    valor_escrituracion (concepto distinto: 82 ventas difieren hasta $1.5M) ni
--    recalcula. Solo donde precio_asignacion IS NOT NULL.
--
-- Lo leen el detalle de venta y el PDF de solicitud-asignación en vez de
-- fn_calcular_precio_venta. La función NO se modifica (sigue sirviendo a
-- inventario y al preview de asignación nueva). El contrato de
-- promesa-compraventa ya usaba precio_asignacion (no cambia). Cuadratura, CxC y
-- comisiones siguen ancladas a sus snapshots (valor_escrituracion /
-- precio_asignacion): este cambio NO toca dinero.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + UPDATE idempotente (solo filas sin
-- snapshot). Robusto a Preview sin datos: el UPDATE simplemente no afecta filas.

BEGIN;

ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS desglose_precio jsonb;

COMMENT ON COLUMN dilesa.ventas.desglose_precio IS
  'Snapshot del desglose de precio congelado al asignar la venta. Evita que fn_calcular_precio_venta re-tarife una venta ya asignada cuando cambian reglas globales (exención ZCU, +6% del crédito). componentes_detallados=true → objeto completo del cálculo (ventas nuevas); =false → solo total de contrato backfilleado de precio_asignacion (históricas). Lo leen el detalle de venta y el PDF de solicitud-asignación; NO toca dinero (cuadratura/CxC anclan a valor_escrituracion/precio_asignacion). Regla Beto 2026-06-15.';

-- Backfill de históricas: copia directa de precio_asignacion, sin aritmética ni
-- recálculo. Solo el total + valor_comercial.
UPDATE dilesa.ventas
SET desglose_precio = jsonb_build_object(
  'precio_venta_total', precio_asignacion,
  'valor_comercial', valor_comercial,
  'origen', 'backfill_contrato',
  'componentes_detallados', false
)
WHERE precio_asignacion IS NOT NULL
  AND desglose_precio IS NULL
  AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
