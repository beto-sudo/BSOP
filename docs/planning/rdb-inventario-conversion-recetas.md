# Iniciativa — Inventario · Conversión de unidades en recetas (RDB)

**Slug:** `rdb-inventario-conversion-recetas`
**Empresas:** RDB (v1); el mecanismo es genérico y enchufa otras empresas
**Schemas afectados:** `erp` (productos, producto_receta, movimientos_inventario, fn_trg_waitry_to_movimientos), `rdb` (v_inventario_stock)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-06-25
**Última actualización:** 2026-06-25
**Próximo hito:** Sprint 4 — capturar `contenido`/`unidad_base` de los 31 insumos (lista validada por Beto) + corrección del stock histórico (UI de captura ya lista, PR Sprint 3)

> Promovida el 2026-06-25. Beto detectó que el descuento de inventario por
> receta no podía saber cuántos mililitros tiene una botella si el "980ml"
> sólo vive en el nombre del producto. La investigación reveló que el
> descuento automático **ya existe en prod y está descontando mal** desde
> mediados de junio: el trigger resta la cantidad de la receta (ml/g) sin
> convertirla a la unidad de stock (pieza/botella), vaciando inventarios a
> un ritmo de hasta 980× lo real.

## Problema

El trigger `erp.fn_trg_waitry_to_movimientos` (vivo desde 2026-04-24) descuenta
los insumos de la receta al concretarse una venta Waitry. Inserta el movimiento
de salida con `cantidad = NEW.quantity * receta.cantidad` — **la cantidad de la
receta tal cual, sin convertir de unidad**. La vista `rdb.v_inventario_stock`
expone `stock_actual` desde `erp.inventario.cantidad`, que un trigger de
materialización mantiene sumando/restando esos movimientos.

El stock de cada insumo se lleva en su `erp.productos.unidad` (la unidad de
compra: pieza/botella/bolsa). Pero las recetas se capturan en la unidad natural
de consumo (ml/g). **No existe ningún dato que ligue ambas**: que "1 botella de
Bacardi = 980 ml" vive sólo en el `nombre` del producto, no en una columna.

Resultado, al vender **1** Bacardi Pintado:

| Insumo                | Receta | Hoy resta       | Debería restar      |
| --------------------- | ------ | --------------- | ------------------- |
| Bacardi Botella 980ml | 20 ml  | 20 (≈ botellas) | 20 ÷ 980 = 0.020    |
| Agua Peñafiel 2 L     | 100 ml | 100             | 100 ÷ 2000 = 0.05   |
| Coca 2.5 L            | 25 ml  | 25              | 25 ÷ 2500 = 0.01    |
| Hielo 25 kg           | 10 g   | 10              | 10 ÷ 25000 = 0.0004 |
| Vaso térmico 20 oz    | 1 pza  | 1 ✓             | 1 ✓                 |

### Tamaño real (auditoría Sprint 0, 2026-06-25)

No es sólo el bar. **31 insumos** tienen al menos una receta cuya unidad difiere
de su unidad de stock (`lower(pr.unidad) <> lower(p.unidad)`), abarcando bar
(Bacardi, Clamato, Licor 43, aguas, salsas embotelladas) y cocina (carnes,
quesos, verduras, cremas, tortillas). Daño ya materializado en
`movimientos_inventario` (salidas por receta con cantidad ≥ 1, desde 2026-06-17):
Clamato −720 (máx 120/mov), Bistec −510 (máx 170), Carne molida −300 en un solo
movimiento, Lechuga −220, Salsa Verde de tomatillo −200, varios quesos y cremas
−40 a −160. Las bebidas vendidas directo por pieza (Topochico, Tecate, Electrolit)
descuentan bien porque su consumo coincide con su unidad de compra.

## Outcome esperado

1. **Cada insumo sabe su contenido**: capturable en "Configurar Producto"
   ("1 botella = 980 ml"), no inferido del nombre.
2. **El descuento por venta convierte** la cantidad de receta a la unidad de
   stock antes de restar — el inventario en botellas/piezas baja al ritmo real.
3. **Sin dato de contenido, no se sangra**: si un insumo no tiene cómo
   convertirse, el trigger no descuenta (mejor faltante que stock fantasma) y
   queda visible para capturar.
4. **Historia corregida**: los movimientos mal descontados desde junio se
   recalculan; los stocks quedan reales.

## Decisión de diseño (Beto, 2026-06-25)

**Stock en presentación de compra.** El inventario se sigue contando y mostrando
en la unidad de compra (botellas, bolsas, piezas) — como se compra y como se
cuenta en el levantamiento físico. La receta se captura en unidad fina (ml/g) y
el motor convierte a fracción de presentación. Mínimo blast radius: no se tocan
compras, recepción ni levantamientos.

