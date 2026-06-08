-- ╭─ 20260608004732_dilesa_venta_fases_partial_unique ─╮
-- Fix: regresar y re-cerrar una fase choca con `venta_fases_uk`.
--
-- Beto reportó al regresar Fase 4 a Fase 3 y volver a abrir el módulo de
-- captura de Fase 4: "Enviar solicitud" salía error en toast:
--   "Adjuntos guardados pero no se cerró la fase:
--    duplicate key value violates unique constraint 'venta_fases_uk'"
--
-- Root cause: `venta_fases_uk` era un UNIQUE constraint FULL sobre
-- `(venta_id, fase)` — sin filtro `WHERE deleted_at IS NULL`. La fila
-- previa quedó soft-deleted por `regresarAFaseInner` y al re-insertar
-- chocaba con ella.
--
-- Fix: reemplazar el constraint UNIQUE full por un partial unique index
-- WHERE deleted_at IS NULL. Patrón estándar del repo para tablas con
-- soft-delete (mismo que ya usa `dilesa_venta_fases_venta_idx`).
--
-- PostgreSQL no permite UNIQUE CONSTRAINT con WHERE — solo UNIQUE INDEX
-- con WHERE. El "constraint" cambia de forma (ya no aparece en
-- `pg_constraint`) pero la garantía de unicidad sigue como índice
-- parcial.

BEGIN;

ALTER TABLE dilesa.venta_fases DROP CONSTRAINT IF EXISTS venta_fases_uk;

CREATE UNIQUE INDEX IF NOT EXISTS venta_fases_uk
  ON dilesa.venta_fases (venta_id, fase)
  WHERE deleted_at IS NULL;

COMMENT ON INDEX dilesa.venta_fases_uk IS
  'Una sola fila activa (no soft-deleted) por (venta_id, fase). Las filas soft-deleted no participan — habilita regresar+re-cerrar una fase en la bitácora.';

NOTIFY pgrst, 'reload schema';

COMMIT;
