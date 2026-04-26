# ADR-006 — Waitry: forense del doble-tap, antes de reportar al proveedor

**Status:** Proposed (Fase 1.5 cerrada, complementa [ADR-005](005_rdb_waitry_dedup_root_cause.md))
**Fecha:** 2026-04-26
**Iniciativa:** [`rdb-waitry-ingesta-dedup`](../../docs/planning/rdb-waitry-ingesta-dedup.md)

## Contexto

ADR-005 concluyó que la causa raíz del dup NO está en el pipeline DB, y propuso reportar el doble-tap al proveedor Waitry. Beto pidió: **antes de reportar, asegurar 100% que el problema está en su cancha y no en la nuestra**, identificar el patrón humano (qué operador, qué horas), y definir cómo elegir "el bueno" en cada par. Esta forense es el insumo para esa conversación.

## Prueba definitiva: el doble-tap es operacional, no defecto del POS

Se compararon los payloads JSON crudos de los dos miembros de un par dup confirmado (`17055334` ↔ `17055335`, par del corte ancla de ADR-005). Resultado: **todos los identificadores internos de Waitry son distintos entre los dos**, lo que prueba que Waitry los procesó como dos operaciones legítimas e independientes:

| Campo del payload Waitry        | 17055334           | 17055335           |
| ------------------------------- | ------------------ | ------------------ |
| `orderId`                       | 17055334           | 17055335           |
| `orderItems[0].orderItemId`     | 45190209           | 45190214           |
| `orderItems[0].sequence`        | 1777166675718335   | 1777166698263015   |
| `orderItems[0].timestamp`       | 22:24:40           | 22:25:03 (+23 s)   |
| `payments[0].orderPaymentId`    | 5445435            | 5445436            |
| `payments[0].paymentType.name`  | credit_card_visa   | cash               |
| `payments[0].createdAt`         | 22:24:42           | 22:25:04 (+22 s)   |
| `orderActions[*].orderActionId` | 78584490–92, 513   | 78584501–03, 512   |
| `externalDeliveryId`            | "P-0AEF83"         | "P-D88D04"         |
| `orderActions[*].user.username` | pablo.hm@dilesa.mx | pablo.hm@dilesa.mx |

Cada par dup en el sistema replica este patrón: **dos órdenes con identidad propia en Waitry, no una orden enviada dos veces**. Confirmado adicionalmente para `17055503` (latest detected dup): mismo operador `pablo.hm@dilesa.mx`, dos cobros consecutivos de credit_card_visa $60 con ~3 segundos de diferencia, cada uno con su propia secuencia y `externalDeliveryId` único.

**Implicación para la conversación con Waitry**: NO podemos reclamarles "el POS está duplicando órdenes". Eso es falso. **Importante**: la magnitud real del doble-tap operacional es mucho menor de lo que el detector reporta — ver sección "El detector está sobre-estimando" más abajo, donde se concluye que las cifras crudas inflan ~5–10× el problema real. Cualquier conversación con Waitry debe esperar a que arreglemos primero nuestro detector para llevarles datos honestos.

## Patrón temporal — picos en horas de cierre, no aleatorio

Distribución de los 717 órdenes-B duplicadas por hora local (`America/Matamoros`):

```
hora | dups
-----+--------------------
  0  |   7
  8  |  14
  9  |  24
 10  |   7
 11  |   6
 12  |   3
 13  |   4
 15  |   1
 17  |  18
 18  |  44
 19  | 141  ████████████
 20  |  90  ████████
 21  | 158  ██████████████
 22  | 136  ████████████
 23  |  64  ██████
```

**73% (525 / 717) ocurren entre 19:00 y 23:00**. Coincide con la operación de mayor volumen del restaurante/bar (cena + posterior). El doble-tap correlaciona con presión operativa, no es bug aleatorio. Confirma que la solución debe ser preventiva en el POS (warning antes de crear) o defensiva en nuestra UI (resolución asistida después).

