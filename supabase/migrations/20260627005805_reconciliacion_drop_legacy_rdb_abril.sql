-- ╭─ 20260627005805_reconciliacion_drop_legacy_rdb_abril ─╮
-- Sprint 0.5 de `derivados-sin-drift` (cat C — toca prod). Resabios de la
-- consolidación rdb de abril 2026 (GOVERNANCE §5): 5 vistas de compat + 4 tablas
-- archive que prod conserva pero el repo NO recrea (los no-op stubs de abril no
-- las reproducen). Verificado: cero dependientes vivos (pg_depend = 0); el código
-- RDB usa erp.* (no estas vistas); las únicas FK a las archive son internas.
-- Backup de las 3 archive con datos tomado antes de aplicar (ordenes_compra=160,
-- requisiciones=188, proveedores=30; corte_conteo_denominaciones_archive=0 vacía).
-- Sin CASCADE: si algo dependiera inesperadamente, falla y se detiene.

BEGIN;

-- Vistas de compat primero (pueden depender de las tablas archive).
DROP VIEW IF EXISTS rdb.ordenes_compra;
DROP VIEW IF EXISTS rdb.requisiciones;
DROP VIEW IF EXISTS rdb.proveedores;
DROP VIEW IF EXISTS rdb.corte_conteo_denominaciones;
DROP VIEW IF EXISTS rdb.v_waitry_pending_duplicates;

-- Tablas archive: orden hijo→padre por las FK internas
-- (ordenes_compra_archive → proveedores_archive / requisiciones_archive).
DROP TABLE IF EXISTS rdb.ordenes_compra_archive_2026_04_17;
DROP TABLE IF EXISTS rdb.requisiciones_archive_2026_04_17;
DROP TABLE IF EXISTS rdb.proveedores_archive_2026_04_17;
DROP TABLE IF EXISTS rdb.corte_conteo_denominaciones_archive_2026_04_17;

NOTIFY pgrst, 'reload schema';

COMMIT;
