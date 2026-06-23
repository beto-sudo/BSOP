-- ╭─ 20260623034751_compras_emision_guard_direccion ─╮
-- Blindaje server-side del candado de compras — iniciativa dilesa-compras-flujo · Sprint 3.
--
-- Garantiza EN LA BASE DE DATOS que, en las empresas que lo exijan (DILESA),
-- solo un admin global o el rol "Dirección" pueda EMITIR una orden de compra
-- (que `erp.ordenes_compra.estado` llegue a 'enviada' — el momento en que se
-- compromete el presupuesto). Defensa en profundidad detrás del gate de UI del
-- Sprint 1: cubre los 3 caminos de emisión (adjudicar RFQ, generar OC directa,
-- marcar enviada) en un solo punto, y AUDITA cada emisión.
--
-- RDB y las demás empresas: sin cambio (el flag arranca en false). Backend
-- (service_role) y migraciones (postgres, sin JWT) pasan sin gate.

BEGIN;

-- ── 1. Flag de gobierno por empresa (deriva de core.empresas; alinea con la
--       iniciativa rollout-multiempresa) ───────────────────────────────────────
ALTER TABLE core.empresas
  ADD COLUMN IF NOT EXISTS compras_emision_requiere_direccion boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN core.empresas.compras_emision_requiere_direccion IS
  'Si true, emitir una orden de compra (estado -> enviada) exige admin o rol '
  'Dirección (enforcement server-side en erp.fn_guard_oc_emision). '
  'Iniciativa dilesa-compras-flujo S3.';

UPDATE core.empresas SET compras_emision_requiere_direccion = true WHERE slug = 'dilesa';

-- ── 2. Guard + auditoría de la emisión de OC ────────────────────────────────
CREATE OR REPLACE FUNCTION erp.fn_guard_oc_emision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, core, public
AS $fn$
DECLARE
  v_nueva_emision boolean;
  v_requiere boolean;
BEGIN
  -- ¿Esta escritura EMITE la OC? Insert directo en 'enviada' (adjudicar / OC
  -- directa) o transición borrador -> 'enviada' (marcar enviada). La recepción
  -- (enviada -> parcial/cerrada) y los borradores NO disparan el candado.
  v_nueva_emision := NEW.estado = 'enviada'
    AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'enviada');
  IF NOT v_nueva_emision THEN
    RETURN NEW;
  END IF;

  -- Solo gobierna a usuarios autenticados; el backend (service_role) y las
  -- migraciones (postgres, sin JWT) pasan sin gate.
  IF coalesce(auth.role(), '') <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- ¿La empresa exige Dirección para emitir?
  SELECT compras_emision_requiere_direccion INTO v_requiere
    FROM core.empresas WHERE id = NEW.empresa_id;
  IF NOT coalesce(v_requiere, false) THEN
    RETURN NEW;
  END IF;

  -- Candado de dinero (D1/D2): admin global O rol "Dirección" de la empresa.
  IF NOT (core.fn_is_admin() OR core.fn_user_has_role('Dirección', NEW.empresa_id)) THEN
    RAISE EXCEPTION 'Solo Dirección o un admin puede emitir órdenes de compra'
      USING ERRCODE = '42501';
  END IF;

  -- Auditoría de la emisión (quién, qué OC, monto, origen).
  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (
    NEW.empresa_id, auth.uid(), 'oc_emitida', 'erp.ordenes_compra', NEW.id,
    jsonb_build_object(
      'estado', NEW.estado,
      'total', NEW.total,
      'proveedor_id', NEW.proveedor_id,
      'cotizacion_id', NEW.cotizacion_id,
      'requisicion_id', NEW.requisicion_id
    )
  );

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION erp.fn_guard_oc_emision() IS
  'Guard server-side: en empresas con compras_emision_requiere_direccion=true, '
  'solo admin o rol Dirección puede emitir una OC (estado -> enviada); audita en '
  'core.audit_log (accion oc_emitida). Iniciativa dilesa-compras-flujo S3.';

DROP TRIGGER IF EXISTS erp_oc_guard_emision ON erp.ordenes_compra;
CREATE TRIGGER erp_oc_guard_emision
  BEFORE INSERT OR UPDATE ON erp.ordenes_compra
  FOR EACH ROW EXECUTE FUNCTION erp.fn_guard_oc_emision();

-- Recarga el cache de PostgREST (columna nueva en core.empresas).
NOTIFY pgrst, 'reload schema';

COMMIT;
