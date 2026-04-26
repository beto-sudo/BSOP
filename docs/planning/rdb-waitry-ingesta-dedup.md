# Iniciativa — Waitry: investigación de ingesta y deduplicación de pedidos y pagos

**Slug:** `rdb-waitry-ingesta-dedup`
**Empresas:** RDB
**Schemas afectados:** rdb (waitry\_\*), erp (cortes_caja, movimientos_caja, movimientos_inventario)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-04-26
**Última actualización:** 2026-04-26

## Problema

Laisha (cajero RDB) reportó dos discrepancias al cuadrar el corte **`Corte-271aff6e`**:

1. **Movimiento duplicado por $60 con folio `#17055382`** — un pedido aparece dos veces en el corte cuando en la operación física fue uno solo.
2. **Sobrante de $180 en tarjeta** — el total cobrado por tarjeta en el sistema supera por $180 lo que el cajero registró/cuadró. No está claro si es error de captura humana en el POS Waitry o un pago duplicado por la cadena de ingesta.

Lo que no sabemos hoy:

- **En qué capa se duplicó**: si en `rdb.waitry_inbound` (webhook entró 2 veces y `payload_hash` no atajó), si en el trigger que materializa `waitry_pedidos` / `waitry_pagos` desde inbound, o si fueron dos pedidos distintos en Waitry mismo (operador del POS abrió la cuenta dos veces).
- **Si es caso aislado o patrón**. El corte `271aff6e` es el primero reportado de manera explícita por el cajero, pero ya tenemos infraestructura de detección parcial viva (`rdb.waitry_duplicate_candidates`, `rdb.v_waitry_pending_duplicates`, `rdb.v_waitry_pedidos_reversa_sospechosa`) — significa que en algún momento se identificó el problema como recurrente, pero no se cerró el flujo de detección + resolución.
- **Si los $180 sobrantes en tarjeta son del mismo mecanismo** (otro pago duplicado escondido) o un fenómeno distinto (cajero capturando manualmente algo que también llegó por Waitry, p. ej.).

Mientras esto no se entienda y se cierre, los cortes RDB siguen requiriendo reconciliación manual del cajero — fricción operativa diaria y riesgo de dinero "perdido" o "fantasma" en reportes.

## Outcome esperado

- **Causa raíz identificada y documentada** para el caso del corte `271aff6e` (los $60 dup y los $180 de tarjeta), con el camino exacto del dato (`waitry_inbound` → trigger → `waitry_pedidos`/`waitry_pagos` → `corte_id`).
- **Decisión clara** sobre dónde aplicar la dedup canónica: en webhook (constraint sobre `payload_hash`), en trigger (early-exit por `order_id` + `content_hash`), o en capa de visualización del corte (filtro de duplicados al armar `cortes_movimientos`). Documentada en ADR.
- **Constraint(s) DB** que prevengan re-ocurrencia del mecanismo encontrado, sin romper el flujo del webhook ni la captura del cajero en producción.
- **Backfill / resolución** de los duplicados históricos que ya estén en `rdb.waitry_duplicate_candidates` y `v_waitry_pending_duplicates`, con criterio definido (cuál `order_id` es el "bueno" cuando hay un par).
- **Cajero deja de cuadrar a ojo**: cualquier discrepancia futura es visible en una vista/UI de RDB con flag de "sospechoso" y opción de resolver, no detectada solo cuando Laisha encuentra que sobran $180.

## Alcance v1 — fase de investigación (read-only)

> Esta v1 es **diagnóstica**, no de fix. Hasta entender el mecanismo no aplicamos cambios estructurales. CC ejecuta el diagnóstico, anota hallazgos, y abre ADR con la decisión. Solo después cerramos alcance de v2 (dedup + UI).

- [ ] **Reproducir el caso `Corte-271aff6e`** desde DB:
  - Localizar el corte (`erp.cortes_caja` por id LIKE '271aff6e%').
  - Listar `cortes_movimientos` y `cortes_vouchers` asociados.
  - Encontrar el movimiento duplicado de $60 y el folio `#17055382` (¿es `order_id` de Waitry, payment_id, o folio interno del POS? Mapearlo).
  - Trazar la cadena: ¿hay 2 filas en `waitry_pedidos` con mismo `content_hash` o mismo total/timestamp/mesa? ¿2 filas en `waitry_pagos` con mismo `payment_id` o mismo amount/order_id? ¿2 filas en `waitry_inbound` con mismo `payload_hash`?
