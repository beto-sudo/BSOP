-- ╭─ 20260612185804_venta_fase_revisiones_acuse ─╮
-- La revisión de F13 ahora cubre el ciclo PLD completo: informe + ACUSE DE
-- ENVÍO del SPPLD (decisión Beto 2026-06-12 — "cerramos ciclo completo y
-- aseguramos que se dio el último paso"). La revisión queda ligada a la
-- versión exacta de AMBOS documentos: si cualquiera se reemplaza, queda
-- stale y el gate exige re-correrla.
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión).

BEGIN;

ALTER TABLE dilesa.venta_fase_revisiones
  ADD COLUMN IF NOT EXISTS adjunto_acuse_id uuid
    REFERENCES erp.adjuntos (id) ON DELETE SET NULL;

COMMENT ON COLUMN dilesa.venta_fase_revisiones.adjunto_acuse_id IS
  'Acuse de envío SPPLD (erp.adjuntos, rol acuse_pld) revisado en esta corrida. NULL en corridas previas al ciclo completo o si el acuse no estaba subido.';

NOTIFY pgrst, 'reload schema';

COMMIT;