## Patrón espacial — concentración casi total en una sola tablet

| Mesa / lugar           | Pedidos dup | %     |
| ---------------------- | ----------: | ----- |
| Tiendita (`MOSTRADOR`) |       1,194 | 97.0% |
| Pádel 1                |          12 | 1.0%  |
| Pádel 3                |          10 | 0.8%  |
| Pádel 5                |           4 | 0.3%  |
| Pádel 4                |           4 | 0.3%  |
| Pádel 2                |           4 | 0.3%  |
| Pádel 9                |           2 | 0.2%  |

**El 97% del "problema" vive en la tablet de mostrador "Tiendita"** (layout `MOSTRADOR`, `tableId 94034`). **Importante** (ver sección "El detector está sobre-estimando" abajo): esta concentración refleja en gran parte un sesgo del detector — todas las ventas de mostrador comparten `table_name = "Tiendita"` y el `content_hash` no incluye `tableId`, así que ventas legítimas a clientes distintos en mostrador colisionan en el hash. La concentración real del doble-tap operacional en Tiendita probablemente es menor que la cifra cruda sugiere.

## Patrón humano — quién está haciendo doble-tap

Distribución del operador POS en pedidos B duplicados (1,247 pedidos B / pedidos en pares dup):

| Operador POS                        | Pedidos | %     |
| ----------------------------------- | ------: | ----- |
| `<NULL>` (path JSON vacío)          |     928 | 75.4% |
| **Laisha Michel Martinez Martinez** |     199 | 16.2% |
| **Juan Pablo Hernández Martínez**   |      48 | 3.9%  |
| Victor Torres                       |      22 | 1.8%  |
| Rincon Del Bosque (cuenta admin)    |      16 | 1.3%  |
| Otros (≤4 cada uno)                 |      14 | 1.1%  |

**Caveat importante sobre el 75% NULL**: 932 de 1,230 inbound rows tienen `orderActions[]` y `orderUsers[]` vacíos en el payload. Hipótesis: son órdenes generadas desde la app/QR del cliente final (sin operador POS humano detrás) o eventos intermedios donde Waitry no manda metadata de usuario. **Antes de afirmar "Laisha es la principal" en absoluto, hay que validar este NULL** — el ratio Laisha:Juan Pablo dentro del 25% identificado es 4:1, pero proyectado al total podría cambiar.

**Análisis por par (no por pedido)** — quién crea cada lado del par:

| Clasificación del par                         | Pares | %     |
| --------------------------------------------- | ----: | ----- |
| Al menos uno con operador NULL en JSON        |   749 | 78.9% |
| **Mismo operador en ambos lados (doble-tap)** |   139 | 14.6% |
| Operadores distintos en cada lado             |    61 | 6.4%  |

Los 139 pares con mismo operador son **doble-tap inequívoco**. Los 61 pares con operadores distintos son más interesantes: probables cambios de turno donde el siguiente cajero rehace la orden sin saber que ya estaba hecha — caso para resolución manual con contexto.

## Distinción crítica — "pago registrado en sistema" no es lo mismo que "cobro real al cliente"

**Esta sección corrige una afirmación temprana de la forense que sobreestimaba la severidad.**

El campo `paid` en `rdb.waitry_pedidos` y los rows de `rdb.waitry_pagos` con `amount > 0` provienen del payload JSON de Waitry — específicamente de `(p ->> 'paid')::boolean` y `payments[].amount`. **Reflejan lo que el operador del POS marcó como cobrado**, no necesariamente lo que la terminal de tarjeta procesó ni lo que el cliente físicamente entregó.

Evidencia interna que ya lo confirmaba: la vista `rdb.v_waitry_pedidos_reversa_sospechosa` existe precisamente para detectar casos donde un mismo `order_id` tiene `payments[].amount` positivo y negativo compensándose (cancelación no marcada, reverso, refund). Su existencia es admisión tácita de que `paid=true` no implica cobro firme.

