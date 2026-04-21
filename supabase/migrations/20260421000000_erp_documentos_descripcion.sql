-- Agrega columna `descripcion` a erp.documentos.
--
-- Campo corto (resumen ~500 chars) con el contenido del documento, pensado
-- para mostrar una vista rápida en la tabla de documentos sin abrir el PDF.
-- A futuro puede poblarse automáticamente a partir del texto extraído del
-- PDF principal (ver plan de IA/OCR en PR aparte).

ALTER TABLE erp.documentos
  ADD COLUMN IF NOT EXISTS descripcion TEXT;

COMMENT ON COLUMN erp.documentos.descripcion IS
  'Resumen breve (<=500 chars) de lo que contiene el documento. Se muestra '
  'en la tabla de documentos como vista previa. Puede editarse a mano o '
  'generarse por IA a partir del PDF principal.';

-- Reload PostgREST schema cache.
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
