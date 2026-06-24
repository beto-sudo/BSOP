-- ╭─ 20260624224024_fix_recepcion_recibida_marca_obra_terminada ─╮
-- El criterio autoritativo de "obra terminada" es la RECEPCIÓN (Atención a
-- Clientes recibe la obra), NO que el avance llegue a 100. El flujo nuevo ya
-- NO exige cerrar la tarea-checklist digital (revisión en papel + acta firmada
-- es la evidencia), así que toda obra recibida se quedaba colgada en ~99.7%
-- (una tarea `checklist` sin palomear) y por ende en estado 'en_progreso'.
--
-- (El fix previo 20260624220455 marcaba terminada al cruzar avance≥100; solo
-- alcanzaba a las obras donde alguien palomeó el checklist a mano. Este lo
-- resuelve de raíz: recepción='recibida' ⇒ obra 'terminada'.)
--
-- Fix: `fn_recepcion_cerrar`, al cerrar como 'recibida', marca la obra
-- 'terminada' + fecha_terminada = fecha de recepción. El trigger existente
-- `tg_construccion_estado_avance` fuerza avance_pct=100 al ver el estado
-- post-obra. + backfill de las obras ya recibidas que quedaron rezagadas.

BEGIN;

-- ── 1. fn_recepcion_cerrar: recibida ⇒ obra terminada ────────────────────────
-- Reescrita desde la definición VIVA en prod (pg_get_functiondef) + el bloque
-- nuevo. Todo lo demás queda idéntico (gates, upsert de recepción, visita,
-- tarea recepcion_final).
CREATE OR REPLACE FUNCTION dilesa.fn_recepcion_cerrar(
  p_construccion_id uuid,
  p_checklist jsonb DEFAULT '[]'::jsonb,
  p_notas text DEFAULT NULL::text,
  p_fecha date DEFAULT CURRENT_DATE,
  p_estado text DEFAULT 'recibida'::text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'dilesa', 'public'
AS $function$
DECLARE
  v_empresa_id  uuid;
  v_plantilla   uuid;
  v_recepcion   uuid;
BEGIN
  SELECT empresa_id INTO v_empresa_id
    FROM dilesa.construccion
   WHERE id = p_construccion_id AND deleted_at IS NULL;
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Construcción % no existe o está cancelada', p_construccion_id;
  END IF;

  IF NOT (
       core.fn_is_admin()
    OR core.fn_user_has_role('Atencion a Clientes', v_empresa_id)
    OR core.fn_user_has_role('Dirección', v_empresa_id)
  ) THEN
    RAISE EXCEPTION 'Solo Atención a Clientes (o Dirección/admin) puede recibir la obra.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id INTO v_recepcion
    FROM dilesa.recepcion_obra
   WHERE construccion_id = p_construccion_id AND deleted_at IS NULL;

  -- Candados duros para CERRAR como recibida.
  -- (Ya NO se exige checklist digital sin observaciones: la revisión es en
  --  papel; el acta firmada escaneada es la evidencia y el gate único.)
  IF p_estado = 'recibida' THEN
    IF NOT dilesa.fn_construccion_previas_completas(p_construccion_id) THEN
      RAISE EXCEPTION 'No se puede recibir: aún hay tareas de construcción pendientes.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_recepcion IS NULL OR NOT EXISTS (
      SELECT 1 FROM erp.adjuntos
       WHERE entidad_tipo = 'recepcion_obra' AND entidad_id = v_recepcion AND rol = 'acta_recepcion'
    ) THEN
      RAISE EXCEPTION 'No se puede recibir: falta subir el acta de recepción firmada.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Tarea de recepción final de esta obra (por la marca, no por nombre).
  SELECT pt.id INTO v_plantilla
    FROM dilesa.plantilla_tareas pt
    JOIN dilesa.construccion c ON c.id = p_construccion_id
    JOIN dilesa.tareas_construccion tc
      ON tc.id = pt.tarea_id AND tc.hito_recepcion = 'recepcion_final'
   WHERE pt.producto_id = c.producto_id AND pt.deleted_at IS NULL
   LIMIT 1;

  INSERT INTO dilesa.recepcion_obra
    (empresa_id, construccion_id, estado, fecha_recepcion, recibido_por_user_id, checklist, notas)
  VALUES
    (v_empresa_id, p_construccion_id, p_estado, p_fecha, auth.uid(), coalesce(p_checklist, '[]'::jsonb), p_notas)
  ON CONFLICT (construccion_id) WHERE deleted_at IS NULL
  DO UPDATE SET estado = excluded.estado,
                fecha_recepcion = excluded.fecha_recepcion,
                recibido_por_user_id = excluded.recibido_por_user_id,
                checklist = excluded.checklist,
                notas = excluded.notas,
                updated_at = now()
  RETURNING id INTO v_recepcion;

  -- Recepción cerrada como 'recibida' ⇒ la OBRA queda 'terminada'. Criterio
  -- autoritativo: NO dependemos de avance=100 (la tarea-checklist ya no se
  -- exige cerrar, dejaría la obra colgada en ~99.7%). El trigger
  -- tg_construccion_estado_avance fuerza avance_pct=100 al ver el estado
  -- post-obra. El filtro estado IN ('arrancada','en_progreso') nunca degrada
  -- un estado posterior (dtu/seguro_calidad/extraida) y lo hace idempotente.
  IF p_estado = 'recibida' THEN
    UPDATE dilesa.construccion
    SET estado          = 'terminada',
        fecha_terminada = COALESCE(fecha_terminada, p_fecha)
    WHERE id = p_construccion_id
      AND estado IN ('arrancada', 'en_progreso');
  END IF;

  IF p_estado = 'recibida' AND v_plantilla IS NOT NULL THEN
    -- Visita final del historial (cierre del ciclo de re-inspección).
    INSERT INTO dilesa.recepcion_visitas
      (empresa_id, recepcion_id, fecha_visita, resultado, observaciones, registrado_por_user_id)
    VALUES
      (v_empresa_id, v_recepcion, p_fecha, 'recibida', nullif(btrim(coalesce(p_notas, '')), ''), auth.uid());

    INSERT INTO dilesa.construccion_tareas_terminadas
      (empresa_id, construccion_id, plantilla_tarea_id, fecha_terminada, revisado_por_user_id)
    VALUES
      (v_empresa_id, p_construccion_id, v_plantilla, p_fecha, auth.uid())
    ON CONFLICT (construccion_id, plantilla_tarea_id) DO NOTHING;
  END IF;

  RETURN v_recepcion;
END;
$function$;

-- ── 2. Backfill: obras ya RECIBIDAS pero aún en progreso ─────────────────────
-- Hoy son 3 (M13-L9-LDS-RMD, M18-L39 / M18-L40-LDLE-ISC), colgadas en ~99.7%
-- por la tarea-checklist sin palomear. El trigger BEFORE UPDATE OF estado
-- fuerza avance_pct=100.
UPDATE dilesa.construccion c
SET estado          = 'terminada',
    fecha_terminada = COALESCE(c.fecha_terminada, r.fecha_recepcion, CURRENT_DATE)
FROM dilesa.recepcion_obra r
WHERE r.construccion_id = c.id
  AND r.deleted_at IS NULL
  AND r.estado = 'recibida'
  AND c.estado IN ('arrancada', 'en_progreso')
  AND c.deleted_at IS NULL;

COMMIT;