Para los pares dup detectados, sin embargo: solo **6 pares (0.6%)** tienen alguna reversa interna, y **0 pedidos dup** caen en `v_waitry_pedidos_reversa_sospechosa` (esa vista solo dispara cuando + y − conviven en el MISMO `order_id`; los dups son `order_id`s distintos por construcción).

## Severidad real — desglose por combinación de método de pago

De los 949 pares pendientes:

| Combinación de métodos en el par    | Pares | $ mínimo en par | ¿Doble cargo al cliente?                                                                                                                              |
| ----------------------------------- | ----: | --------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Algún miembro sin pago registrado   |    13 |              $0 | No aplica                                                                                                                                             |
| **cash + cash**                     |   244 |         $47,032 | **NO** — cliente pagó cash 1 vez, segundo registro es fantasma. Faltante en cash al cierre.                                                           |
| **cash + tarjeta**                  |   395 |         $91,518 | **NO** — cliente pagó por 1 método. El otro es fantasma. Descuadre cash o tarjeta al cierre.                                                          |
| cash + STRIPE                       |     1 |            $100 | NO                                                                                                                                                    |
| **tarjeta + tarjeta** (credit_card) |   275 |         $81,800 | **POSIBLE** — requiere reconciliar contra cierre de lote del banco. Subset incluye también falsos positivos: 2 clientes distintos comprando lo mismo. |
| STRIPE + STRIPE                     |    10 |          $1,035 | POSIBLE — reconciliar contra Stripe dashboard                                                                                                         |
| Otro / mixto                        |    11 |          $4,940 | Mixto                                                                                                                                                 |

### Recálculo del impacto financiero (preliminar — ver siguiente sección sobre falsos positivos)

- **640 pares ($138,650) garantizado NO involucran doble cargo al cliente.** Son descuadres operativos puros: el operador marcó cobrado en una orden que ya estaba pagada en otra, el cliente solo entregó dinero una vez. El cajero al cierre nota el delta y atribuye la causa a la fuente equivocada (como vimos en el ADR-005 con "$180 sobran tarjeta" siendo en realidad "$180 faltan efectivo").
- **285 pares ($82,835) son candidatos a doble cargo real al cliente.** De estos, una porción son falsos positivos del detector (siguiente sección).

## El detector está sobre-estimando — falsos positivos sistémicos en mostrador

Las cifras anteriores asumen que cada par detectado es un dup real. Después del desglose por método encontramos que la mayoría no son doble cobro al cliente. Pero hay **un problema más profundo**: muchos de los pares detectados ni siquiera son operacionalmente duplicados — son ventas legítimas distintas que el detector no sabe distinguir.

### Causa: el `content_hash` es insuficiente

`rdb.compute_content_hash(products, total_amount, table_name)` hashea SHA-256 sobre:

```
product_name + quantity (por ítem, ordenados)
+ total_amount
+ table_name  ← texto, no ID
```

**Lo que NO incluye**: `tableId` (mesa física), `orderUserId` (cliente identificado), `discountPrice` (descuentos por ítem), modifiers, secuencia interna del POS, ni nada que distinga clientes distintos.

**Implicación crítica**: en el mostrador todas las ventas comparten `table_name = "Tiendita"` (es nombre del MOSTRADOR, no de mesa por cliente). Dos clientes distintos comprando lo mismo en la fila del mostrador dentro de 3 minutos generan **content_hash idéntico**. El detector marca dup donde no lo hay.

### Evidencia — distribución de dups por mesa

Del total de pedidos en abril 2026 con su tasa de pares dup detectados:

| Mesa               | Pedidos abr | Marcados dup | % dup   |
| ------------------ | ----------: | -----------: | ------- |
| **Tiendita**       |   **1,730** |      **242** | **14%** |
| Pádel 5            |          20 |            2 | 10.0%   |
| Pádel 1            |          58 |            2 | 3.4%    |
| Pádel 3            |          60 |            2 | 3.3%    |
| Pádel 2/4/6/7/8/10 |      varios |            0 | 0%      |

