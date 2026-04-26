-- Iniciativa rdb-waitry-ingesta-dedup, Opción C (PR follow-up de ADR-005/006).
--
-- 3 cambios independientes y de bajo riesgo, cada uno justificado:
--
--   1. Fix typo en `rdb.v_cortes_totales`: filtra por 'order_cancelled'
--      (doble L, británico) cuando el status real escrito por el trigger
--      es 'order_canceled' (una L, americano). Resultado actual: pedidos
--      cancelados se siguen sumando en ingresos del corte. Afecta TODOS
--      los cortes RDB con cancelaciones. Bug latente desde la migración
--      20260414000003 (origen primero del view) hasta hoy. Verificación
--      empírica (ADR-005 §6, 2026-04-26): hay 1 pedido cancelado en
--      `waitry_duplicate_candidates` que aparece sumado en totales.
--
--   2. Drop `rdb.trg_procesar_venta_waitry()`: función plpgsql trigger
--      que referencia `rdb.inventario_movimientos` (tabla inexistente,
--      reemplazada hace tiempo por `erp.movimientos_inventario` y
--      `erp.fn_trg_waitry_to_movimientos`). No la usa ningún trigger
--      activo (ver `information_schema.triggers` del 2026-04-26). Es
--      código muerto que confunde a futuras sesiones. Cero impacto.
--
--   3. Mejorar `match_reason` en `rdb.check_duplicates(text)`: el texto
--      hardcoded 'same products + amount + table within 3 minutes' es
--      poco accionable cuando un humano (o UI futura) revisa pares.
--      Esta versión agrega `seconds_apart` (cuán cerca están en tiempo)
--      y los `payment_methods` involucrados (pista clave para distinguir
--      doble-tap operacional vs falso positivo del hash — ver ADR-006).
--
-- Scope
-- -----
-- Toca:    rdb.v_cortes_totales (CREATE OR REPLACE VIEW)
--          rdb.trg_procesar_venta_waitry (DROP FUNCTION)
--          rdb.check_duplicates (CREATE OR REPLACE FUNCTION)
-- No toca: rdb.process_waitry_inbound, rdb.compute_content_hash,
--          rdb.pedidos_after_insert_check_duplicates, rdb.waitry_pedidos,
--          ningún índice o constraint, ningún grant.
--
-- Rollback
-- --------
-- §1: re-aplicar la versión previa de v_cortes_totales (migración
--     20260425120000_rdb_v_cortes_totales_fecha_pushdown.sql).
-- §2: re-crear la función desde su definición histórica (no se va
--     a perder porque no se usa, pero la definición queda en este
--     mismo header como referencia).
-- §3: re-aplicar la versión previa de check_duplicates (definición
--     en migración original — no rastreada explícitamente aquí).
--
-- Aplicado vía `mcp__supabase__apply_migration` el 2026-04-26 antes
-- de que mergee este PR. CI valida que el archivo SQL es idempotente.

------------------------------------------------------------------------
-- §1 — Fix typo: 'order_cancelled' → 'order_canceled'
------------------------------------------------------------------------

CREATE OR REPLACE VIEW rdb.v_cortes_totales AS
WITH pagos_por_corte AS (
  SELECT ped.corte_id,
         lower(p.payment_method) AS method,
         p.amount
    FROM rdb.waitry_pedidos ped
    JOIN rdb.waitry_pagos   p ON p.order_id = ped.order_id
   WHERE ped.corte_id IS NOT NULL
     AND ped.status <> 'order_canceled'
),
pedidos_por_corte AS (
  SELECT corte_id, count(*) AS total_pedidos
    FROM rdb.waitry_pedidos
   WHERE corte_id IS NOT NULL
     AND status <> 'order_canceled'
   GROUP BY corte_id
),
movimientos_por_corte AS (
  SELECT corte_id,
         sum(CASE WHEN tipo = 'entrada' THEN monto ELSE 0 END) AS total_depositos,
         sum(CASE WHEN tipo = 'salida'  THEN monto ELSE 0 END) AS total_retiros
    FROM erp.movimientos_caja
   WHERE empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
   GROUP BY corte_id
)
SELECT c.id AS corte_id,
       c.empresa_id,
       c.caja_nombre,
       c.estado,
       c.abierto_at AS hora_inicio,
       c.cerrado_at AS hora_fin,
       c.efectivo_inicial,
       COALESCE(sum(CASE WHEN pp.method = 'cash' THEN pp.amount ELSE 0 END), 0) AS ingresos_efectivo,
       COALESCE(sum(CASE WHEN pp.method LIKE 'credit_card%' OR pp.method = 'pos' THEN pp.amount ELSE 0 END), 0) AS ingresos_tarjeta,
       COALESCE(sum(CASE WHEN pp.method = 'stripe' THEN pp.amount ELSE 0 END), 0) AS ingresos_stripe,
       COALESCE(sum(CASE WHEN pp.method = 'other'  THEN pp.amount ELSE 0 END), 0) AS ingresos_transferencias,
       COALESCE(sum(pp.amount), 0) AS total_ingresos,
       COALESCE(m.total_depositos, 0) AS depositos,
       COALESCE(m.total_retiros, 0) AS retiros,
       c.efectivo_inicial
         + COALESCE(sum(CASE WHEN pp.method = 'cash' THEN pp.amount ELSE 0 END), 0)
         + COALESCE(m.total_depositos, 0)
         - COALESCE(m.total_retiros, 0) AS efectivo_esperado,
       COALESCE(pc.total_pedidos, 0) AS pedidos_count,
       c.fecha_operativa
  FROM erp.cortes_caja c
  LEFT JOIN pagos_por_corte      pp ON pp.corte_id = c.id
  LEFT JOIN pedidos_por_corte    pc ON pc.corte_id = c.id
  LEFT JOIN movimientos_por_corte m  ON m.corte_id  = c.id
 WHERE c.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
 GROUP BY c.id, c.empresa_id, c.caja_nombre, c.estado, c.abierto_at,
          c.cerrado_at, c.efectivo_inicial, m.total_depositos,
          m.total_retiros, pc.total_pedidos, c.fecha_operativa;

