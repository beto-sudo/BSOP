-- ============================================================================
-- DILESA · Productos adicionales en venta (paridad Coda Fase 1)
-- ----------------------------------------------------------------------------
-- En el form de Solicitud de Asignación de Coda existe el campo "Productos
-- Adicionales" — monto $ que el vendedor declara cuando el paquete incluye
-- extras que no están en `dilesa.productos` (closets, upgrades, mejoras
-- puntuales que no ameritan ser un prototipo aparte). El monto se SUMA al
-- precio total de venta junto con valor comercial, excedente, frente verde,
-- esquina, venta futuro y costo crédito adicional.
--
-- Cambios:
--   1. Nueva columna `dilesa.ventas.productos_adicionales numeric NOT NULL
--      DEFAULT 0`. Los registros históricos importados de Coda quedan en 0
--      (el dato no se migró todavía; backfill manual si Beto lo pide).
--   2. `fn_calcular_precio_venta` gana un parámetro `p_productos_adicionales`
--      (default 0 para retro-compatibilidad) y lo suma al `precio_venta_total`.
--      Retornado en el JSONB para que el preview lo muestre.
--   3. Reload schema cache de PostgREST.
--
-- Iniciativa: `dilesa-prelaunch-audit` · Fase 1 paridad Coda.
-- ============================================================================

BEGIN;

-- ── 1. Columna nueva en ventas ───────────────────────────────────────────────

ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS productos_adicionales numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN dilesa.ventas.productos_adicionales IS
  'Monto $ de productos adicionales declarados por el vendedor — se suma al precio total. 0 si no hay extras. Paridad Coda Fase 1.';

-- ── 2. Reemplazar fn_calcular_precio_venta con parámetro nuevo ──────────────
--
-- DROP la firma vieja antes del CREATE OR REPLACE: agregar un parámetro
-- crea una OVERLOAD (función nueva con misma name pero distinta firma),
-- no reemplaza. Dejaríamos 2 funciones vivas con el mismo nombre y
-- COMMENT ON FUNCTION fallaría con "function name is not unique".

DROP FUNCTION IF EXISTS dilesa.fn_calcular_precio_venta(uuid, uuid, numeric, numeric);

