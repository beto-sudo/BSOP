-- ============================================================
-- B.1.extra.b — rdb.v_cortes_productos
--
-- Per-product sales aggregates scoped to an RDB (Waitry POS) corte.
-- Joins waitry_productos ↔ waitry_pedidos via order_id, groups by
-- corte_id × product_id, sums quantity and importe.
--
-- Context:
--   * `rdb.cortes` was a ghost relation (never created in phase-2);
--     the canonical proxy is `rdb.v_cortes_lista`. This view replaces
--     a stale TODO in app/rdb/cortes/page.tsx where reads were typed as
--     `.schema('rdb' as any).from('v_cortes_productos')`.
--   * Filtering on `corte_id IS NOT NULL` and excluding cancelled
--     orders matches the existing `v_cortes_totales` convention.
--
-- Performance:
--   Relies on the partial index `rdb_waitry_pedidos_corte_id_idx`
--   (CREATE INDEX ... ON rdb.waitry_pedidos (corte_id) WHERE corte_id IS NOT NULL)
--   already created in a prior migration.
--
-- Security posture:
--   security_invoker = true  — the view runs under the caller's role,
--   so RLS on the underlying tables is enforced per-user. This keeps
--   Supabase's `security_definer_view` advisor green and avoids the
--   privilege escalation foot-gun of the default SECURITY DEFINER.
--
-- Applied to production DB on 2026-04-17 via Supabase MCP
-- (apply_migration). This file archives that DDL for reproducibility.
-- ============================================================

-- EDITED 2026-04-23 (drift-1.5): rdb.waitry_* ambient.
DO $do$
BEGIN
  IF to_regclass('rdb.waitry_productos') IS NULL OR to_regclass('rdb.waitry_pedidos') IS NULL THEN
    RETURN;
  END IF;

  DROP VIEW IF EXISTS rdb.v_cortes_productos;

  EXECUTE $sql$
    CREATE VIEW rdb.v_cortes_productos
    WITH (security_invoker = true)
    AS
      SELECT
        wp.corte_id,
        wpp.product_id,
        wpp.product_name                                  AS producto_nombre,
        SUM(wpp.quantity)                                 AS cantidad_vendida,
        SUM(
          COALESCE(
            wpp.total_price,
            wpp.unit_price * wpp.quantity,
            0::numeric
          )
        )                                                 AS importe_total
      FROM rdb.waitry_productos wpp
      JOIN rdb.waitry_pedidos   wp ON wp.order_id = wpp.order_id
      WHERE wp.corte_id IS NOT NULL
        AND wp.status IS DISTINCT FROM 'order_canceled'
      GROUP BY wp.corte_id, wpp.product_id, wpp.product_name
  $sql$;

  GRANT SELECT ON rdb.v_cortes_productos TO anon, authenticated, service_role;

  COMMENT ON VIEW rdb.v_cortes_productos IS
    'Per-product sales aggregates per RDB corte (Waitry POS). security_invoker=true; '
    'enforces RLS of the caller against waitry_pedidos/waitry_productos. See '
    'app/rdb/cortes/page.tsx for consumer.';
END $do$;
