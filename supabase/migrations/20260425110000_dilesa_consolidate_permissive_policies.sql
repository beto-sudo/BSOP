-- Sprint 4D §2 — Consolidate permissive policies en dilesa.*
--
-- Síntoma:
--   Performance advisor reportaba 31 instancias de
--   `multiple_permissive_policies` en schema `dilesa`. Cada tabla tenía
--   dos policies permissive activas en el path SELECT:
--
--     <tabla>_select  FOR SELECT  USING ((deleted_at IS NULL) AND <empresa scoping>)
--     <tabla>_write   FOR ALL     USING (<empresa scoping>)
--
--   PostgreSQL OR'ea ambas en cada SELECT (porque FOR ALL incluye
--   SELECT), lo cual:
--
--     1. Anulaba el filtro `deleted_at IS NULL` — bug latente: los
--        SELECTs como `authenticated` devolvían registros soft-deleted
--        cuando el predicado de empresa_id matcheaba en el _write.
--     2. Duplicaba la evaluación del helper RLS por fila.
--
-- Fix:
--   Para cada tabla, drop la policy `_write` FOR ALL y crear tres
--   policies separadas: `_insert`, `_update`, `_delete`. La policy
--   `_select` queda intacta y pasa a ser la única que sirve el path
--   SELECT — incluyendo el filtro de soft delete. Mismo idiom que
--   db_perf_surgical.sql §3 aplicó para `rdb.productos_waitry_map`
--   y `rdb.waitry_duplicate_candidates`.
--
-- Baseline 2026-04-25 (verificado contra prod antes de aplicar):
--   • 31 tablas afectadas en `dilesa` (verificado vía pg_policies).
--   • 9 son catálogo con `empresa_id` NULLABLE (ver `catalog_tables`);
--     22 son operativas con `empresa_id` NOT NULL.
--   • 0 rows con `deleted_at IS NOT NULL` en las 31 tablas → cero
--     impacto operativo, fix puramente defensivo (cierra bug latente).
--   • UI lane (`app/dilesa`, `components/dilesa`) ya filtra
--     `.is('deleted_at', null)` en todas las queries de listado —
--     defense-in-depth, sin regression.
--   • `app/api/dilesa/anteproyectos/[id]/convertir/route.ts` usa el
--     cliente `admin` (service_role), que bypassa RLS — el check de
--     `deleted_at` en server-side sigue funcionando idéntico.
--   • 0 policies pre-existentes con sufijo `_insert/_update/_delete`
--     en `dilesa` → ningún DROP POLICY necesario antes de crear.
--
-- Approach:
--   DO block dinámico que itera `pg_policies` para descubrir las tablas
--   con `_write FOR ALL`. La lista `catalog_tables` queda hardcoded
--   porque distingue `empresa_id` nullable. Si aparece una tabla nueva
--   en `dilesa` con el patrón viejo después de este migration,
--   re-ejecutar el script regenera el patrón correcto idempotentemente.
--   El `stem` se deriva del `policyname` (no del tablename) para
--   respetar el truncamiento histórico de
--   `anteproyectos_prototipos_referencia` (cuyo policy stem es
--   `anteproyectos_prototipos_ref`, no el nombre completo de la tabla).

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
$do$;
