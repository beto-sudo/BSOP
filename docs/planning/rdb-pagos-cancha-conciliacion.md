# Iniciativa — Conciliación Playtomic ↔ Waitry (pagos de cancha en club)

**Slug:** `rdb-pagos-cancha-conciliacion`
**Empresas:** RDB
**Schemas afectados:** `playtomic` (nueva tabla `payment_assignments` + vista calculada de cobertura), lectura de `rdb.waitry_pedidos` + `rdb.waitry_productos` + `rdb.waitry_pagos`
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-05-04
**Última actualización:** 2026-05-07 (refinamiento de cobertura efectiva: ventana temporal simétrica, wallet con `non_applicable_total`, boost por cancha en notes, badge dry-run de auto-conciliación)

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
- **2026-05-07** — Wallet payments en CSV de Playtomic Manager: `total=0` siempre, monto real está en `non_applicable_total`. Verificado en BD productiva (90d): 136 wallet payments, todos con `total=0`, todos con `non_applicable_total>0` (suma $30,550). `payment_type='Single payer'` indica que el wallet cubrió todo el booking; otros valores cubren fraccional. La heurística previa `price/N` era doble-mala: subestimaba single-payer (Dina pagó $800, modelo decía $266) y sobreestimaba fracciones con descuento. La fuente real evita ambos errores.
- **2026-05-07** — Wellhub aparece en CSV con `origin='Playtomic Manager'` aunque sí está cobrado vía la integración. Reclasificarlo por `payment_method` (no por `origin`) lo cuenta correctamente como online, no como manager-unverified.
- **2026-05-07** — Auto-conciliación en modo dry-run primero. Pablo ve el badge "🤖 Sugerido auto" pero sigue conciliando manual. Después de 1-2 semanas validamos tasa de acierto antes de activar cron. Razón: Beto prefiere validar antes de auto-mutar producción.

## Bitácora