CREATE OR REPLACE FUNCTION dilesa.fn_calcular_precio_venta(
  p_unidad_id uuid,
  p_tipo_credito_id uuid DEFAULT NULL,
  p_monto_credito_titular numeric DEFAULT 0,
  p_monto_credito_cotitular numeric DEFAULT 0,
  p_productos_adicionales numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unidad record;
  v_proyecto record;
  v_producto record;
  v_tipo_credito record;
  v_valor_comercial numeric(14,2);
  v_metros_excedentes numeric(8,2);
  v_valor_excedente_terreno numeric(14,2);
  v_valor_frente_verde numeric(14,2);
  v_valor_esquina numeric(14,2);
  v_pct_esquina numeric(5,4);
  v_valor_venta_futuro numeric(14,2);
  v_costo_credito_adicional numeric(14,2);
  v_productos_adicionales numeric(14,2);
  v_precio_venta_total numeric(14,2);
  v_apoyo_infonavit numeric(14,2);
  v_pago_directo numeric(14,2);
BEGIN
  -- Cargar unidad
  SELECT id, empresa_id, proyecto_id, producto_id, area_m2, es_esquina,
         tiene_frente_verde, valor_venta_futuro_snapshot, identificador
  INTO v_unidad
  FROM dilesa.unidades
  WHERE id = p_unidad_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'unidad no encontrada');
  END IF;

  -- Cargar proyecto
  SELECT id, precio_m2_excedente, tamano_lote_promedio, clasificacion_inmobiliaria
  INTO v_proyecto
  FROM dilesa.proyectos
  WHERE id = v_unidad.proyecto_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'proyecto no encontrado');
  END IF;

  -- Cargar producto (prototipo) — puede ser NULL en unidades sin asignar
  v_valor_comercial := 0;
  IF v_unidad.producto_id IS NOT NULL THEN
    SELECT valor_comercial_referencia INTO v_producto
    FROM dilesa.productos
    WHERE id = v_unidad.producto_id AND deleted_at IS NULL;
    v_valor_comercial := COALESCE(v_producto.valor_comercial_referencia, 0);
  END IF;

  -- Tipo de crédito (opcional)
  v_costo_credito_adicional := 0;
  v_apoyo_infonavit := 0;
  IF p_tipo_credito_id IS NOT NULL THEN
    SELECT costo_venta_adicional_pct, apoyo_infonavit_monto INTO v_tipo_credito
    FROM dilesa.tipos_credito
    WHERE id = p_tipo_credito_id AND deleted_at IS NULL;
    IF FOUND THEN
      v_costo_credito_adicional := v_valor_comercial * COALESCE(v_tipo_credito.costo_venta_adicional_pct, 0);
      v_apoyo_infonavit := COALESCE(v_tipo_credito.apoyo_infonavit_monto, 0);
    END IF;
  END IF;

  -- Metros excedentes (si la unidad es mayor al lote promedio)
  v_metros_excedentes := 0;
  v_valor_excedente_terreno := 0;
  IF v_unidad.area_m2 IS NOT NULL AND v_proyecto.tamano_lote_promedio IS NOT NULL THEN
    v_metros_excedentes := GREATEST(0, v_unidad.area_m2 - v_proyecto.tamano_lote_promedio);
    v_valor_excedente_terreno := v_metros_excedentes * COALESCE(v_proyecto.precio_m2_excedente, 0);
  END IF;

  -- Frente verde: +2% si aplica (parejo para todos los proyectos por ahora)
  v_valor_frente_verde := CASE WHEN COALESCE(v_unidad.tiene_frente_verde, false)
    THEN v_valor_comercial * 0.02
    ELSE 0
  END;

  -- Esquina: % depende de la clasificación del proyecto
  v_pct_esquina := CASE v_proyecto.clasificacion_inmobiliaria
    WHEN 'interes_social' THEN 0.15
    WHEN 'residencial_medio' THEN 0.032
    WHEN 'residencial_alto' THEN 0.032
    ELSE 0
  END;
  v_valor_esquina := CASE WHEN COALESCE(v_unidad.es_esquina, false)
    THEN v_valor_comercial * v_pct_esquina
    ELSE 0
  END;

  -- Valor venta futuro: snapshot manual (eventualmente del módulo obra)
  v_valor_venta_futuro := COALESCE(v_unidad.valor_venta_futuro_snapshot, 0);

  -- Productos adicionales (paridad Coda): monto $ declarado por el vendedor
  v_productos_adicionales := GREATEST(0, COALESCE(p_productos_adicionales, 0));

  -- Precio de venta total
  v_precio_venta_total := v_valor_comercial
    + v_valor_excedente_terreno
    + v_valor_frente_verde
    + v_valor_esquina
    + v_valor_venta_futuro
    + v_costo_credito_adicional
    + v_productos_adicionales;

  -- Pago directo del cliente (después de créditos y apoyo)
  v_pago_directo := v_precio_venta_total
    - COALESCE(p_monto_credito_titular, 0)
    - COALESCE(p_monto_credito_cotitular, 0)
    - v_apoyo_infonavit;

  RETURN jsonb_build_object(
    'unidad_id', v_unidad.id,
    'identificador', v_unidad.identificador,
    'valor_comercial', v_valor_comercial,
    'metros_excedentes', v_metros_excedentes,
    'valor_excedente_terreno', v_valor_excedente_terreno,
    'valor_frente_verde', v_valor_frente_verde,
    'valor_esquina', v_valor_esquina,
    'pct_esquina_aplicado', v_pct_esquina,
    'valor_venta_futuro', v_valor_venta_futuro,
    'costo_credito_adicional', v_costo_credito_adicional,
    'productos_adicionales', v_productos_adicionales,
    'precio_venta_total', v_precio_venta_total,
    'apoyo_infonavit', v_apoyo_infonavit,
    'monto_credito_titular', COALESCE(p_monto_credito_titular, 0),
    'monto_credito_cotitular', COALESCE(p_monto_credito_cotitular, 0),
    'pago_directo', v_pago_directo,
    'enganche_1pct', v_precio_venta_total * 0.01,
    'isai_2pct', v_precio_venta_total * 0.02,
    'gastos_notariales_6pct', v_precio_venta_total * 0.06
  );
END;
$$;

COMMENT ON FUNCTION dilesa.fn_calcular_precio_venta IS
  'Cálculo del precio de venta de una unidad — replica fórmula de Coda. UI Fase 1 (Solicitud) llama para preview en vivo. Inputs: unidad_id, tipo_credito_id (opt), montos de crédito, productos_adicionales (opt). Returns JSONB con breakdown completo.';

GRANT EXECUTE ON FUNCTION dilesa.fn_calcular_precio_venta TO authenticated;

-- ── 3. Reload schema cache PostgREST ─────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

COMMIT;
