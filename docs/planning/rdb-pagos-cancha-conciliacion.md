# Iniciativa — Conciliación Playtomic ↔ Waitry (pagos de cancha en club)

**Slug:** `rdb-pagos-cancha-conciliacion`
**Empresas:** RDB
**Schemas afectados:** `playtomic` (nueva tabla `payment_assignments` + vista calculada de cobertura), lectura de `rdb.waitry_pedidos` + `rdb.waitry_productos` + `rdb.waitry_pagos`
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-05-04
**Última actualización:** 2026-05-04 (S2-CSV cerrado: import + cobertura combinada Waitry+CSV + filtro dashboard live; quedan S2-Waitry-write y S3)

## Problema

El módulo `/rdb/playtomic` lista "Pagos Pendientes" basándose solo en `payment_status` del third-party API de Playtomic. Verificado: ese campo solo refleja pagos hechos vía la **plataforma online** de Playtomic (link de pago, app, etc). Los **pagos en club** (efectivo o tarjeta cobrados en recepción) viven en Waitry y nunca se reflejan en `payment_status`.

Resultado: ~550 reservas / ~$200K MXN aparecen como pendientes aunque en la realidad estén pagadas en cancha. El operador no tiene forma de cruzar manualmente sin abrir Playtomic + Waitry en pestañas separadas y comparar a mano.

Verificado contra el API de Playtomic: probamos `GET /v1/bookings/{id}` (singular), `/v1/bookings/{id}/payments`, `/v1/payments`, `/v1/receipts`, `/v2/bookings/{id}` — todos 404. **El API third-party no expone los pagos en club por ningún endpoint.** La única forma de cerrar el ciclo es cruzar contra Waitry, donde los cobros sí están como producto "Renta Cancha Padel" en `rdb.waitry_pedidos`.

Caso ejemplo (verificado en BD): reserva del 7-abr 20:30 Padel 8 $800 (Jose Luis Paz Zablah) marcada como PENDING en Playtomic. En Waitry hay un pedido del 7-abr 20:17, "Renta Cancha Padel" $200, notes "jose Luis paz efectivo", paid=true. El cobro existe, solo falta amarrarlo a la reserva.

## Outcome esperado

Una vista nueva `/rdb/playtomic/conciliacion` donde el operador puede:

- Ver la lista de reservas Playtomic pendientes (`payment_status=PENDING`, no canceladas).
- Para cada reserva, asignar **manualmente** uno o varios pedidos de Waitry "Renta Cancha Padel" que la cubren — `1 reserva = N pedidos Waitry`, donde la suma cubre el total de la reserva (típico: 4 × $200 = $800).
- Persistir esa asignación con audit trail (quién asignó, cuándo).
- Las reservas con cobertura completa salen del listado de "Pagos Pendientes (sin cobro online)" del dashboard principal.

KPIs visibles en el dashboard:

- **Cobertura**: % reservas pendientes con asignación completa.
- **$ identificado como pagado en club**: suma de `assigned_amount`.
- **Pendientes reales** (sin pago online ni cobertura via Waitry): cuenta + monto.

## Decisiones de alcance (cerradas con Beto 2026-05-04)

1. **Granularidad: a nivel reserva.** 1 reserva Playtomic se concilia cuando la suma de pedidos Waitry asignados cubre el total. No conciliamos por jugador individual, aunque cada jugador en Waitry pague su parte por separado ($200 c/u típico).
2. **Asignación manual.** No matching automático. El operador elige los pedidos del dropdown. La UI puede sugerir/ranquear candidatos, pero el operador siempre confirma.
3. **Solo "Renta Cancha Padel"** cuenta como cobertura. Otros productos de Waitry (Torneo Relámpago, F&B) no son canchas reservadas y quedan fuera.
4. **Vista nueva específica** con dropdown/picker de pedidos no asignados.
5. **Métricas de éxito sí** se publican en el dashboard.

## Alcance v1

### Migración y modelo de datos

- [ ] **Tabla nueva `playtomic.payment_assignments`**:

  ```
  id                uuid PK default gen_random_uuid()
  booking_id        text NOT NULL FK → playtomic.bookings(booking_id)
  waitry_order_id   text NOT NULL UNIQUE FK → rdb.waitry_pedidos(order_id)
  assigned_amount   numeric NOT NULL CHECK (assigned_amount > 0)
  assigned_by       uuid NOT NULL FK → auth.users(id)
  assigned_at       timestamptz NOT NULL DEFAULT now()
  note              text NULL
  ```

  - `UNIQUE(waitry_order_id)` → un pedido no se asigna 2 veces.
  - Índice en `(booking_id)` para lookup rápido al renderizar la lista.

