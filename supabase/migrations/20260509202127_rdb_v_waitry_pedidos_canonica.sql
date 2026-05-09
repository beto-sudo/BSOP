-- MIGRATION: rdb-waitry-deduplicacion Sprint 3 — vista canónica rdb.v_waitry_pedidos
--
-- CONTEXTO (continuación Sprint 2, mergeado en PR #465):
--   Sprint 1 dejó la columna superseded_by_order_id + filtro inline en 3
--   readers. Sprint 2 instaló función + 2 triggers + backfill de los 39
--   fantasmas históricos. Sprint 3 cierra el loop con vista canónica que
--   reemplaza el filtro inline y un flag boolean explícito para UI.
--
-- ALCANCE:
--   1. `rdb.v_waitry_pedidos` — selecciona TODAS las columnas de
--      `rdb.waitry_pedidos` cuyo `superseded_by_order_id IS NULL`,
--      proyectando además `es_fantasma boolean` (siempre FALSE en esta
--      vista, pero queda en el shape para que el UI haga toggle a
--      la tabla cruda con consistencia).
--   2. `rdb.v_waitry_pedidos_con_fantasmas` — vista de auditoría que
--      proyecta TODAS las filas con `es_fantasma` calculado.
--
-- POLÍTICA de SECURITY:
--   `security_invoker=on` (per ADR de views_security_invoker, migración
--   20260417213252). RLS de la tabla base se hereda en cada SELECT.
--
-- POSTGREST:
--   Las vistas quedan expuestas via PostgREST automáticamente (mismos
--   grants que la tabla base sobre los roles authenticated/anon).
--
-- COMPATIBILIDAD:
--   El filtro inline `.is('superseded_by_order_id', null)` introducido en
--   Sprint 1 sigue siendo válido sobre la tabla base — las dos formas de
--   leer canónicos coexisten. Sprint 3 migra los callsites a la vista.

CREATE OR REPLACE VIEW rdb.v_waitry_pedidos
WITH (security_invoker = on)
AS
SELECT
  p.id,
  p.order_id,
  p.status,
  p.paid,
  p."timestamp",
  p.place_id,
  p.place_name,
  p.table_name,
  p.layout_name,
  p.total_amount,
  p.total_discount,
  p.service_charge,
  p.tax,
  p.external_delivery_id,
  p.notes,
  p.last_action_at,
  p.content_hash,
  p.created_at,
  p.updated_at,
  p.corte_id,
  p.table_id,
  p.superseded_by_order_id,
  FALSE AS es_fantasma
FROM rdb.waitry_pedidos p
WHERE p.superseded_by_order_id IS NULL;

COMMENT ON VIEW rdb.v_waitry_pedidos IS
  'Vista canónica de pedidos Waitry: excluye fantasmas detectados por bug del POS Waitry (ver iniciativa rdb-waitry-deduplicacion + ADR-031). Default para todos los reads de UI/reportes/conciliación. Para auditoría con fantasmas incluidos, leer de rdb.waitry_pedidos directamente o usar rdb.v_waitry_pedidos_con_fantasmas.';

-- Vista de auditoría: todas las filas + flag es_fantasma calculado
CREATE OR REPLACE VIEW rdb.v_waitry_pedidos_con_fantasmas
WITH (security_invoker = on)
AS
SELECT
  p.id,
  p.order_id,
  p.status,
  p.paid,
  p."timestamp",
  p.place_id,
  p.place_name,
  p.table_name,
  p.layout_name,
  p.total_amount,
  p.total_discount,
  p.service_charge,
  p.tax,
  p.external_delivery_id,
  p.notes,
  p.last_action_at,
  p.content_hash,
  p.created_at,
  p.updated_at,
  p.corte_id,
  p.table_id,
  p.superseded_by_order_id,
  (p.superseded_by_order_id IS NOT NULL) AS es_fantasma
FROM rdb.waitry_pedidos p;

COMMENT ON VIEW rdb.v_waitry_pedidos_con_fantasmas IS
  'Vista auditable de pedidos Waitry: incluye TODOS los pedidos (canónicos + fantasmas) con flag es_fantasma. Para toggle "Mostrar duplicados detectados" en /rdb/ventas y para QA contra cortes históricos. NO usar en reportes financieros — usar rdb.v_waitry_pedidos.';

-- Grants (mismos que la tabla base — PostgREST los necesita explícitos para vistas)
GRANT SELECT ON rdb.v_waitry_pedidos TO authenticated, anon;
GRANT SELECT ON rdb.v_waitry_pedidos_con_fantasmas TO authenticated, anon;

-- Verificación inline: la vista canónica debe excluir exactamente los 39 fantasmas
DO $$
DECLARE
  v_canonicos_via_view integer;
  v_canonicos_via_tabla integer;
  v_fantasmas integer;
BEGIN
  SELECT COUNT(*) INTO v_canonicos_via_view FROM rdb.v_waitry_pedidos;
  SELECT COUNT(*) INTO v_canonicos_via_tabla FROM rdb.waitry_pedidos WHERE superseded_by_order_id IS NULL;
  SELECT COUNT(*) INTO v_fantasmas FROM rdb.waitry_pedidos WHERE superseded_by_order_id IS NOT NULL;

  IF v_canonicos_via_view <> v_canonicos_via_tabla THEN
    RAISE EXCEPTION
      'Vista canónica diverge: view=%, table=%',
      v_canonicos_via_view, v_canonicos_via_tabla;
  END IF;

  IF v_fantasmas <> 39 THEN
    RAISE EXCEPTION
      'Esperaba 39 fantasmas marcados (Sprint 2 backfill); hay %',
      v_fantasmas;
  END IF;

  RAISE NOTICE 'Sprint 3 vista canónica OK: % canónicos, % fantasmas',
    v_canonicos_via_view, v_fantasmas;
END;
$$;

NOTIFY pgrst, 'reload schema';
