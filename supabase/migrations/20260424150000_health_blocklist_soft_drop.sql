-- ADR-002 · Health ingest blocklist: soft drop
-- Cambia la regla `source IS NULL OR source = ''` de RAISE EXCEPTION a RETURN NULL.
-- Motivo: el RAISE EXCEPTION abortaba el batch entero de /api/health/ingest,
-- causando pérdida colateral de filas válidas (Sleep * del 22/04-24/04).
-- Queda consistente con las otras reglas del mismo trigger (Test Watch, Dietary Water).
-- Ver supabase/adr/002_health_ingest_soft_drop.md para detalle del incidente.

CREATE OR REPLACE FUNCTION health.fn_reject_noisy_ingest()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.source IS NULL OR NEW.source = '' THEN
    RETURN NULL;  -- antes: RAISE EXCEPTION (abortaba batch entero)
  END IF;
  IF NEW.source = 'Test Watch' THEN
    RETURN NULL;
  END IF;
  IF NEW.metric_name IN ('Dietary Water') THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION health.fn_reject_noisy_ingest IS
  'Filtra basura en el ingest de Health Auto Export. Todas las reglas usan RETURN NULL para no abortar el batch (evita pérdida colateral de buenas filas). Ver ADR-002.';