Mecanismo: dos columnas nuevas en `erp.productos`:

- **`unidad_base`** (text, nullable) — unidad fina en que se mide el contenido
  (ej. `mililitro`, `gramo`). NULL ⇒ el producto no se fracciona.
- **`contenido`** (numeric, nullable) — cuántas `unidad_base` trae 1 `unidad`
  de compra (ej. 980). NULL ⇒ sin fraccionamiento.

Conversión en dos niveles, encapsulada en `erp.fn_factor_receta_a_stock(insumo, unidad_receta) → numeric`:

1. **Universal, misma dimensión** (litro↔ml ×1000, kilo↔gramo ×1000): tabla de
   factores en SQL + en `lib/unidades.ts`.
2. **Presentación discreta** (pieza/botella/bolsa → ml/g): vía `contenido` +
   `unidad_base` del insumo.

`salida_en_stock = qty_vendida × cantidad_receta × factor`, donde `factor`
lleva de `unidad_receta` a `unidad` de stock. Si no es convertible → factor NULL
→ no se descuenta.

## Alcance v1

### Sprint 0 — Auditoría / dimensionar daño ✅ 2026-06-25

- [x] Confirmado el bug en la versión viva del trigger (`pg_get_functiondef`).
- [x] 31 insumos afectados identificados; daño histórico cuantificado.
- [x] Confirmado que `stock_actual` sale de `erp.inventario.cantidad`
      (materializado), no de la vista — la corrección histórica debe tocar
      movimientos **y** el stock materializado.

### Sprint 1 — Schema + función de conversión ✅ 2026-06-25 (PR #1026)

- [x] Migración: `erp.productos.contenido` + `erp.productos.unidad_base`.
- [x] `erp.fn_factor_universal` (litro↔ml, kilo↔g) +
      `erp.fn_factor_receta_a_stock(p_insumo_id uuid, p_unidad_receta text)
RETURNS numeric` — universales + contenido/unidad_base, NULL si no convertible.
- [x] Regenerar `SCHEMA_REF.md` + `types/supabase.ts`.
- [x] Aplicada a prod por MCP + ledger reconciliado (`migration repair`).

### Sprint 2 — Motor: trigger convierte (detiene el sangrado) ✅ 2026-06-25 (PR #1026)

- [x] Reescrito `fn_trg_waitry_to_movimientos` desde la versión viva usando
      `fn_factor_receta_a_stock`. Insumo sin factor ⇒ no inserta salida.
- [x] Conservado el fallback legacy (`parent_id` + `factor_consumo`) para
      productos sin receta — ese camino ya estaba en la unidad correcta.
- [x] Verificado en prod: Bacardi sin contenido ⇒ factor NULL ⇒ no descuenta.

### Sprint 3 — Captura en UI ✅ 2026-06-25 (PR Sprint 3)

- [x] "Configurar Producto" (`app/rdb/productos/page.tsx`): cuando inventariable,
      campos "Contenido por <unidad>" + "Unidad de consumo" (`unidad_base`).
- [x] Persistir `contenido`/`unidad_base` en `handleSave` (con validación:
      número > 0, unidad de consumo requerida si hay contenido).
- [x] Helper de conversión en `lib/unidades.ts` (`factorUniversal` +
      `factorRecetaAStock`, espejo de la SQL) + 17 unit tests.
- [x] Preview por fila de receta: "Descuenta 0.0204 pieza por venta" o aviso
      ámbar "⚠ sin conversión, configura el contenido" cuando falta el dato.

### Sprint 4 — Backfill datos + corrección histórica

- [ ] Capturar `contenido` + `unidad_base` de los 31 insumos (valores leídos del
      nombre, **validados por Beto** — no se infieren a ciegas).
- [ ] Recalcular los movimientos `venta_waitry` mal descontados desde 2026-06-17
      y reconciliar `erp.inventario.cantidad`.
- [ ] Verificar stocks contra el levantamiento físico cuando lo haya.

### Sprint 5 — Cierre

- [ ] Verificación visual de Beto en preview/prod.
- [ ] Barrido de Reminders. Mover iniciativa a `## Done`.
- [ ] Evaluar deprecación del doble-modelo (`parent_id`/`factor_consumo` +
      `inventariable=true` en preparados) — posible sub-iniciativa.

## Fuera de alcance v1

- **Stock en unidad fina** (ml/g como unidad de inventario). Descartado a favor
  de "presentación de compra".
