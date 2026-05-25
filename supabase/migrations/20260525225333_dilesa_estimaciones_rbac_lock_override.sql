-- ============================================================================
-- Iniciativa: dilesa-estimaciones · Sprint 2 — RBAC + lock override
-- ============================================================================
--
-- Tres cambios:
--
-- 1. Crea el rol "Gerencia Construcción" para DILESA (paralelo a
--    "Gerencia Ventas"). Inicialmente sin usuarios asignados — Beto
--    lo asigna desde Settings → Acceso cuando decida quién es gerente.
--
-- 2. Agrega sub-slug `dilesa.construccion.estimaciones` en core.modulos
--    con permisos read+write para los 7 roles existentes (patrón laxo
--    actual del módulo construcción — el control fino se hace por UI).
--
-- 3. Helper SQL `core.fn_user_has_role(role_name, empresa_id) → bool`
--    que verifica si el `auth.uid()` actual tiene asignado un rol
--    específico en una empresa. SECURITY DEFINER para bypass RLS.
--
-- 4. Update del trigger `tg_ctt_lock_pagadas` para permitir override
--    cuando el usuario tiene rol "Dirección" en DILESA o es admin
--    global (`core.fn_is_admin()`).
--
-- Migración aditiva — solo agrega rol/módulo/helper + redefine 1
-- función. 0 ALTER en tablas existentes.
-- ============================================================================

DO $$
DECLARE
  v_dilesa_id uuid;
  v_rol_id uuid;
  v_modulo_id uuid;
  v_rol_count int;
  v_perm_count int;
BEGIN
  SELECT id INTO v_dilesa_id FROM core.empresas WHERE slug = 'dilesa';
  IF v_dilesa_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró empresa DILESA';
  END IF;

  -- ── 1. Crear rol "Gerencia Construcción" (idempotente) ──────────────────
  SELECT id INTO v_rol_id
  FROM core.roles
  WHERE empresa_id = v_dilesa_id AND nombre = 'Gerencia Construcción';

  IF v_rol_id IS NULL THEN
    INSERT INTO core.roles (empresa_id, nombre, descripcion, puede_aprobar_cierres)
    VALUES (
      v_dilesa_id,
      'Gerencia Construcción',
      'Autoriza estimaciones semanales de contratistas, marca facturas recibidas y registra pagos. Paralelo a Gerencia Ventas pero para el área de construcción.',
      true  -- típicamente aprueba cierres de estimación
    )
    RETURNING id INTO v_rol_id;
    RAISE NOTICE '✓ Rol "Gerencia Construcción" creado: %', v_rol_id;
  ELSE
    RAISE NOTICE '  Rol "Gerencia Construcción" ya existía: %', v_rol_id;
  END IF;

  -- ── 2. Sub-slug dilesa.construccion.estimaciones ─────────────────────────
  INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
  VALUES (
    'dilesa.construccion.estimaciones',
    'Estimaciones',
    'Cierre semanal de pago a contratistas: agrupa tareas terminadas pendientes de pago, aplica retención, genera PDF y registra pago.',
    v_dilesa_id,
    'operaciones'
  )
  ON CONFLICT (empresa_id, slug) DO NOTHING
  RETURNING id INTO v_modulo_id;

  IF v_modulo_id IS NULL THEN
    SELECT id INTO v_modulo_id
    FROM core.modulos
    WHERE empresa_id = v_dilesa_id AND slug = 'dilesa.construccion.estimaciones';
  END IF;

  RAISE NOTICE '✓ Módulo dilesa.construccion.estimaciones: %', v_modulo_id;

  -- ── 3. Backfill permisos: read+write para TODOS los roles DILESA ────────
  -- Mismo patrón laxo que el resto del módulo construcción. El control
  -- granular (quién puede crear/aprobar/pagar estimaciones, override de
  -- lock) se hace por código UI + trigger SQL.
  INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
  SELECT r.id, v_modulo_id, true, true
  FROM core.roles r
  WHERE r.empresa_id = v_dilesa_id
  ON CONFLICT (rol_id, modulo_id) DO NOTHING;

  GET DIAGNOSTICS v_perm_count = ROW_COUNT;
  RAISE NOTICE '✓ Permisos para sub-slug estimaciones: % nuevos', v_perm_count;
