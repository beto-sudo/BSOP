-- CxP — nuevo reparto de responsabilidades de pago (iniciativa `cxp`).
--
-- Decisión operativa (reunión Michelle + Administración, 2026-06-29):
--   • Contabilidad: carga facturas, clasifica partida/cuenta y **programa** los
--     pagos (los cargan ellos mismos en el banco). → "programar" deja de exigir
--     rol Dirección (el gate de pantalla lo da el acceso al módulo).
--   • Dirección (Michelle): **autoriza y registra** el pago en BSOP. → la
--     ejecución (marcar pagado) pasa a exigir rol Dirección.
--
-- Antes, "programar = autoriza" (un paso de Dirección en la pestaña Facturas) y
-- "marcar pagado" era libre. Se invierte: programar libre, ejecutar gateado.
--
-- Esta migración:
--   1. `cxp_pago_autorizar_y_pagar` — RPC nueva: en un paso aprueba (si venía
--      'programado') y marca pagado. Gate Dirección. Es la acción de Michelle.
--      Exige además fecha de pago y comprobante cargado (erp.adjuntos).
--   2. `cxp_pago_marcar_pagado` — se le agrega el gate Dirección (defensa: ya no
--      debe poder ejecutarla Contabilidad).
--   3. `cxp_pago_aprobar` se mantiene con su gate Dirección (sin cambios).
--
-- Aplica a TODAS las empresas: el gate es por rol Dirección en cada empresa.

BEGIN;

-- ── 1. RPC combinada: autorizar (aprobar) + registrar pago (marcar pagado) ────
-- Acepta un pago en 'programado' (lo aprueba en el camino) o 'aprobado' (legacy
-- del flujo anterior). Atómica: o queda pagado o no cambia nada.
CREATE OR REPLACE FUNCTION erp.cxp_pago_autorizar_y_pagar(
  p_pago_id uuid,
  p_fecha_pago date DEFAULT CURRENT_DATE,
  p_referencia text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'erp', 'public'
AS $function$
DECLARE
  v erp.cxp_pagos%ROWTYPE;
BEGIN
  SELECT * INTO v FROM erp.cxp_pagos
   WHERE id = p_pago_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago % no existe o está cancelado', p_pago_id;
  END IF;
  IF v.estado NOT IN ('programado', 'aprobado') THEN
    RAISE EXCEPTION 'El pago debe estar programado o aprobado para autorizarse y pagarse (estado actual: %)', v.estado;
  END IF;
  IF NOT (core.fn_is_admin() OR core.fn_user_has_role('Dirección', v.empresa_id)) THEN
    RAISE EXCEPTION 'Solo admin o un usuario con rol Dirección puede autorizar y registrar pagos';
  END IF;
  -- Exige fecha de pago y comprobante cargado (control financiero: no se registra
  -- un egreso sin fecha ni evidencia). El comprobante vive en erp.adjuntos.
  IF p_fecha_pago IS NULL THEN
    RAISE EXCEPTION 'La fecha de pago es obligatoria';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM erp.adjuntos
    WHERE entidad_tipo = 'cxp_pago' AND entidad_id = p_pago_id
      AND rol = 'comprobante' AND sustituido_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Sube el comprobante del pago antes de autorizar y registrarlo';
  END IF;

  UPDATE erp.cxp_pagos
     SET estado = 'pagado',
         -- Si venía 'programado', sella también la autorización en este paso.
         aprobado_por = COALESCE(aprobado_por, auth.uid()),
         aprobado_at  = COALESCE(aprobado_at, now()),
         fecha_pago = p_fecha_pago,
         referencia = COALESCE(p_referencia, referencia),
         pagado_por = auth.uid(),
         pagado_at = now(),
         updated_at = now()
   WHERE id = p_pago_id;

  -- Gancho de tesorería (ADR-037 D4). Solo si se conoce la cuenta.
  IF v.cuenta_bancaria_id IS NOT NULL THEN
    INSERT INTO erp.movimientos_bancarios (
      empresa_id, cuenta_id, tipo, monto, fecha, descripcion, referencia,
      referencia_tipo, referencia_id, conciliado
    ) VALUES (
      v.empresa_id, v.cuenta_bancaria_id, 'cargo', v.monto_total, p_fecha_pago,
      'Pago CxP', COALESCE(p_referencia, v.referencia), 'cxp_pago', p_pago_id, false
    );
  END IF;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (v.empresa_id, auth.uid(), 'cxp_pago_autorizado_y_pagado', 'erp.cxp_pagos', p_pago_id,
    jsonb_build_object('fecha_pago', p_fecha_pago, 'referencia', p_referencia,
      'monto', v.monto_total, 'cuenta_bancaria_id', v.cuenta_bancaria_id,
      'estado_previo', v.estado));
END;
$function$;

REVOKE EXECUTE ON FUNCTION erp.cxp_pago_autorizar_y_pagar(uuid, date, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION erp.cxp_pago_autorizar_y_pagar(uuid, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION erp.cxp_pago_autorizar_y_pagar(uuid, date, text) TO authenticated, service_role;

-- ── 2. Gate Dirección en marcar_pagado (antes era libre) ─────────────────────
-- Redefinida desde la versión viva en prod + el chequeo de rol. Mantiene el
-- gancho de tesorería y el audit intactos.
CREATE OR REPLACE FUNCTION erp.cxp_pago_marcar_pagado(
  p_pago_id uuid,
  p_fecha_pago date DEFAULT CURRENT_DATE,
  p_referencia text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'erp', 'public'
AS $function$
DECLARE
  v erp.cxp_pagos%ROWTYPE;
BEGIN
  SELECT * INTO v FROM erp.cxp_pagos
   WHERE id = p_pago_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago % no existe o está cancelado', p_pago_id;
  END IF;
  IF v.estado <> 'aprobado' THEN
    RAISE EXCEPTION 'El pago debe estar aprobado antes de marcarse pagado (estado actual: %)', v.estado;
  END IF;
  IF NOT (core.fn_is_admin() OR core.fn_user_has_role('Dirección', v.empresa_id)) THEN
    RAISE EXCEPTION 'Solo admin o un usuario con rol Dirección puede registrar el pago';
  END IF;

  UPDATE erp.cxp_pagos
     SET estado = 'pagado',
         fecha_pago = p_fecha_pago,
         referencia = COALESCE(p_referencia, referencia),
         pagado_por = auth.uid(),
         pagado_at = now(),
         updated_at = now()
   WHERE id = p_pago_id;

  IF v.cuenta_bancaria_id IS NOT NULL THEN
    INSERT INTO erp.movimientos_bancarios (
      empresa_id, cuenta_id, tipo, monto, fecha, descripcion, referencia,
      referencia_tipo, referencia_id, conciliado
    ) VALUES (
      v.empresa_id, v.cuenta_bancaria_id, 'cargo', v.monto_total, p_fecha_pago,
      'Pago CxP', COALESCE(p_referencia, v.referencia), 'cxp_pago', p_pago_id, false
    );
  END IF;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (v.empresa_id, auth.uid(), 'cxp_pago_pagado', 'erp.cxp_pagos', p_pago_id,
    jsonb_build_object('fecha_pago', p_fecha_pago, 'referencia', p_referencia,
      'monto', v.monto_total, 'cuenta_bancaria_id', v.cuenta_bancaria_id));
END;
$function$;

COMMIT;
