-- ╭─ 20260624180340_estimacion_tareas_rls_set_membership ─╮
-- Perf RLS: la política SELECT de dilesa.estimacion_tareas usaba
-- `core.fn_has_empresa(empresa_id)` — una función con argumento de COLUMNA,
-- que Postgres evalúa POR FILA (aunque sea STABLE). Con 129k+ filas, un
-- operador no-admin (p.ej. el rol "Dirección" de DILESA) gatillaba 129k
-- llamadas a la función → ~7.1s, pasando el statement_timeout de 8s del rol
-- `authenticated` → "canceling statement due to statement timeout". El admin
-- no lo veía porque `fn_is_admin()` cortocircuita el OR a true constante.
--
-- Fix: set-membership. `empresa_id IN (SELECT core.fn_current_empresa_ids())`
-- evalúa el subquery UNA sola vez (InitPlan), no por fila → ~40ms.
-- Autorización IDÉNTICA: fn_current_empresa_ids() corre el mismo join con los
-- mismos filtros (u.activo + ue.activo) que fn_has_empresa. El override de
-- admin se preserva. ALTER POLICY conserva rol (PUBLIC), cmd (SELECT) y
-- permissive; solo reemplaza el predicado USING.

BEGIN;

ALTER POLICY estimacion_tareas_rls_select ON dilesa.estimacion_tareas
  USING (
    empresa_id IN (SELECT core.fn_current_empresa_ids())
    OR core.fn_is_admin()
  );

COMMIT;