- [ ] **Vista `playtomic.v_bookings_payment_coverage`** que para cada `booking_id` retorna: total reserva (`price_amount`), Σ `assigned_amount`, cobertura (% o estado: `none`/`partial`/`full`), lista de `waitry_order_id` asignados. La UI consume esta vista en lugar de hacer joins manuales.
- [ ] **RLS**: tabla solo accesible para operadores RDB con permiso de escritura sobre módulo Playtomic. Lectura para roles con permiso de lectura sobre Playtomic. Ver patrón en otras tablas del schema `playtomic` y aplicar el mismo gate.
- [ ] **`SCHEMA_REF.md` regenerado** después de aplicar la migración (regla del repo).

### Backend / server actions

- [ ] **`assignPaymentAction(bookingId, waitryOrderId, amount, note?)`** — server action que inserta en `payment_assignments`. Valida:
  - Pedido Waitry existe, `paid=true`, `product_name='Renta Cancha Padel'`.
  - Pedido aún no asignado (UNIQUE constraint protege a nivel DB también).
  - Reserva existe y no cancelada.
  - `amount` razonable (default = `total_price` del pedido; el operador puede ajustar manualmente).
  - Audit trail nativo via `assigned_by` + `assigned_at`.
- [ ] **`unassignPaymentAction(assignmentId)`** — borra asignación (soft delete o hard delete a decidir en ADR; soft trae historial pero complica unique constraint).
- [ ] **Query helper `getPendingBookingsWithCoverage(empresa_id, dateRange)`** — lista de reservas pendientes + estado de cobertura, una sola query a la vista.
- [ ] **Query helper `getAvailableWaitryOrders(bookingStart, ±hoursTolerance)`** — lista de pedidos Waitry "Renta Cancha Padel" no asignados, dentro de ventana temporal alrededor del booking_start. Ordenados por proximidad temporal.

### UI

- [ ] **Página nueva**: `app/rdb/playtomic/conciliacion/page.tsx`. Patrón split: lista de reservas a la izquierda, panel de asignación a la derecha (o drawer en mobile). Patrón de detail-page del repo aplica.
- [ ] **Lista de reservas pendientes**: ordenadas por antigüedad (más viejas primero — más prioridad), agrupadas por jugador (owner). Cada fila muestra: fecha, hora, cancha, total, estado de cobertura ("Sin cobertura", "Parcial 50%", "Cubierta").
- [ ] **Panel de asignación** por reserva seleccionada:
  - Datos de la reserva (fecha, hora, cancha, jugadores, total).
  - Lista de asignaciones existentes (waitry_order_id, monto, fecha pago, notes Waitry, botón quitar).
  - Indicador de cobertura: "Cubierto: $600/$800 (75%)".
  - **Dropdown/picker** de pedidos Waitry disponibles:
    - Filtrados: `product_name='Renta Cancha Padel'`, `paid=true`, no asignados a ninguna reserva.
    - Ventana temporal: ±3h del `booking_start` (configurable a futuro).
    - Sugerencias rankeadas: notes contiene nombre del owner/participantes ↑, monto compatible con `booking.price_amount / participantes` (no hardcoded — soporta padel $800/4=$200, tenis singles $300/2=$150, tenis dobles $400/4=$100, descuentos por horario, etc.) ↑, timestamp más cercano ↑.
    - Cada item del dropdown muestra: hora, monto, notes, badge si match con jugador.
- [ ] **Botón "Conciliar"** explícito cuando Σ ≥ total: cierra la asignación. Si Σ < total, queda parcial pero se puede forzar con nota explicativa (descuentos, cortesías).
- [ ] **Filtro de la lista del dashboard principal**: las reservas con cobertura completa (`v_bookings_payment_coverage.estado = 'full'`) salen del listado de "Pagos Pendientes (sin cobro online)" del PR #406.

### Métricas en dashboard

- [ ] **3 KPI cards nuevas** en `/rdb/playtomic`:
  - Cobertura (% reservas pendientes conciliadas)
  - $ identificado como pagado en club (suma `assigned_amount`)
  - Pendientes reales (sin pago online ni cobertura) — el número que importa
- [ ] **Indicador de salud**: comparación contra periodo anterior (mes anterior) para detectar drift.

## Fuera de alcance

- **Matching automático sin confirmación humana.** Decisión explícita: el operador siempre asigna. Si después aparece un caso obvio (1 pedido perfecto match por timestamp+monto+nombre), podemos agregar "auto-sugerencia con confirmación de un click", pero NO matching ciego.
- **Conciliación de torneos, F&B, otros productos Waitry.** Solo "Renta Cancha Padel" cubre rentas. Torneos y consumo se tratan por separado en otra iniciativa si aparece la necesidad.
- **Conciliación retroactiva masiva** — la herramienta está. Quién la corra hacia atrás (Beto/Ale/Michelle) y hasta qué fecha se decide operativamente, no es parte del v1.
- **Notificación al cliente** cuando su pago se concilia (ej. WhatsApp "registramos tu pago"). Roadmap futuro.
- **Conciliación de tenis, pickleball u otras canchas que tengan precios distintos.** El modelo soporta cualquier precio (no asumimos $200), pero el alcance v1 valida con padel donde está la mayor parte del problema. Otras canchas se prueban en S3.
- **Importar histórico previo a la integración Waitry**. Solo conciliamos lo que ya está en `rdb.waitry_pedidos`.

