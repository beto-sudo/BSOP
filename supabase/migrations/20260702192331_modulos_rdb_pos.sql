-- ╭─ 20260702192331_modulos_rdb_pos ─╮
-- rdb-pos-propio · S2 — Módulos RBAC del POS (ADR-014/ADR-030/ADR-056):
-- padre umbrella `rdb.pos` + sub-slugs captura/kds/admin, con backfill
-- defensivo de permisos (captura y kds a todos los roles RDB; admin queda
-- solo para admins globales — gobierna PINs/estaciones).

BEGIN;

-- Paso 1a: módulo padre `rdb.pos` (hereda empresa_id y seccion de rdb.ventas
-- — sección 'operaciones', junto a Ventas y Cortes).
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT 'rdb.pos', 'Punto de Venta', 'POS propio de RDB — captura, KDS y cobro (ADR-056)',
       parent.empresa_id, parent.seccion
FROM core.modulos parent
WHERE parent.slug = 'rdb.ventas'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Paso 1b: sub-slugs (heredan del padre recién insertado).
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT s.slug, s.nombre, s.descripcion, parent.empresa_id, parent.seccion
FROM (
  VALUES
    ('rdb.pos.captura', 'POS · Captura', 'Captura táctil de cuentas y cobro (mostrador/meseros)'),
    ('rdb.pos.kds',     'POS · Cocina',  'Kitchen Display — comandas en tiempo real'),
    ('rdb.pos.admin',   'POS · Admin',   'Estaciones, operadores/PINs y configuración del POS')
) AS s(slug, nombre, descripcion)
CROSS JOIN core.modulos parent
WHERE parent.slug = 'rdb.pos'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Paso 2: backfill de permisos — captura y kds a todos los roles de RDB
-- (módulo operativo de piso). `rdb.pos.admin` NO se backfillea: queda
-- accesible solo para admins globales (override de fn_is_admin) hasta que
-- Beto asigne permisos explícitos por rol.
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT r.id, m.id, true, true
FROM core.roles r
JOIN core.empresas e ON e.id = r.empresa_id
JOIN core.modulos m ON m.empresa_id = r.empresa_id
WHERE e.slug = 'rdb'
  AND m.slug IN ('rdb.pos', 'rdb.pos.captura', 'rdb.pos.kds')
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

-- Paso 3: RPCs de administración del POS (solo admin global — gobierna
-- estaciones y PINs). La UI de /rdb/pos/admin las consume; RLS de escritura
-- en pos_* es deny-all, así que esta es la única vía.

CREATE OR REPLACE FUNCTION rdb.fn_pos_admin_upsert_estacion(
  p_empresa_id uuid, p_nombre text, p_tipo text,
  p_activa boolean DEFAULT true, p_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'rdb', 'core', 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT core.fn_is_admin() THEN
    RAISE EXCEPTION 'POS: solo administradores gestionan estaciones';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO rdb.pos_estaciones (empresa_id, nombre, tipo, activa)
    VALUES (p_empresa_id, p_nombre, p_tipo, p_activa)
    RETURNING id INTO v_id;
  ELSE
    UPDATE rdb.pos_estaciones
    SET nombre = p_nombre, tipo = p_tipo, activa = p_activa, updated_at = now()
    WHERE id = p_id AND empresa_id = p_empresa_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'POS: estación inexistente'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION rdb.fn_pos_admin_guardar_operador(
  p_empleado_id uuid, p_puede_autorizar boolean DEFAULT false,
  p_activo boolean DEFAULT true, p_pin text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'rdb', 'erp', 'core', 'extensions', 'public'
AS $$
DECLARE
  v_empresa uuid;
  v_id uuid;
BEGIN
  IF NOT core.fn_is_admin() THEN
    RAISE EXCEPTION 'POS: solo administradores gestionan operadores';
  END IF;
  SELECT empresa_id INTO v_empresa FROM erp.empleados WHERE id = p_empleado_id;
  IF v_empresa IS NULL THEN RAISE EXCEPTION 'POS: empleado inexistente'; END IF;
  IF p_pin IS NOT NULL AND p_pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'POS: el PIN debe ser de 4 a 6 dígitos';
  END IF;
  IF p_pin IS NULL AND NOT EXISTS (
    SELECT 1 FROM rdb.pos_operadores
    WHERE empresa_id = v_empresa AND empleado_id = p_empleado_id
  ) THEN
    RAISE EXCEPTION 'POS: operador nuevo requiere PIN';
  END IF;

  INSERT INTO rdb.pos_operadores (empresa_id, empleado_id, pin_hash, puede_autorizar, activo)
  VALUES (v_empresa, p_empleado_id,
          extensions.crypt(p_pin, extensions.gen_salt('bf')),
          p_puede_autorizar, p_activo)
  ON CONFLICT (empresa_id, empleado_id) DO UPDATE SET
    pin_hash = CASE WHEN p_pin IS NOT NULL
                    THEN extensions.crypt(p_pin, extensions.gen_salt('bf'))
                    ELSE rdb.pos_operadores.pin_hash END,
    puede_autorizar = p_puede_autorizar,
    activo = p_activo,
    updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'rdb.fn_pos_admin_upsert_estacion(uuid, text, text, boolean, uuid)',
    'rdb.fn_pos_admin_guardar_operador(uuid, boolean, boolean, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
