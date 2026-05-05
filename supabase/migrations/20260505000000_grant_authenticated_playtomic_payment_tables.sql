-- Otorga GRANTs faltantes a `authenticated` y `service_role` en las tablas
-- nuevas de S1 + S2-CSV. Sin estos GRANTs, las queries del cliente
-- supabase-js fallan con "permission denied for table" ANTES de evaluar RLS.
--
-- Confirmado en producción al hacer el primer upload del CSV: el server
-- action falló con "Error consultando existentes: permission denied for table
-- payments_import". Las RLS policies estaban definidas pero no se llegaban a
-- evaluar — Postgres rechaza primero por GRANT a nivel tabla.
--
-- Patrón: mismo grant que ya tiene `playtomic.bookings` (verificado via
-- information_schema.table_privileges). Sin `anon` — estas tablas son
-- privadas, sin acceso anónimo.

BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON playtomic.payment_assignments
  TO authenticated;

GRANT ALL
  ON playtomic.payment_assignments
  TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON playtomic.payments_import
  TO authenticated;

GRANT ALL
  ON playtomic.payments_import
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
