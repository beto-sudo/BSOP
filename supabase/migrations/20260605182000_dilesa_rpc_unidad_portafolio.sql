-- Iniciativa: dilesa-portafolio-activos (Sprint — workflow unidad ↔ portafolio).
--
-- Mecanismo bidireccional pedido por Beto (2026-06-05): poder traspasar una
-- unidad/lote del inventario de un fraccionamiento hacia el portafolio de
-- activos (para darle otro uso: renta, oficina, venta como terreno), lo que la
-- saca del canal de ventas del proyecto; y poder regresarla al proyecto origen
-- para volver a ponerla a disposición del equipo de ventas.
--
-- Dos RPCs atómicas (el server action las llama; supabase-js no transacciona
-- multi-tabla en cliente):
--   - fn_liberar_unidad_portafolio: crea el activo master + su satélite por
--     tipo + liga unidades.activo_id. Devuelve el activo_id.
--   - fn_regresar_unidad_proyecto: limpia unidades.activo_id y soft-borra el
--     activo (audit trail: no se borra duro, queda con deleted_at).
--
-- SECURITY INVOKER (patrón dilesa): el caller debe tener acceso a las tablas
-- por RLS. La UI ya restringe el botón a admin / Dirección DILESA.

BEGIN;

CREATE OR REPLACE FUNCTION dilesa.fn_liberar_unidad_portafolio(
  p_unidad_id uuid,
  p_tipo text,
  p_modalidad text,
  p_valor numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = dilesa, public
AS $$
DECLARE
  u RECORD;
  v_activo_id uuid;
  v_nombre text;
  v_estado text;
BEGIN
  SELECT * INTO u FROM dilesa.unidades WHERE id = p_unidad_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unidad no encontrada';
  END IF;
  IF u.activo_id IS NOT NULL THEN
    RAISE EXCEPTION 'La unidad ya está en el portafolio';
  END IF;
  IF p_tipo NOT IN ('casa', 'lote', 'local', 'terreno', 'departamento', 'edificio', 'nave') THEN
    RAISE EXCEPTION 'Tipo de activo no soportado: %', p_tipo;
  END IF;
  IF p_modalidad NOT IN ('renta', 'venta', 'uso_propio', 'renta_venta', 'sin_definir') THEN
    RAISE EXCEPTION 'Modalidad no válida: %', p_modalidad;
  END IF;

  -- `venta` => activo en cartera (adquirido); renta/uso => en operación.
  v_estado := CASE WHEN p_modalidad = 'venta' THEN 'adquirido' ELSE 'operando' END;
  v_nombre := initcap(p_tipo) || ' ' || COALESCE(NULLIF(u.calle, ''), 'sin calle')
              || ' (' || u.identificador || ')';

  INSERT INTO dilesa.activos
    (empresa_id, tipo, nombre, estado, modalidad, clave_interna, area_m2,
     valor_estimado, situacion_legal, notas)
  VALUES
    (u.empresa_id, p_tipo, v_nombre, v_estado, p_modalidad, u.identificador, u.area_m2,
     COALESCE(p_valor, u.precio), 'Escriturado a DILESA',
     'Liberado al portafolio desde la unidad ' || u.identificador || '.')
  RETURNING id INTO v_activo_id;

  -- Satélite por tipo, con los campos físicos heredables de la unidad.
  IF p_tipo = 'casa' THEN
    INSERT INTO dilesa.activo_casa (activo_id, empresa_id, m2_terreno, m2_construccion)
    VALUES (v_activo_id, u.empresa_id, u.area_m2, u.m2_construccion);
  ELSIF p_tipo = 'lote' THEN
    INSERT INTO dilesa.activo_lote (activo_id, empresa_id, manzana, numero_lote)
    VALUES (v_activo_id, u.empresa_id, u.manzana, u.numero_lote);
  ELSIF p_tipo = 'local' THEN
    INSERT INTO dilesa.activo_local (activo_id, empresa_id, m2_rentable)
    VALUES (v_activo_id, u.empresa_id, u.area_m2);
  ELSIF p_tipo = 'terreno' THEN
    INSERT INTO dilesa.activo_terreno (activo_id, empresa_id)
    VALUES (v_activo_id, u.empresa_id);
  ELSIF p_tipo = 'departamento' THEN
    INSERT INTO dilesa.activo_departamento (activo_id, empresa_id)
    VALUES (v_activo_id, u.empresa_id);
  END IF;
  -- edificio / nave: el master basta; satélite opcional capturable después.

  UPDATE dilesa.unidades SET activo_id = v_activo_id, updated_at = now()
  WHERE id = p_unidad_id;

  RETURN v_activo_id;
END;
$$;

CREATE OR REPLACE FUNCTION dilesa.fn_regresar_unidad_proyecto(
  p_unidad_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = dilesa, public
AS $$
DECLARE
  v_activo_id uuid;
BEGIN
  SELECT activo_id INTO v_activo_id FROM dilesa.unidades
  WHERE id = p_unidad_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unidad no encontrada';
  END IF;
  IF v_activo_id IS NULL THEN
    RAISE EXCEPTION 'La unidad no está en el portafolio';
  END IF;

  -- Desliga la unidad (vuelve a contar como inventario del proyecto) y
  -- soft-borra el activo (queda en historia, fuera del portafolio activo).
  UPDATE dilesa.unidades SET activo_id = NULL, updated_at = now()
  WHERE id = p_unidad_id;
  UPDATE dilesa.activos SET deleted_at = now(), updated_at = now()
  WHERE id = v_activo_id;
END;
$$;

GRANT EXECUTE ON FUNCTION dilesa.fn_liberar_unidad_portafolio(uuid, text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION dilesa.fn_regresar_unidad_proyecto(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
