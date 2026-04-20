-- Drop tabla snapshot temporal que ya cumplió su función.
-- La info se consolidó en las tablas health_* definitivas.
-- Además cerraba un advisor de seguridad (RLS Disabled in Public).

DROP TABLE IF EXISTS public.health_ingest_snapshot_2025_pre;
