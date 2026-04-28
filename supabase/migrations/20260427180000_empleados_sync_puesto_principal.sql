-- Sprint 2 — Empleados multi-puesto
-- Trigger que mantiene sync automático entre erp.empleados.puesto_id (escalar legacy)
-- y erp.empleados_puestos.principal (modelo N:M nuevo).
--
-- Permite que el wizard de alta y las detail pages existentes sigan escribiendo
-- a empleados.puesto_id sin romper nada — el trigger crea/actualiza la fila
-- correspondiente en empleados_puestos con principal=true. Cuando se cambia
-- el puesto_id, el principal anterior queda como secundario (no se borra),
-- alineado con la semántica multi-puesto.
--
-- Sprint 3 va a migrar la UI a escribir directo a empleados_puestos. Cuando
-- todos los writes lo hagan, este trigger queda como safety net y eventualmente
-- se puede dropar junto con empleados.puesto_id (fuera del alcance).

CREATE OR REPLACE FUNCTION erp.fn_empleados_sync_puesto_principal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Caso 1: INSERT con puesto_id no NULL → crear fila principal en empleados_puestos
  IF TG_OP = 'INSERT' THEN
    IF NEW.puesto_id IS NOT NULL THEN
      INSERT INTO erp.empleados_puestos (empresa_id, empleado_id, puesto_id, principal, fecha_inicio)
      VALUES (NEW.empresa_id, NEW.id, NEW.puesto_id, true, NEW.fecha_ingreso)
      ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  -- Caso 2: UPDATE con cambio de puesto_id → resincronizar principal
  IF TG_OP = 'UPDATE' AND NEW.puesto_id IS DISTINCT FROM OLD.puesto_id THEN
    -- Desmarcar el principal anterior (queda como secundario, no se borra)
    UPDATE erp.empleados_puestos
       SET principal = false, updated_at = now()
     WHERE empleado_id = NEW.id
       AND principal = true
       AND fecha_fin IS NULL;

    -- Si hay nuevo puesto, crear/promover a principal
    IF NEW.puesto_id IS NOT NULL THEN
      -- Insert si no existe la relación
      INSERT INTO erp.empleados_puestos (empresa_id, empleado_id, puesto_id, principal, fecha_inicio)
      VALUES (NEW.empresa_id, NEW.id, NEW.puesto_id, true, NEW.fecha_ingreso)
      ON CONFLICT DO NOTHING;

      -- Si ya existía como secundario, promover a principal
      UPDATE erp.empleados_puestos
         SET principal = true, updated_at = now()
       WHERE empleado_id = NEW.id
         AND puesto_id = NEW.puesto_id
         AND fecha_fin IS NULL;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION erp.fn_empleados_sync_puesto_principal() IS
  'Sincroniza erp.empleados.puesto_id (escalar legacy) → erp.empleados_puestos.principal (N:M nuevo). Sprint 2 de empleados-multi-puesto.';

CREATE TRIGGER trg_empleados_sync_puesto_principal
  AFTER INSERT OR UPDATE OF puesto_id ON erp.empleados
  FOR EACH ROW
  EXECUTE FUNCTION erp.fn_empleados_sync_puesto_principal();
