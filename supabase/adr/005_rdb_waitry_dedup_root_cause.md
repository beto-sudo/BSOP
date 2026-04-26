# ADR-005 — Waitry: causa raíz de duplicados de pedidos y plan de fix

**Status:** Proposed (Fase 1 cerrada, pendiente aprobación de Beto para Fase 2)
**Fecha:** 2026-04-26
**Iniciativa:** [`rdb-waitry-ingesta-dedup`](../../docs/planning/rdb-waitry-ingesta-dedup.md)
**Caso ancla:** Corte `271aff6e-2583-449f-b7c6-5fb731a5e49b` (RDB, Caja Pablo, fecha operativa 2026-04-25)

## Contexto

El cajero del corte (Juan Pablo Hernández, no Laisha como originalmente se reportó — Laisha probablemente lo escaló verbalmente) cerró el corte con observación literal:

> _"En tarjeta me sobran 180 y hay un movimiento duplicado por 60 pesos con el folio #17055382"_

Investigamos read-only la cadena `rdb.waitry_inbound` → trigger materializador → `rdb.waitry_pedidos` / `waitry_pagos` → `erp.cortes_caja` para entender el mecanismo del duplicado y cuantificar el problema histórico.

## Hallazgos

### 1. La causa raíz NO está en el pipeline DB

Las protecciones existentes funcionan correctamente:

- `rdb.waitry_inbound.order_id` tiene constraint `UNIQUE`.
- `rdb.waitry_pedidos.order_id` tiene constraint `UNIQUE`.
- `rdb.waitry_pagos` tiene `UNIQUE (order_id, payment_id) WHERE payment_id IS NOT NULL`.
- `rdb.waitry_productos` tiene `UNIQUE (order_id, product_id, product_name)`.
- El trigger `rdb.process_waitry_inbound()` usa `INSERT … ON CONFLICT (order_id) DO UPDATE` — es idempotente: replays del webhook con el mismo `order_id` actualizan, no duplican.

Verificación directa sobre el corte `271aff6e`: las 6 filas en `waitry_inbound` para los `order_id`s sospechosos (`17055334`, `17055335`, `17055369`, `17055382`, `17055503`, `17055504`) tienen **`payload_hash` distinto** y **`attempts = 0`** (procesadas en primer intento). No hay replay, no hay retry, no hay race condition del trigger.

### 2. La causa raíz está en operación humana del POS Waitry

Para los 2 pares de duplicados confirmados en este corte, los productos son idénticos:

| Par                     | Mesa     | Productos                       | Total | seconds_apart |
| ----------------------- | -------- | ------------------------------- | ----- | ------------- |
| `17055334` ↔ `17055335` | Tiendita | 2× Renta Cancha Padel @ $200    | $400  | 22 s          |
| `17055503` ↔ `17055504` | Tiendita | 1× Agua Mineral Topochico @ $60 | $60   | 3 s           |

Cada par son **2 órdenes legítimamente distintas creadas en el POS Waitry** (con `order_id` distinto, asignado por Waitry), idénticas en contenido y cercanas en tiempo. El mecanismo más probable es **doble-tap del operador** al cobrar — la app de Waitry registra dos órdenes en lugar de una. No controlamos el código del POS Waitry; el bug está allá.

### 3. Detector de duplicados (existente) funciona, pero tiene edge cases

El trigger `waitry_pedidos_after_insert_check_duplicates` ejecuta `rdb.check_duplicates(order_id)`, que escribe pares candidatos a `rdb.waitry_duplicate_candidates`. Lógica:

```
JOIN waitry_pedidos a contra waitry_pedidos b
  ON a.content_hash = b.content_hash
  AND b.timestamp BETWEEN a.timestamp - INTERVAL '3 minutes'
                       AND a.timestamp + INTERVAL '3 minutes'
```

Detectó correctamente los 2 pares. **No detectó** el par `17055369` ↔ `17055382` (Pádel 5, total $0, **6.4 minutos** apart) porque cae fuera de la ventana de 3 min. Como ambos son $0, el impacto monetario es nulo, pero el patrón existe.

Trade-off: ampliar la ventana (a 10 min, p. ej.) reduciría false negatives pero aumentaría false positives — venta repetida del mismo producto al mismo cliente cercana en tiempo (típico en una mesa de barra, ej. 2 cervezas al mismo cliente con 5 min de diferencia) sería marcada como dup incorrectamente. La ventana de 3 min es razonable como compromiso para el caso típico.

### 4. Confusión de folio aclarada

El cajero anotó `#17055382` como el folio del dup de $60. En realidad:

