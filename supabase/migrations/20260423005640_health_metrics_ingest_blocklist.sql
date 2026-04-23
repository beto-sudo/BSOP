-- Sprint drift-1 · Mig 4 de 6
-- Previene que vuelvan a caer filas basura en health.health_metrics.
-- Actualizar la blocklist según se detecte nueva basura (Dietary Water ya
-- quedó filtrada en Mig 3 y se marca acá para no re-ingresar).

CREATE OR REPLACE FUNCTION health.fn_reject_noisy_ingest()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.source IS NULL OR NEW.source = '' THEN
    RAISE EXCEPTION 'health_metrics: source cannot be null/empty';
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

DROP TRIGGER IF EXISTS trg_health_metrics_ingest_blocklist ON health.health_metrics;
CREATE TRIGGER trg_health_metrics_ingest_blocklist
BEFORE INSERT ON health.health_metrics
FOR EACH ROW EXECUTE FUNCTION health.fn_reject_noisy_ingest();

COMMENT ON FUNCTION health.fn_reject_noisy_ingest IS
  'Filtra basura en el ingest de Health Auto Export. Actualizar blocklist según se detecte nueva basura.';
