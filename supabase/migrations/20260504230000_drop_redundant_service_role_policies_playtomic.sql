-- Drop policies redundantes detectadas por drift-check.sql:
-- service_role bypassa RLS automáticamente, así que las policies
-- `* FOR ALL TO service_role USING (true)` son ruido. Las introdujimos en
-- las migraciones de S1 (payment_assignments) y S2-CSV (payments_import)
-- siguiendo el patrón histórico de `20260418020117_rls_rdb_playtomic_cleanup`,
-- pero el linter actual del repo prefiere no agregarlas en migraciones nuevas.
--
-- Net effect: cero cambio funcional. service_role sigue pudiendo escribir/leer
-- ambas tablas porque bypassa RLS sin policies.

BEGIN;

DROP POLICY IF EXISTS payment_assignments_service_role
  ON playtomic.payment_assignments;

DROP POLICY IF EXISTS payments_import_service_role
  ON playtomic.payments_import;

NOTIFY pgrst, 'reload schema';

COMMIT;
