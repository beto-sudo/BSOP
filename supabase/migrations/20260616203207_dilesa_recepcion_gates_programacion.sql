-- Atención a Clientes (dilesa-atencion-clientes) — Sprint 1, S1d.
--
-- Candados de SECUENCIA de la recepción de obra (antes no había límites):
--   1. La recepción solo se PROGRAMA cuando todas las tareas de construcción
--      previas (las que no son hito de recepción) están terminadas.
--   2. El checklist solo se abre tras programar (estado 'programada').
--   3. Marcar "recibida" exige: previas completas + checklist todo en verde
--      (sin observaciones) + acta firmada subida (adjunto rol='acta_recepcion').
--
-- Agrega estado 'programada' + fecha_programada, el helper de avance previo,
-- la RPC fn_recepcion_programar, y endurece fn_recepcion_cerrar con los gates.

BEGIN;

-- ── 1. Estado 'programada' + fecha agendada ───────────────────────────────────
ALTER TABLE dilesa.recepcion_obra
  ADD COLUMN IF NOT EXISTS fecha_programada date;

ALTER TABLE dilesa.recepcion_obra DROP CONSTRAINT IF EXISTS recepcion_obra_estado_check;
ALTER TABLE dilesa.recepcion_obra
  ADD CONSTRAINT recepcion_obra_estado_check
    CHECK (estado IN ('programada', 'con_observaciones', 'recibida', 'rechazada'));

-- ── 2. Helper: ¿todas las tareas previas (no-recepción) están terminadas? ─────
CREATE OR REPLACE FUNCTION dilesa.fn_construccion_previas_completas(p_construccion_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = dilesa, public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM dilesa.construccion c
    JOIN dilesa.plantilla_tareas pt
      ON pt.producto_id = c.producto_id AND pt.deleted_at IS NULL
    JOIN dilesa.tareas_construccion tc ON tc.id = pt.tarea_id
    LEFT JOIN dilesa.construccion_tareas_terminadas ctt
      ON ctt.construccion_id = c.id AND ctt.plantilla_tarea_id = pt.id AND ctt.deleted_at IS NULL
    WHERE c.id = p_construccion_id
      AND tc.hito_recepcion IS NULL  -- solo tareas de obra, no el checklist ni la recepción
      AND ctt.id IS NULL             -- pendiente
  );
$$;

COMMENT ON FUNCTION dilesa.fn_construccion_previas_completas(uuid) IS
  'True si todas las tareas de construcción NO-recepción (hito_recepcion IS NULL) de la obra están terminadas. Gate para programar/recibir.';

-- ── 3. RPC: programar la recepción (agenda fecha, abre el checklist) ──────────
CREATE OR REPLACE FUNCTION dilesa.fn_recepcion_programar(
  p_construccion_id uuid,
  p_fecha_programada date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = dilesa, public
AS $$
DECLARE
  v_empresa_id uuid;
  v_id         uuid;
BEGIN
  SELECT empresa_id INTO v_empresa_id
    FROM dilesa.construccion WHERE id = p_construccion_id AND deleted_at IS NULL;
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Construcción % no existe o está cancelada', p_construccion_id;
  END IF;

  IF NOT (
       core.fn_is_admin()
    OR core.fn_user_has_role('Atencion a Clientes', v_empresa_id)
    OR core.fn_user_has_role('Dirección', v_empresa_id)
  ) THEN
    RAISE EXCEPTION 'Solo Atención a Clientes (o Dirección/admin) programa la recepción.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT dilesa.fn_construccion_previas_completas(p_construccion_id) THEN
    RAISE EXCEPTION 'Aún hay tareas de construcción pendientes; no se puede programar la recepción.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO dilesa.recepcion_obra (empresa_id, construccion_id, estado, fecha_programada)
  VALUES (v_empresa_id, p_construccion_id, 'programada', p_fecha_programada)
  ON CONFLICT (construccion_id) WHERE deleted_at IS NULL
  DO UPDATE SET fecha_programada = excluded.fecha_programada,
                -- no degradar una recepción ya cerrada
                estado = CASE WHEN dilesa.recepcion_obra.estado = 'recibida'
                              THEN dilesa.recepcion_obra.estado ELSE 'programada' END,
                updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION dilesa.fn_recepcion_programar(uuid, date) IS
  'Programa la recepción de obra (estado=programada + fecha). Gate: rol Atención a Clientes/Dirección/admin + todas las tareas previas terminadas. Abre el checklist.';

REVOKE ALL ON FUNCTION dilesa.fn_recepcion_programar(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION dilesa.fn_recepcion_programar(uuid, date) TO authenticated;

-- ── 4. Endurecer fn_recepcion_cerrar con los candados ─────────────────────────
CREATE OR REPLACE FUNCTION dilesa.fn_recepcion_cerrar(
  p_construccion_id uuid,
  p_checklist       jsonb DEFAULT '[]'::jsonb,
  p_notas           text  DEFAULT NULL,
  p_fecha           date  DEFAULT current_date,
  p_estado          text  DEFAULT 'recibida'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = dilesa, public
AS $$
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

  -- Recepción existente (debe existir desde "programar" cuando se va a recibir).
  SELECT id INTO v_recepcion
    FROM dilesa.recepcion_obra
   WHERE construccion_id = p_construccion_id AND deleted_at IS NULL;

  -- Candados duros para CERRAR como recibida.
  IF p_estado = 'recibida' THEN
    IF NOT dilesa.fn_construccion_previas_completas(p_construccion_id) THEN
      RAISE EXCEPTION 'No se puede recibir: aún hay tareas de construcción pendientes.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(p_checklist, '[]'::jsonb)) e
       WHERE e->>'estado' = 'observacion'
    ) THEN
      RAISE EXCEPTION 'No se puede recibir con observaciones abiertas en el checklist.'
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

  IF p_estado = 'recibida' AND v_plantilla IS NOT NULL THEN
    INSERT INTO dilesa.construccion_tareas_terminadas
      (empresa_id, construccion_id, plantilla_tarea_id, fecha_terminada, revisado_por_user_id)
    VALUES
      (v_empresa_id, p_construccion_id, v_plantilla, p_fecha, auth.uid())
    ON CONFLICT (construccion_id, plantilla_tarea_id) DO NOTHING;
  END IF;

  RETURN v_recepcion;
END;
$$;

COMMENT ON FUNCTION dilesa.fn_recepcion_cerrar(uuid, jsonb, text, date, text) IS
  'Guarda/cierra la recepción. Gate de rol siempre. Para estado=recibida exige: tareas previas completas + checklist sin observaciones + acta firmada subida; entonces marca (idempotente) la tarea recepcion_final como terminada.';

REVOKE ALL ON FUNCTION dilesa.fn_recepcion_cerrar(uuid, jsonb, text, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION dilesa.fn_recepcion_cerrar(uuid, jsonb, text, date, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
