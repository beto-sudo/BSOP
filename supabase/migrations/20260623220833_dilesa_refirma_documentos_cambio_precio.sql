-- PR B (ADR-048 D5): re-firma de documentos cuando cambia el precio en la
-- dictaminación. Si Dirección ajusta el precio en la fase 8, la Solicitud de
-- Asignación y la Promesa de Compraventa firmadas quedan desactualizadas y deben
-- re-firmarse con el precio nuevo antes de avanzar.

BEGIN;

-- 1. Snapshot del precio que tienen los documentos firmados VIGENTES (Solicitud
--    + Promesa). Arranca = precio_asignacion (lo que firmó el cliente en la
--    Promesa); al re-firmar en la dictaminación se actualiza a valor_escrituracion.
--    La re-firma se exige cuando valor_escrituracion difiere de este snapshot —
--    así no se compara contra el precio_asignacion fijo (que dispararía un bucle:
--    tras re-firmar seguiría difiriendo).
ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS precio_documentos_firmados numeric;

COMMENT ON COLUMN dilesa.ventas.precio_documentos_firmados IS
  'Precio que tienen los documentos firmados vigentes (Solicitud de Asignación + Promesa de Compraventa). Arranca = precio_asignacion; se actualiza a valor_escrituracion al re-firmar en la dictaminación (ADR-048 D5). La re-firma se exige cuando valor_escrituracion (poblado) difiere de este valor.';

-- Backfill: las ventas existentes tienen los documentos con el precio de asignación.
UPDATE dilesa.ventas
SET precio_documentos_firmados = precio_asignacion
WHERE precio_documentos_firmados IS NULL AND precio_asignacion IS NOT NULL;

-- 2. Flag de adjunto sustituido. Cuando se sube un documento nuevo del mismo rol
--    (Solicitud/Promesa re-firmada), los anteriores del mismo rol se marcan con
--    sustituido_at: NO se borran (auditoría LFPIORPI) pero dejan de ser el vigente.
ALTER TABLE erp.adjuntos
  ADD COLUMN IF NOT EXISTS sustituido_at timestamptz;

COMMENT ON COLUMN erp.adjuntos.sustituido_at IS
  'Marca de documento sustituido por una versión más nueva (ej. re-firma por cambio de precio, ADR-048 D5). No se borra (auditoría); deja de ser el vigente. NULL = vigente.';

-- Recarga el cache de PostgREST (columnas nuevas):
NOTIFY pgrst, 'reload schema';

COMMIT;
