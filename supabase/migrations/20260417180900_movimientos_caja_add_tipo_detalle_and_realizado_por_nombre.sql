-- Agrega dos columnas a erp.movimientos_caja:
--   tipo_detalle:         sub-categoría de negocio (caja_negra, propina, retiro_efectivo, etc.)
--                         complementa `tipo` (direccional: entrada/salida/fondo/devolucion).
--   realizado_por_nombre: nombre raw de quien registró el movimiento.
--                         complementa `realizado_por` (uuid FK a erp.empleados) cuando el
--                         empleado no está cargado en la DB (ej. durante sync con Coda).

ALTER TABLE erp.movimientos_caja
  ADD COLUMN IF NOT EXISTS tipo_detalle text,
  ADD COLUMN IF NOT EXISTS realizado_por_nombre text;

COMMENT ON COLUMN erp.movimientos_caja.tipo_detalle IS
  'Sub-categoría de negocio (caja_negra, retiro_efectivo, propina, repartidor, proveedor, aporta_efectivo, etc.). Para reportes. NULL hasta que se poble.';

COMMENT ON COLUMN erp.movimientos_caja.realizado_por_nombre IS
  'Nombre raw de quien registró el movimiento. Útil cuando realizado_por (uuid) no puede resolverse a un empleado. En BSOP nativo se llena automáticamente desde la sesión.';

-- Índice para consultas por tipo_detalle (muy común en reports)
CREATE INDEX IF NOT EXISTS erp_movimientos_caja_tipo_detalle_idx
  ON erp.movimientos_caja (empresa_id, tipo_detalle)
  WHERE tipo_detalle IS NOT NULL;