## Métricas de éxito

- **Cobertura ≥ 80%** de las reservas pendientes ($) tras 30 días de uso (asume operador conciliando regularmente).
- **Tiempo de conciliación < 30 segundos** por reserva en promedio (medible si lo instrumentamos; visual smoke test en S2).
- **Cero falsos pagados** — ninguna reserva conciliada que después resulte impaga (validación al cierre del primer mes con Beto/Ale).
- **Dashboard muestra "Pendientes reales"** como número creíble (< $50K probablemente, vs los $200K actuales).

## Riesgos / preguntas abiertas

- [ ] **Tolerancia de monto**: si Σ < total Playtomic por descuento/cortesía no registrado en Waitry, ¿la reserva cierra como conciliada o requiere note explicativa? Decisión propuesta: requiere note + estado "conciliada con delta". A confirmar en S1.
- [ ] **Ventana temporal del dropdown**: ±3h propuesta. ¿Suficiente, o subir a ±6h / día completo? El extremo opuesto (muy ancho) genera ruido y dificulta la curaduría. Validar con datos reales en S1 read-only.
- [ ] **Permisos / RBAC**: ¿quién puede asignar pagos? Default propuesto: cualquiera con escritura sobre módulo Playtomic en RDB (Beto, Ale, Michelle). Operadores del club no tienen este rol por default. Decidir en S2.
- [ ] **Historial de asignaciones borradas** (soft vs hard delete): si Beto borra una asignación, ¿queremos saber qué/cuándo/por qué? Soft delete trae historial pero complica el UNIQUE. Decisión: empezar hard delete + log de auditoría externo si se necesita histórico (vía Supabase audit triggers o tabla de eventos).
- [ ] **Pedidos Waitry duplicados** (`rdb.waitry_duplicate_candidates` tiene 841 filas). Si un pedido es duplicado pendiente de resolver, ¿lo permitimos asignar? Posible flag/exclusión. Validar en S1.
- [ ] **Reservas canceladas con cobro previo**: si Sr. Paz pagó $200 en club y luego canceló la reserva, ¿el pedido Waitry queda asignado a una reserva cancelada o se libera? Edge case. Default propuesto: dejar la asignación pero indicador visual; decisión final en S2.
- [ ] **Place_name confuso en Waitry**: la mayoría de "Renta Cancha Padel" están bajo `place_name='Rincón del Bosque'` + `table_name='Tiendita'`. Solo 1 pedido en 60d aparece bajo "Pádel 3 - M2". No restringimos por place; el filtro real es `product_name`.

## Sprints / hitos

| #   | Scope                                                                                                                                                                                                                                                                   | Estado  | PR  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --- |
| S1  | **Read-only**: migración SQL (tabla `payment_assignments` + vista `v_bookings_payment_coverage` + RLS) + página `/rdb/playtomic/conciliacion` con lista + panel de asignación pre-llenado (proponer matches, sin guardar todavía). Da visibilidad y valida heurísticas. | planned | —   |
| S2  | **Write**: server actions `assignPaymentAction` / `unassignPaymentAction`, persistencia, audit trail, botón Conciliar. Filtro del dashboard principal: las cubiertas salen de "Pagos Pendientes (sin cobro online)".                                                    | planned | —   |
| S3  | **Refinamiento**: ranking inteligente de sugerencias en dropdown (notes match con participantes, score), 3 KPI cards en dashboard, bulk-actions si es útil. Validar tolerancia de monto y ventana temporal con datos reales.                                            | planned | —   |

## Decisiones registradas

- **2026-05-04** — Granularidad a nivel reserva (no por jugador individual). Razón: simplifica modelo y se alinea con cómo Beto piensa el problema (1 reserva = 1 unidad de cobranza).
- **2026-05-04** — Asignación manual obligatoria, no matching ciego. Razón: alto riesgo de falsos positivos sin contexto humano (notes ambiguos, montos atípicos).
- **2026-05-04** — Solo "Renta Cancha Padel" en scope. Razón: torneos no son canchas reservadas; F&B no aplica.
- **2026-05-04** — Vista nueva separada (`/rdb/playtomic/conciliacion`), no inline en el dashboard. Razón: la operación de conciliar es un workflow distinto a "ver KPIs", separar concerns.
- **2026-05-04** — La heurística de matching deriva el monto esperado del propio booking (`price_amount / participantes`), no de un valor hardcoded. Razón: tenis singles ($300/2 = $150), tenis dobles ($400/4 = $100), horarios con descuento, torneos a precios distintos. Hardcodear $200 sólo funcionaba para padel a precio estándar y rompía el resto. Tolerancia ±15% absorbe redondeos del POS.

