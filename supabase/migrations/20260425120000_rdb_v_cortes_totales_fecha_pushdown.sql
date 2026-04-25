-- Sprint 4D §3 — Push-down de fecha en rdb.v_cortes_totales (Opción A).
--
-- Problem
-- -------
-- Tras PR #181 (Ruta A — InitPlan wrap en rdb.waitry_* SELECT policies),
-- /cortes pasó de 2157 ms → 108 ms para Laisha (viewer). Pero queda
-- deuda estructural: rdb.v_cortes_totales NO expone fecha_operativa,
-- así que el filtro WHERE fecha_operativa = X que el cliente aplica
-- sobre v_cortes_lista NO se propaga al subquery interior. Cada llamada
-- agrega los 444 cortes históricos: Seq Scan on waitry_pedidos (11 026
-- rows) + Seq Scan on waitry_pagos (11 150 rows) + HashAggregate.
-- Medición 2026-04-25 como Laisha: 993 ms, buffers 4 621.
--
-- Fix
-- ---
-- Agregar c.fecha_operativa al SELECT y GROUP BY de v_cortes_totales.
-- Ajustar v_cortes_lista para joinear por (corte_id, fecha_operativa).
-- El planner propaga el predicado vía equi-join + columna en GROUP BY,
-- aplicando el filtro al cortes_caja interior y reduciendo el outer
-- scan a 3 filas. Los LEFT JOIN con CTEs se vuelven Nested Loop con
-- Index Scan en rdb_waitry_pedidos_corte_id_idx.
--
-- Dry-run en transacción ROLLBACK (2026-04-25, 3 cortes del 22-04):
--                          Antes      Después
--   Execution (Laisha)     993 ms     11.8 ms    (84×)
--   Buffers shared hit     4 621      1 710      (2.7×)
--
-- Ver supabase/adr/003_v_cortes_totales_fecha_pushdown.md.
--
-- Scope
-- -----
--   Toca:    rdb.v_cortes_totales (CREATE OR REPLACE VIEW + GROUP BY ext)
--            rdb.v_cortes_lista   (CREATE OR REPLACE VIEW + JOIN ext)
--   No toca: ninguna tabla, política, función, índice, grant.
--
-- Rollback
-- --------
-- Re-aplicar la definición previa de ambas vistas
-- (ver migración 20260414000003_erp_migrate_rdb_data_phase2.sql §5a/§5b
-- y 20260409220000_rdb_v_cortes_totales_fix_methods.sql).
--
-- security_invoker
-- ----------------
-- Postgres preserva reloptions (incluyendo security_invoker = on,
-- aplicado en 20260417200000_views_security_invoker.sql) en
-- CREATE OR REPLACE VIEW siempre que el cuerpo se sustituya. Aún así
-- re-afirmamos al final para evitar drift.

-- 1. v_cortes_totales: agregar c.fecha_operativa al final del SELECT
--    y al GROUP BY. Cuerpo idéntico al actual modulo esa diferencia.
CREATE OR REPLACE VIEW rdb.v_cortes_totales AS
WITH pagos_por_corte AS (
  SELECT ped.corte_id,
         lower(p.payment_method) AS method,
         p.amount
    FROM rdb.waitry_pedidos ped
    JOIN rdb.waitry_pagos   p ON p.order_id = ped.order_id
   WHERE ped.corte_id IS NOT NULL
     AND ped.status <> 'order_cancelled'
),
pedidos_por_corte AS (
  SELECT corte_id, count(*) AS total_pedidos
    FROM rdb.waitry_pedidos
   WHERE corte_id IS NOT NULL
     AND status <> 'order_cancelled'
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

-- 2. v_cortes_lista: el JOIN con vt ahora propaga fecha_operativa.
--    Es lo que activa el push-down — el resto del cuerpo es idéntico.
CREATE OR REPLACE VIEW rdb.v_cortes_lista AS
SELECT c.id,
       COALESCE(c.corte_nombre, 'Corte-' || left(c.id::text, 8)) AS corte_nombre,
       NULL::text AS coda_id,
       NULL::uuid AS caja_id,
       c.caja_nombre,
       c.fecha_operativa,
       c.abierto_at AS hora_inicio,
       c.cerrado_at AS hora_fin,
       c.estado,
       NULL::text AS turno,
       c.tipo,
       c.observaciones,
       c.efectivo_inicial,
       c.efectivo_contado,
       NULL::text AS responsable_apertura,
       NULL::text AS responsable_cierre,
       COALESCE(vt.ingresos_efectivo,        0) AS ingresos_efectivo,
       COALESCE(vt.ingresos_tarjeta,         0) AS ingresos_tarjeta,
       COALESCE(vt.ingresos_stripe,          0) AS ingresos_stripe,
       COALESCE(vt.ingresos_transferencias,  0) AS ingresos_transferencias,
       COALESCE(vt.total_ingresos,           0) AS total_ingresos,
       COALESCE(vt.depositos,                0) AS depositos,
       COALESCE(vt.retiros,                  0) AS retiros,
       COALESCE(vt.efectivo_esperado,        0) AS efectivo_esperado,
       COALESCE(vt.pedidos_count,            0) AS pedidos_count
  FROM erp.cortes_caja c
  LEFT JOIN rdb.v_cortes_totales vt
    ON vt.corte_id        = c.id
   AND vt.fecha_operativa = c.fecha_operativa
 WHERE c.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid;

ALTER VIEW rdb.v_cortes_lista SET (security_invoker = on);

-- 3. Re-aplicar grants para ser explícitos (no esperamos cambios:
--    CREATE OR REPLACE VIEW preserva grants existentes).
GRANT SELECT ON rdb.v_cortes_totales TO anon, authenticated, service_role;
GRANT SELECT ON rdb.v_cortes_lista   TO anon, authenticated, service_role;
