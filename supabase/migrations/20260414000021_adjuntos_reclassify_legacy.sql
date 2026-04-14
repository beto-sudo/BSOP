-- Reclassify legacy adjuntos that defaulted to 'anexo' before the rol column existed.
-- Only affects adjuntos linked to documentos (entidad_tipo = 'documento').

-- PDFs → documento_principal
UPDATE erp.adjuntos
SET rol = 'documento_principal'
WHERE entidad_tipo = 'documento'
  AND rol = 'anexo'
  AND (tipo_mime = 'application/pdf' OR lower(nombre) LIKE '%.pdf');

-- Images → imagen_referencia
UPDATE erp.adjuntos
SET rol = 'imagen_referencia'
WHERE entidad_tipo = 'documento'
  AND rol = 'anexo'
  AND (tipo_mime LIKE 'image/%' OR lower(nombre) ~ '\.(jpe?g|png|gif|webp|tiff)$');

NOTIFY pgrst, 'reload schema';