## Bitácora

- **2026-05-04** — Iniciativa promovida. Detonante: investigación de [#406](https://github.com/beto-sudo/BSOP/pull/406) (banner aclaratorio sobre pagos online vs club) + descubrimiento de que Waitry ya está integrado en BSOP (schema `rdb`, ~10K pedidos / 14K productos). Match verificado del caso del Sr. Paz Zablah (reserva 7-abr 20:30 ↔ Waitry order 16798276 con notes "jose Luis paz efectivo"). Alcance v1 cerrado tras 5 preguntas con Beto.
- **2026-05-04** — Sprint 1 abierto en [#409](https://github.com/beto-sudo/BSOP/pull/409): migración SQL + helpers + UI read-only con ranking de candidatos por proximidad temporal + match en notes + compatibilidad de monto. Heurística de monto ajustada tras feedback de Beto para derivarse del booking en vez de hardcodear $200 (soporta tenis singles/dobles, horarios con descuento, torneos a precios distintos).
- **2026-05-04** — Iteración S1 + descubrimiento de pivote a CSV. Tras smoke test se ajustó la heurística: ventana asimétrica (pre-grace 30min, post ajustable 3h/1d/2d/7d/30d, [#410](https://github.com/beto-sudo/BSOP/pull/410)), fix del cap PostgREST de 1000 rows ([#411](https://github.com/beto-sudo/BSOP/pull/411)), y se descubrió que Playtomic Manager exporta un CSV de pagos que cubre el ~73% del problema sin tocar Waitry. Pivote estratégico: S2 reframe = CSV import primero, Waitry-write después.
- **2026-05-04** — **S2-CSV-A mergeado** ([#412](https://github.com/beto-sudo/BSOP/pull/412)). Tabla `playtomic.payments_import`, parser puro `lib/playtomic/csv-import.ts` (15 tests verdes, formato Playtomic con `;`, comas decimales y fechas DD/MM/YYYY en CST), server action `importPaymentsCsv()` y UI `/rdb/playtomic/import-csv` con drag-drop. Primer upload del CSV de prueba: 1812 filas insertadas, 0 errores de parse. Bug post-merge: faltaban GRANTs a `authenticated` en las tablas nuevas (S1 + S2-CSV) — fixeado en [#414](https://github.com/beto-sudo/BSOP/pull/414).
- **2026-05-04** — Cleanup de drift detectado por `drift-check.sql`: policies `service_role USING(true)` redundantes en S1 y S2-CSV (service_role bypassa RLS automáticamente). Dropeadas en [#413](https://github.com/beto-sudo/BSOP/pull/413).
- **2026-05-04** — **S2-CSV-B mergeado** ([#415](https://github.com/beto-sudo/BSOP/pull/415)). Tres mejoras: vista combinada `playtomic.v_bookings_total_coverage` que suma Waitry+CSV por booking con match flexible (cualquier participante + ±15min), filtro del dashboard principal que excluye reservas cubiertas (validado: 551 → 441 pendientes, $30,700 limpiados), y whitelist de productos cancha ampliado de 1 a 4 patterns (padel + tenis + pickleball + "Uso cancha coach %" — 7 variantes con nombres de coaches). Cleanup tipos en [#416](https://github.com/beto-sudo/BSOP/pull/416).

## Estado tras S2-CSV (snapshot 2026-05-04 noche)

| Métrica                                  |                            Valor |
| ---------------------------------------- | -------------------------------: |
| Pendientes en BSOP                       |                    441 (era 569) |
| Bookings auto-conciliados (Waitry o CSV) |                              189 |
| $ identificado en CSV                    |                         ~$30,700 |
| CSV cargado                              | 1812 filas (1 mes ~feb-mar 2026) |
| Patterns de productos cancha reconocidos | 4 (padel/tenis/pickleball/coach) |

## Pendiente para cerrar la iniciativa

- **S2-Waitry-write**: server actions `assignPaymentAction` / `unassignPaymentAction` + UI funcional para asignar manualmente pedidos Waitry a las ~441 reservas que no se cubrieron via CSV (efectivo en cancha sin registrar en manager). Stash listo en branch local.
- **S3 — Refinamiento**: parser de signature en notes Waitry para auto-conciliación con copy-paste del bloque del manager Playtomic, KPI cards en dashboard, bulk-actions, ranking inteligente de candidatos.
