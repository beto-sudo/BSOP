-- B.1.extra legacy cleanup — Plan A (reversible archive)
-- Rationale: RDB modules not in direct operation yet; all 4 legacy tables have
-- erp.* equivalents with rdb.* proxy views already wired up. v_waitry_*_30d are
-- obsolete Coda-era artifacts with no data or app references.
--
-- Reversibility: tables renamed (not dropped). Revert via
--   ALTER TABLE rdb.{name}_archive_2026_04_17 RENAME TO {name}_legacy;
-- Views are dropped (recoverable from migration history if ever needed).

BEGIN;

-- 1) Archive legacy tables (keeps indexes, triggers, RLS policies intact)
ALTER TABLE rdb.corte_conteo_denominaciones_legacy
  RENAME TO corte_conteo_denominaciones_archive_2026_04_17;

ALTER TABLE rdb.ordenes_compra_legacy
  RENAME TO ordenes_compra_archive_2026_04_17;

ALTER TABLE rdb.proveedores_legacy
  RENAME TO proveedores_archive_2026_04_17;

ALTER TABLE rdb.requisiciones_legacy
  RENAME TO requisiciones_archive_2026_04_17;

-- 2) Drop Coda-era 30-day filter views (no data, no app consumers)
DROP VIEW IF EXISTS rdb.v_waitry_pagos_30d;
DROP VIEW IF EXISTS rdb.v_waitry_pedidos_30d;
DROP VIEW IF EXISTS rdb.v_waitry_productos_30d;

COMMIT;;
