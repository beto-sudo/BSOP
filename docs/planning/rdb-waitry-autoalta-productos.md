# Iniciativa — Auto-alta de productos entrantes de Waitry (RDB)

**Slug:** `rdb-waitry-autoalta-productos`
**Empresas:** RDB
**Schemas afectados:** `rdb` (ingesta `waitry_productos` — webhook o trigger), `erp` (`productos`)
**Estado:** done
**Próximo hito:** — (cerrada 2026-06-08)
**Dueño:** Beto
**Creada:** 2026-06-05
**Última actualización:** 2026-06-08 (**cerrada** — Sprints 0-2 en prod, verificado E2E; Sprint 3 era explícitamente opcional)

> Promovida el 2026-06-05 al diagnosticar por qué el reporte de ventas por
> categoría de RDB seguía mostrando "Sin categoría" pese a que Pablo ya había
> categorizado el catálogo. La causa no era falta de categorías sino productos
> vendidos en Waitry que nunca existieron en `erp.productos`. Beto eligió atacar
> la raíz con una iniciativa nueva acotada (vs. plegarla a la bloqueada
> `rdb-waitry-catalog-sync` o seguir con backfills manuales).

## Problema

El catálogo de RDB (`erp.productos`) y el menú del POS Waitry son dos universos
que hoy **no se sincronizan en la dirección entrante**. Cuando se da de alta un
producto nuevo en el menú de Waitry y se vende, el webhook entrante
(`supabase/functions/waitry-webhook`) registra la venta en `rdb.waitry_productos`
pero **no crea el producto en `erp.productos`**. El producto queda "fantasma":
existe en ventas, no en el catálogo.

Consecuencias medidas:

- **Reporte de ventas por categoría con hueco recurrente.** El enlace
  `rdb.waitry_productos.product_id = erp.productos.codigo` no resuelve para estos
  productos, así que caen en "Sin categoría". No por falta de categoría —
  por falta del producto en el catálogo. Pablo no los puede arreglar porque ni
  siquiera le aparecen en la pantalla de Productos (esa lista lee `erp.productos`).
- **Treadmill de backfills manuales.** Ya van **dos** backfills puntuales:
  - `20260521164159` (iniciativa `rdb-ventas-por-categoria`, Sprint 2): 19
    servicios deportivos. Bajó "Sin categoría" de 24.7% a 2.1% del importe.
  - `20260605160000` (este diagnóstico): 38 productos nuevos de mayo (comida,
    bebidas preparadas, licores, merchandise, uso de cancha, torneos). Regresó
    mayo a 100% categorizado.
  - Entre uno y otro pasaron ~2 semanas. Sin sync, el hueco se reabre con cada
    producto nuevo del menú.
- **Productos sin costeo/inventario/recepción.** Al no estar en `erp.productos`,
  no se pueden costear, no entran a levantamientos, no se pueden recibir por OC.

## Outcome esperado

- **Cero productos vendidos fuera del catálogo.** Cuando llega una venta de Waitry
  con un `product_id` que no existe en `erp.productos` (RDB), el sistema **crea
  automáticamente** el producto faltante (`codigo` = `product_id`, `nombre` =
  `product_name`, **sin categoría**, `inventariable=false`, `activo=true`).
- **"Sin categoría" se vuelve auto-limpiante.** El bucket del reporte deja de
  mezclar "no catalogado" con "no clasificado": un producto recién auto-creado
  aparece en la pantalla de Productos de Pablo con categoría vacía, listo para que
  la asigne en un clic. El hueco refleja trabajo pendiente real, no ausencia.
- **Fin del treadmill.** No más backfills manuales por productos nuevos del menú.

## Alcance v1 (propuesto — a cerrar con Beto antes de `planned`)

### Sprint 1 — Auto-alta en la ingesta

- Por cada línea de venta cuyo `product_id` no exista como `codigo` en
  `erp.productos` (RDB), hacer un `INSERT` idempotente del producto faltante
  (`codigo`, `nombre`, `inventariable=false`, `activo=true`, `categoria_id=NULL`,
  `tipo='producto'`). **Fail-open**: si el alta falla, la ingesta de la venta no
  se cae (la venta es la fuente de verdad financiera).
- **D1 (decisión de diseño pendiente):** ¿dónde vive el auto-alta?
  - **(a) Trigger DB** sobre `rdb.waitry_productos` (AFTER INSERT). Robusto:
    cubre cualquier vía de ingesta, no solo el webhook. Toca el hot path de
    inserción de ventas — el trigger debe ser barato y fail-open.
  - **(b) En la edge function** `waitry-webhook` (TS), tras materializar las
    líneas. Más explícito y testeable, pero solo cubre ese camino de ingesta.

### Sprint 2 — Visibilidad de pendientes por categorizar

