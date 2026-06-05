-- Retira `dilesa.obra_presupuesto`: renombra a `_deprecated` (NO drop).
--
-- Superseded por `erp.presupuesto_partidas` (modelo canónico, ADR-040). El
-- re-apunte de Costeo (Sprint 1 fase 2a), el rediseño UX (fase 2b) y la
-- clasificación 128/128 ya están en prod; nada en runtime lee
-- `obra_presupuesto`. Verificado antes de retirar (2026-06-05):
--   · cero referencias runtime en código (solo un JSDoc histórico + el script
--     one-off `scripts/import_dilesa_obra_presupuesto.py`),
--   · cero vistas dependientes, cero FKs entrantes,
--   · paridad de datos 128 legacy ↔ 128 canónico (`fuente='obra_resumen'`).
--
-- Se conserva como referencia histórica del traspaso de obra (no se dropea).
-- Reversible: `ALTER TABLE dilesa.obra_presupuesto_deprecated RENAME TO obra_presupuesto;`

BEGIN;

ALTER TABLE dilesa.obra_presupuesto RENAME TO obra_presupuesto_deprecated;

COMMENT ON TABLE dilesa.obra_presupuesto_deprecated IS
  'DEPRECATED 2026-06-05 — superseded por erp.presupuesto_partidas (ADR-040). No usar; conservada como referencia histórica del traspaso de obra (iniciativa dilesa-compras).';

NOTIFY pgrst, 'reload schema';

COMMIT;