En las tablets de Pádel (donde el operador distingue mesa por reservación: `Pádel 1`, `Pádel 2`, etc., cada una con su propio `table_name` único por cancha y reserva) la tasa de dup es 3–4%, consistente con doble-tap operacional real. **En Tiendita es 14% — 4× más alta**, casi seguro porque el hash colisiona entre clientes distintos.

Si la tasa "real" en Tiendita fuera comparable (3–4%), el conteo real de doble-tap en Tiendita sería ~60–70 pedidos al mes, no 242. Los otros ~170 son falsos positivos.

### Evidencia — concentración en pocos hashes

Solo dentro de Tiendita, agrupando los 949 pares por (`total_amount`, `content_hash`):

| `total_amount` | Pares en par_a | Hashes distintos |
| -------------- | -------------: | ---------------: |
| $200           |        **360** |            **4** |
| $300           |            184 |                2 |
| $250           |             84 |                2 |
| $800           |             16 |                1 |
| $1,000         |              4 |                1 |
| $425           |              7 |                1 |

**360 "duplicados" de $200 con solo 4 productos distintos** no son 360 doble-taps. Son 4 productos populares (probablemente cubetas, combos o paquetes promocionales — Beto confirmó que las "cubetas de botellas" se facturan con `total_discount = total_amount` y precio individual descontado a 0) vendidos repetidamente a clientes distintos a lo largo del mes, donde cualquier 2 ventas en ventana de 3 minutos comparten hash.

### Recálculo realista del impacto

Combinando los dos sesgos detectados (pago registrado ≠ cobro real + falsos positivos por hash):

| Estimación                                                                           | Pares       | $            |
| ------------------------------------------------------------------------------------ | ----------- | ------------ |
| Cifra cruda del detector (ADR-005, antes de refinar)                                 | 949         | $163,078     |
| Pares con potencial doble cargo (después del análisis método de pago)                | 285         | $82,835      |
| **Estimación honesta de pares operacionalmente reales (extrapolando tasa de Pádel)** | **~50–100** | **~$10–20k** |
| Doble cargo confirmado al cliente (sin datos de reconciliación bancaria)             | desconocido | desconocido  |

**El problema operacional es 5–10× más chico de lo que el detector reporta.** Sigue existiendo doble-tap real, pero la magnitud no justifica una conversación urgente con Waitry sobre "su POS está duplicando $163k al mes". Sí justifica un fix del detector y una UI mejor de cuadre para Laisha.

### Cómo distinguir caso por caso (para Fase 2)

Para los 285 pares "tarjeta+tarjeta" o "stripe+stripe", el flujo de resolución manual debería:

1. **Cruzar contra `cortes_vouchers` con OCR procesado**. Si el voucher de la terminal del corte muestra un cierre de lote por monto X y la suma de tarjeta del sistema dice X+ delta, esos pares son fantasmas. Si los montos calzan, hubo doble cargo real.
2. **Cuando OCR no esté disponible**, asumir conservadoramente como "fantasma" si el cajero no registró reclamo del cliente. Si hay reclamo, escalar a reconciliación bancaria.
3. **Para STRIPE**, cruzar contra Stripe dashboard (cobro real al PAN del cliente). Más fácil que tarjeta porque tenemos visibilidad directa.

Esto significa que la Opción B (UI de resolución) debe **integrar el voucher OCR** en el flujo, no ser solo "marcar resuelto".

## Cómo elegir "el bueno" — criterios para la UI de resolución (Fase 2)

Para que la UI de Opción B (resolución manual de duplicados) sugiera automáticamente cuál orden mantener y cuál descartar, propongo estos criterios en orden de prioridad:

