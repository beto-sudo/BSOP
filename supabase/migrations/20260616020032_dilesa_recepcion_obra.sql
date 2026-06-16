-- Atención a Clientes (dilesa-atencion-clientes) — Sprint 1, S1b + S1c.
--
-- Backend de la RECEPCIÓN DE OBRA al contratista:
--   - S1b: tabla `dilesa.recepcion_obra` (1 por construcción) + checklist de
--     verificaciones (snapshot JSONB), captura que no existía en Coda.
--   - S1c: gate "solo Atención a Clientes (+ Dirección/admin) recibe":
--       · RPC `dilesa.fn_recepcion_cerrar` (autoridad del flujo)
--       · trigger defensa-en-profundidad sobre construccion_tareas_terminadas
--         (bloquea el cierre directo de la tarea recepcion_final sin rol)
--       · sub-slug RBAC `dilesa.construccion.recepcion` (gobierna el botón en UI)
--
-- Cerrar la recepción marca la tarea con hito_recepcion='recepcion_final' como
-- terminada (idempotente) -> dispara tg_construccion_avance -> obra terminada.
-- La identificación de la tarea es por la marca hito_recepcion (migración
-- 20260616011322), NO por nombre/etapa.

BEGIN;

-- ── 1. Tabla dilesa.recepcion_obra ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dilesa.recepcion_obra (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  construccion_id      uuid NOT NULL REFERENCES dilesa.construccion(id) ON DELETE RESTRICT,
  estado               text NOT NULL DEFAULT 'recibida'
                         CHECK (estado IN ('recibida', 'con_observaciones', 'rechazada')),
  fecha_recepcion      date NOT NULL DEFAULT current_date,
  recibido_por_user_id uuid REFERENCES core.usuarios(id) ON DELETE SET NULL,
  -- Snapshot inmutable del checklist de verificaciones/pruebas que llenó
  -- Atención a Clientes: [{ "clave": text, "etiqueta": text, "ok": bool, "nota": text }]
  checklist            jsonb NOT NULL DEFAULT '[]'::jsonb,
  notas                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);

COMMENT ON TABLE dilesa.recepcion_obra IS
  'Recepción de obra al contratista (Atención a Clientes): checklist de verificaciones + cierre. 1 por construcción. Cerrarla marca la tarea hito_recepcion=recepcion_final como terminada.';

