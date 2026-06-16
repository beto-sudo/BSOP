-- ╭─ 20260616020428_dilesa_ventas_audit_descuentos ─╮
-- Iniciativa `dilesa-descuentos-promos` · Sprint 1 — auditoría + amarre total↔buckets.
--
-- Cierra dos huecos del descuento de venta (diagnóstico 2026-06-15):
--   1. Auditoría: editar el descuento de una venta era un UPDATE plano sin
--      rastro. `dilesa.ventas` no pasaba por ningún auditor (0 filas en
--      core.audit_log). Ahora todo cambio va por una RPC SECURITY DEFINER que
--      registra anterior/nuevo (patrón de erp.fn_oc_audit: autor vía email del
--      JWT → core.usuarios.id).
--   2. Amarre `total↔buckets`: el motor lee `descuento_total` como el monto
--      autoritativo (decisión Beto 2026-06-15: "en uno se define cuánto, los
--      buckets definen en qué se aplica, ligados por sum(buckets)=total"). La
--      RPC garantiza el amarre: si se mandan buckets, su suma debe cuadrar con
--      el total; si no, es modo total-only (ej. captura en Formalizada) y no
--      toca el desglose.
--
-- Aditiva: 2 funciones nuevas. No cambia datos (0 divergencias hoy: las 1,309
-- ventas vivas ya tienen descuento_total = suma de buckets). El tope NO cambia
-- en este sprint.

BEGIN;

-- ── Helper de auditoría (patrón erp.fn_oc_audit) ────────────────────────────
-- Registra una entrada en core.audit_log para dilesa.ventas. Interno: lo
-- llaman las RPCs de descuento (no se otorga a authenticated).
CREATE OR REPLACE FUNCTION dilesa.fn_venta_auditar_descuentos(
  p_empresa_id uuid,
  p_accion text,
  p_venta_id uuid,
  p_datos_anteriores jsonb,
  p_datos_nuevos jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_usuario_id uuid;
BEGIN
  SELECT id INTO v_usuario_id
  FROM core.usuarios
  WHERE email = lower(coalesce(auth.jwt() ->> 'email', ''))
    AND activo = true
  LIMIT 1;

  INSERT INTO core.audit_log (
    empresa_id, usuario_id, accion, tabla, registro_id,
    datos_anteriores, datos_nuevos, created_at
  ) VALUES (
    p_empresa_id, v_usuario_id, p_accion, 'dilesa.ventas', p_venta_id,
    p_datos_anteriores, p_datos_nuevos, now()
  );
END;
$$;

COMMENT ON FUNCTION dilesa.fn_venta_auditar_descuentos(uuid, text, uuid, jsonb, jsonb) IS
  'Helper interno: audita cambios de descuento de dilesa.ventas en core.audit_log (autor vía email del JWT). Lo llaman las RPCs de descuento.';

-- ── RPC: actualizar descuentos de una venta (amarre + auditoría) ────────────
-- Modos:
--   • total-only  (todos los buckets NULL): set descuento_total, NO toca el
--     desglose. Lo usa la captura de Formalizada (Fase 3).
--   • con desglose (algún bucket NOT NULL): exige sum(buckets) = total y
--     persiste total + los 4 buckets. Lo usa la pestaña Cuadratura (Dirección).
-- Gate: admin global O rol en la empresa de la venta (admin nunca bloqueado).
CREATE OR REPLACE FUNCTION dilesa.fn_actualizar_descuentos_venta(
  p_venta_id uuid,
  p_descuento_total numeric,
  p_descuento_precio numeric DEFAULT NULL,
  p_descuento_equipamiento numeric DEFAULT NULL,
  p_descuento_gastos_escrituracion numeric DEFAULT NULL,
  p_descuento_nota_credito numeric DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, dilesa, core, public
AS $$
DECLARE
  v_empresa_id uuid;
  v_old jsonb;
  v_new jsonb;
  v_has_buckets boolean;
  v_sum numeric;
  v_total numeric;
BEGIN
  SELECT empresa_id INTO v_empresa_id
  FROM dilesa.ventas
  WHERE id = p_venta_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Venta % no encontrada o borrada', p_venta_id USING ERRCODE = '22023';
  END IF;

  -- Gate de empresa (admin nunca bloqueado — política Beto 2026-06-10).
  IF NOT core.fn_is_admin() AND NOT core.fn_has_empresa(v_empresa_id) THEN
    RAISE EXCEPTION 'Sin permiso para la empresa de la venta' USING ERRCODE = '42501';
  END IF;

  v_total := coalesce(p_descuento_total, 0);
  IF v_total < 0 THEN
    RAISE EXCEPTION 'El descuento total no puede ser negativo' USING ERRCODE = '22023';
  END IF;

  v_has_buckets :=
    p_descuento_precio IS NOT NULL
    OR p_descuento_equipamiento IS NOT NULL
    OR p_descuento_gastos_escrituracion IS NOT NULL
    OR p_descuento_nota_credito IS NOT NULL;

  SELECT jsonb_build_object(
    'descuento_total', descuento_total,
    'descuento_precio', descuento_precio,
    'descuento_equipamiento', descuento_equipamiento,
    'descuento_gastos_escrituracion', descuento_gastos_escrituracion,
    'descuento_nota_credito', descuento_nota_credito,
    'descuento_maximo_autorizado', descuento_maximo_autorizado,
    'promocion_id', promocion_id
  ) INTO v_old
  FROM dilesa.ventas
  WHERE id = p_venta_id;

  IF v_has_buckets THEN
    v_sum :=
      coalesce(p_descuento_precio, 0)
      + coalesce(p_descuento_equipamiento, 0)
      + coalesce(p_descuento_gastos_escrituracion, 0)
      + coalesce(p_descuento_nota_credito, 0);
    IF round(v_sum, 2) <> round(v_total, 2) THEN
      RAISE EXCEPTION 'El desglose (suma %) no cuadra con el descuento total %',
        round(v_sum, 2), round(v_total, 2) USING ERRCODE = '22023';
    END IF;
    UPDATE dilesa.ventas SET
      descuento_total = v_total,
      descuento_precio = coalesce(p_descuento_precio, 0),
      descuento_equipamiento = coalesce(p_descuento_equipamiento, 0),
      descuento_gastos_escrituracion = coalesce(p_descuento_gastos_escrituracion, 0),
      descuento_nota_credito = coalesce(p_descuento_nota_credito, 0),
      updated_at = now()
    WHERE id = p_venta_id;
  ELSE
    -- Modo total-only: el descuento se captura sin desglose (Formalizada).
    UPDATE dilesa.ventas SET
      descuento_total = v_total,
      updated_at = now()
    WHERE id = p_venta_id;
  END IF;

  SELECT jsonb_build_object(
    'descuento_total', descuento_total,
    'descuento_precio', descuento_precio,
    'descuento_equipamiento', descuento_equipamiento,
    'descuento_gastos_escrituracion', descuento_gastos_escrituracion,
    'descuento_nota_credito', descuento_nota_credito,
    'descuento_maximo_autorizado', descuento_maximo_autorizado,
    'promocion_id', promocion_id
  ) INTO v_new
  FROM dilesa.ventas
  WHERE id = p_venta_id;

  IF v_old IS DISTINCT FROM v_new THEN
    PERFORM dilesa.fn_venta_auditar_descuentos(
      v_empresa_id,
      'venta_descuentos_actualizados',
      p_venta_id,
      v_old,
      v_new || jsonb_build_object('motivo', p_motivo)
    );
  END IF;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION dilesa.fn_actualizar_descuentos_venta(uuid, numeric, numeric, numeric, numeric, numeric, text) IS
  'Actualiza el descuento de una venta (total + opcional desglose en 4 buckets), garantiza el amarre sum(buckets)=total y audita anterior/nuevo en core.audit_log. Gate: admin O rol en la empresa.';

GRANT EXECUTE ON FUNCTION dilesa.fn_actualizar_descuentos_venta(uuid, numeric, numeric, numeric, numeric, numeric, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
