-- Backfill de TODOS los costos de referencia en dilesa.productos,
-- derivados de datos reales por unidad (ventas + construcciones).
--
-- Fórmulas confirmadas por Beto (2026-05-31):
--   - Valor comercial ref = avg(ventas.valor_comercial) por producto
--   - MO ref              = avg(construccion.valor_contrato_mo) obras terminadas
--   - Materiales ref      = avg(construccion.costo_materiales) obras terminadas
--   - Urbanización ref    = proyecto.costo_urbanizacion / lotes del proyecto
--   - Registro RUV        = 0.03%  del avg valor comercial por unidad
--   - Seguro de calidad   = 0.065% del avg valor comercial por unidad
--   - Comercialización    = 2%     del avg valor comercial por unidad
--
-- Fuente: promedios de unidades individuales, no valores estáticos del producto.

-- ── Valor comercial, RUV, seguro calidad, comercialización ──────────────
-- Derivados del avg(ventas.valor_comercial) real por producto.
UPDATE dilesa.productos p
SET valor_comercial_referencia = sub.avg_vcr,
    registro_ruv_referencia = round(sub.avg_vcr * 0.0003, 2),
    seguro_calidad_referencia = round(sub.avg_vcr * 0.00065, 2),
    costo_comercializacion_referencia = round(sub.avg_vcr * 0.02, 2)
FROM (
  SELECT u.producto_id,
         round(avg(v.valor_comercial), 2) AS avg_vcr
  FROM dilesa.ventas v
  JOIN dilesa.unidades u ON v.unidad_id = u.id AND u.deleted_at IS NULL
  WHERE v.deleted_at IS NULL
    AND v.estado != 'cancelada'
    AND v.valor_comercial IS NOT NULL
    AND v.valor_comercial > 0
  GROUP BY u.producto_id
) sub
WHERE p.id = sub.producto_id
  AND p.deleted_at IS NULL;

-- ── MO referencia ───────────────────────────────────────────────────────
UPDATE dilesa.productos p
SET costo_mo_referencia = sub.avg_mo
FROM (
  SELECT c.producto_id,
         round(avg(c.valor_contrato_mo), 2) AS avg_mo
  FROM dilesa.construccion c
  WHERE c.deleted_at IS NULL
    AND c.estado IN ('terminada','dtu','seguro_calidad','extraida')
    AND c.valor_contrato_mo IS NOT NULL
    AND c.valor_contrato_mo > 0
  GROUP BY c.producto_id
) sub
WHERE p.id = sub.producto_id
  AND p.deleted_at IS NULL;

-- ── Materiales referencia ───────────────────────────────────────────────
UPDATE dilesa.productos p
SET costo_materiales_referencia = sub.avg_mat
FROM (
  SELECT c.producto_id,
         round(avg(c.costo_materiales), 2) AS avg_mat
  FROM dilesa.construccion c
  WHERE c.deleted_at IS NULL
    AND c.estado IN ('terminada','dtu','seguro_calidad','extraida')
    AND c.costo_materiales IS NOT NULL
    AND c.costo_materiales > 0
  GROUP BY c.producto_id
) sub
WHERE p.id = sub.producto_id
  AND p.deleted_at IS NULL;

-- ── Urbanización referencia ─────────────────────────────────────────────
UPDATE dilesa.productos p
SET costo_urbanizacion_referencia = sub.urb_por_lote
FROM (
  SELECT pr.id AS proyecto_id,
         round(pr.costo_urbanizacion / NULLIF(cnt.n, 0), 2) AS urb_por_lote
  FROM dilesa.proyectos pr
  JOIN LATERAL (
    SELECT count(*) AS n
    FROM dilesa.unidades u
    WHERE u.proyecto_id = pr.id AND u.deleted_at IS NULL
  ) cnt ON true
  WHERE pr.deleted_at IS NULL
    AND pr.costo_urbanizacion IS NOT NULL
    AND pr.costo_urbanizacion > 0
    AND cnt.n > 0
) sub
WHERE p.proyecto_id = sub.proyecto_id
  AND p.deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
