-- Sprint drift-1 · Mig 3 de 6
-- Limpieza de filas basura en health.health_metrics. Conteos esperados
-- (verificados el 2026-04-22):
--   · Dietary Water       : 332 filas, todas value=0, último dato 2023-03-28
--   · source vacío / NULL : 302 filas
--   · source = 'Test Watch': 1 fila
--   · VO2 Max             : 1 fila suelta (no hay uso actual en app)
-- Tras los deletes, VACUUM FULL + REINDEX para recuperar espacio.

DELETE FROM health.health_metrics WHERE metric_name = 'Dietary Water';
DELETE FROM health.health_metrics WHERE source = '' OR source IS NULL;
DELETE FROM health.health_metrics WHERE source = 'Test Watch';
DELETE FROM health.health_metrics
  WHERE metric_name = 'VO2 Max'
    AND (SELECT COUNT(*) FROM health.health_metrics WHERE metric_name = 'VO2 Max') < 5;

-- VACUUM FULL y REINDEX se corren fuera del bloque transaccional de la
-- migración (el CLI/CI de Supabase los aplica en autocommit). Se dejan
-- acá documentados; si el runner los rechaza, correrlos manualmente.
-- VACUUM FULL health.health_metrics;
-- REINDEX TABLE health.health_metrics;
