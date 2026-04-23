-- Sprint 2 (Sec DB) — force security_invoker=on on all existing views.
--
-- EDITED 2026-04-23 (drift-1.5): wrap each ALTER VIEW with a to_regclass()
-- guard so a fresh DB (Preview Branch / dev local) without the upstream
-- ambient views (rdb.* compatibility shims, playtomic / waitry-derived views)
-- does not fail. Views that don't exist were never created against a fresh
-- DB chain — there's nothing to harden.
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

DO $$
DECLARE
  v text;
  vs text[] := ARRAY[
    'erp.v_empleados_full',
    'playtomic.v_ocupacion_diaria',
    'playtomic.v_revenue_diario',
    'playtomic.v_top_players',
    'rdb.corte_conteo_denominaciones',
    'rdb.ordenes_compra',
    'rdb.proveedores',
    'rdb.requisiciones',
    'rdb.v_corte_conteo_totales',
    'rdb.v_cortes_lista',
    'rdb.v_cortes_totales',
    'rdb.v_inv_stock_actual',
    'rdb.v_inventario_stock',
    'rdb.v_productos_grupo',
    'rdb.v_waitry_pedidos_reversa_sospechosa',
    'rdb.v_waitry_pending_duplicates'
  ];
BEGIN
  FOREACH v IN ARRAY vs LOOP
    IF to_regclass(v) IS NOT NULL THEN
      EXECUTE format('ALTER VIEW %s SET (security_invoker = on)', v);
    END IF;
  END LOOP;
END $$;
