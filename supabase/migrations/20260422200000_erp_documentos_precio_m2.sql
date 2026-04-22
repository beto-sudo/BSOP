-- Columna calculada `precio_m2` en erp.documentos.
--
-- Para compraventas (y cualquier otro documento con monto + superficie
-- explícitos), derivar el precio por metro cuadrado es un métrico crítico
-- de análisis. Ya teníamos `monto` y `superficie_m2` pobladas por el
-- pipeline IA; la división es siempre la misma fórmula.
--
-- Se calcula vía GENERATED column (STORED) para:
--   * Mantener consistencia automática cuando monto o superficie cambian
--     (ej. corrección manual desde la UI de editar).
--   * Permitir índices y sorts directos sin computar en cada query.
--   * Evitar que la UI duplique la fórmula en TS y que eventualmente
--     diverja.
--
-- Solo se calcula cuando ambos valores son > 0 (NULL en caso contrario).
-- La moneda no se convierte — el valor conserva la moneda de `moneda`.

ALTER TABLE erp.documentos
  ADD COLUMN IF NOT EXISTS precio_m2 NUMERIC(18, 2) GENERATED ALWAYS AS (
    CASE
      WHEN monto IS NOT NULL AND monto > 0 AND superficie_m2 IS NOT NULL AND superficie_m2 > 0
        THEN ROUND((monto / superficie_m2)::numeric, 2)
      ELSE NULL
    END
  ) STORED;

COMMENT ON COLUMN erp.documentos.precio_m2 IS
  'Precio por metro cuadrado derivado de monto/superficie_m2. GENERATED STORED: '
  'se recalcula automáticamente cuando cambian los inputs. Conserva la moneda '
  'de `moneda` (no hace conversión). NULL si monto o superficie no están '
  'poblados o son 0.';

-- Índice para sorts y filtros por precio_m2 (útil en reportes y dashboards).
-- Parcial sobre docs no borrados que sí tienen el cálculo, para mantenerlo chico.
CREATE INDEX IF NOT EXISTS erp_documentos_precio_m2_idx
  ON erp.documentos (precio_m2)
  WHERE precio_m2 IS NOT NULL AND deleted_at IS NULL;

-- Reload PostgREST schema cache.
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
