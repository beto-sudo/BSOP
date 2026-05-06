-- Migración: cierre de la iniciativa rdb-waitry-ingesta-dedup
--
-- Marca como resolved=true los 146 pares pendientes en
-- rdb.waitry_duplicate_candidates clasificándolos por bucket:
--
--   1. 'historic_pre_terminal_change' — detectados antes del shift
--      operativo del 2026-04-30 (cuando RDB cambió la terminal POS de
--      tablet Android a Windows + emulador Android, eliminando la
--      causa raíz operacional del doble-tap). Mix de dups reales y
--      falsos positivos del detector — no se distinguen porque la UI
--      Fase 2.C no procede dada la mitigación externa.
--
--   2. 'tiendita_false_positive_residual' — detectados post-cambio en
--      Tiendita (mostrador). Son los falsos positivos esperados
--      (~9.3%) documentados en ADR-006: todas las ventas de mostrador
--      comparten tableId 94034, así que productos populares vendidos
--      a clientes distintos colisionan en compute_content_hash.
--
-- Ver ADR-008 para el contexto completo y validación empírica.
--
-- Riesgo: bajo. Solo modifica rdb.waitry_duplicate_candidates (tabla
-- de detección) + extiende su check constraint. NO toca
-- waitry_pedidos, waitry_pagos, cortes_caja, cortes_movimientos ni
-- movimientos_inventario. Reversible si fuese necesario.

BEGIN;

-- 1. Extender el check constraint de resolution con los nuevos valores
--    que reflejan el cierre histórico de la iniciativa.
ALTER TABLE rdb.waitry_duplicate_candidates
  DROP CONSTRAINT IF EXISTS waitry_dup_candidates_resolution_chk;

ALTER TABLE rdb.waitry_duplicate_candidates
  ADD CONSTRAINT waitry_dup_candidates_resolution_chk
  CHECK (
    resolution IS NULL
    OR resolution = ANY (ARRAY[
      'confirmed_duplicate',
      'not_duplicate',
      'historic_pre_terminal_change',
      'tiendita_false_positive_residual'
    ])
  );

-- 2. Bucket 1: pre-shift operativo del 2026-04-30
--    (UTC 14:00 ≈ 8 AM Matamoros)
UPDATE rdb.waitry_duplicate_candidates
SET
  resolved = true,
  resolution = 'historic_pre_terminal_change'
WHERE resolved = false
  AND detected_at < '2026-04-30 14:00:00+00';

-- 3. Bucket 2: post-cambio en Tiendita (falsos positivos residuales)
UPDATE rdb.waitry_duplicate_candidates c
SET
  resolved = true,
  resolution = 'tiendita_false_positive_residual'
FROM rdb.waitry_pedidos p
WHERE c.resolved = false
  AND c.detected_at >= '2026-04-30 14:00:00+00'
  AND p.order_id = c.order_id_a
  AND p.table_name = 'Tiendita';

COMMIT;
