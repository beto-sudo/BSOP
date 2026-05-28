-- Sec DB hardening — cierra los hallazgos del linter de Supabase que
-- reaparecieron en módulos nuevos (DILESA construcción/estimaciones, KYC erp)
-- por no mantener la convención de los sprints `views_security_invoker` /
-- `functions_search_path` (2026-04-17).
--
-- Dos cosas:
--
-- 1) `function_search_path_mutable` (WARN) — 7 funciones creadas después del
--    hardening original quedaron sin `SET search_path`. Todas son
--    SECURITY INVOKER (no DEFINER), así que el riesgo de search-path injection
--    es bajo, pero fijar el path mantiene la convención del repo y silencia el
--    linter. Los cuerpos ya schema-qualifican todo, así que pinear el path NO
--    cambia comportamiento. Path por función = `pg_catalog, <schema propio>,
--    [core si referencia core.*], public` — mismo patrón que
--    `20260417213449_functions_search_path.sql`.
--
-- 2) `security_definer_view` (ERROR) — `public.health_ingest_log` corría como
--    SECURITY DEFINER, exponiendo TODO el log a cualquier rol con grant SELECT
--    (anon/authenticated), saltándose la política `health_ingest_log_admin_read`
--    (SELECT solo si `core.fn_is_admin()`) de la tabla base. La ingesta inserta
--    vía service-role (bypassa RLS), y ningún SELECT de la app consume esta
--    vista, así que `security_invoker = on` no rompe nada y restaura el
--    aislamiento admin-only en lecturas.

-- ── 1) Pin search_path en funciones nuevas ──────────────────────────────────
DO $$
DECLARE
  spec text;
  -- One row per function — "schema.fn(args)" || search_path
  specs text[][] := ARRAY[
    ['dilesa.fn_calcular_avance_construccion(uuid)',                'pg_catalog, dilesa, public'],
    ['dilesa.fn_generar_estimacion_borrador(uuid, date, numeric)',  'pg_catalog, dilesa, core, public'],
    ['dilesa.fn_tarea_terminada_esta_pagada(uuid)',                 'pg_catalog, dilesa, public'],
    ['dilesa.fn_tg_construccion_avance()',                          'pg_catalog, dilesa, public'],
    ['dilesa.fn_tg_ctt_lock_pagadas()',                             'pg_catalog, dilesa, core, public'],
    ['erp.fn_personas_datos_fiscales_uppercase_normalize()',        'pg_catalog, erp, public'],
    ['erp.fn_personas_uppercase_normalize()',                       'pg_catalog, erp, public']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(specs, 1) LOOP
    IF to_regprocedure(specs[i][1]) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = %s', specs[i][1], specs[i][2]);
    END IF;
  END LOOP;
END $$;

-- ── 2) health_ingest_log → security_invoker ─────────────────────────────────
-- ALTER (no CREATE OR REPLACE) para no tocar la definición ni los grants.
DO $$
BEGIN
  IF to_regclass('public.health_ingest_log') IS NOT NULL THEN
    ALTER VIEW public.health_ingest_log SET (security_invoker = on);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
