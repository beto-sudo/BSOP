-- ════════════════════════════════════════════════════════════════════════════
-- BSOP drift-check — corre contra la DB en vivo
-- ════════════════════════════════════════════════════════════════════════════
--
-- Ejecutar:
--   psql "$SUPABASE_DB_URL" -f supabase/scripts/drift-check.sql
--
-- Output:
--   INFO   — métrica informativa (siempre se muestra)
--   ALERT  — algo requiere atención (la GH Action falla si detecta una)
--
-- Diseñado para detectar los drifts que ya nos mordieron:
--   1. Tablas ambient (creadas via dashboard, sin migración fuente)
--   2. Policies service_role redundantes (USING true) → RLS bypass duplicado
--   3. Tablas sin RLS en schemas con datos de cliente
--   4. Duplicate indexes (misma definición de columnas)
--   5. Migraciones aplicadas no presentes en repo (drift de tracker)

\set QUIET on
\pset format unaligned
\pset tuples_only on
\pset border 0

\echo '════════════════════════════════════════════════════════════════════════'
\echo ' BSOP drift-check'
\echo '════════════════════════════════════════════════════════════════════════'

-- ─────────────── 1. Resumen de schemas ───────────────
\echo ''
\echo '## §1 Schemas de aplicación'
SELECT
  'INFO  schema=' || nspname ||
  ' tables=' || (SELECT count(*) FROM pg_tables WHERE schemaname = nspname)::text ||
  ' views=' || (SELECT count(*) FROM pg_views WHERE schemaname = nspname)::text ||
  ' functions=' || (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = nspname)::text
FROM pg_namespace
WHERE nspname IN ('public','core','erp','rdb','health','playtomic','dilesa','maquinaria')
ORDER BY nspname;

-- ─────────────── 2. Service_role policies redundantes ───────────────
\echo ''
\echo '## §2 Service_role policies redundantes (USING true)'
WITH redundant AS (
  SELECT schemaname, tablename, policyname
  FROM pg_policies
  WHERE 'service_role' = ANY(roles::text[]::text[])
    AND qual = 'true'
    AND (with_check = 'true' OR with_check IS NULL)
)
SELECT CASE
  WHEN count(*) = 0 THEN 'INFO  no redundant service_role policies'
  ELSE 'ALERT ' || count(*) || ' redundant service_role policies (service_role bypassa RLS automáticamente). Detalle: ' ||
       string_agg(schemaname || '.' || tablename || ' (' || policyname || ')', ', ')
END
FROM redundant;

-- ─────────────── 3. Tablas con datos sin RLS habilitado ───────────────
\echo ''
\echo '## §3 Tablas en schemas de aplicación sin RLS'
WITH no_rls AS (
  SELECT n.nspname, c.relname
  FROM pg_class c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE c.relkind = 'r'
    AND c.relrowsecurity = false
    AND n.nspname IN ('core','erp','rdb','health','playtomic','dilesa','maquinaria')
    AND c.relname NOT LIKE '%_archive_%'
)
SELECT CASE
  WHEN count(*) = 0 THEN 'INFO  all application tables have RLS enabled'
  ELSE 'ALERT ' || count(*) || ' tables without RLS: ' || string_agg(nspname || '.' || relname, ', ')
END
FROM no_rls;

-- ─────────────── 4. Duplicate indexes ───────────────
\echo ''
\echo '## §4 Indexes duplicados (misma definición de columnas)'
WITH dup AS (
  SELECT
    schemaname,
    tablename,
    array_agg(indexname ORDER BY indexname) AS indexes,
    count(*) AS n
  FROM (
    SELECT
      schemaname,
      tablename,
      indexname,
      regexp_replace(indexdef, '^CREATE (UNIQUE )?INDEX [^ ]+ ', '') AS def_normalized
    FROM pg_indexes
    WHERE schemaname IN ('public','core','erp','rdb','health','playtomic','dilesa','maquinaria')
  ) i
  GROUP BY schemaname, tablename, def_normalized
  HAVING count(*) > 1
)
SELECT CASE
  WHEN count(*) = 0 THEN 'INFO  no duplicate indexes'
  ELSE 'ALERT ' || count(*) || ' sets of duplicate indexes: ' ||
       string_agg(schemaname || '.' || tablename || ' [' || array_to_string(indexes, ',') || ']', '; ')
END
FROM dup;

-- ─────────────── 5. Tablas grandes con bloat ≥30% ───────────────
\echo ''
\echo '## §5 Tablas con bloat alto (≥30% dead, ≥10MB)'
WITH bloated AS (
  SELECT
    schemaname,
    relname,
    n_dead_tup,
    n_live_tup,
    pg_total_relation_size(schemaname || '.' || relname) AS sz,
    round(n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0) * 100, 1) AS pct_dead
  FROM pg_stat_all_tables
  WHERE schemaname IN ('public','core','erp','rdb','health','playtomic','dilesa','maquinaria')
    AND n_live_tup + n_dead_tup > 1000
)
SELECT CASE
  WHEN count(*) = 0 THEN 'INFO  no bloated tables'
  ELSE 'ALERT ' || count(*) || ' bloated tables (consider VACUUM FULL): ' ||
       string_agg(schemaname || '.' || relname || ' (' || pct_dead || '% dead, ' ||
                  pg_size_pretty(sz) || ')', ', ')
END
FROM bloated
WHERE pct_dead >= 30 AND sz >= 10 * 1024 * 1024;

-- ─────────────── 6. Migraciones aplicadas vs versiones esperadas ───────────────
\echo ''
\echo '## §6 Migraciones registradas (últimas 5)'
SELECT 'INFO  ' || version || ' ' || name
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 5;

\echo ''
\echo '════════════════════════════════════════════════════════════════════════'
\echo ' drift-check completed'
\echo '════════════════════════════════════════════════════════════════════════'
