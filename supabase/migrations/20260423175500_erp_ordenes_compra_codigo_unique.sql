-- Añade unique (empresa_id, codigo) en erp.ordenes_compra.
-- Permite upsert idempotente durante sync desde Coda (ver
-- scripts/sync_rdb_ordenes_compra_from_coda.ts) sin borrar filas ni
-- romper FKs que referencien la OC (recepciones, entradas).
--
-- Precondición verificada el 2026-04-23: sin duplicados previos.

ALTER TABLE erp.ordenes_compra
  ADD CONSTRAINT ordenes_compra_empresa_codigo_key UNIQUE (empresa_id, codigo);