- Filtro/badge **"Pendientes de categorizar"** en la pantalla de Productos de RDB
  (`app/rdb/productos`): los productos con `categoria_id IS NULL`. Contador
  visible para que Pablo los trabaje proactivamente sin esperar a que alguien
  mire el reporte de ventas.
- **D2 (pendiente):** ¿marcar los auto-creados con un flag de origen (p. ej.
  `origen='waitry_autoalta'`) para distinguirlos de altas manuales, o basta
  `categoria_id IS NULL`?

### Sprint 3 — (opcional) Aviso

- Notificar (widget en `/inicio` o email) cuando hay N productos nuevos sin
  categorizar tras X días. Se evalúa si Sprint 2 no basta.

## Relación con `rdb-waitry-catalog-sync`

**Hermanas, no competidoras.**

- `rdb-waitry-catalog-sync` (`proposed`, **bloqueada desde 2026-04-29** esperando
  NDA + llaves de la API de Waitry) es la versión **saliente**: BSOP como fuente
  de verdad del catálogo, empuja altas/precios/sold-out a Waitry vía su API. Es la
  solución "grande" pero depende de una dependencia externa parada hace mes y medio.
- Esta iniciativa es **entrante y desbloqueada**: tapa el hueco hoy usando datos
  que **ya recibimos** por el webhook entrante, sin NDA ni API saliente.
- **D5 (pendiente):** cuando `rdb-waitry-catalog-sync` se desbloquee y reemplace
  el webhook entrante (su Sprint 5, "Push New Order"), esta lógica de auto-alta
  podría absorberse ahí. Mientras tanto, da valor inmediato.

## Fuera de alcance v1

- **Sync saliente BSOP → Waitry** (precios, sold-out, etc.) — eso es
  `rdb-waitry-catalog-sync`.
- **Adivinar la categoría.** El auto-alta deja `categoria_id NULL` a propósito;
  clasificar es decisión humana (Pablo). No se hace heurística de categoría.
- **Cross-empresa.** Solo RDB usa Waitry (D4: confirmar RDB-only).
- **Limpieza retroactiva.** El backfill de los 38 de mayo ya se aplicó
  (`20260605160000`); esta iniciativa evita que se reabra hacia adelante.

## Riesgos / impacto en producción

- **Hot path de ingesta de ventas.** El auto-alta (trigger o webhook) corre en el
  camino que alimenta cortes/reportería. Debe ser fail-open y barato. Mitigación:
  `INSERT ... WHERE NOT EXISTS`, sin locks pesados; en trigger, `EXCEPTION WHEN
OTHERS THEN RETURN` para nunca tumbar la venta.
- **Productos basura.** Si Waitry emite `product_id` efímeros/de prueba, se
  crearían productos basura. Mitigación: crear solo desde ventas reales
  (`paid`/pedido canónico, no fantasmas ADR-031/035); revisar volumen tras Sprint 1.
- **Códigos reutilizados.** Waitry reutiliza `product_id` entre productos de la
  misma familia (hallazgo de `rdb-ventas-por-categoria` Sprint 2). El primer alta
  gana el código; aceptable porque agrupan familia. Documentar.
- **Duplicación futura con el sync saliente.** Ver D5.

## Métricas de éxito

- Cero líneas de venta "sin match de código" en el reporte de categoría de forma
  **sostenida** (hoy es un treadmill que se reabre cada ~2 semanas).
- Un producto nuevo del menú de Waitry aparece en la pantalla de Productos de
  Pablo (con categoría vacía) ≤1 día tras su primera venta.
- Cero backfills manuales nuevos por productos no catalogados.

## Sprints / hitos

- **Sprint 0 — cerrar alcance v1.** ✅ Cerrado 2026-06-05: D1 = trigger DB; D2 = sin flag (`categoria_id IS NULL`); D4 = RDB-only; D3 resuelto en Sprint 2; D5 documentado.
- **Sprint 1 — auto-alta en la ingesta.** ✅ Entregado: trigger `trg_waitry_zzz_autoalta_producto` + función `erp.fn_trg_waitry_autoalta_producto`.
- **Sprint 2 — visibilidad de pendientes.** ✅ Entregado: filtro + contador "Sin categoría" en `/rdb/productos`.
- **Sprint 3 — aviso (opcional).** ⏳ A evaluar si Sprint 2 no basta.

## Decisiones registradas

### 2026-06-05 · Promoción a iniciativa

