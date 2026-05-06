-- Agrega columna `tasa_iva` a `erp.proveedores` para capturar la tasa
-- de IVA principal de cada proveedor.
--
-- Valores válidos en México: 0 (exento, ej. medicinas/alimentos básicos),
-- 0.08 (zona fronteriza norte/sur), 0.16 (general).
--
-- Si un proveedor maneja múltiples tasas (ej. retail con productos
-- exentos + gravados), se guarda la principal. Si después surge
-- necesidad de modelarlas todas, ampliar a `tasas_iva numeric[]` o
-- a una tabla `proveedor_tasas` con histórico.
--
-- Capturada inicialmente desde el padrón CONTPAQi de DILESA en el
-- import bulk del 2026-05-06.

ALTER TABLE erp.proveedores
  ADD COLUMN IF NOT EXISTS tasa_iva numeric;

ALTER TABLE erp.proveedores
  DROP CONSTRAINT IF EXISTS proveedores_tasa_iva_chk;

ALTER TABLE erp.proveedores
  ADD CONSTRAINT proveedores_tasa_iva_chk
  CHECK (tasa_iva IS NULL OR tasa_iva IN (0, 0.08, 0.16));

COMMENT ON COLUMN erp.proveedores.tasa_iva IS
  'Tasa de IVA principal del proveedor en decimal (0=exento, 0.08=frontera, 0.16=general). Capturada inicialmente desde el padrón CONTPAQi de DILESA. Si el proveedor maneja múltiples tasas (ej. retail con productos exentos + gravados), se guarda la principal.';

NOTIFY pgrst, 'reload schema';
