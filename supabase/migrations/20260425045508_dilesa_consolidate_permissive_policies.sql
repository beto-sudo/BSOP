DO $do$
DECLARE
  r record;
  catalog_tables text[] := ARRAY[
    'clasificacion_inmobiliaria','etapas_construccion','fases_inventario',
    'fases_urbanizacion','forma_pago','tipo_credito','tipo_deposito',
    'tipo_proyecto','tipo_trabajo'
  ];
  predicate text;
  stem text;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'dilesa'
      AND policyname LIKE '%_write'
      AND cmd = 'ALL'
      AND 'authenticated' = ANY(roles)
    ORDER BY tablename
  LOOP
    IF to_regclass('dilesa.'||r.tablename) IS NULL THEN
      CONTINUE;
    END IF;

    IF r.tablename = ANY(catalog_tables) THEN
      predicate := '((empresa_id IS NULL) OR core.fn_has_empresa(empresa_id) OR core.fn_is_admin())';
    ELSE
      predicate := '(core.fn_has_empresa(empresa_id) OR core.fn_is_admin())';
    END IF;

    stem := regexp_replace(r.policyname, '_write$', '');

    EXECUTE format('DROP POLICY IF EXISTS %I ON dilesa.%I',
      r.policyname, r.tablename);

    EXECUTE format(
      'CREATE POLICY %I ON dilesa.%I FOR INSERT TO authenticated WITH CHECK %s',
      stem||'_insert', r.tablename, predicate);

    EXECUTE format(
      'CREATE POLICY %I ON dilesa.%I FOR UPDATE TO authenticated USING %s WITH CHECK %s',
      stem||'_update', r.tablename, predicate, predicate);

    EXECUTE format(
      'CREATE POLICY %I ON dilesa.%I FOR DELETE TO authenticated USING %s',
      stem||'_delete', r.tablename, predicate);
  END LOOP;
END
$do$;;
