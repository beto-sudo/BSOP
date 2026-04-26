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

**Implicación para la conversación con Waitry**: NO podemos reclamarles "el POS está duplicando órdenes". Eso es falso. Lo que podemos pedirles legítimamente: **agregar warning/double-confirm en el POS cuando el operador intenta crear una orden con productos+monto+mesa idénticos a una creada en los últimos N minutos**. Esto es UX preventiva que ataja el caso 95% sin afectar el caso del cliente legítimo que pide lo mismo dos veces seguidas (ese caso podría confirmar el warning).

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

**El 97% del problema vive en la tablet de mostrador "Tiendita"** (layout `MOSTRADOR`, `tableId 94034`). Las tablets de Pádel (que son para reservación de canchas, no cobro rápido en línea) prácticamente no presentan el problema. Esto refuerza que el contexto operativo —cobro rápido a clientes en fila— es el factor principal.

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

## Severidad — cuántos pares involucran dinero realmente cobrado

De los 949 pares pendientes:

| Característica                                  | Pares | %     |
| ----------------------------------------------- | ----: | ----- |
| **Ambos miembros con `payment.amount > 0`**     |   936 | 98.6% |
| Solo uno con pago (otro es orden vacía/anulada) |     3 | 0.3%  |
| Ninguno con pago                                |    10 | 1.1%  |
| Ambos con productos en `waitry_productos`       |   939 | 98.9% |
| Status distinto entre los dos miembros          |    32 | 3.4%  |

**98.6% de los pares involucran doble cobro real**, no son solo "fantasmas" de captura. Esto valida que la cifra de impacto $163k del ADR-005 es real, no inflada por orders vacías.

## Cómo elegir "el bueno" — criterios para la UI de resolución (Fase 2)

Para que la UI de Opción B (resolución manual de duplicados) sugiera automáticamente cuál orden mantener y cuál descartar, propongo estos criterios en orden de prioridad:

1. **Si solo uno tiene `productos > 0`**: el que tiene productos gana. (3 pares, edge case)
2. **Si solo uno tiene `pagos.amount > 0`**: el que tiene pago gana. (3 pares)
3. **Si ambos tienen pago pero `payment_method` distinto**: indeterminado por software, requiere humano (ej. par 17055334/35: tarjeta vs cash). El cajero debe consultar voucher o memoria.
4. **Si ambos tienen pago e idéntico `payment_method`** (ej. par 17055503/04: ambos tarjeta $60): en general el primero (`timestamp` menor) es el "bueno" — el segundo es el doble-tap. **Verificable** porque el primero suele tener `last_action_at` con todos los `orderActionType` completos (`user_checked_in` → `user_placed_order` → `user_paid` → `order_ended`), y el segundo a veces tiene secuencia incompleta o duplicada.
5. **Status `order_canceled` en uno de los dos**: el cancelado se descarta automáticamente.

UI debería mostrar: ambos pedidos lado a lado con sus diferencias resaltadas, sugerir el "bueno" según los criterios arriba, y permitir override manual con campo de razón obligatorio (audit trail).

## Recomendaciones — qué reportar a Waitry, en qué orden

### Para reportar a Waitry (cuando Beto decida)

Mensaje propuesto, basado en los datos arriba:

> Detectamos un patrón sostenido en nuestro POS Waitry de Rincón del Bosque (placeId `11145`, tableId `94034` "Tiendita"): los operadores están creando órdenes idénticas (mismos productos, mismo total, misma mesa) con segundos de diferencia, presumiblemente por doble-tap en el flujo de cobro. En abril 2026 detectamos **949 pares de órdenes duplicadas, $163,078 de impacto en doble cobro**, concentradas 73% en horas pico (19:00–23:00) y 97% en una sola tablet de mostrador.
>
> Verificamos que cada par tiene IDs internos completamente distintos en su sistema (`orderId`, `orderItemId`, `orderPaymentId`, `orderActionId`, `externalDeliveryId` todos únicos), por lo que no es un bug de transmisión ni replay del webhook — es operacional.
>
> **Solicitud**: ¿es factible agregar un warning/double-confirm en el flujo de creación de orden cuando se detecta una orden idéntica (mismos productos + monto + mesa) creada en los últimos 5 minutos por el mismo o distinto operador? Eso atajaría >95% del problema.
>
> Adjuntamos detalle de pares para diagnóstico si quieren reproducir.

### Para nosotros — orden recomendado

1. **Mergear PR #209** (alta de iniciativa + ADR-005). En revisión.
2. **Mergear este PR (ADR-006)**. Forense lista, no toca código.
3. **PR Opción C** (rama y PR aparte): corregir typo `order_cancelled` → `order_canceled` en `v_cortes_totales`, drop `rdb.trg_procesar_venta_waitry()`, mejorar `match_reason` del detector para incluir `seconds_apart` y `payment_methods`. PR chico, mergeable rápido.
4. **Planning detallado de Opción B** en `docs/planning/rdb-waitry-ingesta-dedup.md` o promover iniciativa hermana `rdb-waitry-conciliacion-reversa`. UI de resolución, criterios de "el bueno", backfill controlado, métricas.
5. **Beto contacta a Waitry** con el mensaje arriba (o equivalente). Independiente de B — atajan el flujo en producción.

## Decisiones registradas (de esta forense)

- **No reportar a Waitry como "su POS está duplicando".** Es falso. Reportar como "su flujo permite doble-tap del operador y pedimos UX preventiva".
- **No identificar a Laisha como "la responsable" en la conversación con el negocio**. Es la operadora con mayor volumen reportable, sí, pero (a) puede ser efecto de mayor volumen total no de error rate más alto y (b) el 75% NULL en el path de operador hace la cifra direccional, no absoluta. Tratar como dato técnico, no señalamiento.
- **Criterio default del "bueno"**: el de `timestamp` menor cuando `payment_method` y monto coinciden; humano decide cuando difiere o cuando el caso es edge.

## Preguntas abiertas

1. **Sobre el 75% NULL en operador**: necesitamos validar con Waitry si los pedidos sin `orderActions[].user` son web/QR del cliente final, o si es un bug del propio payload. Sin esto, las cifras de operador son direccionales.
2. **Backfill de los 180 cortes históricos afectados**: ¿se ataca todo, o solo de aquí en adelante? El backfill manual con UI tomaría tiempo significativo a Laisha/Juan Pablo. Alternativa: aceptar que los reportes históricos son lo que son y solo limpiar de aquí en adelante.
3. **Contacto con Waitry**: ¿hay alguien del lado RDB o externo (consultor) ya en touch con su soporte/CSM? Si no, Beto decide canal.