1. **Si solo uno tiene `productos > 0`**: el que tiene productos gana. (3 pares, edge case)
2. **Si solo uno tiene `pagos.amount > 0`**: el que tiene pago gana. (3 pares)
3. **Si ambos tienen pago pero `payment_method` distinto**: indeterminado por software, requiere humano (ej. par 17055334/35: tarjeta vs cash). El cajero debe consultar voucher o memoria.
4. **Si ambos tienen pago e idéntico `payment_method`** (ej. par 17055503/04: ambos tarjeta $60): en general el primero (`timestamp` menor) es el "bueno" — el segundo es el doble-tap. **Verificable** porque el primero suele tener `last_action_at` con todos los `orderActionType` completos (`user_checked_in` → `user_placed_order` → `user_paid` → `order_ended`), y el segundo a veces tiene secuencia incompleta o duplicada.
5. **Status `order_canceled` en uno de los dos**: el cancelado se descarta automáticamente.

UI debería mostrar: ambos pedidos lado a lado con sus diferencias resaltadas, sugerir el "bueno" según los criterios arriba, y permitir override manual con campo de razón obligatorio (audit trail).

## Recomendaciones — replanteadas con la nueva información

La prioridad cambia significativamente respecto a la versión inicial de este ADR. Antes de hablar con Waitry, debemos **arreglar el detector** porque sin datos confiables no podemos llevar una conversación honesta con ellos.

### Prioridad 1 — arreglar `compute_content_hash` (nueva, antes era prioridad 2)

El hash actual es insuficiente para mostrador (`Tiendita`). Cambios propuestos para reducir falsos positivos:

- **Incluir `tableId` (entero único por mesa física en Waitry)** en vez de `table_name` (texto). Resuelve el caso "todo Tiendita comparte nombre".
- **Considerar incluir `orderUserId`** (cliente identificado) cuando esté presente. Cuando no está, no agrava — el caso degenerado sigue siendo igual de ruidoso.
- **Reducir la ventana de 3 minutos a 60–90 segundos** para que doble-tap real (típicamente segundos) siga capturado pero ventas legítimas separadas no caigan.

Esto requiere:

1. Migración para nueva versión de `compute_content_hash` y `check_duplicates`.
2. Backfill: recalcular `content_hash` de pedidos abril–mayo (~5,000 filas) y limpiar `waitry_duplicate_candidates` no resueltos (porque fueron generados con el algoritmo viejo).
3. Re-detectar contra los nuevos hashes.

Tras esto, **la cifra real de duplicados será visible**. Si confirma 50–100 pares/mes (no 949), el siguiente paso es muy distinto.

### Prioridad 2 — Opción C original sigue válida

- Fix typo `'order_cancelled'` → `'order_canceled'` en `v_cortes_totales`.
- Drop `rdb.trg_procesar_venta_waitry()` (función huérfana).
- Mejorar `match_reason` del detector para incluir `seconds_apart` y `payment_methods` cuando existan.

Independiente del fix del hash. Mergeable en cualquier orden.

### Prioridad 3 — Conversación con Waitry (NO urgente)

Si el detector arreglado revela que el doble-tap real es ~50–100 pares/mes (~$10–20k de descuadre operativo, no doble cobro), **no es urgente reportarlo**. Podemos:

- Pedir a Waitry confirmar el comportamiento del campo `paid` (¿la terminal procesó realmente o solo el operador marcó?).
- Pedir confirmar quién genera los pedidos sin `orderActions[].user` (el 75% NULL — son web/QR del cliente final?).
- Si el dato confirma que el doble-tap es operacional y no marginal, entonces sí pedir UX preventiva.

**No corresponde la conversación "su POS duplica $163k al mes"**. Esa cifra incluye sesgo del detector y de la métrica de pago.

### Prioridad 4 — Opción B (UI de resolución) replanteada

Con un detector honesto, los pares pendientes a resolver bajan de 949 a ~50–100. La UI ya no necesita ser un sistema masivo de triage — alcanza con:

