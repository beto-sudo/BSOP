-- Mejora al trigger de task_updates: si el usuario no tiene junta_activa_id
-- marcada (porque capturó avances desde el módulo de tareas sin pasar por la
-- pantalla de junta, o porque la UI no alcanzó a marcarlo activo), ligar el
-- avance a la junta 'en_curso' más reciente de su empresa. Regla descrita
-- por el usuario: "la última junta que esté abierta".

CREATE OR REPLACE FUNCTION erp.task_updates_set_junta_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_junta uuid;
BEGIN
  -- 1) Respeta junta_id explícito desde el cliente
  IF NEW.junta_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.creado_por IS NULL THEN
    RETURN NEW;
  END IF;

  -- 2) Junta activa explícita del usuario (entró a la pantalla de junta)
  SELECT u.junta_activa_id
    INTO v_junta
    FROM core.usuarios u
   WHERE u.id = NEW.creado_por;

  IF v_junta IS NOT NULL THEN
    NEW.junta_id := v_junta;
    RETURN NEW;
  END IF;

  -- 3) Fallback: última junta 'en_curso' de la empresa por fecha_hora DESC.
  --    Si hay múltiples simultáneas, gana la más reciente. Si no hay
  --    ninguna, el avance queda con junta_id NULL (no se cuela a viejas).
  SELECT j.id
    INTO v_junta
    FROM erp.juntas j
   WHERE j.empresa_id = NEW.empresa_id
     AND j.estado = 'en_curso'
   ORDER BY j.fecha_hora DESC
   LIMIT 1;

  NEW.junta_id := v_junta;
  RETURN NEW;
END;
$$;
