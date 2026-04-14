-- Rename legacy rdb base tables to *_legacy while keeping compatibility views
-- so any remaining functions/views/UI references to old names do not break.

DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY[
    'productos',
    'proveedores',
    'cajas',
    'inventario_movimientos',
    'requisiciones',
    'requisiciones_items',
    'ordenes_compra',
    'ordenes_compra_items',
    'cortes',
    'movimientos',
    'corte_conteo_denominaciones'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    IF to_regclass(format('rdb.%I', tbl)) IS NOT NULL
       AND to_regclass(format('rdb.%I', tbl || '_legacy')) IS NULL THEN
      EXECUTE format('ALTER TABLE rdb.%I RENAME TO %I', tbl, tbl || '_legacy');
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY[
    'productos',
    'proveedores',
    'cajas',
    'inventario_movimientos',
    'requisiciones',
    'requisiciones_items',
    'ordenes_compra',
    'ordenes_compra_items',
    'cortes',
    'movimientos',
    'corte_conteo_denominaciones'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    IF to_regclass(format('rdb.%I', tbl || '_legacy')) IS NOT NULL THEN
      EXECUTE format('DROP VIEW IF EXISTS rdb.%I', tbl);
      EXECUTE format('CREATE VIEW rdb.%I AS SELECT * FROM rdb.%I', tbl, tbl || '_legacy');
      EXECUTE format('COMMENT ON VIEW rdb.%I IS %L', tbl, 'Compatibility shim over rdb.' || tbl || '_legacy after ERP migration.');
      EXECUTE format('GRANT SELECT ON rdb.%I TO anon', tbl);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON rdb.%I TO authenticated, service_role', tbl);
    END IF;
  END LOOP;
END
$$;