- `17055382` es un order_id real, mesa Pádel 5, **total $0, 0 productos en `waitry_productos`** (orden vacía / cancelada en POS antes de cobrar).
- El dup REAL de $60 es `17055503` ↔ `17055504` (Tiendita, Topochico).

Hipótesis: el cajero vio `17055382` destacado en pantalla por proximidad temporal (orden con $0 y `paid=true` puede aparecer como anomalía visual) y lo asoció al dup de $60 que sí estaba viendo en la suma. Es un detalle de UX del corte, no del dato.

### 5. La cifra del cajero "sobran $180 en tarjeta" es en realidad "faltan $180 en EFECTIVO"

La vista `rdb.v_cortes_totales` calcula para este corte:

| Campo                 | Valor      |
| --------------------- | ---------- |
| efectivo_inicial      | $3,025     |
| ingresos_efectivo     | $3,933     |
| ingresos_tarjeta      | $3,580     |
| ingresos_stripe       | $600       |
| retiros (movimientos) | $3,500     |
| **efectivo_esperado** | **$3,458** |
| efectivo_contado      | $3,278     |

**Delta efectivo: $3,278 − $3,458 = −$180.** No es un sobrante en tarjeta; es un faltante en efectivo. Se explica casi exactamente por el dup `17055334` ↔ `17055335`, donde `17055335` es **`payment_method = cash`** $400 dup. Si esa fila no debería existir, ingresos_efectivo real serían $3,533 → efectivo_esperado real $3,058 → vs contado $3,278 = +$220 (sobrante razonable, dentro de margen normal de manejo de efectivo).

Esto es una **falla de UX del corte**: la observación libre del cajero es imprecisa porque la vista no separa visualmente "discrepancia explicada por dup" vs "discrepancia genuina". El cajero ve un descuadre y lo atribuye a la fuente más visible (el voucher de tarjeta) cuando el dato dice otra cosa.

### 6. Bug latente independiente: typo en filtro de cancelados

`rdb.v_cortes_totales` filtra pagos con `WHERE ped.status <> 'order_cancelled'` (doble `L`, inglés británico), pero el status real que escribe el trigger es **`'order_canceled'`** (una `L`, inglés americano). Verificación en `pg_stat`: en `waitry_duplicate_candidates` hay 1 par cuyo orden B tiene `status = 'order_canceled'` y aparece sumado en los totales del corte. Bug que afecta TODOS los cortes RDB con pedidos cancelados — los cancelaciones se siguen contando en ingresos.

`rdb.v_cortes_productos` no tiene este typo (usa `'order_canceled'` correctamente). El bug es exclusivo de `v_cortes_totales`.

### 7. Cifra histórica del problema

| Métrica                                                    | Valor        |
| ---------------------------------------------------------- | ------------ |
| Pares dup detectados (vista) en abril 2026                 | 949          |
| Pares resueltos                                            | 0            |
| Órdenes B únicas (descontables si descartamos uno por par) | 717          |
| Cortes distintos con al menos 1 dup pendiente              | 180          |
| Impacto $ — pedidos B `status = order_ended` (paid)        | **$163,078** |
| Impacto por método: tarjeta dup                            | $91,470      |
| Impacto por método: efectivo dup                           | $67,561      |
| Impacto por método: STRIPE dup                             | $1,035       |
| Impacto por método: other dup                              | $3,040       |
| Pedidos dup ya cancelados por operador del POS             | 1 ($30)      |

Importante: los $163k son **el monto que el sistema reporta de más en `v_cortes_totales`** si cada par dup es realmente una sola venta humana. Para confirmar el "real" hay que pasar caso por caso; sin el OCR de los vouchers procesado (ver finding 8), no se puede automatizar.

### 8. Vouchers de cierre de terminal sin procesar

