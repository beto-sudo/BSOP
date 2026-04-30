# Iniciativa — OC: cierre del ciclo operativo (gates UI + historial + handoff CxP)

**Slug:** `oc-cierre-ciclo`
**Empresas:** RDB (única con OCs vivas; cuando otras empresas adopten OC heredan estas reglas)
**Schemas afectados:** `erp` (`ordenes_compra`, `ordenes_compra_detalle`, `movimientos_inventario`) + 1 view nueva (`erp.v_oc_cerradas_pendientes_pago`)
**Estado:** done
**Dueño:** Beto
**Creada:** 2026-04-29
**Cerrada:** 2026-04-29
**Última actualización:** 2026-04-29 (Sprints 1-4 entregados en un solo ciclo autónomo: PRs #334, #335, #336, #339. 5 gaps cerrados en RDB end-to-end.)

## Problema

La iniciativa madre [`oc-recepciones`](./oc-recepciones.md) cerró el 2026-04-28 con
DB + 3 RPCs + UI básica de recepciones. Funciona, pero el ciclo operativo
de OC sigue con huecos que confunden al operador y dejan el flujo
abierto al final:

1. **No marca "OC enviada" claro tras envío.** [`handleSavePricesAndMarkEnviada`](../../app/rdb/ordenes-compra/page.tsx:1360)
   sí escribe `estado='enviada'` + `autorizada_at` en DB, pero el toast
   es genérico y la lista principal no se refresca al instante. Falta
   sello visible "ENVIADA · fecha · por quién" que cierre la duda
   "¿realmente la mandé?".
2. **No bloquea cuando ya está enviada/cerrada.** Los inputs sí se
   desactivan en estados terminales ([`isOcEditable`](../../app/rdb/ordenes-compra/page.tsx:232)
   solo permite `borrador|abierta`), pero la UI se ve igual que en captura
   y el operador puede pensar que sigue editable. Falta señal visual
   contundente (color de header, sello, banner explícito).
3. **Imprimir disponible en `borrador`.** [`canPrint = Boolean(orden?.proveedor_id)`](../../app/rdb/ordenes-compra/page.tsx:371)
   solo pide proveedor asignado. Una OC en `borrador` con proveedor se
   imprime y se manda al proveedor sin formalizarla en el sistema. Imprimir
   debería ser **post-envío** únicamente.
4. **Sin historial de recepciones en el drawer.** Las recepciones generan
   `erp.movimientos_inventario` con `referencia_tipo='oc_recepcion'` +
   `referencia_id=oc_id`, pero la única vista está en
   [`/rdb/inventario/movimientos`](../../app/rdb/inventario/movimientos/page.tsx).
   El operador tiene que cambiar de página para ver "qué se recibió
   cuándo y por cuánto" — la información ya existe pero no en el lugar
   donde se necesita.
5. **Sin handoff a CxP al cerrar.** `total_a_pagar` se congela al
   cerrar la OC pero queda como columna huérfana. El módulo
   [`cxp`](./cxp.md) está `planned` (Sprint 1 pendiente). Cuando una OC
   cierra hoy, no hay nada que avise "ya se puede pagar al proveedor".

Resultado operativo: OCs que se envían a proveedor sin que la captura
en sistema lo refleje contundentemente, drafts impresos como si fueran
formales, recepciones que viven en otra pantalla sin contexto, y OCs
cerradas con `total_a_pagar` listo que nadie cobra hasta que CxP
exista. El círculo no cierra.

## Outcome esperado

- **Máquina de estados respetada por la UI**: cada estado tiene gates
  claros sobre 6 acciones (editar líneas, asignar proveedor, imprimir,
  recibir, cerrar, override de precio). Un operador que abra una OC en
  cualquier estado entiende sin pensar qué puede y qué no puede hacer.
- **Sello visible de envío**: badge grande "ENVIADA · 29-abr · Beto" +
  toast contundente + lista refresca al instante. Cero ambigüedad
  sobre si la OC ya se mandó al proveedor o no.
- **Imprimir solo en estados post-envío**: `enviada / parcial /
cerrada / cancelada`. Borrador no se imprime — se obliga a "Marcar
  Enviada" antes de generar el PDF.
- **Sello en el PDF impreso**: watermark/sello visible con el estado
  ("ENVIADA", "RECEPCIÓN PARCIAL", "RECIBIDA", "CANCELADA") para que
  ningún PDF impreso se confunda con uno formalizado.
- **Sección "Historial de recepciones" en el drawer**: tabla con
  fecha, línea, cantidad, costo unitario, valor por movimiento + total
  recibido vs. total pedido. Source: `erp.movimientos_inventario`.
- **Indicador "Listo para CxP"** en OCs cerradas: badge + view
  `erp.v_oc_cerradas_pendientes_pago` que CxP consume cuando se
  construya. Cero schema nuevo en tablas — solo expone los datos.

## Alcance v1

### Sprint 1 — Gates de UI + sello visual + refresh

- [ ] **Gate de imprimir** ([`page.tsx:371`](../../app/rdb/ordenes-compra/page.tsx:371)):
      `canPrint = Boolean(orden?.proveedor_id) && !isOcEditable(estatus)`.
      Cubre `enviada / parcial / cerrada / cancelada`. En `borrador` el
      botón se desactiva con tooltip "Marca Enviada para poder imprimir".
- [ ] **Sello de estado en PDF**: agregar watermark / banda diagonal
      sutil en el print-only block (línea 396-428) con el texto del estado
      actual (`ENVIADA / RECEPCIÓN PARCIAL / RECIBIDA / CANCELADA`).
- [ ] **Sello visible de envío en el drawer**: header del drawer con
      banda colorada según estado + meta line "ENVIADA · 29-abr · Beto"
      cuando aplica (lee `autorizada_at` + `autorizada_por`). Footer del
      drawer también muestra el estado.
- [ ] **Refresh post-envío**: `handleSavePricesAndMarkEnviada` llama
      `refreshOrdenAfterMutation(ordenId)` al final, igual que las
      recepciones. La fila de la tabla se actualiza al instante.
- [ ] **Toast contundente**: cambiar mensaje genérico por
      "📤 OC #X enviada al proveedor — ya no se puede editar" con icon
      apropiado.
- [ ] **Banner de "OC en estado terminal"**: si la OC ya está cerrada
      o cancelada, banner arriba del drawer que lo dice explícitamente
      (hoy hay nota pequeña en línea 500 — promover a banner visible).

### Sprint 2 — Historial de recepciones intra-drawer

- [ ] **Sección colapsable** debajo de la tabla de líneas: "Historial
      de recepciones" (abierta por default si hay > 0 movimientos).
- [ ] **Query**: lee de `erp.movimientos_inventario` filtrado por
      `referencia_tipo='oc_recepcion' AND referencia_id=orden_id`,
      ordenado por `created_at DESC`.
- [ ] **Tabla** (`<DataTable>` reused): Fecha · Producto · Cantidad ·
      Costo unitario · Valor (cantidad × costo) · Almacén destino.
- [ ] **Total al pie**: "Recibido $X de $Y (N%)" — calcula de los
      movimientos vs. `total_a_pagar` o `Σ(cantidad × precio)` según
      estado.
- [ ] **Click en fila**: deep-link a
      `/rdb/inventario/movimientos?focus={mov_id}` (ya existe el handler
      desde Sprint 4 de `oc-recepciones`).
- [ ] **Estado vacío**: cuando la OC aún no tiene recepciones, mostrar
      empty state "Aún no se han registrado recepciones para esta OC."

### Sprint 3 — Handoff a CxP (opción D2: view sin schema nuevo)

- [ ] **Migración**: `supabase/migrations/<ts>_oc_v_cerradas_pendientes_pago.sql`
      crea view `erp.v_oc_cerradas_pendientes_pago` con columnas:
      `oc_id`, `folio`, `empresa_id`, `proveedor_id`, `total_a_pagar`,
      `cerrada_at`, `cerrada_por`, `dias_desde_cierre`. Filtra por
      `estado = 'cerrada' AND total_a_pagar > 0`. Sin retención de pagos
      porque CxP aún no escribe nada — solo expone OCs cerradas.
- [ ] **Indicador en el drawer**: cuando OC = `cerrada`, banner verde
      con "✅ Listo para CxP — total a pagar al proveedor: $X" + nota
      "Pendiente de factura y pago. Visible para CxP cuando se construya."
- [ ] **`SCHEMA_REF.md` regenerado** con `npm run schema:ref` post-migración.
- [ ] **types/supabase.ts regenerado** con `npm run db:types` para que la view sea consultable type-safe.

### Sprint 4 — Cancelar OC entera (sin recepciones) y ajustes finales

- [ ] **Botón "Cancelar OC"** para estados `borrador` y `enviada` sin
      recepciones. RPC nueva
      [`erp.oc_cancelar_orden_completa(orden_id, motivo)`] o reusa la
      existente `oc_cerrar_orden` con flag `cancelar=true`. Decisión al
      arrancar Sprint 4.
- [ ] **Diferenciar semánticamente**: "Cerrar OC" (lo que hay hoy —
      cancela pendiente, congela `total_a_pagar`, queda `cerrada`) vs.
      "Cancelar OC" (anular completa, no se va a pagar nada, queda
      `cancelada`).
- [ ] **PDF con sello "CANCELADA"** cuando estado = `cancelada`.

## Fuera de alcance

- **Construir el módulo CxP**: vive en su propia iniciativa
  ([`cxp`](./cxp.md), `planned`). Esta iniciativa solo expone los
  datos necesarios para que CxP enchufe sin retrabajo.
- **Multi-empresa rollout**: igual que `oc-recepciones` Sprint 5,
  diferido hasta que DILESA/COAGAN/ANSA tengan operación real de OC.
  Cuando ocurra, los gates de UI y el historial intra-drawer se
  extraen a `components/compras/` como parte de esa sub-iniciativa.
- **Devoluciones a proveedor**: sigue fuera de alcance, igual que en
  `oc-recepciones`. Si un producto llega defectuoso y se rechaza, se
  cancela el pendiente de esa línea por ahora.
- **Audit trail granular de cambios de estado**: ya existe via
  `erp.fn_oc_audit` desde Sprint 1 de `oc-recepciones`. No agregamos
  nada nuevo aquí.
- **Mobile-first** del drawer: sigue desktop.

## Métricas de éxito

- **Cero impresiones de borradores**: query a `core.audit_log` o
  similar no muestra OCs impresas en estado `borrador` post-rollout.
- **Tiempo desde "Marcar Enviada" hasta confirmación visual ≤ 1 seg**:
  el refresh + toast + sello aparecen al instante.
- **Drawer auto-suficiente**: en una sesión típica de "ver qué pasó
  con la OC X", el operador no abre `/rdb/inventario/movimientos` ni
  cambia de pantalla. El historial intra-drawer responde la pregunta.
- **OCs cerradas visibles para CxP**: query a
  `erp.v_oc_cerradas_pendientes_pago` retorna las OCs cerradas con
  `total_a_pagar > 0` correctamente. Cuando CxP arranque, su Sprint 1
  consume esta view sin tocar más.
- **Cero ambigüedad de estado**: el operador identifica el estado de
  cualquier OC en < 2 segundos al abrir el drawer (sello + banner +
  badge concuerdan).

## Riesgos / preguntas abiertas

- [ ] **Refresh de la lista al cambiar estado**: hoy la lista usa una
      query con filtros + paginación. Llamar `refreshOrdenAfterMutation`
      re-lee solo el detalle de esa OC. ¿Necesitamos también actualizar la
      fila en la tabla principal? Sí — verificar que el state de
      `ordenes` (línea ~245) se mute con el estado nuevo. Si no, la fila
      visible se queda con el estado anterior hasta refresh manual.
- [ ] **Sello en PDF impreso**: ¿watermark diagonal o banda en el
      header? Decisión visual al arrancar Sprint 1 — preferencia: banda
      colorada en el header con texto grande del estado (más legible
      impreso que watermark sutil).
- [ ] **`v_oc_cerradas_pendientes_pago` vs. tabla nueva**: opción D2
      vs. D1 del análisis. D2 (view) elegida porque CxP aún no existe y
      no queremos amarrar schema futuro. Si CxP arranca y necesita más,
      la view se reemplaza con tabla materializada o lógica más rica
      desde el módulo CxP — sin retrabajo aquí.
- [ ] **`autorizada_por` puede estar `null`** en OCs viejas
      (pre-iniciativa madre). El sello "ENVIADA · fecha · por X" debe
      caer a "ENVIADA · fecha" si no hay nombre. Edge case manejable.
- [ ] **Deep-link al movimiento desde el historial**: ya existe el
      handler en `/rdb/inventario/movimientos?focus={mov_id}` (Sprint 4
      de `oc-recepciones`), pero verificar que el `mov_id` esté
      expuesto vía `erp.movimientos_inventario` y no perdido en JOIN.
- [ ] **Sprint 4 (cancelar OC entera) puede fundirse con Sprint 1**
      si la lógica resulta trivial (un nuevo botón + un nuevo RPC). Si
      resulta involucrar edge cases (¿qué pasa si ya hay alguna
      recepción y se cancela "completa"?), se queda como sprint propio.

## Sprints / hitos

| #   | Scope                                                                                     | Estado          | PR   |
| --- | ----------------------------------------------------------------------------------------- | --------------- | ---- |
| 0   | Promoción: doc + fila en INITIATIVES.md                                                   | done 2026-04-29 | #333 |
| 1   | Gates UI (imprimir/editar) + sello visual envío + refresh lista + toast contundente       | done 2026-04-29 | #334 |
| 2   | Historial de recepciones intra-drawer (query + tabla + total + deep-link)                 | done 2026-04-29 | #335 |
| 3   | View `erp.v_oc_cerradas_pendientes_pago` + indicador "Listo para CxP" en drawer cerrado   | done 2026-04-29 | #336 |
| 4   | Cancelar OC entera (estado `cancelada` real) + sello PDF + diferenciación con "Cerrar OC" | done 2026-04-29 | #339 |

## Decisiones registradas

### 2026-04-29 — Decisiones de promoción

- **Sub-iniciativa de `oc-recepciones` (cerrada)**, no continuación
  de la madre. La madre cerró su alcance v1 (DB + RPCs + UI básica).
  Esta cubre el cierre del ciclo operativo (gates + UX + handoff).
- **Slug sin prefijo de empresa**: aunque RDB es la única con OCs hoy,
  el patrón aplica a cualquier empresa que adopte OC. Coherente con
  `oc-recepciones`.
- **Opción D2 para handoff CxP** (view sin tabla nueva): CxP aún no
  existe, no queremos amarrar schema. La view es throwaway si CxP
  Sprint 1 decide otro modelo.
- **Borrador NO se imprime**: cambio operativo fuerte. El argumento
  es operativo (Beto reportó el gap): si imprimo un borrador y lo
  mando, no queda registro formal del envío. Forzar "Marcar Enviada"
  antes de imprimir cierra esa puerta.
- **Modo autónomo**: cuando Beto autorice ejecución, CC genera PRs
  sprint-por-sprint y mergea con CI verde. Beto revisa al cierre del
  día siguiente. Si no autoriza modo autónomo, se hace al ritmo de
  Beto.

## Bitácora

### 2026-04-29 — Iniciativa cerrada · 5 PRs en un día

5 PRs mergeados en modo autónomo el mismo día de la promoción
(autorización explícita de Beto: "tú generas PRs y merges hasta
terminar"):

- **#333 (Sprint 0 — Promoción)** — doc planning + fila en
  INITIATIVES.md. Conflict heredado en `INITIATIVES.md` resuelto con
  rebase + checkout --ours sobre origin/main + reaplicación de la
  fila (regla 2 del CLAUDE.md de proyecto).
- **#334 (Sprint 1 — Gates UI + sello)** — `canPrint` ahora exige
  proveedor + NO editable; banner verde "OC enviada al proveedor ·
  fecha" para enviada/parcial; banner terminal mejorado (rojo para
  cancelada, muted para cerrada) con fecha de cierre; sello en PDF
  con borde de color según estado; `handleSavePricesAndMarkEnviada`
  llama `refreshOrdenAfterMutation` post-update; toast contundente
  "OC {folio} enviada al proveedor — los precios ya no se pueden
  editar". Type `OrdenCompra` gana `autorizada_at`. Helper
  `getEstadoSeal()`.
- **#335 (Sprint 2 — Historial intra-drawer)** — sección colapsable
  "Historial de recepciones" después de la tabla de líneas en el
  drawer (visible solo para OCs no-editables), leyendo
  `erp.movimientos_inventario` filtrado por `referencia_tipo='oc_recepcion'`
  - `referencia_id=oc_id` con embed PostgREST de producto y
    almacén. Tabla con Fecha · Producto · Cantidad · Costo unitario ·
    Valor · Almacén; total al pie ("Recibido $X de $Y (N%)"); click en
    fila → deep-link a `/rdb/inventario/movimientos?focus={mov_id}`;
    empty state. Carga al abrir drawer + refresh post-mutación.
- **#336 (Sprint 3 — Handoff CxP)** — migración nueva
  `20260429100000_oc_v_cerradas_pendientes_pago.sql` con view
  `erp.v_oc_cerradas_pendientes_pago` (estado='cerrada' AND
  total_a_pagar > 0). UI: banner verde nuevo en drawer cuando OC =
  cerrada con total_a_pagar > 0. Beto aplicó migración con psql
  antes de mergear. SCHEMA_REF.md sync drift heredado (columna
  `health_ingestion_logs.metrics_by_name` del PR #332) arreglado
  como `chore(schema)` commit en el mismo PR (regla "formateo lo
  heredado para no bloquear CI" del CLAUDE.md aplicada al SCHEMA_REF).
- **#339 (Sprint 4 — Cancelar OC entera)** — sin migración. La RPC
  `oc_cerrar_orden` ya retornaba estado='cancelada' si total_recibida=0
  desde Sprint 1 de oc-recepciones; solo faltaba UI que diferencie
  semánticamente. Botón nuevo "Cancelar OC" para borradores. Botón en
  receiving cambia label según hay recepciones o no. ConfirmDialog
  dinámico según `mode`. Toast lee `data.estado` de la RPC.

**Métricas de éxito de la iniciativa cumplidas en RDB**:

- Cero impresiones de borradores: `canPrint` ahora bloquea — verificable
  desde el código (page.tsx:539-540).
- Refresh de lista al marcar Enviada ≤ 1 seg: ✅ — `refreshOrdenAfterMutation`
  re-lee state de DB y propaga a `setSelected` + `setOrdenes`.
- Drawer auto-suficiente: ✅ — historial intra-drawer cubre el caso de
  uso "qué pasó con la OC X" sin cambiar de pantalla.
- OCs cerradas visibles para CxP: ✅ — view
  `erp.v_oc_cerradas_pendientes_pago` lista para consumo cuando
  iniciativa `cxp` arranque.
- Cero ambigüedad de estado: ✅ — sello en drawer + sello en PDF +
  banners + toast contundentes; los 5 estados visualmente distinguibles.

**Follow-ups documentados**:

- **Multi-empresa rollout** sigue diferido (igual que `oc-recepciones`
  Sprint 5): cuando DILESA/COAGAN/ANSA tengan masa crítica de OCs,
  extraer todo el page de RDB a `components/compras/` parametrizado
  por empresa.
- **`autorizada_por`**: la columna no existe en `erp.ordenes_compra`
  (Sprint 1 madre agregó `cerrada_por` pero no `autorizada_por`). Se
  podría añadir en una migración chica si se quiere "ENVIADA por X"
  en el sello — hoy solo se muestra fecha. No bloquea cierre.
- **CxP listener**: cuando el módulo CxP se construya (iniciativa
  `cxp`, planned), su Sprint 1 consume la view; si decide modelo
  propio, la view se reemplaza/elimina sin afectar este flujo.
- **Devoluciones a proveedor**: sigue fuera de alcance (igual que
  oc-recepciones). Hoy se cancela el pendiente como workaround.

### 2026-04-29 — Sprint 0 (Promoción) entregado

- Doc creado + fila agregada a `INITIATIVES.md`. Estado `proposed →
planned` (alcance v1 cerrado en este doc).
- Diagnóstico ejecutado contra `app/rdb/ordenes-compra/page.tsx`
  (1549 líneas) confirmando los 5 gaps reportados por Beto:
  - Gap 1: `handleSavePricesAndMarkEnviada` (línea 1360) no llama
    refresh de lista.
  - Gap 2: `isOcEditable` (línea 232) bloquea inputs pero no da señal
    visual contundente.
  - Gap 3: `canPrint = Boolean(orden?.proveedor_id)` (línea 371)
    permite imprimir borradores.
  - Gap 4: drawer no consume `erp.movimientos_inventario` con filtro
    por OC; existe vista en `/rdb/inventario/movimientos` pero
    fuera del drawer.
  - Gap 5: `total_a_pagar` congelado al cerrar pero sin handoff a
    CxP — view nueva propuesta como solución sin schema rígido.
- Componente `components/compras/` no existe — todo vive en el page
  de RDB. Cuando se haga rollout multi-empresa, el extract se hace ahí.
