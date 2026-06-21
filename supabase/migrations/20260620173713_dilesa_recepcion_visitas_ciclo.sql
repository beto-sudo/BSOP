-- ╭─ 20260620173713_dilesa_recepcion_visitas_ciclo ─╮
-- Atención a Clientes (dilesa-atencion-clientes) — Sprint 4.
--
-- Recepción de obra "papel-primero" + ciclo de re-inspección:
--   - Se imprime el formato EN BLANCO y se marca/firma físico; el escaneo
--     subido es el ÚNICO gate para recibir (se retira el gate del checklist
--     digital, que deja de capturarse en pantalla).
--   - Cada recorrido es una VISITA: si encuentra detalles NO se recibe, se
--     registra la observación como evidencia y se reprograma con el compromiso
--     del contratista; el ciclo se repite hasta recibir y firmar todos.
--
-- Cambios:
--   1. Tabla nueva dilesa.recepcion_visitas (historial 1:N de rondas).
--   2. RPC nueva fn_recepcion_registrar_visita (visita con observaciones).
--   3. fn_recepcion_cerrar: quita el gate "checklist sin observaciones",
--      mantiene previas + acta firmada, y registra la visita final 'recibida'.

BEGIN;

-- ── 1. Tabla dilesa.recepcion_visitas (historial de rondas de inspección) ─────
CREATE TABLE IF NOT EXISTS dilesa.recepcion_visitas (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id             uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  recepcion_id           uuid NOT NULL REFERENCES dilesa.recepcion_obra(id) ON DELETE CASCADE,
  fecha_visita           date NOT NULL DEFAULT current_date,
  resultado              text NOT NULL
                           CHECK (resultado IN ('con_observaciones', 'recibida')),
  -- Detalles encontrados + reprogramación (solo cuando resultado='con_observaciones')
  observaciones          text,
  fecha_reprograma       date,
  compromiso_contratista text,
  registrado_por_user_id uuid REFERENCES core.usuarios(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz
);

COMMENT ON TABLE dilesa.recepcion_visitas IS
  'Historial de visitas (rondas) de la recepción de obra. Cada recorrido: con_observaciones (evidencia + reprograma) o recibida (cierre). Audit trail del ciclo de re-inspección. Iniciativa dilesa-atencion-clientes S4.';

CREATE INDEX IF NOT EXISTS recepcion_visitas_recepcion_idx
  ON dilesa.recepcion_visitas (recepcion_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS recepcion_visitas_empresa_idx
  ON dilesa.recepcion_visitas (empresa_id);

CREATE TRIGGER tg_recepcion_visitas_updated_at
  BEFORE UPDATE ON dilesa.recepcion_visitas
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

ALTER TABLE dilesa.recepcion_visitas ENABLE ROW LEVEL SECURITY;

CREATE POLICY recepcion_visitas_select ON dilesa.recepcion_visitas
  FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

CREATE POLICY recepcion_visitas_write ON dilesa.recepcion_visitas
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

GRANT SELECT, INSERT, UPDATE ON dilesa.recepcion_visitas TO authenticated;

-- ── 2. RPC: registrar una visita con observaciones + reprogramar ──────────────
CREATE OR REPLACE FUNCTION dilesa.fn_recepcion_registrar_visita(
  p_construccion_id  uuid,
  p_fecha_visita     date,
  p_observaciones    text,
  p_fecha_reprograma date,
  p_compromiso       text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = dilesa, public
AS $$
DECLARE
  v_empresa_id uuid;
  v_recepcion  uuid;
  v_visita     uuid;
BEGIN
  SELECT empresa_id INTO v_empresa_id
    FROM dilesa.construccion WHERE id = p_construccion_id AND deleted_at IS NULL;
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Construcción % no existe o está cancelada', p_construccion_id;
  END IF;

  -- Gate: admin O rol Atención a Clientes O Dirección (admin nunca se bloquea).
  IF NOT (
       core.fn_is_admin()
    OR core.fn_user_has_role('Atencion a Clientes', v_empresa_id)
    OR core.fn_user_has_role('Dirección', v_empresa_id)
  ) THEN
    RAISE EXCEPTION 'Solo Atención a Clientes (o Dirección/admin) registra la recepción.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF coalesce(btrim(p_observaciones), '') = '' THEN
    RAISE EXCEPTION 'Describe las observaciones encontradas en la visita.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_fecha_reprograma IS NULL THEN
    RAISE EXCEPTION 'Indica la nueva fecha programada para resolver las observaciones.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- La recepción debe existir (se programa antes de la primera visita).
  SELECT id INTO v_recepcion
    FROM dilesa.recepcion_obra
   WHERE construccion_id = p_construccion_id AND deleted_at IS NULL;
  IF v_recepcion IS NULL THEN
    RAISE EXCEPTION 'Programa la recepción antes de registrar una visita.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO dilesa.recepcion_visitas
    (empresa_id, recepcion_id, fecha_visita, resultado, observaciones,
     fecha_reprograma, compromiso_contratista, registrado_por_user_id)
  VALUES
    (v_empresa_id, v_recepcion, coalesce(p_fecha_visita, current_date), 'con_observaciones',
     btrim(p_observaciones), p_fecha_reprograma, nullif(btrim(coalesce(p_compromiso, '')), ''), auth.uid())
  RETURNING id INTO v_visita;

  -- La recepción vuelve a 'con_observaciones' y avanza la próxima cita.
  UPDATE dilesa.recepcion_obra
     SET estado = 'con_observaciones',
         fecha_programada = p_fecha_reprograma,
         updated_at = now()
   WHERE id = v_recepcion;

  RETURN v_visita;
END;
$$;

COMMENT ON FUNCTION dilesa.fn_recepcion_registrar_visita(uuid, date, text, date, text) IS
  'Registra una visita de recepción CON OBSERVACIONES (no recibe): inserta la ronda en recepcion_visitas con evidencia/compromiso y reprograma la recepción. Gate: admin/Atención a Clientes/Dirección. Devuelve la visita (para ligarle adjuntos de evidencia).';

REVOKE ALL ON FUNCTION dilesa.fn_recepcion_registrar_visita(uuid, date, text, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION dilesa.fn_recepcion_registrar_visita(uuid, date, text, date, text) TO authenticated;

-- ── 3. fn_recepcion_cerrar: gate = escaneo del acta (sin checklist digital) ───
-- Misma firma que la versión viva (no abre ventana de incompatibilidad con el
-- código en prod). Verificado contra prod con pg_get_functiondef antes de editar.
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
$$;

COMMENT ON FUNCTION dilesa.fn_recepcion_cerrar(uuid, jsonb, text, date, text) IS
  'Cierra la recepción (recibida). Gate de rol siempre. Para recibida exige: tareas previas completas + acta firmada escaneada (rol acta_recepcion). Registra la visita final en recepcion_visitas y marca (idempotente) la tarea recepcion_final como terminada. El checklist digital ya no es gate (revisión en papel).';

REVOKE ALL ON FUNCTION dilesa.fn_recepcion_cerrar(uuid, jsonb, text, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION dilesa.fn_recepcion_cerrar(uuid, jsonb, text, date, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