- Un chip en cada corte con `n_dups_pendientes` (sigue válido).
- Modal con los 1–2 pares del corte (no decenas).
- Cruce con OCR del voucher para sugerir el "bueno".
- Acción "marcar resuelto" + opcional `status='order_canceled'` del descartado.

El backfill de los 180 cortes históricos también se vuelve manejable.

### Para Laisha en lo inmediato

Independiente de todo el código: la causa real de su descuadre del corte ancla `271aff6e` está identificada (faltante de $180 en cash, no sobrante en tarjeta — explicado por dup `17055334/35` que registró $400 cash fantasma). Vale la pena explicarle esto verbalmente para que sepa que no fue su error y para validar la hipótesis con su memoria del turno (¿recuerda haber cobrado dos veces la cancha de pádel? ¿el cliente fue uno solo o dos?).

### Orden de ejecución recomendado

1. **Mergear PR #209** ✅ (ya hecho)
2. **Mergear este PR ADR-006** una vez Beto valide la corrección.
3. **PR de prioridad 1** (fix del hash + backfill + re-detección). Toca producción → coordinar fuera de horario operativo (≤6am o >11pm Matamoros) y validar con Laisha post-deploy.
4. **PR de prioridad 2** (Opción C original) en paralelo o después.
5. **Planning de prioridad 4** (UI de resolución).
6. **Solo entonces** decidir si vale la pena escalar a Waitry.

## Decisiones registradas (de esta forense)

- **No reportar a Waitry como "su POS está duplicando".** Es falso. Y la cifra honesta es mucho menor de lo que pensábamos.
- **El detector actual está sobre-estimando masivamente** por el hash insuficiente (`table_name` en lugar de `tableId`). Antes de tomar cualquier decisión basada en el conteo de duplicados, hay que arreglar el hash.
- **No identificar a Laisha como "la responsable"** en la conversación con el negocio. Su 199 dups/mes contiene proporción significativa de falsos positivos del mostrador, no error operativo desproporcionado. Cuando la conversación interna ocurra, debe basarse en cifras post-fix del hash, no en las actuales.
- **Pago registrado en `waitry_pagos` ≠ cobro real al cliente**. Esto es ya conocido por la existencia de `v_waitry_pedidos_reversa_sospechosa`, pero el ADR-005 inicial lo había olvidado.
- **Criterio default del "bueno" en la UI**: el de `timestamp` menor cuando `payment_method` y monto coinciden; humano decide cuando difiere o cuando el caso es edge. Cruzar con voucher OCR cuando esté disponible.

## Preguntas abiertas

1. **Sobre el 75% NULL en operador**: necesitamos validar con Waitry si los pedidos sin `orderActions[].user` son web/QR del cliente final, o si es un bug del propio payload.
2. **Backfill de cortes históricos**: tras arreglar el hash, los pares "verdaderos" probablemente bajan de 949 a ~50–100/mes. El backfill se vuelve manejable.
3. **Definición de la nueva versión de `compute_content_hash`**: ¿agregar `tableId`? ¿incluir también `orderUserId` o eso sub-detecta cuando varios clientes compran lo mismo en mostrador? Decisión a tomar antes de migración (en planning de prioridad 1).
4. **Contacto con Waitry**: ya no urgente. Si después del fix queda un bug operacional real y consistente, se decide canal en su momento.

## Lecciones de proceso

- **Cifras crudas de un detector existente NO son la verdad** — en este caso el detector de duplicados estaba diseñado para un patrón distinto (mesas con `tableId` único) y se aplicó a mostrador donde la suposición no se cumple. Validar los supuestos antes de usar las cifras.
- **El campo `paid` y `payment.amount` reflejan lo que el operador marcó, no lo que cobró**. Cualquier métrica financiera derivada de estos campos sin reconciliación contra banco / cash físico es indicativa, no firme.
- **Siempre cruzar conteos de "anomalía" contra volumen total** (tasa, no cantidad absoluta). Si el rate en una mesa es 4× el de otras, es probable que la mesa sea anómala, no que el problema sea masivo.
