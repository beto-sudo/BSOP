-- ════════════════════════════════════════════════════════════════════════════
-- SCHEMA BOOTSTRAP — corre antes que cualquier otra migración
-- ════════════════════════════════════════════════════════════════════════════
--
-- Timestamp deliberadamente más antiguo que cualquier migración existente para
-- que Supabase lo aplique PRIMERO al provisionar una DB fresca (Preview Branch,
-- dev local, DR).
--
-- Problema que resuelve:
--   Varios schemas de la aplicación (`erp`, `health`, `dilesa`, `maquinaria`,
--   `waitry`, `caja`, `inventario`) fueron creados en prod vía dashboard antes
--   de existir migration tracking. Migraciones que los referencian asumen que
--   ya existen — rompen con "schema X does not exist" en branches frescas.
--
--   El bootstrap anterior (20260101000001_pre_migration_bootstrap.sql) sólo
--   cubre `core`, `shared`, `rdb`, `playtomic`. Esta migración garantiza los
--   11 schemas existan desde el primer tick de la cadena.
--
-- Convenciones:
--   * `CREATE SCHEMA IF NOT EXISTS` — idempotente. En prod es no-op puro.
--   * Sólo CREATE SCHEMA: tablas, GRANTs, índices, policies los hacen las
--     migraciones originales sin cambios.
--   * No se eliminan las líneas `CREATE SCHEMA IF NOT EXISTS` de migraciones
--     posteriores: son defensivas, duplicadas y seguras.
--
-- Ver supabase/GOVERNANCE.md §1 — migraciones reproducibles desde cero.

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS shared;
CREATE SCHEMA IF NOT EXISTS rdb;
CREATE SCHEMA IF NOT EXISTS playtomic;
CREATE SCHEMA IF NOT EXISTS erp;
CREATE SCHEMA IF NOT EXISTS health;
CREATE SCHEMA IF NOT EXISTS dilesa;
CREATE SCHEMA IF NOT EXISTS maquinaria;
CREATE SCHEMA IF NOT EXISTS waitry;
CREATE SCHEMA IF NOT EXISTS caja;
CREATE SCHEMA IF NOT EXISTS inventario;

NOTIFY pgrst, 'reload schema';
