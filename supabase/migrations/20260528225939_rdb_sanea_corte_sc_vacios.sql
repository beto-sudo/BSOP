-- ============================================================
-- MIGRATION: 20260528225939_rdb_sanea_corte_sc_vacios
--
-- Saneo cosmético (follow-up de ADR-035 / migración 20260528221756).
-- Elimina los Corte-SC ("Sin Corte") que NO tienen ninguna venta real
-- (ningún pedido paid IS TRUE). Son artefactos del trigger
-- handle_sc_corte_on_open ANTES de su fix de paid: agrupaban pedidos
-- huérfanos que resultaron ser todos paid=false/cancelados, por lo que
-- aparecen en $0 en rdb.v_cortes_totales (ruido en la lista de cortes).
--
-- Estado verificado en prod (2026-05-28): 9 Corte-SC vacíos, 18 pedidos
-- paid=false asignados, 0 movimientos_caja / 0 conteos / 0 vouchers.
--
-- Efecto del DELETE (vía las FKs existentes a erp.cortes_caja):
--   · rdb.waitry_pedidos.corte_id           -> SET NULL  (los 18 pedidos
--     paid=false vuelven a huérfanos; correcto bajo F3, no son venta — se
--     preservan en la tabla base para auditoría, regla WAITRY-PAID-2).
--   · erp.corte_conteo_denominaciones       -> CASCADE   (0 filas)
--   · erp.cortes_vouchers                    -> CASCADE   (0 filas)
--   · erp.movimientos_caja                   -> NO ACTION (0 filas, no bloquea)
--
-- Idempotente: un segundo run borra 0. No re-aparecen — el trigger ya
-- corregido (paid IS TRUE) no vuelve a crear Corte-SC para no-ventas.
-- Acotado a RDB (empresa Waitry) como defensa adicional; el patrón de
-- nombre 'Corte-SC-%' ya es exclusivo del trigger SC.
-- ============================================================

DELETE FROM erp.cortes_caja cc
WHERE cc.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
  AND cc.corte_nombre LIKE 'Corte-SC-%'
  AND NOT EXISTS (
    SELECT 1
    FROM rdb.waitry_pedidos wp
    WHERE wp.corte_id = cc.id
      AND wp.paid IS TRUE
  );
