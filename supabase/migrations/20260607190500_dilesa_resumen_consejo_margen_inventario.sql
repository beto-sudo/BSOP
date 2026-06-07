-- Iniciativa: dilesa-resumen-consejo · Sprint 0
-- Recrea los bloques "Análisis de Margen" e "Inventario por Prototipo" del
-- correo diario al Consejo (cutover Coda → BSOP). Ver docs/planning/dilesa-resumen-consejo.md
--
-- 3 cambios:
--   1. Fix RUV/Seguro (D4): Coda es el correcto. registro_ruv = 0.3% del valor
--      comercial, seguro_calidad = 0.65%. En BSOP quedaron capturados a 0.03% y
--      0.065% (punto decimal corrido, ÷10). Recalcular desde el VC.
--   2. dilesa.v_margen_prototipo — costo total y margen por prototipo.
--   3. dilesa.v_inventario_prototipo — conteos por estado, semántica BSOP.

-- 1. Fix RUV/Seguro -----------------------------------------------------------
UPDATE dilesa.productos
SET registro_ruv_referencia   = round(valor_comercial_referencia * 0.003, 2),
    seguro_calidad_referencia = round(valor_comercial_referencia * 0.0065, 2),
    updated_at = now()
WHERE deleted_at IS NULL
  AND valor_comercial_referencia IS NOT NULL;

-- 2. Margen por prototipo -----------------------------------------------------
-- Costo total = terreno + urbanización (prorrateados sobre las viviendas
-- vendibles del proyecto) + materiales + MO + RUV + seguro + comercialización.
-- Terreno/urbanización viven a nivel proyecto (monto total); se reparten entre
-- las viviendas vendibles. El predicado de "vivienda vendible" es el mismo que
-- v_proyecto_avances, pero SIN el filtro activo_id: el costeo se hace sobre las
-- viviendas planeadas del proyecto (228/92/705…), no sobre las que siguen sin
-- liberar al portafolio. El cálculo usa los componentes sin redondeo intermedio
-- y redondea al final (cuadra con Coda al centavo en 8/9 prototipos; el resto
-- difiere <1% por el dato de MO, que por decisión de Beto 2026-06-07 se toma de
-- BSOP por ser el system-of-record).
CREATE OR REPLACE VIEW dilesa.v_margen_prototipo WITH (security_invoker = on) AS
WITH viviendas AS (
  SELECT proyecto_id, COUNT(*) AS n
  FROM dilesa.unidades
  WHERE deleted_at IS NULL
    AND lower(COALESCE(tipo_lote, '')) !~ '(comercial|municipal|donaci|area verde|equipamiento)'
  GROUP BY proyecto_id
),
calc AS (
  SELECT
    pr.id                                AS prototipo_id,
    pr.empresa_id,
    pr.proyecto_id,
    pr.nombre,
    pr.valor_comercial_referencia        AS valor_comercial,
    p.costo_terreno      / NULLIF(v.n, 0) AS terreno_raw,
    p.costo_urbanizacion / NULLIF(v.n, 0) AS urb_raw,
    pr.costo_materiales_referencia       AS costo_materiales,
    pr.costo_mo_referencia               AS costo_mo,
    pr.registro_ruv_referencia           AS registro_ruv,
    pr.seguro_calidad_referencia         AS seguro_calidad,
    pr.costo_comercializacion_referencia AS costo_comercializacion
  FROM dilesa.productos pr
  JOIN dilesa.proyectos p ON p.id = pr.proyecto_id
  LEFT JOIN viviendas v ON v.proyecto_id = pr.proyecto_id
  WHERE pr.deleted_at IS NULL
    AND pr.valor_comercial_referencia IS NOT NULL
)
SELECT
  prototipo_id,
  empresa_id,
  proyecto_id,
  nombre,
  valor_comercial,
  round(terreno_raw, 2) AS costo_terreno,
  round(urb_raw, 2)     AS costo_urbanizacion,
  costo_materiales,
  costo_mo,
  registro_ruv,
  seguro_calidad,
  costo_comercializacion,
  round(
    COALESCE(terreno_raw, 0) + COALESCE(urb_raw, 0) + COALESCE(costo_materiales, 0)
    + COALESCE(costo_mo, 0) + COALESCE(registro_ruv, 0) + COALESCE(seguro_calidad, 0)
    + COALESCE(costo_comercializacion, 0), 2) AS costo_total,
  round(
    valor_comercial - (
      COALESCE(terreno_raw, 0) + COALESCE(urb_raw, 0) + COALESCE(costo_materiales, 0)
      + COALESCE(costo_mo, 0) + COALESCE(registro_ruv, 0) + COALESCE(seguro_calidad, 0)
      + COALESCE(costo_comercializacion, 0)), 2) AS utilidad,
  CASE
    WHEN valor_comercial > 0 THEN round(
      100.0 * (valor_comercial - (
        COALESCE(terreno_raw, 0) + COALESCE(urb_raw, 0) + COALESCE(costo_materiales, 0)
        + COALESCE(costo_mo, 0) + COALESCE(registro_ruv, 0) + COALESCE(seguro_calidad, 0)
        + COALESCE(costo_comercializacion, 0))) / valor_comercial, 2)
    ELSE NULL
  END AS margen_pct
FROM calc;

-- 3. Inventario por prototipo -------------------------------------------------
-- Semántica BSOP (las columnas espejan a Coda; las diferencias de conteo con
-- Coda se investigan aparte — decisión de Beto 2026-06-07 "ponemos lo que sale
-- de BSOP y después determinamos las diferencias"):
--   construccion  = unidades en estado en_construccion
--   terminado     = unidades en estado terminada
--   asignado      = unidades en estado asignada
--   en_inventario = construccion + terminado + asignado (existentes, no
--                   entregadas ni escrituradas)
--   disponible    = terminada y NO es_muestra (disponible para venta, definición
--                   canónica de v_proyecto_avances)
CREATE OR REPLACE VIEW dilesa.v_inventario_prototipo WITH (security_invoker = on) AS
SELECT
  u.producto_id AS prototipo_id,
  u.empresa_id,
  COUNT(*) FILTER (WHERE u.estado = 'en_construccion')                AS inventario_construccion,
  COUNT(*) FILTER (WHERE u.estado = 'terminada')                      AS inventario_terminado,
  COUNT(*) FILTER (WHERE u.estado = 'asignada')                       AS inventario_asignado,
  COUNT(*) FILTER (WHERE u.estado IN ('en_construccion', 'terminada', 'asignada')) AS en_inventario,
  COUNT(*) FILTER (WHERE u.estado = 'terminada' AND NOT u.es_muestra) AS inventario_disponible
FROM dilesa.unidades u
WHERE u.deleted_at IS NULL
  AND u.producto_id IS NOT NULL
GROUP BY u.producto_id, u.empresa_id;

NOTIFY pgrst, 'reload schema';
