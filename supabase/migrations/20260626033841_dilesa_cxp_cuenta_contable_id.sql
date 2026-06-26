-- ╭─ 20260626033841_dilesa_cxp_cuenta_contable_id ─╮
-- Iniciativa dilesa-catalogo-contable · Sprint 2 · ligar CxP al catálogo.
-- Agrega la clasificación contable (opcional) a los egresos que ya pasan por
-- CxP: una cuenta del catálogo erp.cuentas_contables por factura/gasto.
--
-- Nullable y aditivo: no rompe captura existente; la liga se va poblando desde
-- la UI (selector de cuenta, Sprint 3) y, en una fase posterior, por
-- auto-sugerencia. Requiere erp.cuentas_contables (Sprint 1).

BEGIN;

-- Factura (CFDI de egreso que entra por CxP).
ALTER TABLE erp.facturas
  ADD COLUMN IF NOT EXISTS cuenta_contable_id uuid REFERENCES erp.cuentas_contables (id);

-- Gasto operativo (suelto / directo).
ALTER TABLE erp.gastos
  ADD COLUMN IF NOT EXISTS cuenta_contable_id uuid REFERENCES erp.cuentas_contables (id);

-- Índices parciales: solo las filas ya clasificadas (la mayoría arranca en NULL).
CREATE INDEX IF NOT EXISTS idx_facturas_cuenta_contable
  ON erp.facturas (cuenta_contable_id) WHERE cuenta_contable_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gastos_cuenta_contable
  ON erp.gastos (cuenta_contable_id) WHERE cuenta_contable_id IS NOT NULL;

-- Recarga el cache de PostgREST (columnas nuevas expuestas vía supabase-js):
NOTIFY pgrst, 'reload schema';

COMMIT;
