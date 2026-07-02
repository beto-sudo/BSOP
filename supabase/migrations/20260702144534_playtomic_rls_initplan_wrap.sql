-- ╭─ 20260702144534_playtomic_rls_initplan_wrap ─╮
-- Perf RLS: InitPlan wrap en las políticas de playtomic.* — mismo fix que
-- 20260425002501_rls_initplan_waitry_select aplicó a rdb.waitry_*, que en
-- ese barrido dejó fuera al schema playtomic.
--
-- Problema
-- --------
-- El tab Conciliación de RDB (/rdb/playtomic/conciliacion) truena para
-- usuarios no-admin con "canceling statement due to statement timeout"
-- (reportado por Pablo HM, viewer, 2026-07-02). A admins les carga.
--
-- Las políticas dicen:
--
--   USING (core.fn_is_admin() OR core.fn_has_empresa('e52ac307-…'::uuid))
--
-- Ambos helpers son STABLE pero Postgres los evalúa POR FILA como Filter.
-- Asimetría de costo por rol:
--
--   admin : fn_is_admin() = TRUE → el OR corta barato (1 lookup/fila)
--   viewer: fn_is_admin() = FALSE → cae a fn_has_empresa, que corre el
--           JOIN core.usuarios × core.usuarios_empresas en CADA fila
--
-- La vista playtomic.v_bookings_total_coverage (security_invoker=true)
-- agrega bookings × booking_participants × payments_import — el nested
-- loop evalúa el filtro RLS ~256k veces por chunk de 200 bookings.
-- Medido en prod 2026-07-02 (caché caliente, EXPLAIN ANALYZE):
--
--   chunk de 200 en v_bookings_total_coverage   Beto (admin)   Pablo (viewer)
--   Execution time                              429 ms         1 786 ms (4.2×)
--   Buffers shared hit                          27 303         65 855
--
-- El cliente dispara 4 chunks en paralelo + participants + players; en
-- frío o con el pool cargado el statement más lento de Pablo cruza el
-- statement_timeout de 8s del rol `authenticated`. Referencia: las tablas
-- rdb.waitry_* ya wrapeadas responden en ~10 ms bajo el mismo JWT.
--
-- Fix
-- ---
-- Wrap de cada helper en un scalar subquery — el planner lo eleva a
-- InitPlan y lo evalúa UNA vez por query. Todos los argumentos son
-- constantes (el uuid de RDB), así que el wrap aplica limpio; no hay
-- fn_has_empresa(columna) en este schema. Autorización IDÉNTICA: mismo
-- predicado, solo cambia la forma del plan. Sin grants, sin schema, sin
-- cambios de datos.
--
-- Alcance: las 9 políticas del schema playtomic (7 tablas). sync_log va
-- por consistencia (solo fn_is_admin, tabla chica).
--
-- Rollback: re-crear las políticas con el predicado sin wrap (forma
-- original en 20260418020117 / 20260504000000 / 20260504210000).

BEGIN;

-- SELECT-only (creadas en 20260418020117_rls_rdb_playtomic_cleanup)
ALTER POLICY bookings_select ON playtomic.bookings
  USING ((SELECT core.fn_is_admin())
         OR (SELECT core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid)));

ALTER POLICY players_select ON playtomic.players
  USING ((SELECT core.fn_is_admin())
         OR (SELECT core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid)));

ALTER POLICY booking_participants_select ON playtomic.booking_participants
  USING ((SELECT core.fn_is_admin())
         OR (SELECT core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid)));

ALTER POLICY resources_select ON playtomic.resources
  USING ((SELECT core.fn_is_admin())
         OR (SELECT core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid)));

ALTER POLICY sync_log_select ON playtomic.sync_log
  USING ((SELECT core.fn_is_admin()));

-- payment_assignments (20260504000000_playtomic_payment_assignments)
ALTER POLICY payment_assignments_select ON playtomic.payment_assignments
  USING ((SELECT core.fn_is_admin())
         OR (SELECT core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid)));

ALTER POLICY payment_assignments_write ON playtomic.payment_assignments
  USING ((SELECT core.fn_is_admin())
         OR (SELECT core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid)))
  WITH CHECK ((SELECT core.fn_is_admin())
              OR (SELECT core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid)));

-- payments_import (20260504210000_playtomic_payments_import)
ALTER POLICY payments_import_select ON playtomic.payments_import
  USING ((SELECT core.fn_is_admin())
         OR (SELECT core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid)));

ALTER POLICY payments_import_write ON playtomic.payments_import
  USING ((SELECT core.fn_is_admin())
         OR (SELECT core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid)))
  WITH CHECK ((SELECT core.fn_is_admin())
              OR (SELECT core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid)));

COMMIT;
