-- ============================================================
-- ERP DILESA: Accionistas support
-- Migration: 20260414000013_erp_dilesa_accionistas.sql
-- Date: 2026-04-14
-- Description:
--   Adds 'accionista' to erp.personas.tipo CHECK constraint
--   so the DILESA HR import can correctly classify shareholders
--   (identified via "Pertenece a:" column in Coda grid-rCQIDVP9Qq).
--
--   Real data: 17 accionistas / 27 empleados / 38 sin tipo
--   in the 82-row Personal table of doc ZNxWl_DI2D.
-- ============================================================

-- Drop the existing tipo CHECK (auto-named by Postgres from v3 migration).
-- Use DO block so re-running is safe if constraint was already updated.
DO $$ BEGIN
  ALTER TABLE erp.personas DROP CONSTRAINT personas_tipo_check;
EXCEPTION WHEN undefined_object THEN
  NULL; -- already dropped or renamed
END $$;

-- Recreate with accionista included.
ALTER TABLE erp.personas
  ADD CONSTRAINT personas_tipo_check
  CHECK (tipo IN ('empleado', 'proveedor', 'cliente', 'accionista', 'general'));

COMMENT ON COLUMN erp.personas.tipo IS
  'Clasificación primaria: empleado, proveedor, cliente, accionista, general. '
  'Una persona puede vincularse a múltiples roles vía tablas de vínculo (erp.empleados, erp.proveedores, etc.).';
