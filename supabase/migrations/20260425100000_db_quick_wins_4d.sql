-- Sprint 4D §1 — DB quick wins
--
-- Limpia advisories del Supabase Database Linter en una sola migration.
--
--   PERFORMANCE (unindexed_foreign_keys):
--     • 11 BTREE indexes en columnas FK sin cobertura
--
--   SECURITY (function_search_path_mutable):
--     • SET search_path en erp.fn_set_updated_at_producto_receta
--     • SET search_path en erp.fn_set_updated_at_categorias_producto
--       (sister fn — el advisor también la flagea; mismo body trivial)
--
--   SECURITY (rls_policy_always_true):
--     • core.audit_log policy `audit_log_insert`: WITH CHECK (false)
--       para `authenticated`. Investigación 2026-04-25:
--         - No hay triggers, funciones DB, edge functions ni código de
--           app que inserte hoy en core.audit_log.
--         - service_role bypassa RLS, así que cualquier insert futuro
--           server-side (SECURITY DEFINER trigger, edge function con
--           service_role key, etc.) sigue funcionando.
--         - Caso A (per CC_PROMPT): cerrar la puerta a `authenticated`
--           es defensa en profundidad sin impacto operativo.
--
-- Tablas afectadas son chicas (max erp.tasks ~1.2k rows / 1 MB), el
-- write lock breve de CREATE INDEX es despreciable. No requiere
-- CONCURRENTLY (que además no corre dentro de transacción).

-- ════════════════════════════════════════════════════════════════════
-- Section 1 — FK BTREE indexes
-- ════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('core.usuarios') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS core_usuarios_junta_activa_id_idx
      ON core.usuarios (junta_activa_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('dilesa.anteproyectos') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS dilesa_anteproyectos_convertido_a_proyecto_por_idx
      ON dilesa.anteproyectos (convertido_a_proyecto_por);
    CREATE INDEX IF NOT EXISTS dilesa_anteproyectos_tipo_proyecto_id_idx
      ON dilesa.anteproyectos (tipo_proyecto_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('dilesa.checklist_supervision') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS dilesa_checklist_supervision_supervisor_id_idx
      ON dilesa.checklist_supervision (supervisor_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('dilesa.plantilla_tareas_construccion_items') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS dilesa_plantilla_tareas_construccion_items_tipo_trabajo_id_idx
      ON dilesa.plantilla_tareas_construccion_items (tipo_trabajo_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('dilesa.prototipos') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS dilesa_prototipos_responsable_id_idx
      ON dilesa.prototipos (responsable_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('dilesa.proyectos') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS dilesa_proyectos_tipo_proyecto_id_idx
      ON dilesa.proyectos (tipo_proyecto_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('erp.cortes_vouchers') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS erp_cortes_vouchers_uploaded_by_idx
      ON erp.cortes_vouchers (uploaded_by);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('erp.tasks') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS erp_tasks_cierre_aprobado_por_idx
      ON erp.tasks (cierre_aprobado_por);
    CREATE INDEX IF NOT EXISTS erp_tasks_cierre_rechazado_por_idx
      ON erp.tasks (cierre_rechazado_por);
    CREATE INDEX IF NOT EXISTS erp_tasks_cierre_solicitado_por_idx
      ON erp.tasks (cierre_solicitado_por);
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════
-- Section 2 — Pin search_path en trigger functions triviales
-- ════════════════════════════════════════════════════════════════════
-- Body intacto; el único cambio es agregar `SET search_path` para
-- cerrar function_search_path_mutable. CREATE OR REPLACE preserva los
-- triggers que ya bindean estas funciones.

CREATE OR REPLACE FUNCTION erp.fn_set_updated_at_producto_receta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION erp.fn_set_updated_at_categorias_producto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- ════════════════════════════════════════════════════════════════════
-- Section 3 — core.audit_log: cerrar policy permisiva
-- ════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('core.audit_log') IS NOT NULL THEN
    DROP POLICY IF EXISTS audit_log_insert ON core.audit_log;
    CREATE POLICY audit_log_insert ON core.audit_log
      FOR INSERT TO authenticated
      WITH CHECK (false);
  END IF;
END $$;
