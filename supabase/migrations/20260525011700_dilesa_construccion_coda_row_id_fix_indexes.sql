-- Iniciativa: dilesa-construccion · Sprint 2 (fix)
-- Reemplaza los índices UNIQUE parciales de coda_row_id (con WHERE) por
-- índices UNIQUE no parciales (sin WHERE) — patrón canónico de
-- dilesa.ventas (ventas_coda_row_id_empresa_uq).
--
-- ¿Por qué? supabase-js / PostgREST no soporta índices parciales como
-- target de ON CONFLICT: el cliente no genera la cláusula WHERE para
-- discriminar la partial expression, así que recibe el error
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification".
--
-- Las tablas están vacías al momento de aplicar esta migración (verificado
-- vía SELECT COUNT(*) previo), así que reemplazar el índice es seguro.
--
-- Tradeoff con respecto al patrón parcial original: filas con
-- coda_row_id IS NULL podrían colisionar — pero el comportamiento real es
-- inverso porque NULL ≠ NULL en btree, las filas nativas BSOP sin
-- coda_row_id siguen sin colisionar entre sí. Ver ventas para
-- comportamiento idéntico en producción.

DROP INDEX IF EXISTS dilesa.etapas_construccion_coda_row_id_uk;
CREATE UNIQUE INDEX etapas_construccion_coda_row_id_uk
  ON dilesa.etapas_construccion (empresa_id, coda_row_id);

DROP INDEX IF EXISTS dilesa.tareas_construccion_coda_row_id_uk;
CREATE UNIQUE INDEX tareas_construccion_coda_row_id_uk
  ON dilesa.tareas_construccion (empresa_id, coda_row_id);

DROP INDEX IF EXISTS dilesa.plantilla_tareas_coda_row_id_uk;
CREATE UNIQUE INDEX plantilla_tareas_coda_row_id_uk
  ON dilesa.plantilla_tareas (empresa_id, coda_row_id);

DROP INDEX IF EXISTS dilesa.contratistas_datos_coda_row_id_uk;
CREATE UNIQUE INDEX contratistas_datos_coda_row_id_uk
  ON dilesa.contratistas_datos (empresa_id, coda_row_id);

DROP INDEX IF EXISTS dilesa.contratos_construccion_coda_row_id_uk;
CREATE UNIQUE INDEX contratos_construccion_coda_row_id_uk
  ON dilesa.contratos_construccion (empresa_id, coda_row_id);

DROP INDEX IF EXISTS dilesa.contrato_lotes_coda_row_id_uk;
CREATE UNIQUE INDEX contrato_lotes_coda_row_id_uk
  ON dilesa.contrato_lotes (empresa_id, coda_row_id);

DROP INDEX IF EXISTS dilesa.construccion_coda_row_id_uk;
CREATE UNIQUE INDEX construccion_coda_row_id_uk
  ON dilesa.construccion (empresa_id, coda_row_id);

DROP INDEX IF EXISTS dilesa.ctt_coda_row_id_uk;
CREATE UNIQUE INDEX ctt_coda_row_id_uk
  ON dilesa.construccion_tareas_terminadas (empresa_id, coda_row_id);

NOTIFY pgrst, 'reload schema';
