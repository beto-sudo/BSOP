-- Sprint 2 (Sec DB) — pin search_path on functions flagged as
-- `function_search_path_mutable` by the Supabase database linter.
--
-- EDITED 2026-04-23 (drift-1.5): wrap each ALTER FUNCTION with an existence
-- check. Several rdb.* helper functions are ambient (created via dashboard
-- pre-migration tracking), so on a fresh DB they simply don't exist and
-- nothing needs hardening.
--
-- Context
-- -------
-- A Postgres function without `SET search_path = ...` inherits the caller's
-- search_path. Pinning the path closes a search-path injection vector.

DO $$
DECLARE
  spec text;
  -- One row per function — "schema.fn(args)" || '|' || search_path
  specs text[][] := ARRAY[
    ['core.fn_set_updated_at()',                    'pg_catalog, core, public'],
    ['core.set_updated_at()',                       'pg_catalog, core, public'],
    ['erp.fn_set_updated_at()',                     'pg_catalog, erp, public'],
    ['erp.fn_tasks_completado()',                   'pg_catalog, erp, public'],
    ['erp.fn_trg_mantenimiento_inventario()',       'pg_catalog, erp, public'],
    ['erp.fn_trg_waitry_pedidos_cancel()',          'pg_catalog, erp, rdb, public'],
    ['erp.fn_trg_waitry_to_movimientos()',          'pg_catalog, erp, rdb, public'],
    ['playtomic.set_updated_at()',                  'pg_catalog, playtomic, public'],
    ['rdb.fn_inventario_al_corte(timestamptz)',     'pg_catalog, rdb, erp, public'],
    ['rdb.generar_folio_oc()',                      'pg_catalog, rdb, public'],
    ['rdb.generar_folio_requisicion()',             'pg_catalog, rdb, public'],
    ['rdb.parse_waitry_timestamptz(jsonb, text)',   'pg_catalog, public'],
    ['rdb.registrar_entrada_inventario()',          'pg_catalog, rdb, public'],
    ['rdb.set_updated_at()',                        'pg_catalog, rdb, public'],
    ['rdb.trg_actualizar_ultimo_costo()',           'pg_catalog, rdb, public'],
    ['rdb.trg_autocierre_corte()',                  'pg_catalog, rdb, public'],
    ['rdb.trg_procesar_venta_waitry()',             'pg_catalog, rdb, erp, public']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(specs, 1) LOOP
    -- to_regprocedure resolves a function signature to its OID, or NULL
    -- if it does not exist. Safer than catching exceptions and matches
    -- the to_regclass pattern used elsewhere in this sprint.
    IF to_regprocedure(specs[i][1]) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = %s', specs[i][1], specs[i][2]);
    END IF;
  END LOOP;
END $$;
