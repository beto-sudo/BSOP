-- ╭─ 20260702224039_rdb_pos_zonas_folio_pedidos ─╮
-- rdb-pos-propio · S3a — hallazgos de la revisión de Waitry (2026-07-02):
-- (1) catálogo de zonas (fin del texto libre en ubicación), (2) folio corto
-- diario por cuenta para referencia verbal, (3) módulo RBAC rdb.pos.pedidos
-- (tab de pedidos del día). Seeds robustos a Preview (JOIN a core.empresas).

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Catálogo de zonas (espejo de los "puntos de acceso" de Waitry).
-- -----------------------------------------------------------------------------
CREATE TABLE rdb.pos_zonas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES core.empresas(id),
  nombre      text NOT NULL,
  orden       integer NOT NULL DEFAULT 100,
  activa      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, nombre)
);

ALTER TABLE rdb.pos_zonas ENABLE ROW LEVEL SECURITY;
CREATE POLICY pos_zonas_select ON rdb.pos_zonas FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT core.fn_current_empresa_ids()) OR (SELECT core.fn_is_admin()));
GRANT SELECT ON rdb.pos_zonas TO authenticated;
GRANT ALL ON rdb.pos_zonas TO service_role;

-- Seed con las zonas operativas actuales (de Waitry).
INSERT INTO rdb.pos_zonas (empresa_id, nombre, orden)
SELECT e.id, z.nombre, z.orden
FROM (
  VALUES
    ('Tiendita', 10), ('Pádel 1', 21), ('Pádel 2', 22), ('Pádel 3', 23),
    ('Pádel 4', 24), ('Pádel 5', 25), ('Pádel 6', 26), ('Pádel 7', 27),
    ('Pádel 8', 28), ('Pádel 9', 29), ('Pádel 10', 30), ('Tenis', 40),
    ('PickleBall', 50), ('Mesas Open Padel', 60)
) AS z(nombre, orden)
JOIN core.empresas e ON e.slug = 'rdb'
ON CONFLICT (empresa_id, nombre) DO NOTHING;

CREATE OR REPLACE FUNCTION rdb.fn_pos_admin_upsert_zona(
  p_empresa_id uuid, p_nombre text,
  p_orden integer DEFAULT 100, p_activa boolean DEFAULT true, p_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'rdb', 'core', 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT core.fn_is_admin() THEN
    RAISE EXCEPTION 'POS: solo administradores gestionan zonas';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO rdb.pos_zonas (empresa_id, nombre, orden, activa)
    VALUES (p_empresa_id, p_nombre, p_orden, p_activa)
    RETURNING id INTO v_id;
  ELSE
    UPDATE rdb.pos_zonas
    SET nombre = p_nombre, orden = p_orden, activa = p_activa, updated_at = now()
    WHERE id = p_id AND empresa_id = p_empresa_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'POS: zona inexistente'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION rdb.fn_pos_admin_upsert_zona(uuid, text, integer, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rdb.fn_pos_admin_upsert_zona(uuid, text, integer, boolean, uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) Folio corto diario por cuenta ("#7 de hoy") — para referencia verbal.
-- -----------------------------------------------------------------------------
ALTER TABLE rdb.pos_cuentas
  ADD COLUMN IF NOT EXISTS fecha_operativa date NOT NULL
    DEFAULT ((now() AT TIME ZONE 'America/Matamoros'))::date,
  ADD COLUMN IF NOT EXISTS folio integer;

CREATE UNIQUE INDEX IF NOT EXISTS pos_cuentas_folio_uq
  ON rdb.pos_cuentas (empresa_id, fecha_operativa, folio)
  WHERE folio IS NOT NULL;

-- Redefinición de fn_pos_abrir_cuenta (misma firma): asigna folio diario bajo
-- advisory lock transaccional (volumen bajo; sin riesgo de contención real).
CREATE OR REPLACE FUNCTION rdb.fn_pos_abrir_cuenta(
  p_estacion_id uuid, p_pin text, p_client_action_id uuid,
  p_ubicacion text DEFAULT NULL, p_tipo_venta text DEFAULT 'normal',
  p_cliente_nombre text DEFAULT NULL, p_playtomic_folio text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'rdb', 'erp', 'public'
AS $$
DECLARE
  v_empresa_id uuid;
  v_empleado   uuid;
  v_cuenta     uuid;
  v_hoy        date := ((now() AT TIME ZONE 'America/Matamoros'))::date;
  v_folio      integer;
BEGIN
  SELECT empresa_id INTO v_empresa_id FROM rdb.pos_estaciones
  WHERE id = p_estacion_id AND activa;
  IF v_empresa_id IS NULL THEN RAISE EXCEPTION 'POS: estación inválida o inactiva'; END IF;

  -- Idempotencia: mismo tap devuelve la cuenta original.
  SELECT id INTO v_cuenta FROM rdb.pos_cuentas WHERE client_action_id = p_client_action_id;
  IF v_cuenta IS NOT NULL THEN RETURN v_cuenta; END IF;

  v_empleado := rdb.fn_pos_resolver_operador(v_empresa_id, p_pin);

  PERFORM pg_advisory_xact_lock(hashtext('pos_folio' || v_empresa_id::text || v_hoy::text));
  SELECT COALESCE(MAX(folio), 0) + 1 INTO v_folio
  FROM rdb.pos_cuentas
  WHERE empresa_id = v_empresa_id AND fecha_operativa = v_hoy;

  INSERT INTO rdb.pos_cuentas
    (empresa_id, estacion_id, ubicacion, tipo_venta, cliente_nombre,
     playtomic_folio, abierta_por, client_action_id, fecha_operativa, folio)
  VALUES
    (v_empresa_id, p_estacion_id, p_ubicacion, p_tipo_venta, p_cliente_nombre,
     p_playtomic_folio, v_empleado, p_client_action_id, v_hoy, v_folio)
  RETURNING id INTO v_cuenta;

  PERFORM rdb.fn_pos_log_evento(v_empresa_id, 'cuenta_abierta', v_empleado,
    p_estacion_id, v_cuenta, NULL, NULL, NULL,
    jsonb_build_object('ubicacion', p_ubicacion, 'tipo_venta', p_tipo_venta,
                       'folio', v_folio));
  RETURN v_cuenta;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3) Módulo RBAC rdb.pos.pedidos (tab "Pedidos" — live + historial del día).
--    Mismo backfill que captura/kds: todos los roles RDB.
-- -----------------------------------------------------------------------------
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT 'rdb.pos.pedidos', 'POS · Pedidos', 'Pedidos del día — abiertos e historial por zona',
       parent.empresa_id, parent.seccion
FROM core.modulos parent
WHERE parent.slug = 'rdb.pos'
ON CONFLICT (empresa_id, slug) DO NOTHING;

INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT r.id, m.id, true, true
FROM core.roles r
JOIN core.empresas e ON e.id = r.empresa_id
JOIN core.modulos m ON m.empresa_id = r.empresa_id
WHERE e.slug = 'rdb' AND m.slug = 'rdb.pos.pedidos'
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
