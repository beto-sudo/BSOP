# Iniciativa — RDB Waitry: fantasmas tardíos + propagación a cortes/inventario (F1)

**Estado:** done
**Última actualización:** 2026-05-28
**Empresa:** RDB (único cliente Waitry)
**Schemas:** rdb (`detect_waitry_fantasma`, 7 vistas), erp (cortes, inventario)
**ADR:** [ADR-036](../adr/036_rdb_waitry_fantasmas_tardios_propagacion.md)
**Relación:** follow-up de [`rdb-waitry-deduplicacion`](rdb-waitry-deduplicacion.md)
(ADR-031, cerrada) y hermana de F3 ([ADR-035](../adr/035_rdb_waitry_paid_false_no_venta.md)).
Es el "F1" del triage de mayo 2026.

## Problema

Dos defectos compuestos en la dedup de fantasmas de Waitry:

1. **Fantasmas tardíos:** la heurística de ADR-031 marca duplicados (mismo
   `external_delivery_id` + total + items) solo dentro de **15 min**. 23 grupos de
   duplicados idénticos quedaban fuera (spread 17 min – 5.9 h) → ~25 pedidos extra
   ($6,678) contados como venta.
2. **ADR-031 marcó pero no propagó:** solo `v_waitry_pedidos` filtraba `superseded`.
   Cortes, reportería e inventario NO → los 40 fantasmas ya marcados seguían inflando
   todo.

## Outcome

Un fantasma no cuenta como venta en ningún lado (cortes, reportería, inventario), igual
que F3 con `paid=false`. Detección hasta 48 h. Registro crudo preservado.

**Logrado (prod, 2026-05-28):** 65 fantasmas marcados (40 + 25), **$14,353 excluidos de
42 cortes**, ~72 salidas de inventario revertidas, 13,084 pedidos crudos intactos.

## Decisión de Beto (2026-05-28)

- **Corregir TODO retroactivo** (incluidos cortes cerrados) — un fantasma nunca fue una
  segunda venta; corregir exonera faltantes de cajera (~$4,193 cash inflado).
- **Ventana 48 h** — los 23 caen <6 h; 48 h da margen sin falsos positivos.

## Alcance (migración `20260528234944`, espejo de F3)

1. `detect_waitry_fantasma`: ventana 15 min → 48 h + re-backfill marca los 25 nuevos.
2. Filtro `superseded_by_order_id IS NULL` en las 7 vistas de cortes/reportería.
3. Guard `superseded` en `fn_trg_waitry_to_movimientos` + `fn_trg_waitry_pedidos_cancel`.
4. Backfill: revierte ~72 salidas de inventario de fantasmas. Idempotente.

## Sprints

- **Sprint 1** (1 migración + ADR-036): todo lo anterior. Aplicado y verificado en prod.
- **Sprint 2**: closeout (este doc + PR + merge).

## Riesgos y mitigaciones

| Riesgo                                       | Mitigación                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| Cortes cerrados cambian de total             | Decisión explícita "corregir todo"; reduce faltantes de cajera (deseado).   |
| 8 grupos ambiguos (mismo ID, total distinto) | No se auto-detectan; revisión manual. No se marcan para evitar falso pos.   |
| Falso positivo a 48 h                        | `external_delivery_id` único por transacción; los 23 son <6 h e idénticos.  |
| Choque de migraciones con sesiones paralelas | Se pausó hasta que la otra sesión cerró su drift; rebase limpio al retomar. |

## Métricas de éxito

- 0 fantasmas (`superseded`) expuestos en cortes/reportería/inventario. ✓ (verificado)
- 65 fantasmas marcados. ✓
- Registro crudo intacto (13,084 pedidos). ✓

## Decisiones registradas

- **2026-05-28:** ventana 48 h + corregir todo retroactivo (Beto). Deroga WAITRY-DEDUP-4
  para fantasmas (extiende lo que F3 hizo para `paid`). Detalle en ADR-036.

## Bitácora

- **2026-05-28 — promovida y cerrada el mismo día.** Diagnóstico contra prod: 23 grupos
  nuevos ($6,678) + hallazgo de que ADR-031 dejó 40 fantasmas inflando
  cortes/reportería/inventario. Alcance = espejo de F3 con `superseded`. Migración
  `20260528234944` aplicada vía `supabase db push` con OK de Beto: 65 fantasmas marcados,
  $14,353 excluidos de 42 cortes, ~72 salidas revertidas. ADR-036 + este doc. Pausa
  intermedia por choque de migraciones con una sesión paralela (223149/221756/225939
  aplicadas a prod desde otras ramas); se retomó tras cerrar esa sesión, con rebase limpio
  y renombre de la migración a timestamp posterior para preservar orden cronológico.