-- 1 recepción viva por construcción (parcial: tolera re-alta tras soft-delete)
CREATE UNIQUE INDEX IF NOT EXISTS recepcion_obra_construccion_uk
  ON dilesa.recepcion_obra (construccion_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS recepcion_obra_empresa_idx ON dilesa.recepcion_obra (empresa_id);

CREATE TRIGGER tg_recepcion_obra_updated_at
  BEFORE UPDATE ON dilesa.recepcion_obra
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

ALTER TABLE dilesa.recepcion_obra ENABLE ROW LEVEL SECURITY;

CREATE POLICY recepcion_obra_select ON dilesa.recepcion_obra
  FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

CREATE POLICY recepcion_obra_write ON dilesa.recepcion_obra
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

GRANT SELECT, INSERT, UPDATE ON dilesa.recepcion_obra TO authenticated;

-- ── 2. RPC de cierre (autoridad del flujo, gate de rol) ───────────────────────
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
  -- Construcción + empresa
  SELECT empresa_id INTO v_empresa_id
    FROM dilesa.construccion
   WHERE id = p_construccion_id AND deleted_at IS NULL;
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Construcción % no existe o está cancelada', p_construccion_id;
  END IF;

  -- Gate: admin global O rol Atención a Clientes O Dirección (admin nunca se bloquea — política 2026-06-10)
  IF NOT (
       core.fn_is_admin()
    OR core.fn_user_has_role('Atencion a Clientes', v_empresa_id)
    OR core.fn_user_has_role('Dirección', v_empresa_id)
  ) THEN
    RAISE EXCEPTION 'Solo Atención a Clientes (o Dirección/admin) puede recibir la obra.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Localizar la tarea de recepción final de esta obra (por la marca, no por nombre)
  SELECT pt.id INTO v_plantilla
    FROM dilesa.plantilla_tareas pt
    JOIN dilesa.construccion c ON c.id = p_construccion_id
    JOIN dilesa.tareas_construccion tc
      ON tc.id = pt.tarea_id AND tc.hito_recepcion = 'recepcion_final'
   WHERE pt.producto_id = c.producto_id AND pt.deleted_at IS NULL
   LIMIT 1;

  -- UPSERT de la recepción (1 viva por construcción)
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

  -- Marcar la tarea de recepción final como terminada (idempotente) -> avance.
  -- Solo si el estado es 'recibida' (rechazada/observada NO da la obra por terminada).
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
  'Cierra la recepción de obra. Gate: admin O rol Atención a Clientes O Dirección. UPSERT en recepcion_obra + marca (idempotente) la tarea recepcion_final como terminada cuando estado=recibida.';

REVOKE ALL ON FUNCTION dilesa.fn_recepcion_cerrar(uuid, jsonb, text, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION dilesa.fn_recepcion_cerrar(uuid, jsonb, text, date, text) TO authenticated;

-- ── 3. Trigger defensa-en-profundidad sobre el cierre de la tarea recepcion_final ─
CREATE OR REPLACE FUNCTION dilesa.fn_tg_recepcion_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_hito       text;
  v_empresa_id uuid;
BEGIN
  -- Backfill / migraciones (sin sesión auth): no gatear.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- ¿La tarea que se cierra es la recepción final? (por la marca, no por nombre)
  SELECT tc.hito_recepcion INTO v_hito
    FROM dilesa.plantilla_tareas pt
    JOIN dilesa.tareas_construccion tc ON tc.id = pt.tarea_id
   WHERE pt.id = NEW.plantilla_tarea_id;

  IF v_hito IS DISTINCT FROM 'recepcion_final' THEN
    RETURN NEW;  -- tareas normales y checklist pasan sin tocar el camino caliente
  END IF;

  -- Gate de rol para la recepción final
  v_empresa_id := NEW.empresa_id;
  IF NOT (
       core.fn_is_admin()
    OR core.fn_user_has_role('Atencion a Clientes', v_empresa_id)
    OR core.fn_user_has_role('Dirección', v_empresa_id)
  ) THEN
    RAISE EXCEPTION 'Solo Atención a Clientes (o Dirección/admin) puede cerrar la recepción de la obra.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION dilesa.fn_tg_recepcion_gate() IS
  'Defensa en profundidad: bloquea cerrar la tarea hito_recepcion=recepcion_final salvo rol Atención a Clientes/Dirección/admin. No afecta tareas normales ni el checklist. Deja pasar backfills (auth.uid() IS NULL).';

DROP TRIGGER IF EXISTS tg_recepcion_gate ON dilesa.construccion_tareas_terminadas;
CREATE TRIGGER tg_recepcion_gate
  BEFORE INSERT ON dilesa.construccion_tareas_terminadas
  FOR EACH ROW EXECUTE FUNCTION dilesa.fn_tg_recepcion_gate();

-- ── 4. Sub-slug RBAC dilesa.construccion.recepcion (gobierna el botón en UI) ───
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT 'dilesa.construccion.recepcion',
       'Construcción · Recepción de obra',
       'Form de captura: recepción de obra al contratista (checklist de verificaciones + cierre). Write = quién puede recibir.',
       parent.empresa_id, parent.seccion
FROM core.modulos parent
WHERE parent.slug = 'dilesa.construccion'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Backfill defensivo desde el padre (no esconder a quien ya tiene construcción)
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, child.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos parent ON parent.id = pr.modulo_id AND parent.slug = 'dilesa.construccion'
JOIN core.modulos child  ON child.empresa_id = parent.empresa_id AND child.slug = 'dilesa.construccion.recepcion'
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

-- Acceso explícito (read+write) para los roles que reciben: Atención a Clientes + Dirección
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT r.id, m.id, true, true
FROM core.roles r
JOIN core.empresas e ON e.id = r.empresa_id AND e.slug = 'dilesa'
JOIN core.modulos m  ON m.empresa_id = e.id AND m.slug = 'dilesa.construccion.recepcion'
WHERE r.nombre IN ('Atencion a Clientes', 'Dirección')
ON CONFLICT (rol_id, modulo_id) DO UPDATE
  SET acceso_lectura = true, acceso_escritura = true;

NOTIFY pgrst, 'reload schema';

COMMIT;