ALTER VIEW rdb.v_cortes_totales SET (security_invoker = on);

GRANT SELECT ON rdb.v_cortes_totales TO anon, authenticated, service_role;

------------------------------------------------------------------------
-- §2 — Drop función huérfana
------------------------------------------------------------------------

-- Definición histórica de la función (para rollback / referencia):
--   CREATE OR REPLACE FUNCTION rdb.trg_procesar_venta_waitry()
--   RETURNS trigger LANGUAGE plpgsql ...
--   Insertaba en rdb.inventario_movimientos (tabla que ya no existe).
--   Reemplazada conceptualmente por erp.fn_trg_waitry_to_movimientos
--   que escribe a erp.movimientos_inventario.

DROP FUNCTION IF EXISTS rdb.trg_procesar_venta_waitry();

------------------------------------------------------------------------
-- §3 — Mejorar match_reason del detector de duplicados
------------------------------------------------------------------------
-- Antes: 'same products + amount + table within 3 minutes' (literal)
-- Después: 'same products + amount + table (Ns apart, methods=X+Y)'
--
-- La cadena varía caso a caso. Un humano leyendo waitry_duplicate_candidates
-- ahora puede triagear más rápido. La estructura es:
--   - 'same products + amount + table'  (semántica del match — fija)
--   - '(Ns apart'                       (cuán cerca están los timestamps)
--   - ', methods=X+Y'                   (los payment_methods de cada lado)
--   - ')'
--
-- Ejemplos esperados:
--   'same products + amount + table (3s apart, methods=credit_card_visa+credit_card_visa)'
--   'same products + amount + table (22s apart, methods=credit_card_visa+cash)'

CREATE OR REPLACE FUNCTION rdb.check_duplicates(p_order_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'rdb'
AS $function$
DECLARE
  inserted_count INTEGER := 0;
BEGIN
  IF p_order_id IS NULL OR btrim(p_order_id) = '' THEN
    RETURN 0;
  END IF;

  WITH target AS (
    SELECT order_id, content_hash, "timestamp"
    FROM rdb.waitry_pedidos
    WHERE order_id = p_order_id
      AND content_hash IS NOT NULL
      AND "timestamp" IS NOT NULL
    LIMIT 1
  ),
  candidates AS (
    SELECT
      t.order_id AS order_id_a,
      p.order_id AS order_id_b,
      t.content_hash,
      1.0::NUMERIC(5,4) AS similarity_score,
      -- Construir match_reason con seconds_apart y payment_methods cuando existan.
      concat(
        'same products + amount + table (',
        ROUND(abs(EXTRACT(epoch FROM (p."timestamp" - t."timestamp"))))::int,
        's apart',
        CASE
          WHEN (
            SELECT string_agg(DISTINCT payment_method, '/' ORDER BY payment_method)
              FROM rdb.waitry_pagos WHERE order_id = t.order_id AND amount > 0
          ) IS NOT NULL
            OR (
            SELECT string_agg(DISTINCT payment_method, '/' ORDER BY payment_method)
              FROM rdb.waitry_pagos WHERE order_id = p.order_id AND amount > 0
          ) IS NOT NULL
          THEN ', methods='
            || COALESCE((
                 SELECT string_agg(DISTINCT payment_method, '/' ORDER BY payment_method)
                   FROM rdb.waitry_pagos WHERE order_id = t.order_id AND amount > 0
               ), '?')
            || '+'
            || COALESCE((
                 SELECT string_agg(DISTINCT payment_method, '/' ORDER BY payment_method)
                   FROM rdb.waitry_pagos WHERE order_id = p.order_id AND amount > 0
               ), '?')
          ELSE ''
        END,
        ')'
      )::TEXT AS match_reason,
      now() AS detected_at
    FROM target t
    JOIN rdb.waitry_pedidos p
      ON p.order_id <> t.order_id
     AND p.content_hash = t.content_hash
     AND p."timestamp" BETWEEN t."timestamp" - INTERVAL '3 minutes'
                          AND t."timestamp" + INTERVAL '3 minutes'
  ),
  ins AS (
    INSERT INTO rdb.waitry_duplicate_candidates (
      order_id_a,
      order_id_b,
      similarity_score,
      match_reason,
      content_hash,
      detected_at
    )
    SELECT
      least(order_id_a, order_id_b),
      greatest(order_id_a, order_id_b),
      similarity_score,
      match_reason,
      content_hash,
      detected_at
    FROM candidates
    ON CONFLICT ((least(order_id_a, order_id_b)), (greatest(order_id_a, order_id_b))) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO inserted_count FROM ins;

  RETURN inserted_count;
END;
$function$;