- **Validación de stock insuficiente / bloqueo de venta**: el trigger seguirá
  permitiendo stock negativo; alertas son sprint posterior.
- **Limpieza de `unidad='pieza'` mal puesta** en insumos a granel (carnes,
  verduras que se compran por kilo): se absorbe vía `contenido`/`unidad_base`,
  pero normalizar la `unidad` de compra es trabajo de datos aparte.
- **Cross-empresa**: el mecanismo es genérico pero v1 libera sólo RDB.

## Riesgos / Dependencias

- **Corrección histórica es delicada**: recalcular movimientos y reconciliar el
  stock materializado debe hacerse con backup/verificación; es cambio en prod
  con OK verbal de Beto.
- **Trigger es camino caliente** (cada venta Waitry): la función de conversión
  debe ser barata y a prueba de NULL; un error ahí frena el descuento de todas
  las ventas.
- **Datos sucios**: varios insumos tienen `unidad='pieza'` cuando son peso/volumen.
  El contenido capturado por Beto es la fuente de verdad; la UI debe hacer obvio
  qué falta por capturar.
- **Doble-modelo coexistente**: productos como Bacardi Pintado tienen receta
  **y** `parent_id`+`factor_consumo`+`inventariable=true`. El trigger prioriza
  receta; la limpieza del legacy queda para Sprint 5.

## Métrica de éxito

- 0 insumos descontando en unidad equivocada tras Sprint 2 (auditoría repetible).
- Stock de los 31 insumos reconciliado y creíble contra realidad física.
- Beto captura contenidos desde la UI sin escalar a Claude.

## Sprints / hitos

### Sprint 0 — Auditoría · 2026-06-25 ✅

Versión viva del trigger confirmada con `pg_get_functiondef`. 31 insumos
afectados; daño desde 2026-06-17 cuantificado (Clamato −720, Bistec −510, etc.).
`stock_actual` = `erp.inventario.cantidad` (materializado) — la corrección debe
tocar movimientos y stock.

## Decisiones registradas

### 2026-06-25 · Promoción + decisión de unidades

Beto eligió llevar el stock en **presentación de compra** (no en unidad fina) y
promover como iniciativa nueva (la `rdb-productos-config-reportes` está cerrada y
fue 100% UI/reportes; la conversión de unidades quedó fuera de su alcance). El
factor de conversión vive por insumo (`contenido` + `unidad_base`), porque
botella→ml es específico del producto, no universal.

## Bitácora

### 2026-06-25 · Sprint 0 — Auditoría e investigación

Origen: pregunta de Beto sobre cómo el sistema conoce los 980 ml de una botella
si sólo están en el nombre. Investigación encontró el trigger descontando sin
convertir y 31 insumos afectados con daño activo. Iniciativa promovida a
`in_progress`. Branch `claude/rdb-inventario-conversion-recetas`.

### 2026-06-25 · Sprint 1+2 — Motor aplicado a prod (PR #1026)

Migración `20260625150117`: columnas `contenido`/`unidad_base`, funciones
`fn_factor_universal` + `fn_factor_receta_a_stock`, y trigger reescrito (partido
de la versión viva, sólo cambió el loop de receta). Aplicada a prod por MCP;
ledger reconciliado con `migration repair` (archivo `…150117` applied, huérfano
`…152701` reverted). `SCHEMA_REF.md` + `types/supabase.ts` regenerados. 6 checks
de CI en verde. **Sangrado detenido**: insumos sin `contenido` capturado dejan de
descontar (factor NULL) en vez de restar unidades fantasma. Pendiente vivo: el
stock histórico de los 31 insumos sigue distorsionado hasta el Sprint 4
(corrección de movimientos) y el descuento correcto no arranca hasta capturar
contenidos (Sprint 3, UI).

### 2026-06-25 · Sprint 3 — UI de captura (PR Sprint 3)

Branch `claude/rdb-inventario-captura-contenido` (desde `origin/main` con el
motor ya mergeado). En "Configurar Producto": bloque "Contenido por <unidad>" +
"Unidad de consumo" (visible cuando inventariable), persistido en `handleSave`
con validación. Helper `factorUniversal` + `factorRecetaAStock` en
`lib/unidades.ts` (espejo de la SQL, 17 unit tests). Preview por renglón de
receta mostrando cuánto descuenta cada insumo, con aviso ámbar cuando falta el
contenido. 6 checks de CI en verde. PR **sin auto-merge** (UI visible): Beto
revisa el Vercel Preview y mergea. Sigue el Sprint 4 (lista de 31 + corrección
histórica), que necesita su validación.
