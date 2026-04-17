-- Sprint 2 (Sec DB) — force security_invoker=on on all existing views.
--
-- Context
-- -------
-- Supabase's database linter flagged 16 views as running with SECURITY
-- DEFINER behavior (the Postgres default prior to 15, and still the default
-- for unmarked views in 15+). That means queries against these views run
-- with the permissions of the view's *creator* (postgres role) instead of
-- the querying user, silently bypassing RLS on the underlying tables.
--
-- The fix in Postgres 15+ is to mark the view `security_invoker = on`,
-- which makes permission checks use the querying user's privileges — the
-- whole point of RLS.
--
-- There's exactly one view (`rdb.v_cortes_productos`) that already carries
-- this option; the others are untouched from the migrations that created
-- them. This migration brings them into line.
--
-- Safety
-- ------
--   * `ALTER VIEW … SET (security_invoker = on)` rewrites the reloptions
--     on the view metadata only; no data is touched and no locks are taken
--     beyond an AccessExclusiveLock on the view itself (milliseconds).
--   * Queries running against the views during the swap will either use
--     the old behavior (if they started before ALTER commits) or the new
--     behavior — both are valid; they won't fail.
--   * If a caller DID rely on elevated permissions accidentally, they'll
--     now hit an RLS denial. That's intentional: the new behavior exposes
--     what the old one was silently allowing.
--
-- Rollback: `ALTER VIEW <view> RESET (security_invoker);` on any entry.

ALTER VIEW erp.v_empleados_full                         SET (security_invoker = on);
ALTER VIEW playtomic.v_ocupacion_diaria                 SET (security_invoker = on);
ALTER VIEW playtomic.v_revenue_diario                   SET (security_invoker = on);
ALTER VIEW playtomic.v_top_players                      SET (security_invoker = on);
ALTER VIEW rdb.corte_conteo_denominaciones              SET (security_invoker = on);
ALTER VIEW rdb.ordenes_compra                           SET (security_invoker = on);
ALTER VIEW rdb.proveedores                              SET (security_invoker = on);
ALTER VIEW rdb.requisiciones                            SET (security_invoker = on);
ALTER VIEW rdb.v_corte_conteo_totales                   SET (security_invoker = on);
ALTER VIEW rdb.v_cortes_lista                           SET (security_invoker = on);
ALTER VIEW rdb.v_cortes_totales                         SET (security_invoker = on);
ALTER VIEW rdb.v_inv_stock_actual                       SET (security_invoker = on);
ALTER VIEW rdb.v_inventario_stock                       SET (security_invoker = on);
ALTER VIEW rdb.v_productos_grupo                        SET (security_invoker = on);
ALTER VIEW rdb.v_waitry_pedidos_reversa_sospechosa      SET (security_invoker = on);
ALTER VIEW rdb.v_waitry_pending_duplicates              SET (security_invoker = on);
