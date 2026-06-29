-- CxP — consolidar varios pagos del mismo proveedor en uno (iniciativa `cxp`).
--
-- Fase 2 de la agrupación de pagos: cuando ya existen varios `cxp_pagos` sueltos
-- del mismo proveedor (programado/aprobado), Dirección los consolida en UNO para
-- pagarlos con una sola transferencia (un comprobante, un movimiento bancario,
-- vía `cxp_pago_autorizar_y_pagar`).
--
-- Cómo: se elige el pago más antiguo como "sobreviviente", se mueven a él las
-- aplicaciones de los demás (sumando si coinciden en la misma factura, por el
-- UNIQUE (pago_id, factura_id)), se recalcula su `monto_total` y los demás quedan
-- 'cancelado' (ya sin aplicaciones). Es SALDO-NEUTRAL: el conjunto de
-- aplicaciones en pagos vivos no cambia (solo se reagrupa), así que el comprometido
-- y el saldo por factura quedan idénticos.

BEGIN;

CREATE OR REPLACE FUNCTION erp.cxp_pago_consolidar(p_pago_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'erp', 'public'
AS $function$
DECLARE
  v_survivor uuid;
  v_empresa uuid;
  v_n_empresas int;
  v_n_proveedores int;
  v_n_invalidos int;
  v_total numeric(14, 2);
BEGIN
  IF p_pago_ids IS NULL OR array_length(p_pago_ids, 1) IS NULL OR array_length(p_pago_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Selecciona al menos 2 pagos para consolidar';
  END IF;

  -- Bloquea las filas involucradas.
  PERFORM 1 FROM erp.cxp_pagos WHERE id = ANY(p_pago_ids) FOR UPDATE;

  -- Todos deben existir, estar vivos y en estado consolidable.
  SELECT count(*) INTO v_n_invalidos
  FROM unnest(p_pago_ids) AS x(id)
  LEFT JOIN erp.cxp_pagos p ON p.id = x.id
  WHERE p.id IS NULL OR p.deleted_at IS NOT NULL OR p.estado NOT IN ('programado', 'aprobado');
  IF v_n_invalidos > 0 THEN
    RAISE EXCEPTION 'Todos los pagos deben existir y estar programados o aprobados (sin cancelar ni pagar)';
  END IF;

  -- Mismo empresa y mismo proveedor (una transferencia = un beneficiario).
  SELECT count(DISTINCT empresa_id), count(DISTINCT proveedor_id)
    INTO v_n_empresas, v_n_proveedores
  FROM erp.cxp_pagos WHERE id = ANY(p_pago_ids);
  IF v_n_empresas <> 1 THEN
    RAISE EXCEPTION 'Los pagos son de empresas distintas';
  END IF;
  SELECT empresa_id INTO v_empresa FROM erp.cxp_pagos WHERE id = ANY(p_pago_ids) LIMIT 1;
  IF v_n_proveedores <> 1 THEN
    RAISE EXCEPTION 'Solo se pueden consolidar pagos del mismo proveedor';
  END IF;

  -- Gate Dirección (igual que autorizar/pagar).
  IF NOT (core.fn_is_admin() OR core.fn_user_has_role('Dirección', v_empresa)) THEN
    RAISE EXCEPTION 'Solo admin o un usuario con rol Dirección puede consolidar pagos';
  END IF;

  -- Sobreviviente = el más antiguo.
  SELECT id INTO v_survivor
  FROM erp.cxp_pagos WHERE id = ANY(p_pago_ids)
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  -- Mueve las aplicaciones de los demás al sobreviviente, sumando si la misma
  -- factura ya está aplicada en él (respeta el UNIQUE (pago_id, factura_id)).
  INSERT INTO erp.cxp_pago_aplicaciones (empresa_id, pago_id, factura_id, monto_aplicado)
  SELECT empresa_id, v_survivor, factura_id, SUM(monto_aplicado)
  FROM erp.cxp_pago_aplicaciones
  WHERE pago_id = ANY(p_pago_ids) AND pago_id <> v_survivor
  GROUP BY empresa_id, factura_id
  ON CONFLICT (pago_id, factura_id)
  DO UPDATE SET monto_aplicado = erp.cxp_pago_aplicaciones.monto_aplicado + EXCLUDED.monto_aplicado;

  DELETE FROM erp.cxp_pago_aplicaciones
  WHERE pago_id = ANY(p_pago_ids) AND pago_id <> v_survivor;

  -- Recalcula el total del sobreviviente desde sus aplicaciones.
  SELECT COALESCE(SUM(monto_aplicado), 0) INTO v_total
  FROM erp.cxp_pago_aplicaciones WHERE pago_id = v_survivor;
  UPDATE erp.cxp_pagos SET monto_total = v_total, updated_at = now() WHERE id = v_survivor;

  -- Los demás quedan cancelados (ya sin aplicaciones; no revierten nada).
  UPDATE erp.cxp_pagos
     SET estado = 'cancelado',
         notas = trim(both ' ·' from COALESCE(notas, '') || ' · consolidado en pago ' || v_survivor),
         updated_at = now()
   WHERE id = ANY(p_pago_ids) AND id <> v_survivor;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (v_empresa, auth.uid(), 'cxp_pago_consolidado', 'erp.cxp_pagos', v_survivor,
    jsonb_build_object('pago_ids', to_jsonb(p_pago_ids), 'monto_total', v_total));

  RETURN v_survivor;
END;
$function$;

REVOKE EXECUTE ON FUNCTION erp.cxp_pago_consolidar(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION erp.cxp_pago_consolidar(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION erp.cxp_pago_consolidar(uuid[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
