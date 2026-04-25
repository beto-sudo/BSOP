-- Añade unique (empresa_id, codigo) en erp.requisiciones.
-- Permite upsert idempotente durante sync desde Coda (ver
-- scripts/sync_rdb_requisiciones_from_coda.ts) sin borrar filas ni
-- romper FK de erp.ordenes_compra.requisicion_id.
--
-- Precondición verificada el 2026-04-23: no existen códigos duplicados
-- por empresa en la tabla.

ALTER TABLE erp.requisiciones
  ADD CONSTRAINT requisiciones_empresa_codigo_key UNIQUE (empresa_id, codigo);
