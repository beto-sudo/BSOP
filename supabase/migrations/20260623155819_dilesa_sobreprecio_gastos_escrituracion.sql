-- Separar "sobreprecio para gastos de escrituración" de "productos adicionales".
--
-- Hasta hoy un solo renglón (`productos_adicionales`) revolvía dos conceptos: el
-- SOBREPRECIO que sube el precio para que el crédito absorba los gastos de
-- escrituración que el cliente no alcanza (incluye el margen al subir el precio
-- hasta el monto del crédito) — NO comisiona —, y los PRODUCTOS reales del paquete
-- (closets/upgrades) — SÍ comisionan. Se agrega una columna dedicada al sobreprecio
-- y se mueve TODO el valor histórico ahí (decisión Beto 2026-06-23: lo que hay hoy
-- en productos_adicionales es sobreprecio, no productos). El motor de cuadratura
-- trata el sobreprecio igual esté en un campo o en el otro, así que el backfill NO
-- altera ninguna cuadratura ni comisión existente; solo re-etiqueta y deja
-- `productos_adicionales` libre para que signifique solo "productos reales que
-- comisionan" de aquí en adelante.

BEGIN;

-- 1. Columna dedicada al sobreprecio para gastos de escrituración.
ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS sobreprecio_gastos_escrituracion numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN dilesa.ventas.sobreprecio_gastos_escrituracion IS
  'Sobreprecio agregado al precio para que el CRÉDITO absorba los gastos de escrituración que el cliente no alcanza (incluye el margen al subir el precio hasta el monto del crédito). Suma al precio, NO comisiona, fondea gastos. Distinto de productos_adicionales (productos reales del paquete, que SÍ comisionan).';

-- 2. Backfill: mover el valor histórico de productos_adicionales → sobreprecio.
--    NO cambia ninguna cuadratura (el motor trata el sobreprecio igual); solo
--    re-etiqueta. Deja productos_adicionales = 0 en todo el histórico.
UPDATE dilesa.ventas
SET sobreprecio_gastos_escrituracion = productos_adicionales,
    productos_adicionales = 0
WHERE productos_adicionales <> 0;

-- 3. fn_calcular_precio_venta: nuevo parámetro p_sobreprecio_gastos_escrituracion,
--    que se suma al precio total igual que productos_adicionales. Definición tomada
--    de la versión VIVA en prod (regla: CREATE OR REPLACE desde la viva). Cambios
--    marcados con « NUEVO ».
CREATE OR REPLACE FUNCTION dilesa.fn_calcular_precio_venta(
  p_unidad_id uuid,
  p_tipo_credito_id uuid DEFAULT NULL::uuid,
  p_monto_credito_titular numeric DEFAULT 0,
  p_monto_credito_cotitular numeric DEFAULT 0,
  p_productos_adicionales numeric DEFAULT 0,
  p_sobreprecio_gastos_escrituracion numeric DEFAULT 0  -- « NUEVO »
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_zcu_exento boolean := false;
  v_productos_adicionales numeric(14,2);
  v_sobreprecio_gastos_escrituracion numeric(14,2);  -- « NUEVO »
  v_precio_venta_total numeric(14,2);
  v_apoyo_infonavit numeric(14,2);
  v_pago_directo numeric(14,2);
BEGIN
  -- Cargar unidad
  SELECT id, empresa_id, proyecto_id, producto_id, area_m2, es_esquina,
         tiene_frente_verde, valor_venta_futuro_snapshot, identificador,
         problema_zcu
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

  -- Tipo de crédito (opcional). Si la unidad tiene problema ZCU, el costo
  -- adicional del crédito NO se traslada al precio (FOVISSSTE no financia
  -- ese sobreprecio en casas ZCU); el apoyo Infonavit sí se respeta.
  v_costo_credito_adicional := 0;
  v_apoyo_infonavit := 0;
  IF p_tipo_credito_id IS NOT NULL THEN
    SELECT costo_venta_adicional_pct, apoyo_infonavit_monto INTO v_tipo_credito
    FROM dilesa.tipos_credito
    WHERE id = p_tipo_credito_id AND deleted_at IS NULL;
    IF FOUND THEN
      IF COALESCE(v_unidad.problema_zcu, false)
         AND COALESCE(v_tipo_credito.costo_venta_adicional_pct, 0) > 0 THEN
        v_zcu_exento := true;
      ELSE
        v_costo_credito_adicional := v_valor_comercial * COALESCE(v_tipo_credito.costo_venta_adicional_pct, 0);
      END IF;
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

  -- Productos adicionales (productos reales del paquete: closets/upgrades).
  v_productos_adicionales := GREATEST(0, COALESCE(p_productos_adicionales, 0));
  -- « NUEVO » Sobreprecio para gastos de escrituración (lo absorbe el crédito).
  v_sobreprecio_gastos_escrituracion := GREATEST(0, COALESCE(p_sobreprecio_gastos_escrituracion, 0));

  -- Precio de venta total
  v_precio_venta_total := v_valor_comercial
    + v_valor_excedente_terreno
    + v_valor_frente_verde
    + v_valor_esquina
    + v_valor_venta_futuro
    + v_costo_credito_adicional
    + v_productos_adicionales
    + v_sobreprecio_gastos_escrituracion;  -- « NUEVO »

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
    'zcu_exento', v_zcu_exento,
    'productos_adicionales', v_productos_adicionales,
    'sobreprecio_gastos_escrituracion', v_sobreprecio_gastos_escrituracion,  -- « NUEVO »
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
$function$;

-- Recarga el cache de PostgREST (cambió la firma del RPC y el schema de la tabla):
NOTIFY pgrst, 'reload schema';

COMMIT;