END $$;

-- ── 4. Helper: core.fn_user_has_role(role_name, empresa_id) ──────────────
-- Verifica si el auth.uid() actual tiene asignado un rol específico en
-- una empresa. Usado por triggers que necesitan validar roles (como el
-- lock de tareas pagadas).
--
-- SECURITY DEFINER para bypass RLS — el trigger corre con permisos de
-- escritura del usuario pero el lookup de roles necesita visibilidad
-- total para validar correctamente.

CREATE OR REPLACE FUNCTION core.fn_user_has_role(
  p_role_name text,
  p_empresa_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, core
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM core.usuarios_empresas ue
    JOIN core.roles r ON r.id = ue.rol_id
    WHERE ue.usuario_id = auth.uid()
      AND ue.empresa_id = p_empresa_id
      AND ue.activo = true
      AND r.nombre = p_role_name
  );
$$;

COMMENT ON FUNCTION core.fn_user_has_role(text, uuid) IS
  'Verifica si auth.uid() tiene asignado un rol por nombre en una '
  'empresa. SECURITY DEFINER para bypass RLS. Usado por triggers de '
  'validación de overrides (ej. tg_ctt_lock_pagadas).';

GRANT EXECUTE ON FUNCTION core.fn_user_has_role(text, uuid) TO authenticated;

-- ── 5. Redefinir trigger lock con override para "Dirección" + admin ──────
-- ADR-033 D8. La función ahora permite des-palomeo/modificación de
-- tareas pagadas si el usuario:
--   - tiene rol "Dirección" en DILESA, O
--   - es admin global (core.usuarios.rol = 'admin')
-- En cualquier otro caso, el lock sigue activo.

CREATE OR REPLACE FUNCTION dilesa.fn_tg_ctt_lock_pagadas()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
DECLARE
  v_tarea_id uuid := COALESCE(NEW.id, OLD.id);
  v_codigo_estimacion text;
  v_dilesa_id uuid;
BEGIN
  IF NOT dilesa.fn_tarea_terminada_esta_pagada(v_tarea_id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Tarea SÍ está en estimación pagada. Evaluamos overrides.
  SELECT id INTO v_dilesa_id FROM core.empresas WHERE slug = 'dilesa' LIMIT 1;

  -- Override 1: admin global (core.usuarios.rol='admin')
  IF core.fn_is_admin() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Override 2: rol "Dirección" en DILESA
  IF v_dilesa_id IS NOT NULL AND core.fn_user_has_role('Dirección', v_dilesa_id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Sin override → bloquear con mensaje claro
  SELECT e.codigo INTO v_codigo_estimacion
  FROM dilesa.estimacion_tareas et
  JOIN dilesa.estimaciones e ON e.id = et.estimacion_id
  WHERE et.tarea_terminada_id = v_tarea_id
    AND e.estado = 'pagada'
    AND e.deleted_at IS NULL
  LIMIT 1;

  RAISE EXCEPTION 'Tarea bloqueada: está incluida en estimación pagada (%). '
                  'No se puede modificar ni eliminar. Si requieres ajuste, '
                  'pide a alguien de Dirección.', v_codigo_estimacion
    USING ERRCODE = 'check_violation';
END $func$;

COMMENT ON FUNCTION dilesa.fn_tg_ctt_lock_pagadas() IS
  'Trigger function: bloquea UPDATE/DELETE en construccion_tareas_terminadas '
  'si la tarea ya está en estimación pagada. Permite override para rol '
  '"Dirección" en DILESA o admin global. ADR-033 D8 (post-Sprint 2).';

NOTIFY pgrst, 'reload schema';
