# ADR-003 — Push-down de fecha en `rdb.v_cortes_totales`

**Fecha:** 2026-04-25
**Estado:** propuesto (pendiente ejecución por Claude Code y aprobación de Beto)
**Autor:** planeado en Cowork-Supabase, sprint 4D §3
**Referencias:**

- PR previo (Ruta A, fix RLS InitPlan): [#181](https://github.com/beto-sudo/BSOP/pull/181) → migración `supabase/migrations/20260425002501_rls_initplan_waitry_select.sql`
- Sprint 4D §1 (FK indexes / search_path / audit_log): [#183](https://github.com/beto-sudo/BSOP/pull/183)
- Sprint 4D §2 (consolidate permissive policies): [#185](https://github.com/beto-sudo/BSOP/pull/185)
- Vista consumidora: `components/cortes/cortes-view.tsx` → `components/cortes/data.ts`

---

## Contexto

PR [#181](https://github.com/beto-sudo/BSOP/pull/181) ("Ruta A") aplicó el fix de `/cortes` timeout: envolvió los helpers RLS (`core.fn_is_admin()`, `core.fn_has_empresa(...)`) en `(SELECT …)` para forzar `InitPlan`. Resultado medido el 2026-04-24 (3 cortes del 2026-04-22, LIMIT 300):

|                              | Antes (Laisha viewer) | Después (#181) |
| ---------------------------- | --------------------: | -------------: |
| Execution time               | 2 157 ms              | 108 ms         |
| Buffers shared hit           | 143 615               | 4 608          |

Eso desbloqueó la pantalla. Pero queda un problema **estructural** detrás del fix.

### Síntoma estructural medido el 2026-04-25

`rdb.v_cortes_totales` agrega TODAS las cortes históricas de RDB cada vez que se la consulta. El cliente filtra por `WHERE fecha_operativa = X` sobre `v_cortes_lista`, pero `v_cortes_totales` no expone `fecha_operativa`, así que el filtro **no se propaga** al subquery interior. EXPLAIN del 2026-04-25 como Laisha sobre `fecha_operativa = '2026-04-22'`:

- Outer `cortes_caja` → Index Scan, 3 rows, 4.7 ms ✓
- Inner subquery (`v_cortes_totales`) → procesa los 444 cortes históricos:
  - `Seq Scan on waitry_pedidos` 11 026 rows (820 ms)
  - `Seq Scan on waitry_pagos` 11 150 rows (28 ms)
  - HashAggregate de 444 cortes (988 ms)
- **Total: 993 ms, Buffers shared hit: 4 621**

Es decir: la mejora del 108 ms del PR #181 fue real para *ese* día, pero el costo absoluto crece linealmente con el histórico. A 6 meses, con más cortes acumulados, esto vuelve a chocar contra el `statement_timeout = 8s` de PostgREST. Es **deuda estructural**, no un fluke temporal.

### Por qué `v_cortes_totales` no expone `fecha_operativa`

Decisión histórica al consolidar `rdb.cortes` legacy → `erp.cortes_caja` en migración `20260414000003_erp_migrate_rdb_data_phase2.sql`. La vista se diseñó como "tabla de agregados por corte"; la fecha se dejó como atributo del wrapper (`v_cortes_lista`). La columna existe en `erp.cortes_caja.fecha_operativa` (con índice `erp_cortes_fecha_operativa_idx (empresa_id, fecha_operativa)`).

---

## Opciones

### Opción A — Exponer `fecha_operativa` en `v_cortes_totales` (recomendada)

Agregar `c.fecha_operativa` al `SELECT` y al `GROUP BY` de `v_cortes_totales`. Ajustar `v_cortes_lista` para joinear por `(vt.corte_id = c.id AND vt.fecha_operativa = c.fecha_operativa)`.

**Mecánica del push-down:** cuando el cliente filtra `WHERE c.fecha_operativa = '2026-04-22'` sobre `v_cortes_lista`, Postgres propaga el predicado vía equi-join (`vt.fecha_operativa = c.fecha_operativa`). Como `c.fecha_operativa` está en el `GROUP BY` de la vista interior, el planner aplica el filtro al `cortes_caja c_1` *dentro* de `v_cortes_totales`, reduciendo el outer scan a las 3 cortes del día. Los `LEFT JOIN` con las CTEs de pagos/pedidos/movimientos se invierten a Nested Loop con Index Scan en `rdb_waitry_pedidos_corte_id_idx (corte_id)`, que ya existe.

**Validación dry-run (en transacción ROLLBACK, 2026-04-25):**

| Métrica                  | Antes      | Después   | Mejora  |
| ------------------------ | ---------: | --------: | ------: |
| Execution time (Laisha)  | 993 ms     | 11.8 ms   | 84×     |
| Buffers shared hit       | 4 621      | 1 710     | 2.7×    |
| `Seq Scan` waitry_pedidos | 11 026 rows | 11 026 rows (en 1 lugar, no en 2) | parcial |

El `Seq Scan` que queda es el del CTE `pedidos_por_corte` (count distinto de pedidos por corte). Sigue tocando 11 026 filas pero el HashAggregate cuesta 7 ms total — no es el bottleneck. El verdadero ahorro viene de `pagos_por_corte`, que pasa de "Seq Scan + Hash Join 11 150 × 11 026" (820 ms) a "3 Index lookups + Nested Loop ~50 rows" (2.3 ms).

**Pros:**
- Cero cambios en la app — la signature pública de `v_cortes_lista` no cambia, solo se *agrega* `fecha_operativa` (que ya estaba expuesta de `c.fecha_operativa`, no rompe orden).
- Mínima cirugía SQL — `CREATE OR REPLACE VIEW` con la columna agregada al final.
- Push-down validado empíricamente en dry-run.
- Rollback trivial: revertir el `ADD` con otra migración.

**Contras:**
- Depende de un comportamiento del query planner (predicate pushdown a través de equi-join + GROUP BY). Postgres 17.6 lo soporta y se midió. Si futuras versiones cambian heurística, podría regresar — riesgo bajo, recuperable.
- El `pedidos_por_corte` CTE sigue full-scan de `waitry_pedidos`. Costo actual 7 ms; a 100 K rows seguiría siendo barato. Si crece a millones, hacer un §4 separado.

**Riesgo:** bajo. Si el push-down no se da (no es el caso medido, pero hipotéticamente), el plan no empeora vs hoy — solo no mejora.

### Opción B — Función parametrizada `rdb.fn_cortes_totales(p_from, p_to)`

Reemplazar la vista por una función SQL/PLPGSQL que reciba el rango de fechas y filtre el inner WHERE. `v_cortes_lista` deja de ser una vista que joinea con `vt`; pasa a llamar la función vía RPC.

**Pros:**
- Push-down garantizado (es código procedural).
- Control total del plan.

**Contras:**
- Cambia signature pública: el cliente PostgREST/`supabase-js` debe llamar `rpc('fn_cortes_totales', { p_from, p_to })` en lugar de `from('v_cortes_lista').select()`. Implica cambios en `components/cortes/data.ts` y todos los callers.
- Coordinación entre lanes Cowork-Supabase y BSOP-UI.
- Más invasivo, mayor riesgo de regresión funcional.

**Riesgo:** medio. Solo si Opción A no produce push-down efectivo.

### Opción C — Materializar `v_cortes_totales` con refresh

Convertir en `MATERIALIZED VIEW` con `REFRESH MATERIALIZED VIEW CONCURRENTLY` periódico (cron) o trigger.

**Pros:** queries instantáneas.

**Contras:**
- Latencia de actualización (no real-time). Cierres recientes pueden no reflejarse hasta el siguiente refresh.
- Ops overhead: schedule de refresh, monitoreo de staleness, posible bloqueo en `REFRESH ... CONCURRENTLY` si hay write contention.
- Mayor complejidad operacional para un caso que no la justifica (los datos cambian seguido — apertura/cierre de cortes, registro de pagos en tiempo real).

**Riesgo:** alto. No recomendado salvo que A y B sean inviables.

---

## Decisión

**Opción A.** El dry-run del 2026-04-25 muestra 993 ms → 11.8 ms (84×) sin cambios en el contrato público de `v_cortes_lista`. No hace falta escalar a Opción B.

Si en algún sprint futuro se observa que el `Seq Scan` residual de `pedidos_por_corte` se vuelve material (>50 ms), revisitar como sub-§ separado — opciones: convertir `pedidos_por_corte` en LATERAL, o usar `count(DISTINCT ped.corte_id) FILTER (...)` en el SELECT exterior.

---

## Consecuencias

### Positivas

- Pantalla `/cortes` queda en orden de magnitud sub-50 ms para días recientes, independientemente del histórico acumulado.
- Reduce buffers tocados ~3× — menor presión sobre cache compartida.
- No incrementa surface area de la app (no hay nueva función, no hay nuevo endpoint).

### Neutras / a monitorear

- `pg_stat_statements` mean para queries que tocan `v_cortes_lista` debería caer drásticamente en las 24h posteriores al merge. Si no cae, investigar si el cliente filtra por algo distinto a `fecha_operativa` (e.g. rangos abiertos `>=`).
- Filtros por rango (`fecha_operativa BETWEEN x AND y`) se benefician igual: el planner empuja el predicate range igual que el equality.
- Filtros que **no** mencionan `fecha_operativa` (e.g. solo `estado = 'abierto'`) **no** se benefician — esos vuelven al plan post-#181 (~108 ms). Eso es aceptable: el caso dominante en UI es filtro por fecha.

### Negativas

- Ninguna identificada en el dry-run. La columna agregada (`fecha_operativa`) en la signature de `v_cortes_totales` no rompe consumidores existentes (PostgREST/supabase-js ignora columnas no seleccionadas). El JOIN extra en `v_cortes_lista` (`AND vt.fecha_operativa = c.fecha_operativa`) es semánticamente idéntico al join anterior porque `vt.corte_id = c.id` es PK match — no introduce dups.

## Seguimiento

1. **Verificar `pg_stat_statements` en 24h.** Confirmar que la mean para queries de `v_cortes_lista` baja del nivel post-#181 (~108 ms) hacia el de medición de hoy (~12 ms para queries con filtro de fecha). Sin acción si baja; investigar caller con plan distinto si no.
2. **No mergear sin verificación post-aplicar.** Si el plan post-merge no muestra el Index Scan en `cortes_caja c_1` adentro de la vista (i.e. push-down falló), hacer rollback inmediato y escalar a Opción B en sprint aparte.
3. **Eliminar el comentario sobre Coda en SCHEMA_REF.** No aplica a este ADR; nota para futura limpieza de doc.

## Ejecución

Un solo PR en lane Cowork-Supabase:

- Migración: `supabase/migrations/20260425120000_rdb_v_cortes_totales_fecha_pushdown.sql`.
- Regenerar `SCHEMA_REF.md` (`npm run schema:ref`) — la signature pública de `v_cortes_totales` cambia (gana `fecha_operativa`).
- Verificación post-apply en el body del PR:
  - `EXPLAIN ANALYZE` como Laisha y como Beto sobre `fecha_operativa = '2026-04-22'`.
  - Smoke test numérico: `SELECT id, ingresos_efectivo, total_ingresos, pedidos_count, efectivo_esperado FROM rdb.v_cortes_lista WHERE fecha_operativa = '2026-04-22'` antes/después de aplicar — los 3 cortes deben dar valores idénticos.

## Cambios a este ADR

Editar vía PR con cambio de estado: `propuesto → aceptado → implementado`. Si el push-down de Postgres regresa en una versión futura (alguna heurística cambia), revertir esta migración y abrir nuevo ADR para Opción B.
