-- ╭─ 20260616234205_dilesa_liberar_portafolio_v2 ─╮
-- Iniciativa dilesa-portafolio-destinos · Sprint 1.
--
-- Reemplaza `fn_liberar_unidad_portafolio` (firma con p_modalidad text) por una
-- v2 con p_destino_id uuid (catálogo `portafolio_destinos`). Cambios de negocio
-- pedidos por Beto (2026-06-16):
--   - Liberar al portafolio desde CUALQUIER estado de obra (incl. en
--     construcción): el portafolio es el marcador de "fuera de ventas", no hace
--     falta que la casa esté terminada (el avance se muestra en el portafolio).
--   - Guard: bloquear si la unidad tiene una venta viva (activa/terminada),
--     con override de admin (política admin-nunca-bloqueado) anotado en el activo.
--   - Si el destino es 'demo', marca unidades.es_muestra (paridad de reporte con
--     v_proyecto_avances.casas_muestra).
--   - `modalidad` legacy se deriva del destino para no romper lecturas viejas.
-- `fn_regresar_unidad_proyecto` ahora también limpia es_muestra (vuelve a ventas).
--
-- SECURITY INVOKER (patrón dilesa): RLS aplica al caller. La UI restringe el
-- botón a admin / Dirección.
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión).

BEGIN;

-- La firma cambia (text→uuid) ⇒ es una función distinta: hay que DROP la vieja.
DROP FUNCTION IF EXISTS dilesa.fn_liberar_unidad_portafolio(uuid, text, text, numeric);

CREATE OR REPLACE FUNCTION dilesa.fn_liberar_unidad_portafolio(
  p_unidad_id  uuid,
  p_tipo       text,
  p_destino_id uuid,
  p_valor      numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = dilesa, public
AS $$
DECLARE
  u            RECORD;
  d            RECORD;
  v_activo_id  uuid;
  v_nombre     text;
  v_estado     text;
  v_modalidad  text;
  v_venta_viva text;
  v_nota_extra text := '';
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

  -- Destino del catálogo (debe existir, estar activo y ser de la misma empresa).
  SELECT * INTO d FROM dilesa.portafolio_destinos
   WHERE id = p_destino_id AND empresa_id = u.empresa_id AND activo AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Destino de portafolio no válido o inactivo';
  END IF;

  -- Guard: no liberar una unidad con venta viva, salvo admin (queda anotado).
  SELECT v.estado INTO v_venta_viva
  FROM dilesa.ventas v
  WHERE v.unidad_id = p_unidad_id AND v.deleted_at IS NULL
    AND v.estado IN ('activa', 'terminada')
  LIMIT 1;
  IF v_venta_viva IS NOT NULL THEN
    IF NOT core.fn_is_admin() THEN
      RAISE EXCEPTION 'La unidad tiene una venta % — desasígnala antes de liberarla al portafolio', v_venta_viva;
    END IF;
    v_nota_extra := ' (liberada por admin pese a venta ' || v_venta_viva || ')';
  END IF;

  -- `cuenta_venta` ⇒ activo en cartera (adquirido); resto ⇒ en operación.
  v_estado := CASE WHEN d.cuenta_venta THEN 'adquirido' ELSE 'operando' END;

  -- modalidad legacy derivada del destino (respeta el CHECK de 5 valores).
  v_modalidad := CASE d.slug
                   WHEN 'arrendamiento' THEN 'renta'
                   WHEN 'venta'         THEN 'venta'
                   WHEN 'renta_venta'   THEN 'renta_venta'
                   WHEN 'sin_definir'   THEN 'sin_definir'
                   ELSE 'uso_propio'   -- demo / oficina / bodega / uso_propio
                 END;

  v_nombre := initcap(p_tipo) || ' ' || COALESCE(NULLIF(u.calle, ''), 'sin calle')
              || ' (' || u.identificador || ')';

  INSERT INTO dilesa.activos
    (empresa_id, tipo, nombre, estado, modalidad, destino_id, clave_interna, area_m2,
     valor_estimado, situacion_legal, notas)
  VALUES
    (u.empresa_id, p_tipo, v_nombre, v_estado, v_modalidad, d.id, u.identificador, u.area_m2,
     COALESCE(p_valor, u.precio), 'Escriturado a DILESA',
     'Liberado al portafolio desde la unidad ' || u.identificador
       || ' con destino ' || d.label || '.' || v_nota_extra)
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

  -- Liga la unidad al activo y, si el destino es demo, márcala como muestra
  -- (paridad de reporte; el marcador operativo de "fuera de ventas" es activo_id).
  UPDATE dilesa.unidades
  SET activo_id = v_activo_id,
      es_muestra = (es_muestra OR d.slug = 'demo'),
      updated_at = now()
  WHERE id = p_unidad_id;

  RETURN v_activo_id;
END;
$$;

-- Regresar al proyecto: además de deshacer la liberación, vuelve a habilitarla
-- para ventas (es_muestra=false) — ya no es activo de portafolio.
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

  UPDATE dilesa.unidades
  SET activo_id = NULL, es_muestra = false, updated_at = now()
  WHERE id = p_unidad_id;
  UPDATE dilesa.activos SET deleted_at = now(), updated_at = now()
  WHERE id = v_activo_id;
END;
$$;

GRANT EXECUTE ON FUNCTION dilesa.fn_liberar_unidad_portafolio(uuid, text, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION dilesa.fn_regresar_unidad_proyecto(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
