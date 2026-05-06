# ADR-008 — Cierre de iniciativa Waitry dedup: causa raíz operacional, mitigación por cambio de terminal POS

**Fecha:** 2026-05-06
**Estado:** Aceptado
**Iniciativa:** [`rdb-waitry-ingesta-dedup`](../../docs/planning/rdb-waitry-ingesta-dedup.md)
**ADRs previos relacionados:**
[005 — Causa raíz Fase 1](005_rdb_waitry_dedup_root_cause.md),
[006 — Forense doble-tap](006_rdb_waitry_forense_doble_tap.md)

## Contexto

La iniciativa `rdb-waitry-ingesta-dedup` se abrió el 2026-04-26 para
investigar duplicados de pedidos Waitry en cortes de RDB. Las fases 1,
1.5, 2.A y 2.B cerraron entre el 2026-04-26 y el 2026-04-29 (PRs #209,
#210, #211, #212), reduciendo el ruido del detector de **949 → 91
pares** (−90.4%) y dejando documentada la causa raíz: **doble-tap del
operador en el POS Waitry**, sin defecto del software del POS ni del
pipeline DB (`UNIQUE` en `waitry_inbound.order_id` + trigger idempotente
con `ON CONFLICT DO UPDATE` ya garantizaban la dedup en pipeline).

ADR-006 además documentó que `compute_content_hash` tiene falsos
positivos sistémicos en mostrador (Tiendita): todas las ventas comparten
`tableId 94034`, así que ventas legítimas a clientes distintos comparten
hash cuando coinciden producto + cantidad + total. Tasa residual
post-fix: **9.3%** (vs ~3% real en Pádel donde cada cancha tiene
`table_name` único).

La Fase 2.C planeada era una UI para que el cajero/admin RDB resolviera
los pares pendientes sin SQL. Antes de arrancarla, una intervención
operacional externa eliminó la causa raíz.

## La intervención operacional

El **2026-04-30** RDB cambió la terminal del POS Waitry: de tablet
Android stand-alone a una computadora Windows con emulador Android. La
hipótesis (validada por los datos) era que la pantalla táctil de la
tablet original estaba registrando taps fantasma o doble-taps cuando el
operador presionaba botones cerca del borde, especialmente en horas
pico. El emulador Android sobre Windows usa input de mouse/teclado
directo, sin ese problema.

## Validación empírica (verificada el 2026-05-06)

Distribución de pares pendientes en `rdb.waitry_duplicate_candidates`
post-fix de Fase 2.B (PR #212):

| Bucket                       | Mesa     | Pares | Naturaleza                                   |
| ---------------------------- | -------- | ----- | -------------------------------------------- |
| Pre-2026-04-30               | Tiendita | 135   | Mix de dups reales + falsos positivos        |
| Pre-2026-04-30               | Pádel 1  | 2     | 1 dup real ($40, 3s) + 1 falso positivo ($0) |
| 2026-04-30 04:12 (madrugada) | Pádel 2  | 1     | Falso positivo ($0, pre-shift operativo)     |
| Post-2026-04-30 operativo    | Tiendita | 8     | Falsos positivos residuales esperados        |
| Post-2026-04-30 operativo    | Pádel    | **0** | **Prueba dura del cambio**                   |

**La señal clave** es la columna Pádel: cero detecciones operativas en
canchas desde el cambio. Pádel es donde el detector es preciso (no hay
colisión sistémica del hash como sí ocurre en Tiendita). Cero
detecciones = mitigación efectiva sobre el mecanismo real.

Las 8 detecciones residuales en Tiendita post-cambio son consistentes
con el 9.3% de falsos positivos predicho por ADR-006 (no son duplicados
reales — son productos populares vendidos a clientes distintos cuyo
hash colisiona porque todos comparten `tableId 94034`).

## Decisión

**Cerrar la iniciativa `rdb-waitry-ingesta-dedup` sin ejecutar Fase 2.C
(UI de resolución).** La UI dejó de ser necesaria porque el flujo
continuo de duplicados que justificaba construirla se eliminó por la
mitigación operacional. Los pares pendientes históricos se resuelven en
batch con clasificación documentada.

### Resolución de los 146 pares pendientes

- **`historic_pre_terminal_change`** (138 pares) — todos los detectados
  antes de las 14:00 UTC del 2026-04-30 (≈ 8 AM Matamoros, antes del
  shift operativo del día del cambio). No se tocan los cortes
  históricos cerrados; solo se marca `resolved = true` con la razón en
  `resolution`. Audit trail implícito: el `resolved` se hace en una
  sola migración con timestamp identificable en logs.
- **`tiendita_false_positive_residual`** (8 pares) — los detectados
  post-cambio en Tiendita. Documentados como falsos positivos
  esperados del detector (ver ADR-006).

### Política para detecciones futuras

- **Mantener el detector activo.** No filtrar Tiendita aunque siga
  generando ruido residual: si algún día el patrón cambia (p.ej. una
  futura terminal causa el bug otra vez), no queremos haber apagado el
  alarma.
- **Regla de lectura para futuras detecciones:**
  - Detección en **Pádel** = alarma real, investigar.
  - Detección en **Tiendita** con totales > 0 y `seconds_apart < 60s` y
    mismo `payment_method` con tarjeta = posible dup real, investigar.
  - Resto de Tiendita = ruido esperado, ignorable. Si el volumen
    aumenta materialmente o un cajero reporta descuadre, reabrir.

## Alternativas consideradas

1. **Construir Fase 2.C (UI) de todos modos.** Descartado: con flujo
   continuo cero, la UI no agrega valor. Los 146 pendientes se pueden
   resolver una vez en batch sin necesidad de toolería transaccional.
2. **Filtrar Tiendita del detector.** Descartado por ahora: pierde
   capacidad de alarma futura. Reconsiderar si el ruido se vuelve un
   problema operativo.
3. **Reescribir `compute_content_hash` con `orderUserId`.** Ya
   descartado en ADR-006: complejidad alta, beneficio bajo dado que el
   problema operativo está mitigado.

## Riesgos / consecuencias

- **Riesgo bajo, reversible.** El batch resuelve `resolved = true` con
  `resolution` clasificada. No toca `waitry_pedidos`, `waitry_pagos`,
  `cortes_caja`, `cortes_movimientos` ni `movimientos_inventario`. Si
  surge razón para reabrir un par, se hace `UPDATE … SET resolved =
false` puntual.
- **Si la mitigación operacional falla** (regresan a la tablet, o el
  emulador Windows también tiene un bug latente), el detector marcará
  nuevos pares en Pádel con totales > 0 — eso es la señal de alarma.
  Reabrir iniciativa o crear hermana en ese caso.
- **El cajero deja de tener herramienta visual de resolución.** A
  futuro, si Beto u operación quieren auditoría de cualquier
  duplicado, hoy se hace por SQL (la tabla queda viva). Aceptado.

## Referencias

- Planning doc:
  [`docs/planning/rdb-waitry-ingesta-dedup.md`](../../docs/planning/rdb-waitry-ingesta-dedup.md)
- Migración batch:
  `supabase/migrations/20260506223531_rdb_waitry_resolve_historic_pre_terminal_change.sql`
- Investigación verificada el 2026-05-06 con consultas read-only sobre
  `rdb.waitry_duplicate_candidates` JOIN `rdb.waitry_pedidos`.
