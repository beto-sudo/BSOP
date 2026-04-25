-- One-row-per-metric accessor for the dashboard hero cards.
--
-- The previous approach (client-side LIMIT 500 over a mixed query) was
-- dominated by high-frequency metrics like Heart Rate (~16K rows/month)
-- and silently dropped low-frequency metrics (VO2 Max, Wrist Temperature,
-- Blood Pressure), which then rendered as "Sin datos" on the hero even
-- though recent readings existed. DISTINCT ON per metric_name fixes that.

CREATE OR REPLACE FUNCTION public.get_latest_health_metrics(p_names text[])
RETURNS TABLE (
  id bigint,
  metric_name text,
  date timestamptz,
  value real,
  unit text,
  source text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (m.metric_name)
    m.id, m.metric_name, m.date, m.value, m.unit, m.source
  FROM public.health_metrics m
  WHERE m.metric_name = ANY(p_names)
  ORDER BY m.metric_name, m.date DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_latest_health_metrics(text[])
  TO anon, authenticated, service_role;