Beto pidió arreglar el reporte de ventas por categoría de mayo (muchos "Sin
categoría" pese a que Pablo categorizó el catálogo). Diagnóstico contra prod
(read-only) mostró que el 6.4% del importe de mayo sin categoría eran 38
productos vendidos en Waitry pero ausentes de `erp.productos` (no un problema de
categorías faltantes — el grupo "en catálogo sin categoría" salió en 0). Tras el
backfill puntual (`20260605160000`), Beto eligió **iniciativa nueva acotada** para
la raíz (vs. plegarla a la bloqueada `rdb-waitry-catalog-sync` o seguir con
backfills manuales), por ser la vía **desbloqueada** (no necesita el NDA de Waitry).

### 2026-06-05 · Sprint 0 — decisiones de diseño cerradas

- **D1 — auto-alta en trigger DB (no en el webhook).** Trigger `AFTER INSERT` sobre
  `rdb.waitry_productos` en vez de modificar la edge function `waitry-webhook`. Razón:
  cubre **cualquier** vía de ingesta (webhook actual y el futuro "Push New Order" de
  `rdb-waitry-catalog-sync`), vive en la DB sin acoplarse a un camino específico, y es
  idempotente + fail-open.
- **D2 — sin flag de origen.** `categoria_id IS NULL` es señal suficiente de "pendiente
  de clasificar"; no se agrega columna a `erp.productos` (tabla compartida) solo para
  distinguir auto-creados de altas manuales.
- **D4 — RDB-only confirmado.** `rdb.waitry_productos` es RDB-específica.
- **No se toca `erp.fn_trg_waitry_to_movimientos`.** Los productos `inventariable=false`
  generan movimientos "legacy" pero `rdb.v_inventario_stock` filtra `inventariable=true`
  → no contaminan el stock (preexistente: 30 productos / 3,960 movimientos). El trigger
  de auto-alta corre **después** de `to_movimientos` (naming `zzz`) para que la primera
  venta de un producto nuevo no genere un movimiento legacy.

## Bitácora

- **2026-06-08 (cierre de la iniciativa)** — Sprints 0-2 en prod y verificados E2E — trigger `trg_waitry_zzz_autoalta_producto` + función `erp.fn_trg_waitry_autoalta_producto` (auto-crea el producto faltante sin categoría, idempotente + fail-open) + contador/filtro "Sin categoría" en `/rdb/productos` (#704). D1-D4 cerradas. El Sprint 3 (aviso/notificación) era explícitamente opcional y condicional a que el Sprint 2 no bastara — no es un pendiente comprometido. Cerrada por instrucción de Beto tras auditoría de estado real (el header estaba stale respecto al trabajo ya en prod).

### 2026-06-05 · Promoción + backfill puntual

- Diagnóstico de mayo: 2,322 líneas / $363,856.90. Antes del fix: 154 líneas
  ($23,355, 6.4%) sin categoría = 38 `product_id` de Waitry sin match en
  `erp.productos` (verificado: ninguno existía en el catálogo, en ningún estado).
  El grupo "producto en catálogo sin categoría" salió en **0** — confirmando que
  Pablo completó su parte y el hueco es de catálogo, no de clasificación.
- Backfill `20260605160000_rdb_backfill_productos_no_catalogados_waitry.sql`
  aplicado a prod (vía MCP por drift de historial multi-sesión; archivo versionado
  por PR). Resultado verificado: mayo a **100% categorizado**, 38 productos creados
  con categoría e `inventariable=false`.
- Doc de planning creado en estado `proposed`. Próximo: Sprint 0 (cerrar D1-D5).

### 2026-06-05 · Sprint 0+1+2 — auto-alta en automático (este PR)

- **Migración `20260605180000_rdb_waitry_autoalta_producto_trigger.sql`**: función
  `erp.fn_trg_waitry_autoalta_producto` (SECURITY DEFINER, fail-open) + trigger
  `trg_waitry_zzz_autoalta_producto` AFTER INSERT en `rdb.waitry_productos`. Crea el
  producto faltante (`codigo` = `product_id`, sin categoría, `inventariable=false`) en
  la primera venta. Aplicada a prod vía MCP (drift de historial multi-sesión).
- **Verificación E2E en prod**: línea de venta de prueba (pedido `paid=false`, aislado
  de reportes) → el trigger auto-creó el producto con `categoria_id NULL` +
  `inventariable=false`; rastro de prueba limpiado por completo.
- **UI** (`app/rdb/productos/page.tsx`): contador clicable "N sin categoría" en el header
  - botón toggle "Sin categoría" en los filtros, para que el operador vea y clasifique lo
    que el trigger va creando. Cero queries nuevas (deriva de `categoria_id IS NULL`).
- 4 checks verdes (typecheck/lint/format/test 1,293 ✓). El backfill histórico de los 94
  códigos viejos sin catalogar **no** se ejecuta (cola larga pre-mayo que no toca reportes
  recientes; el trigger los recupera si se vuelven a vender).
- Estado `proposed → in_progress`. Próximo: observar volumen de auto-altas; evaluar Sprint
  3 (aviso) solo si el contador no basta.
