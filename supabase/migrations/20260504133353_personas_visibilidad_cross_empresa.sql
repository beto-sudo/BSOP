-- Iniciativa: personas-cross-empresa-rls (ADR-029)
-- Permitir lectura de erp.personas cuando el usuario tiene vínculo
-- (vía erp.empleados) en cualquier empresa donde la persona esté
-- representada — independientemente de erp.personas.empresa_id.
--
-- Contexto
-- --------
-- Hoy `erp.personas` tiene SELECT scoped por:
--   USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
--
-- Pero `erp.personas.empresa_id` es NOT NULL — cada persona "vive" en
-- una empresa, mientras que `erp.empleados` permite N filas por persona
-- (una por empresa donde trabaja). El modelo soporta "humano que opera
-- en varias empresas" pero la RLS no acompaña: un usuario no-admin con
-- empleado en empresa A y persona en empresa B no puede leer su propia
-- ficha → `erp.v_empleados_full` (security_invoker=on) filtra el JOIN
-- y devuelve 0 filas.
--
-- Caso real que motivó esta migración: Pablo HM (`pablo.hm@dilesa.mx`),
-- empleado en RDB con persona en DILESA (legacy de la migración JP
-- 2026-04-27). Su widget /inicio mostraba lista vacía aunque tenía 8
-- tareas asignadas. El cron diario sí le mandaba correos porque usa
-- service-role y bypasea RLS.
--
-- Solución
-- --------
-- Helper nuevo `core.fn_persona_visible(p_persona_id uuid)`:
--   true si el usuario actual tiene un empleado vinculado a esa persona
--   en cualquier empresa donde tenga membership activa.
--
-- Predicate nuevo de `erp_personas_select`:
--   USING (fn_has_empresa(empresa_id) OR fn_persona_visible(id) OR fn_is_admin())
--
-- Mismo patrón STABLE + SECURITY DEFINER + search_path pinned que
-- `fn_has_empresa` / `fn_is_admin` (ver 20260418010129_core_rls_helpers.sql).
-- Postgres cachea el resultado por statement, costo extra es marginal.
--
-- V1 cubre solo vínculo vía `erp.empleados` (PV2 del ADR). Si surge
-- caso para accionistas u otras tablas, se extiende la función con un
-- OR EXISTS — sin tocar la policy.
--
-- No se modifica el schema (`empresa_id` queda NOT NULL como "empresa
-- primaria"), no se modifican policies INSERT/UPDATE/DELETE de personas,
-- no se modifican policies de tablas satélite (PV4).
--
-- Auditoría histórica (no se ejecuta aquí, queda como referencia):
-- ----------------------------------------------------------------
-- Listar empleados activos cuya persona vive en una empresa distinta:
--
-- SELECT e.id AS empleado_id, emp_e.nombre AS empleado_empresa,
--        p.id AS persona_id, emp_p.nombre AS persona_empresa,
--        (p.nombre || ' ' || COALESCE(p.apellido_paterno,'')) AS persona,
--        e.email_empresa, p.email AS persona_email
-- FROM erp.empleados e
-- JOIN erp.personas p     ON p.id = e.persona_id AND p.empresa_id <> e.empresa_id
-- JOIN core.empresas emp_e ON emp_e.id = e.empresa_id
-- JOIN core.empresas emp_p ON emp_p.id = p.empresa_id
-- WHERE e.activo = true AND p.deleted_at IS NULL
-- ORDER BY emp_e.nombre, p.nombre;
--
-- Rollback: DROP POLICY + recreate con predicate viejo + opcional drop
-- de fn_persona_visible (no causa daño dejarla sin uso).

-- ───────────────────────────────────────────────────────────────────────
-- 1) Helper: ¿el usuario actual ve esta persona vía algún empleado suyo?
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION core.fn_persona_visible(p_persona_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM erp.empleados e
     WHERE e.persona_id = p_persona_id
       AND e.empresa_id IN (SELECT * FROM core.fn_current_empresa_ids())
  );
$$;

COMMENT ON FUNCTION core.fn_persona_visible(uuid) IS
  'True iff the current JWT user has an active empresa membership in a company where the given persona has an empleado row. Lets non-admin users read their own erp.personas row even when persona.empresa_id differs from their employee''s empresa_id (case: humans operating cross-empresa whose persona "lives" in their primary empresa). Used by erp.personas SELECT policy. ADR-029.';


-- ───────────────────────────────────────────────────────────────────────
-- 2) Replace SELECT policy on erp.personas
-- ───────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS erp_personas_select ON erp.personas;

CREATE POLICY erp_personas_select
  ON erp.personas FOR SELECT TO authenticated
  USING (
       core.fn_has_empresa(empresa_id)
    OR core.fn_persona_visible(id)
    OR core.fn_is_admin()
  );


-- ───────────────────────────────────────────────────────────────────────
-- 3) Reload PostgREST schema cache so the change takes effect immediately
-- ───────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