- **2026-05-04** — Iniciativa promovida. Detonante: investigación de [#406](https://github.com/beto-sudo/BSOP/pull/406) (banner aclaratorio sobre pagos online vs club) + descubrimiento de que Waitry ya está integrado en BSOP (schema `rdb`, ~10K pedidos / 14K productos). Match verificado del caso del Sr. Paz Zablah (reserva 7-abr 20:30 ↔ Waitry order 16798276 con notes "jose Luis paz efectivo"). Alcance v1 cerrado tras 5 preguntas con Beto.
- **2026-05-04** — Sprint 1 abierto en [#409](https://github.com/beto-sudo/BSOP/pull/409): migración SQL + helpers + UI read-only con ranking de candidatos por proximidad temporal + match en notes + compatibilidad de monto. Heurística de monto ajustada tras feedback de Beto para derivarse del booking en vez de hardcodear $200 (soporta tenis singles/dobles, horarios con descuento, torneos a precios distintos).
- **2026-05-04** — Iteración S1 + descubrimiento de pivote a CSV. Tras smoke test se ajustó la heurística: ventana asimétrica (pre-grace 30min, post ajustable 3h/1d/2d/7d/30d, [#410](https://github.com/beto-sudo/BSOP/pull/410)), fix del cap PostgREST de 1000 rows ([#411](https://github.com/beto-sudo/BSOP/pull/411)), y se descubrió que Playtomic Manager exporta un CSV de pagos que cubre el ~73% del problema sin tocar Waitry. Pivote estratégico: S2 reframe = CSV import primero, Waitry-write después.
- **2026-05-04** — **S2-CSV-A mergeado** ([#412](https://github.com/beto-sudo/BSOP/pull/412)). Tabla `playtomic.payments_import`, parser puro `lib/playtomic/csv-import.ts` (15 tests verdes, formato Playtomic con `;`, comas decimales y fechas DD/MM/YYYY en CST), server action `importPaymentsCsv()` y UI `/rdb/playtomic/import-csv` con drag-drop. Primer upload del CSV de prueba: 1812 filas insertadas, 0 errores de parse. Bug post-merge: faltaban GRANTs a `authenticated` en las tablas nuevas (S1 + S2-CSV) — fixeado en [#414](https://github.com/beto-sudo/BSOP/pull/414).
- **2026-05-04** — Cleanup de drift detectado por `drift-check.sql`: policies `service_role USING(true)` redundantes en S1 y S2-CSV (service_role bypassa RLS automáticamente). Dropeadas en [#413](https://github.com/beto-sudo/BSOP/pull/413).
- **2026-05-04** — **S2-CSV-B mergeado** ([#415](https://github.com/beto-sudo/BSOP/pull/415)). Tres mejoras: vista combinada `playtomic.v_bookings_total_coverage` que suma Waitry+CSV por booking con match flexible (cualquier participante + ±15min), filtro del dashboard principal que excluye reservas cubiertas (validado: 551 → 441 pendientes, $30,700 limpiados), y whitelist de productos cancha ampliado de 1 a 4 patterns (padel + tenis + pickleball + "Uso cancha coach %" — 7 variantes con nombres de coaches). Cleanup tipos en [#416](https://github.com/beto-sudo/BSOP/pull/416).
- **2026-05-04** — Bitácora intermedia ([#417](https://github.com/beto-sudo/BSOP/pull/417)) consolidando avance de S2-CSV.
- **2026-05-04** — Bug detectado en `/rdb/playtomic/conciliacion`: la página seguía mostrando 457 pendientes con todas marcadas "Sin cobertura" porque el hook `use-conciliacion-data.ts` tenía hardcoded `coverage_status='none'` y nunca consumió la vista `v_bookings_total_coverage`. **Fix [#418](https://github.com/beto-sudo/BSOP/pull/418)**: el hook ahora lee la vista combinada, excluye los `full` (bajan los 106 cubiertos del listado) y propaga el coverage_status real para que el badge muestre `none/partial/full`.
- **2026-05-04** — **Boost de coaches** ([#419](https://github.com/beto-sudo/BSOP/pull/419)). De los 457 pendientes en ventana 90d, 307 (67%) tienen un coach (Omar/Anibal/Manuel/Paco/Hugo) como owner o participante. 83 pedidos coach existen en Waitry pero solo 17 con nombre (66 son genéricos `Uso cancha coach`). Auto-match estricto solo agarra 2; en cambio el ranker ahora promueve cualquier ticket coach al top cuando la reserva tiene coach (+30 score) y bonus extra (+20) si el nombre del producto coincide con el del booking.
- **2026-05-04** — Bug "no aparecen pedidos del 30-mar en adelante". Causa: PostgREST default de Supabase capa a ~1000 rows ignorando `.limit(8000)`. Con 5732 pedidos pagados en 120d, la query con `.order(ascending)` traía los más antiguos y dejaba fuera los recientes. **Fix paliativo [#420](https://github.com/beto-sudo/BSOP/pull/420)**: descending. **Fix de raíz [#421](https://github.com/beto-sudo/BSOP/pull/421)**: `ALTER ROLE authenticator SET pgrst.db_max_rows = '50000'` aplicado en producción — todas las queries del repo se benefician.
- **2026-05-04** — **S2-Waitry-write abierto** ([#423](https://github.com/beto-sudo/BSOP/pull/423)). Server actions `assignPaymentAction` / `unassignPaymentAction` sobre `playtomic.payment_assignments` (validación de booking no cancelada, pedido `paid=true` con producto cancha, monto > 0, manejo de unique violation `23505`). UI funcional en `/rdb/playtomic/conciliacion`: lista de asignaciones actuales con botón Quitar, botón Conciliar wireado a iterar `selectedOrderIds` vía `useTransition`, feedback de éxito/parcial/error inline, banner "S1 read-only" retirado. Hook devuelve `assignmentsByBooking: Map<string, AssignmentDetail[]>`. CI verde, pendiente smoke en preview + merge por Beto.
- **2026-05-07** — **Refinamiento de cobertura efectiva** (5 PRs en sesión continua):
  - [#436](https://github.com/beto-sudo/BSOP/pull/436) — Match window CSV de ±90min → ±15min tras drift fix v2 ([#435](https://github.com/beto-sudo/BSOP/pull/435)). Verificado: 96% pagos online en ±5min, 14 outliers eran spurious. -27 full / +40 partial reflejan precisión, no regresión.
  - [#437](https://github.com/beto-sudo/BSOP/pull/437) — Split-payment: un pedido Waitry puede asignarse a N reservas (caso Omar Palacios coach con 3 clases en 1 pago). DROP `UNIQUE(waitry_order_id)` → ADD `UNIQUE(booking_id, waitry_order_id)` + trigger valida `SUM(assigned_amount) <= total_amount` con advisory lock. Action calcula `remaining` antes del insert con mensaje rico. UI: badge "Pago compartido" + monto disponible.
  - [#438](https://github.com/beto-sudo/BSOP/pull/438) → reemplazado por [#448](https://github.com/beto-sudo/BSOP/pull/448) — Wellhub y Club wallet ya no marcados como "manager unverified". Reclasificación por `payment_method`: Wellhub → online; Club wallet → wallet con cobertura usando `non_applicable_total` real (NO heurística `price/N` que sub/sobreestimaba). Caso Dina: $266.67 partial → $800 full. 137 bookings nuevos a full por contar correctamente Wellhub + wallet.
  - [#444](https://github.com/beto-sudo/BSOP/pull/444) — Ventana temporal simétrica. La asunción "pago siempre post-booking" rompe en pre-pago anticipado (caso Paco Palacios pagó 27-abr para jugar 4-may). Eliminado `PRE_BOOKING_GRACE_MS` fijo de 30min, ahora preset aplica a ambos lados.
  - [#449](https://github.com/beto-sudo/BSOP/pull/449) — Boost por cancha en notes. Las hostes/Pablo copian/pegan el bloque "Pista / Padel N \"Sponsor\" / Fecha / Hora" desde Playtomic Manager. Match exacto del `resource_name` en notes → +80 score. Mismatch ("padel 1" vs "padel 5") → -100. Auto-pick visual cuando la nota está bien.
  - [#450](https://github.com/beto-sudo/BSOP/pull/450) — Badge "🤖 Sugerido auto" (dry-run). `is_auto_match` se marca con criterios duros (cancha exacta + owner en notas + monto coincide + ±15min + saldo). Pablo concilia manual mientras valida tasa de acierto. Si >95% en 1-2 semanas → cron real. Bug fix descubierto: stopword "del" causaba falsos positivos por la palabra "pa**del**" — agregada blacklist `NAME_TOKEN_STOPWORDS`.

## Estado tras S2-CSV (snapshot 2026-05-04 noche)

| Métrica                                  |                            Valor |
| ---------------------------------------- | -------------------------------: |
| Pendientes en BSOP                       |                    441 (era 569) |
| Bookings auto-conciliados (Waitry o CSV) |                              189 |
| $ identificado en CSV                    |                         ~$30,700 |
| CSV cargado                              | 1812 filas (1 mes ~feb-mar 2026) |
| Patterns de productos cancha reconocidos | 4 (padel/tenis/pickleball/coach) |

## Pendiente para cerrar la iniciativa

- **S2-Waitry-write**: server actions de write + UI funcional. Plan detallado abajo.
- **S3 — Refinamiento**: parser de signature en notes Waitry para auto-conciliación con copy-paste del bloque del manager Playtomic, KPI cards en dashboard, bulk-actions, ranking inteligente de candidatos.

---

## Handoff a S2-Waitry-write (próxima sesión)

### Contexto operativo a leer al arrancar

1. Esta sección + bitácora arriba.
2. La tabla `playtomic.payment_assignments` y la vista `playtomic.v_bookings_total_coverage` ya existen en producción y tienen GRANTs correctos. Tipos están en `types/supabase.ts`.
3. La página `/rdb/playtomic/conciliacion` ya filtra full-cubiertas y muestra coverage real (`coverage_status` propagado desde la vista combinada). El botón "Conciliar (S2)" en `assignment-panel.tsx` está disabled — eso es lo que hay que habilitar.
4. La heurística del ranker (`lib/playtomic/conciliacion.ts`) ya soporta padel/tenis/pickleball + boost de coaches. No tocar — sigue siendo válida.

### Estado de producción al iniciar S2-Waitry-write

| Métrica                                                           |                                                  Valor |
| ----------------------------------------------------------------- | -----------------------------------------------------: |
| Pendientes en `/conciliacion` (después de filtrar full-cubiertas) |                                                   ~351 |
| Cobertura full alcanzada por CSV                                  |                                  113 reservas, $30,700 |
| `payment_assignments` filas                                       | 0 (vacía hasta que S2-Waitry-write empiece a poblarla) |
| `pgrst.db_max_rows`                                               |                                                  50000 |

### Alcance de S2-Waitry-write

**Archivos a crear:**

1. `app/rdb/playtomic/conciliacion/actions.ts` — server actions:
   - `assignPaymentAction({ booking_id, waitry_order_id, assigned_amount, note? })` — inserta en `playtomic.payment_assignments`. Valida:
     - Auth: `supabase.auth.getUser()` — si no, error.
     - `assertNotInPreview()` (ver patrón en `app/rdb/cortes/actions.ts`).
     - Booking existe y `is_canceled=false`.
     - Pedido Waitry existe, `paid=true`, y al menos uno de sus productos pasa `isCanchaProduct(p.product_name)` (helper exportado en `lib/playtomic/conciliacion.ts`).
     - `assigned_amount > 0`.
     - Captura unique violation (`code === '23505'`) con mensaje "Ya está asignado a otra reserva".
     - `revalidatePath('/rdb/playtomic/conciliacion')` y `'/rdb/playtomic'`.
     - Retorno discriminado: `{ ok: true, id } | { ok: false, error }`.
   - `unassignPaymentAction(assignmentId: string)` — borra por `id`. Hard delete (decisión registrada arriba).

**Archivos a modificar:**

2. `components/playtomic/conciliacion/assignment-panel.tsx`:
   - Quitar `disabled` del botón "Conciliar".
   - Al hacer click: para cada `selectedOrderIds`, llamar `assignPaymentAction(...)` con `assigned_amount = candidate.total_amount` y manejar errores con `useTransition` + state local.
   - Tras éxito: limpiar selección, llamar `refetch()` (prop nueva del padre) para refrescar la vista.
   - Renderizar arriba del dropdown de candidatos una lista de **asignaciones existentes** (de `booking.assigned_waitry_orders` que ya viene en el booking). Cada item con su monto + botón "Quitar" → llama `unassignPaymentAction()`.

3. `components/playtomic/conciliacion/conciliacion-view.tsx`:
   - Pasar `refetch` (ya existe en el hook) al `AssignmentPanel`.

4. `components/playtomic/conciliacion/use-conciliacion-data.ts`:
   - Devolver `assignmentsByBooking: Map<string, AssignmentDetail[]>` además de los bookings — para que el panel pueda renderizar las asignaciones con detalle (waitry_order_id, monto, fecha, note). Fetcher: `playtomic.payment_assignments.select('*').in('booking_id', bookingIds)`.

**Tests:**

- `lib/playtomic/conciliacion.test.ts` ya existe — no requiere cambios para S2-Waitry-write.
- Ojo: server actions del repo no tienen tests unitarios típicamente (verificable con `find app/rdb/*/actions.ts.test.ts` — vacío). Smoke en preview es la validación operativa.

**Decisiones registradas (no preguntar de nuevo):**

- Hard-delete en unassign (no soft-delete — el `UNIQUE(waitry_order_id)` complica soft).
- `assigned_amount` default = `candidate.total_amount` (no `unit_price`). El operador puede ajustar manualmente vía note.
- Audit trail nativo via `assigned_by` + `assigned_at` (ya están en la tabla).

**Decisiones pendientes (resolver al arrancar):**

- ¿Permitir conciliar reservas con `Σ < total`? Mi voto: sí, queda como `partial` y el operador puede agregar nota explicativa. La vista `v_bookings_total_coverage` ya soporta partial.
- ¿Bulk action "Asignar todos los matches con score > X automáticamente"? Mi voto: NO en S2 — empezar con click-por-click, validar el modelo, y solo si vale la pena agregar bulk en S3.

### PRs aún abiertos al hacer este handoff

- [#418](https://github.com/beto-sudo/BSOP/pull/418) — fix: excluir cubiertas + mostrar coverage real. **Listo para mergear.**
- [#419](https://github.com/beto-sudo/BSOP/pull/419) — boost de coaches. **Listo para mergear.**
- [#420](https://github.com/beto-sudo/BSOP/pull/420) — descending fix paliativo. **Cerrar sin mergear** (redundante con #421 ya aplicado).

### Cómo arrancar la sesión nueva

1. _"Vamos a retomar la iniciativa `rdb-pagos-cancha-conciliacion`. Lee `docs/planning/rdb-pagos-cancha-conciliacion.md` y arranca S2-Waitry-write siguiendo el plan."_
2. Crear branch `feat/rdb-conciliacion-s2-waitry-write` desde main.
3. Implementar archivos listados arriba.
4. 4 checks (typecheck + tests + lint + format) antes de push.
5. PR + watch CI + smoke en preview con un caso real (ej. asignar pedido Waitry a una reserva pendiente, verificar que sale del listado).
