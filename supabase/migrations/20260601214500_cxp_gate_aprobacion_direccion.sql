-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260601214500_cxp_gate_aprobacion_direccion                      │
-- │                                                                    │
-- │  Corrección del gate de aprobación de pagos CxP (decisión de Beto):│
-- │  la autoridad de aprobación es el ROL "Dirección" (modelo de roles │
-- │  core.usuarios_empresas + core.roles), NO el puesto "Comité         │
-- │  Ejecutivo" (erp.empleados_puestos) que se usó por error en la      │
-- │  migración 20260601200000.                                         │
-- │                                                                    │
-- │  Ale, Michelle y Beto tienen el rol "Dirección" (Beto además tiene │
-- │  admin, que NO cuenta para aprobar — control financiero estricto). │
-- │                                                                    │
-- │  1. cxp_pago_aprobar pasa a gatear con core.fn_user_has_role(       │
-- │     'Dirección', empresa) — el helper canónico (ver memoria         │
-- │     reference_roles_por_empresa / ADR de roles por empresa).        │
-- │  2. Se elimina erp.es_comite_ejecutivo (modelo equivocado, recién   │
-- │     introducido en 200000, sin consumidores fuera de aquí).         │
-- │                                                                    │
-- │  Iniciativa: `cxp` (Sprint 1, corrección).                         │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- 1. Gate por rol "Dirección" (core.fn_user_has_role usa auth.uid() interno).
CREATE OR REPLACE FUNCTION erp.cxp_pago_aprobar(p_pago_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = erp, public
AS $$
DECLARE
  v erp.cxp_pagos%ROWTYPE;
BEGIN
  SELECT * INTO v FROM erp.cxp_pagos
   WHERE id = p_pago_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago % no existe o está cancelado', p_pago_id;
  END IF;
  IF v.estado <> 'programado' THEN
    RAISE EXCEPTION 'El pago no está en estado programado (estado actual: %)', v.estado;
  END IF;
  -- Autoridad de aprobación = rol "Dirección" de la empresa. Sin override
  -- de admin (decisión de Beto, control financiero estricto).
  IF NOT core.fn_user_has_role('Dirección', v.empresa_id) THEN
    RAISE EXCEPTION 'Solo un usuario con rol Dirección puede aprobar pagos';
  END IF;

  UPDATE erp.cxp_pagos
     SET estado = 'aprobado', aprobado_por = auth.uid(), aprobado_at = now(), updated_at = now()
   WHERE id = p_pago_id;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (v.empresa_id, auth.uid(), 'cxp_pago_aprobado', 'erp.cxp_pagos', p_pago_id, '{}'::jsonb);
END;
$$;

-- 2. Eliminar el helper del modelo equivocado (puesto Comité Ejecutivo).
DROP FUNCTION IF EXISTS erp.es_comite_ejecutivo(uuid, uuid);

NOTIFY pgrst, 'reload schema';

COMMIT;
