-- Backfill RUV y seguro de calidad de referencia en dilesa.productos.
--
-- Fórmulas confirmadas por Beto (2026-05-31):
--   - Registro RUV       = 0.03%  del valor comercial de referencia
--   - Seguro de calidad  = 0.065% del valor comercial de referencia
--   - Comercialización   = 2%     del valor comercial (ya aplicado en
--     migración 20260530210000, repetido aquí por idempotencia)

UPDATE dilesa.productos
SET registro_ruv_referencia = round(valor_comercial_referencia * 0.0003, 2)
WHERE deleted_at IS NULL
  AND valor_comercial_referencia IS NOT NULL
  AND valor_comercial_referencia > 0
  AND registro_ruv_referencia IS NULL;

UPDATE dilesa.productos
SET seguro_calidad_referencia = round(valor_comercial_referencia * 0.00065, 2)
WHERE deleted_at IS NULL
  AND valor_comercial_referencia IS NOT NULL
  AND valor_comercial_referencia > 0
  AND seguro_calidad_referencia IS NULL;

UPDATE dilesa.productos
SET costo_comercializacion_referencia = round(valor_comercial_referencia * 0.02, 2)
WHERE deleted_at IS NULL
  AND valor_comercial_referencia IS NOT NULL
  AND valor_comercial_referencia > 0
  AND costo_comercializacion_referencia IS NULL;

NOTIFY pgrst, 'reload schema';
