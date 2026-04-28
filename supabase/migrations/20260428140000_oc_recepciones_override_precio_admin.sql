-- ============================================================
-- Sprint 3 — OC Recepciones: gate admin para override de precio_real
-- ============================================================
-- Iniciativa: oc-recepciones (docs/planning/oc-recepciones.md)
--
-- Sprint 1 dejó las columnas precio_real / precio_modificado_por /
-- precio_modificado_at en erp.ordenes_compra_detalle. Sprint 3
-- agrega el gate de seguridad: sólo administradores pueden
-- modificar precio_real, y el audit se llena automáticamente.
--
-- Decisión (ver doc de planning, riesgo "modelo de rol Gerente"):
-- el repo no tiene granularidad de "Gerente" por módulo — usamos
-- core.fn_is_admin() como gate. Es suficiente porque los pocos
-- usuarios con override autorizado son admins en este punto del
-- desarrollo. Si después se modela "Gerente", basta cambiar la
-- comparación de la función.

CREATE OR REPLACE FUNCTION erp.fn_oc_detalle_precio_real_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_usuario_id uuid;
BEGIN
  -- Sólo intervenir si precio_real cambió
  IF NEW.precio_real IS NOT DISTINCT FROM OLD.precio_real THEN
    RETURN NEW;
  END IF;

  -- Gate: sólo admin puede tocar precio_real
  IF NOT core.fn_is_admin() THEN
    RAISE EXCEPTION 'Sólo un administrador puede modificar precio_real (override de precio en recepción)'
      USING ERRCODE = '42501';
  END IF;

  -- Resolver usuario actual para audit
  SELECT id INTO v_usuario_id
  FROM core.usuarios
  WHERE email = lower(coalesce(auth.jwt() ->> 'email', ''))
    AND activo = true
  LIMIT 1;

  -- Auto-llenar audit columns
  NEW.precio_modificado_por := v_usuario_id;
  NEW.precio_modificado_at := now();

  -- Audit log — usa el helper de Sprint 1 para shape consistente
  PERFORM erp.fn_oc_audit(
    NEW.empresa_id,
    'oc_override_precio_real',
    'erp.ordenes_compra_detalle',
    NEW.id,
    jsonb_build_object('precio_real', OLD.precio_real),
    jsonb_build_object('precio_real', NEW.precio_real)
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION erp.fn_oc_detalle_precio_real_guard() IS
  'Trigger guard sobre erp.ordenes_compra_detalle: bloquea cambios a precio_real para no-admins, auto-llena precio_modificado_por/at, registra audit log.';

DROP TRIGGER IF EXISTS trg_oc_detalle_precio_real_guard ON erp.ordenes_compra_detalle;
CREATE TRIGGER trg_oc_detalle_precio_real_guard
BEFORE UPDATE OF precio_real ON erp.ordenes_compra_detalle
FOR EACH ROW EXECUTE FUNCTION erp.fn_oc_detalle_precio_real_guard();

-- Fin Sprint 3