Los 2 vouchers JPEG del corte (`WhatsApp Image 2026-04-25 at 11.15 PM.jpeg` y `11.20 PM.jpeg`) están en `erp.cortes_vouchers` con `monto_reportado = NULL`, `ocr_monto_sugerido = NULL`, `banco_id = NULL`. El feature OCR (PR #197/#199) no corrió o falló silenciosamente para estos archivos. No bloquea el dedup pero impide reconciliación automática voucher-vs-suma-tarjeta.

### 9. Código muerto encontrado

`rdb.trg_procesar_venta_waitry()` referencia tabla `rdb.inventario_movimientos` (que no existe — fue reemplazada por `erp.movimientos_inventario` y la función `erp.fn_trg_waitry_to_movimientos`). La función está en el schema pero ningún trigger la usa. Recomendación: drop en migración separada (no urgente).

## Decisión recomendada (Fase 2 — pendiente aprobación)

Basado en los hallazgos, el problema es **predominantemente de detección+UX, no de constraint DB**. Las opciones de fix evaluadas:

### Opción A — Constraint estricta a nivel webhook/trigger ❌ NO recomendada

Agregar `UNIQUE (content_hash, table_name, time_bucket)` en `waitry_pedidos`. Bloquea el INSERT del segundo pedido dup.

- **Contra fuerte**: descarta órdenes legítimas cuando un cliente recompra el mismo producto en la misma mesa (ej. 2 cervezas idénticas con 1 min de diferencia). Genera falsos positivos que se traducen en ventas perdidas. **Riesgo operativo alto.**
- **Contra**: requiere lógica de "qué hacer con la segunda" (rechazo silencioso pierde dato real, error duro rompe webhook).

### Opción B — Mejorar detección + UI de resolución manual ✅ RECOMENDADA

Mantener el detector actual (escribe a `waitry_duplicate_candidates`), agregar:

1. **UI en RDB Cortes**: chip visible en cada corte con `n_dups_pendientes`. Click → modal con los pares. Cajero/admin marca "es dup → mantener A" o "no es dup → ambos válidos". Esto resuelve `waitry_duplicate_candidates.resolved` y opcionalmente actualiza `waitry_pedidos.status` del descartado a `'order_canceled'` (que dispara `fn_trg_waitry_pedidos_cancel` y limpia inventario).
2. **Vista `v_cortes_totales` ajustada**: corregir typo (`'order_cancelled'` → `'order_canceled'`) y agregar columna `pedidos_dup_pendientes_n` para que la UI pueda mostrar el chip sin query extra.
3. **Backfill controlado**: 180 cortes históricos con dups pendientes — cron o action que sugiera una resolución default (descartar el order B con timestamp mayor) pero requiera approval humana corte por corte. NO hacer backfill ciego.

- **Pro**: NO descarta dato; preserva ambas filas para auditoría hasta que un humano decida.
- **Pro**: cierra el flujo Laisha-style ("cuadro a ojo") porque el descuadre del corte se etiqueta con su causa probable.
- **Pro**: respeta el principio "trust internal code, validate at boundaries" — el boundary es el POS Waitry, no nuestro DB.
- **Contra**: requiere desarrollo de UI (no es solo migración).

### Opción C — Solo corregir el typo de status + mejorar match_reason ⚠️ Mínimo viable

Si Beto quiere algo rápido sin Fase 2 completa:

1. Migración para corregir `v_cortes_totales` typo (`order_cancelled` → `order_canceled`). Una línea.
2. Mejorar el `match_reason` del detector para incluir el `seconds_apart` y los `payment_methods` involucrados, así Laisha tiene más contexto cuando consulte la vista.

No resuelve el problema de fondo pero corta el bug latente y mejora la observabilidad sin desarrollo grande.

## Recomendación

Combinar **Opción C inmediatamente** (1-2 PRs chicos: corrección de typo + drop de código muerto) + **planear Opción B como Fase 2 con alcance separado** (dedicado a la UI de resolución de duplicados, posiblemente la iniciativa hermana `rdb-waitry-conciliacion-reversa` que mencionaba el doc planning original).

**Opción A queda descartada** por riesgo de generar falsos positivos en operación normal.

## Consecuencias

- **Sin acción**: $163k históricos seguirán inflando reportes; cajeros seguirán cuadrando a ojo y atribuyendo descuadres a la fuente equivocada (como pasó aquí con "$180 tarjeta" cuando era "$180 efectivo").
- **Con Opción C** (mínima): se corrige el typo (impacto chico pero real en cortes con cancelaciones) y se elimina código muerto. Sigue requiriendo Fase 2 para resolver el problema real.
- **Con Opción B** (completa): cierra el ciclo de detección. Permite reportar a Waitry (proveedor) la frecuencia del bug operacional con datos duros para que ellos arreglen el doble-tap en el POS.

## Preguntas abiertas para Beto

1. ¿OK con avanzar Opción C en un PR chico de 1-2 commits (typo + drop código muerto + mejora match_reason)?
2. ¿La Fase 2 (UI de resolución) se promueve como iniciativa nueva (`rdb-waitry-conciliacion-reversa`) o queda como Fase 2 de esta misma iniciativa?
3. ¿Querés que se haga ya el análisis caso-por-caso de los 180 cortes históricos afectados, o se ataja solo de aquí en adelante?
4. Para el reporte al proveedor Waitry: ¿hay alguien del lado RDB que esté en contacto con ellos, o esto se queda como hallazgo interno hasta nuevo aviso?
