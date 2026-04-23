-- Sprint drift-1 · Mig 1 (aplicada post-confirmación de beto 2026-04-22)
-- Drop del experimento Splitwise/travel descontinuado. Beto confirmó que
-- el módulo completo de viajes (app/travel, app/compartir, components/travel,
-- data/site.ts) se elimina en el mismo PR. No hay callers después de este commit.

DROP TABLE IF EXISTS public.expense_splits    CASCADE;
DROP TABLE IF EXISTS public.trip_share_tokens CASCADE;
DROP TABLE IF EXISTS public.trip_expenses     CASCADE;
DROP TABLE IF EXISTS public.trip_participants CASCADE;