- [ ] **Cuantificar el problema histórico**:
  - Consultar `rdb.v_waitry_pending_duplicates` para ver cuántos candidatos hay sin resolver.
  - Consultar `rdb.v_waitry_pedidos_reversa_sospechosa` para ver cuántos pedidos tienen pagos positivos+negativos sospechosos (cancelaciones no marcadas).
  - Cuantificar el $ impacto histórico (suma de duplicados sospechosos por mes).
- [ ] **Auditar el camino del webhook**:
  - Revisar la edge function `waitry-webhook` (cómo escribe a `waitry_inbound`, si hace dedup por `payload_hash` antes de insertar, manejo de retries).
  - Revisar el trigger que materializa `waitry_pedidos` / `waitry_pagos` / `waitry_productos` desde `waitry_inbound`. Identificar idempotencia.
  - Verificar constraints actuales en `waitry_pedidos.order_id` (¿UNIQUE? ¿solo PK en `id` UUID?), `waitry_pagos.payment_id`, `waitry_inbound.payload_hash`.
- [ ] **Investigar el sobrante de $180 en tarjeta** específicamente:
  - ¿Hay un `waitry_pago` con `payment_method` = tarjeta y `amount` = 180 que no tiene match en `cortes_vouchers`?
  - ¿Hay un pago de tarjeta duplicado en otro `order_id` cercano?
  - Cruzar con OCR de vouchers del corte (la fase de OCR de PR #197/#199 ya guarda esto) para ver si hay un voucher que justifique los $180 o si el sobrante viene del lado Waitry.
- [ ] **Documentar hallazgos en ADR** (`supabase/adr/NNN_rdb_waitry_dedup.md`):
  - Mecanismo del bug.
  - Opciones de fix (webhook / trigger / corte) con tradeoffs.
  - Decisión recomendada para v2.

## Fuera de alcance v1

- **Aplicar el fix estructural**: nuevos constraints, índices únicos, cambios en trigger/webhook, backfill de duplicados históricos. Todo eso vive en v2 o iniciativas siguientes una vez cerrado el ADR.
- **UI de conciliación reversa para Laisha** (la candidata `rdb-waitry-conciliacion-reversa` que tenía pendiente). Si la investigación confirma que es patrón frecuente, la promovemos como iniciativa hermana.
- **Cambios en el POS Waitry** (lado del proveedor) — no controlamos su lógica de captura. Si el bug está allá, lo asumimos como input "sucio" y lo absorbe nuestra capa.
- **Productos / inventario consumido** por los pedidos duplicados (descuento doble de stock) — fuera de alcance de la fase 1; lo manejamos cuando reescribamos el flujo si aplica.

## Riesgos / impacto en producción

> **OBLIGATORIO** — esta iniciativa toca el camino que alimenta `erp.cortes_caja` y `erp.cortes_movimientos`, donde Laisha y otros usuarios capturan cortes en tiempo real.

- [ ] **Investigación es read-only** — la fase v1 NO escribe en producción. Solo `SELECT` sobre tablas y vistas vivas. Sin riesgo directo. CC lo respeta y no aplica migraciones en esta fase.
- [ ] **Si en v2 cambia constraint sobre `waitry_pedidos.order_id` o `waitry_pagos.payment_id`** — riesgo de bloquear inserts del webhook o del trigger si hay datos que ya violan la nueva constraint. Mitigación: backfill / dedup ANTES de aplicar el constraint, en migración separada.
- [ ] **Si en v2 cambia el trigger de materialización** — riesgo de perder pedidos si el cambio rompe la idempotencia. Mitigación: dry-run sobre snapshot de `waitry_inbound` no procesados antes de aplicar.
- [ ] **Backfill de duplicados históricos** (v2) — decidir cuál `order_id` "gana" en un par afecta totales de cortes pasados ya cuadrados. Riesgo: alterar reportes de meses ya cerrados. Mitigación: backfill solo afecta pedidos NO asociados a corte cerrado, o se hace con flag `superseded_by` sin borrar la fila original.
- [ ] **Captura activa de cajero** — Laisha captura cortes en tiempo real. Cualquier deploy de v2 debe coordinarse fuera de horario operativo (≤ 6am o > 11pm Matamoros) y validarse con ella post-deploy.
- [ ] **Edge function `waitry-webhook`** — si v2 toca el webhook, downtime del endpoint = pedidos perdidos durante la ventana. Mitigación: deploys atómicos y rollback rápido (Supabase edge functions soporta versiones).

## Métricas de éxito

- **Fase v1 (investigación):** ADR mergeado con causa raíz documentada, decisión de fix elegida, y conteo $ del impacto histórico. Sin esto no se cierra v1.
- **Fase v2 (cuando cierre alcance):** 0 nuevos duplicados detectados en `v_waitry_pending_duplicates` por las próximas 4 semanas operativas tras el fix.
- **Operativo:** tiempo de cuadre de corte de Laisha ≤ 5 min cuando no hay anomalía real (hoy puede tomar más por revisar manualmente discrepancias). Confirmar baseline antes de medir delta.
- **Cobertura:** todos los duplicados históricos en `waitry_duplicate_candidates` quedan con `resolved = true` y `resolution` documentada, sin perder revenue.

## Sprints / hitos

- **Fase 1 — investigación read-only.** ✅ **Cerrada 2026-04-26.** Salida: [ADR-005](../../supabase/adr/005_rdb_waitry_dedup_root_cause.md) con causa raíz, cifra histórica y 3 opciones de fix.
- **Fase 1.5 — forense del doble-tap antes de reportar a Waitry.** ✅ **Cerrada 2026-04-26.** Salida: [ADR-006](../../supabase/adr/006_rdb_waitry_forense_doble_tap.md) con prueba definitiva (no es defecto del POS), patrones (97% en una tablet, 73% en horas pico), corrección de impacto (~$10–20k reales, no $163k crudos) y replanteo de prioridades.
- **Fase 2.A — Opción C (cleanup mínimo).** ⏳ **En curso (PR abierto):** migración `20260426120000_rdb_waitry_c_cleanup.sql` con typo fix `'order_canceled'`, drop de `rdb.trg_procesar_venta_waitry`, mejora de `match_reason` en detector. Aplicada a DB live antes del PR.
- **Fase 2.B — Fix del hash (compute_content_hash + backfill + re-detección).** ⏸️ Próximo. Toca producción en horario sensible → coordinar fuera de ventana operativa de Laisha (≤6am o >11pm Matamoros).
- **Fase 2.C — UI de resolución (Opción B).** ⏸️ Después del fix del hash, cuando los pares pendientes bajen a magnitud manejable.
- **Fase 3 — Conversación con Waitry (NO urgente).** ⏸️ Solo si después del fix del hash queda un bug operacional consistente.

## Decisiones registradas

- **2026-04-26 (CC) — Causa raíz NO está en pipeline DB.** Verificado read-only: `waitry_inbound.order_id` y `waitry_pedidos.order_id` ya tienen `UNIQUE`; trigger `process_waitry_inbound` usa `INSERT … ON CONFLICT DO UPDATE` (idempotente). Para los 6 `order_id`s sospechosos del corte ancla: 6 filas `waitry_inbound` con `payload_hash` distinto y `attempts=0` → no es replay ni retry. Origen real: doble-tap del operador en POS Waitry (no controlamos su código).
- **2026-04-26 (CC) — Errores en doc planning corregidos al investigar:**
  - El doc decía `erp.cortes_movimientos`; la tabla real es `erp.movimientos_caja` (movimientos manuales del cajero, ej. retiros). El esquema afectado por el dup es `erp.movimientos_inventario` vía `erp.fn_trg_waitry_to_movimientos`.
  - El doc decía "Laisha (cajero RDB) reportó"; el corte fue cerrado por **Juan Pablo Hernández Martínez** según `realizado_por_nombre` de `movimientos_caja`. `cortes_caja.cajero_id` está NULL. Laisha pudo escalar verbalmente.
  - El cajero anotó "$60 dup folio #17055382"; el order `17055382` realmente tiene total $0 + 0 productos. El dup REAL de $60 es `17055503/04`. Confusión visual de UI del corte.
  - El cajero anotó "sobran $180 en tarjeta"; el delta real es **$180 FALTAN en EFECTIVO** (ver tabla en ADR sección 5).
- **2026-04-26 (CC) — Bug latente independiente del dedup.** `rdb.v_cortes_totales` filtra `status <> 'order_cancelled'` (doble L, británico) cuando el status real escrito por el trigger es `'order_canceled'` (una L, americano). Resultado: pedidos cancelados se SIGUEN sumando en ingresos del corte. Afecta TODOS los cortes RDB con cancelaciones, no solo este. Recomendado fix en Opción C del ADR.
- **2026-04-26 (CC) — Código muerto en DB.** `rdb.trg_procesar_venta_waitry()` referencia `rdb.inventario_movimientos` (tabla inexistente, fue reemplazada por `erp.movimientos_inventario`). Ningún trigger la usa. Recomendado drop en migración separada (no urgente).
- **2026-04-26 (CC, Fase 1.5) — Pago registrado ≠ cobro real al cliente.** Aclaración por observación de Beto. El campo `paid` y `waitry_pagos.amount` reflejan lo que el operador del POS marcó, no necesariamente lo que la terminal procesó ni lo que el cliente entregó físicamente. Esto invalidó la métrica de "98.6% de pares con doble cobro real" del ADR-005. Desglose por método de pago: 640 pares ($138k) NO involucran doble cargo al cliente; 285 pares ($82k) son los únicos candidatos.
- **2026-04-26 (CC, Fase 1.5) — `compute_content_hash` tiene falsos positivos sistémicos.** Hashea `product_name + quantity + total_amount + table_name (texto)`. NO incluye `tableId`. En el mostrador todas las ventas comparten `table_name = "Tiendita"`, así que ventas legítimas a clientes distintos colisionan. Tasa de dup en Tiendita: 14% vs ~3% en Pádel (donde cada cancha tiene `table_name` único). Ejemplo extremo: 360 "duplicados" de $200 con solo 4 hashes distintos = 4 productos populares (cubetas, combos) vendidos repetidamente. Impacto real estimado: ~50–100 pares/mes (no 949), ~$10–20k (no $163k).
- **2026-04-26 (CC, Fase 1.5) — Promos con `total_discount = total_amount` son la regla, no la excepción.** Beto observó. Verificado: 99% de pares tienen descuento, 98% promo full. No es discriminante para distinguir dups, pero contribuye a falsos positivos cuando productos populares vendidos a clientes distintos comparten hash.
- **2026-04-26 (CC, Fase 1.5) — No reportar a Waitry como "su POS duplica".** Es falso. Cada par dup tiene IDs internos completamente distintos en Waitry (`orderId`, `orderItemId`, `orderPaymentId`, `orderActionId`, `externalDeliveryId`). Son operaciones legítimamente independientes ejecutadas por el operador. Lo legítimo que se les puede pedir es UX preventiva (warning si se intenta crear orden idéntica en ventana corta). Pero no es urgente — primero arreglar nuestro detector para no llevarles cifras infladas.
- **2026-04-26 (CC, Fase 1.5) — No identificar a Laisha como "responsable" del descuadre.** Sus 199 dups en datos crudos contiene proporción significativa de falsos positivos del mostrador, no error operativo desproporcionado. Cuando la conversación interna ocurra, debe basarse en cifras post-fix del hash.

## Bitácora

- **2026-04-26 (CC)** — Investigación Fase 1 completa. Branch `docs/rdb-waitry-ingesta-dedup-init`, commits `394e1d5` (alta de iniciativa por Cowork) + `ff60842` (chore format). Push a origin. ADR-005 creado con causa raíz, cifra histórica ($163k impacto en abril, 949 pares, 180 cortes afectados) y 3 opciones de fix (A descartada, B recomendada, C como mínimo viable). Próximo hito: Beto revisa ADR y decide alcance v2.
- **2026-04-26 (CC)** — Forense Fase 1.5 completa. Beto pidió validar 100% que el problema es de Waitry antes de reportarles. Branch `docs/rdb-waitry-forense-pos`, PR [#210](https://github.com/beto-sudo/BSOP/pull/210) mergeado. ADR-006 creado con prueba definitiva (IDs internos del POS son distintos, es operacional), patrones (97% Tiendita, 73% horas pico, Laisha 199 dups en datos crudos), y dos correcciones materiales tras observaciones de Beto: (1) "pago registrado ≠ cobro real" — ningún cliente paga 2 veces sin reclamar, mucho del impacto inicial era inflado; (2) `compute_content_hash` con `table_name` texto causa falsos positivos sistémicos en mostrador. Recálculo honesto del impacto: ~$10–20k de descuadre operativo, no $163k.
- **2026-04-26 (CC)** — Fase 2.A (Opción C) en curso. Branch `feat/rdb-waitry-c-cleanup`. Migración `20260426120000_rdb_waitry_c_cleanup.sql` con 3 cambios: typo fix `'order_canceled'` en `v_cortes_totales`, drop de `rdb.trg_procesar_venta_waitry()`, mejora del `match_reason` en `rdb.check_duplicates` para incluir `seconds_apart` y `payment_methods`. Aplicada vía `mcp__supabase__apply_migration` antes del PR. Verificado: view filtra correctamente por `'order_canceled'`, función dropeada, match_reason ejemplo: `"same products + amount + table (3s apart, methods=credit_card_visa+credit_card_visa)"`. SCHEMA_REF.md regenerado (solo cambia timestamp). Próximo hito: Fase 2.B — fix del `compute_content_hash` (incluir `tableId`, ventana 60–90s, considerar `orderUserId`) + backfill + re-detección. Coordinar fuera de horario operativo.
