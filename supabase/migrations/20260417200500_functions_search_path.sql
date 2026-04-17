-- Sprint 2 (Sec DB) — pin search_path on 17 functions flagged as
-- `function_search_path_mutable` by the Supabase database linter.
--
-- Context
-- -------
-- A Postgres function without `SET search_path = ...` inherits the
-- caller's search_path. If an attacker can create a schema named
-- `public` (or any schema earlier in the path) and define a shim
-- function/table there, they can hijack calls made through the
-- original — classic search-path injection. The fix is to pin the
-- path to a known set of trusted schemas on each function.
--
-- Pattern
-- -------
-- Every ALTER below uses `SET search_path = pg_catalog, <home>, public`
-- (plus extra schemas where the function is known to reach across).
-- `pg_catalog` is always first so system functions can't be shadowed.
-- `public` is kept because several helpers call `now()`, `gen_random_uuid()`,
-- etc. via the `extensions` schema re-exposed in `public`.
--
-- Safety / rollback
-- -----------------
--   * Pure metadata change on each function; no data touched.
--   * Each ALTER takes an AccessExclusiveLock on the specific function
--     (milliseconds) — concurrent callers retry transparently.
--   * Reversible with `ALTER FUNCTION <fn>(<args>) RESET search_path;`
--     per row if anything blows up.
--
-- If a function is still flagged by the advisor after this migration,
-- it means either (a) the argument signature in the ALTER didn't match
-- an overload, or (b) a new function was added after this migration
-- ran. Re-run the advisor query to find the offender.

-- ── core ────────────────────────────────────────────────────────────────
ALTER FUNCTION core.fn_set_updated_at()  SET search_path = pg_catalog, core, public;
ALTER FUNCTION core.set_updated_at()     SET search_path = pg_catalog, core, public;

-- ── erp ─────────────────────────────────────────────────────────────────
ALTER FUNCTION erp.fn_set_updated_at()                    SET search_path = pg_catalog, erp, public;
ALTER FUNCTION erp.fn_tasks_completado()                  SET search_path = pg_catalog, erp, public;
ALTER FUNCTION erp.fn_trg_mantenimiento_inventario()      SET search_path = pg_catalog, erp, public;
ALTER FUNCTION erp.fn_trg_waitry_pedidos_cancel()         SET search_path = pg_catalog, erp, rdb, public;
ALTER FUNCTION erp.fn_trg_waitry_to_movimientos()         SET search_path = pg_catalog, erp, rdb, public;

-- ── playtomic ───────────────────────────────────────────────────────────
ALTER FUNCTION playtomic.set_updated_at()                 SET search_path = pg_catalog, playtomic, public;

-- ── rdb ─────────────────────────────────────────────────────────────────
ALTER FUNCTION rdb.fn_inventario_al_corte(timestamptz)    SET search_path = pg_catalog, rdb, erp, public;
ALTER FUNCTION rdb.generar_folio_oc()                     SET search_path = pg_catalog, rdb, public;
ALTER FUNCTION rdb.generar_folio_requisicion()            SET search_path = pg_catalog, rdb, public;
ALTER FUNCTION rdb.parse_waitry_timestamptz(jsonb, text)  SET search_path = pg_catalog, public;
ALTER FUNCTION rdb.registrar_entrada_inventario()         SET search_path = pg_catalog, rdb, public;
ALTER FUNCTION rdb.set_updated_at()                       SET search_path = pg_catalog, rdb, public;
ALTER FUNCTION rdb.trg_actualizar_ultimo_costo()          SET search_path = pg_catalog, rdb, public;
ALTER FUNCTION rdb.trg_autocierre_corte()                 SET search_path = pg_catalog, rdb, public;
ALTER FUNCTION rdb.trg_procesar_venta_waitry()            SET search_path = pg_catalog, rdb, erp, public;
