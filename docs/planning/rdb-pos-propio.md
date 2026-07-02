# Iniciativa — POS propio de RDB (reemplazo de Waitry)

**Slug:** `rdb-pos-propio`
**Empresas:** RDB
**Schemas afectados:** `rdb` (nuevas `pos_cuentas`, `pos_rondas`, `pos_items`, `pos_pagos`, `pos_estaciones`, `pos_eventos`; vista canónica `v_ventas_canonicas`; sub-slugs RBAC `rdb.pos.*` en `core.modulos`/`core.permisos_rol`). `erp` (escritura en `movimientos_inventario` vía trigger espejo; lectura/escritura `cortes_caja`/`cortes_vouchers`). Post-cutover: `rdb.waitry_*` queda histórico read-only y el edge function `waitry-webhook` (incl. espejo a Coda) se apaga.
**Estado:** in_progress
**Próximo hito:** Beto revisa el preview de S2 (captura + KDS + admin) y mergea; luego alta de estaciones/PINs y práctica con la hostess (S3)
**Dueño:** Beto
**Creada:** 2026-07-02
**Última actualización:** 2026-07-02 (S2 en PR: módulo /rdb/pos — captura, KDS, admin)

> **Sucede a** la saga Waitry: [`rdb-waitry-ingesta-dedup`](rdb-waitry-ingesta-dedup.md),
> [`rdb-waitry-deduplicacion`](rdb-waitry-deduplicacion.md),
> [`rdb-waitry-fantasmas-tardios`](rdb-waitry-fantasmas-tardios.md),
> [`rdb-waitry-catalog-sync`](rdb-waitry-catalog-sync.md) y
> [`rdb-waitry-autoalta-productos`](rdb-waitry-autoalta-productos.md) (todas cerradas).
> ADRs de contexto: 005/006/008 (supabase/adr), 031/035/036 (docs/adr).

## Problema

Waitry, el POS SaaS del club, genera pedidos fantasma: reabre pedidos ya
cerrados y, al re-cerrarlos la cajera de buena fe, crea `orderId`+`paymentId`
nuevos con el mismo contenido — indistinguibles desde afuera de una venta
legítima repetida. **Waitry confirmó que no va a corregirlo.** No ofrece API
real (solo webhooks). Cuatro iniciativas de deduplicación recorrieron el
trade-off completo de heurísticas (ventana 3 min → 15 min → 48 h; hash por
contenido → tableId → external_delivery_id): el problema es estructural — la
información para distinguir fantasma de venta real no existe en el dato
recibido. Además obliga a doble configuración de productos (Waitry + BSOP).

El club registra **todas** sus ventas por Waitry (restaurante/bar, rentas de
cancha, clínica, gym, torneos), así que la falta de confianza en el dato
contamina cortes, inventario y toda la reportería de RDB.

## Outcome

Las ventas de RDB nacen en BSOP: un solo ID por pedido, cero webhooks, cero
deduplicación, una sola configuración de productos. Captura de mostrador y
meseros + KDS de cocina + pagos registrados + cortes, conectado nativo al
inventario por receta y a los cortes de caja existentes. Waitry cancelado.

## Alcance — regla brutal de v1

Construimos **captura + KDS + pagos registrados + cortes**. Explícitamente
FUERA de v1: QR ordering, CFDI, terminal bancaria integrada, motor de
promociones/precios por horario, delivery, loyalty, modo offline real.
Si el alcance se abre, deja de ser una ventaja y se vuelve otro POS a medio
hacer.

### Dentro de v1

- Catálogo completo del club (no solo cocina): F&B, rentas de cancha,
  clínica, gym, torneos. Flag por producto/categoría **"va a cocina"** — solo
  esos aparecen en el KDS.
- Captura mostrador (Tiendita, hostess): táctil sin modales, pay-as-you-go.
- Cuentas abiertas por mesa/cancha con rondas (meseros con tablets) — post
  piloto de mostrador.
- KDS: pantalla realtime en cocina con ACK obligatorio y fallback a polling.
- Pagos: efectivo, tarjeta (terminal standalone + voucher/OCR como hoy),
  mixto, cortesía. Campo de propina en el pago (prompt siempre en tarjeta).
- Consumo de empleados: venta tipo "empleado" con descuento configurable.
- Corte de caja: mismas `erp.cortes_caja`/`cortes_vouchers`; el gate de
  cierre con tarjeta-sin-voucher (#1149) sigue vigente.
- Inventario: descuento por evento de línea vía trigger espejo del motor de
  recetas/conversión (`lib/unidades.ts`), con reversa en cancelación.
- Auditoría y anti-fraude base (ver Decisiones).

## Decisiones registradas

- **2026-07-02 — Tablas nuevas `rdb.pos_*`, no generalizar `waitry_*`.**
  Waitry es un pipeline de ingesta webhook con semántica propia (dedup,
  superseded, external ids); el POS nativo es transaccional. Cada venta vive
  en UNA tabla. Waitry queda histórico read-only; no se migra.
- **2026-07-02 — Vista canónica `rdb.v_ventas_canonicas`** con columna
  `source` (`waitry`|`pos`) une histórico + nuevo. **Nadie lee tablas
  crudas**: `/rdb/ventas`, `/rdb/home` y la conciliación Playtomic migran a
  la vista. El comparativo semanal señala visualmente la frontera del
  cutover.
- **2026-07-02 — KDS sale junto con la captura (S2), no después.** La cocina
  opera por monitor hoy; captura sin KDS no es operación completa.
- **2026-07-02 — Piloto por estación, no paralelo-total.** Doble captura
  cansa al staff y produce datos malos. Tiendita pasa al POS (práctica sin
  impacto → cutover de mostrador); canchas siguen en Waitry con su corte por
  fuente. Waitry es rollback listo, no captura paralela.
- **2026-07-02 — Identidad: dispositivo + PIN de operador.** La tablet se
  autentica como estación (cuenta de dispositivo con permisos mínimos); cada
  acción lleva PIN corto de empleado para atribución real en el audit trail.
  El PIN identifica al operador de turno, no sustituye auth de admin.
- **2026-07-02 — Anti-fraude base v1:** eventos append-only vía RPC
  (`pos_eventos`), pagos inmutables (corregir = reversa), items enviados a
  cocina no se editan (void + relíneo), cancelar lo ya cobrado es reembolso
  explícito, descuento sobre umbral pide PIN de autorización + razón,
  reapertura de cuenta cerrada bloqueada (se crea una nueva ligada).
- **2026-07-02 — Idempotencia por `client_action_id`** único por tap: el
  doble-tap (origen de la saga Waitry) muere por diseño, no por heurística.
- **2026-07-02 — Precio congelado al capturar** (snapshot de nombre, precio,
  categoría y receta en el item); cambio de catálogo no altera cuentas
  abiertas.
- **2026-07-02 — Propina** (Beto): campo en el pago; prompt siempre al
  cobrar con tarjeta (puede ser $0), opcional en efectivo. No toca
  inventario; el corte la desglosa.
- **2026-07-02 — Promociones** (Beto): existen pero no por horario. Combos y
  cubetas = productos con precio propio; descuento manual pasa por
  autorización. Sin motor de precios.
- **2026-07-02 — Consumo de empleados** (Beto): se captura como venta con
  tipo "empleado" y descuento configurable; queda quién consumió y quién
  autorizó.
- **2026-07-02 — Espejo a Coda** (Beto): ya no es necesario; muere con el
  cutover junto con el webhook.
- **2026-07-02 — Respaldo de internet** (Beto): WAN2 Telcel ya activa como
  respaldo; el enlace desde casa queda como redundancia futura. Deja de ser
  bloqueador de cutover.
- **2026-07-02 — El POS no toca PAN** de tarjetas: terminal standalone,
  voucher fotografiado + OCR, como hoy.

## Plan de sprints

| #   | Entregable                                                                                                                                                      | Gate                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| S0  | Spec operativa cerrada + ADR del modelo POS + slugs RBAC `rdb.pos.*` definidos                                                                                  | —                                                         |
| S1  | Schema `pos_*` + RPCs transaccionales idempotentes + trigger inventario con reversa + vista canónica + RLS (set-membership + InitPlan) + tests SQL              | PR de migración separado (norma del repo)                 |
| S2  | Captura Tiendita (UI táctil sin modales; efectivo/tarjeta/mixto/cortesía contra corte activo; PIN operador; propina) + KDS mínimo con ACK + fallback polling    | Demo end-to-end en preview                                |
| S3  | Piloto Tiendita: práctica 3-5 días sin impacto → cutover de mostrador; canchas siguen en Waitry                                                                 | Corte de Tiendita cuadra N días seguidos sin intervención |
| S4  | Cuentas abiertas simples + tablets de meseros con PIN (canchas)                                                                                                 | Solo con S3 verde                                         |
| S5  | Robustez: transferir/juntar cuentas, dividir pago, devoluciones                                                                                                 | Según lo exija la operación                               |
| S6  | Cutover total + export final de Waitry + apagar webhook/Coda + migrar conciliación Playtomic a la vista canónica + cancelar contrato (30 días estables después) | Autorización de Beto                                      |

## Riesgos y mitigaciones

1. **KDS pierde o retrasa comandas** → insert en DB antes de mostrar éxito;
   ACK obligatorio de cocina con alerta sonora; polling fallback 5-10 s
   además de Realtime; contador de pendientes visible.
2. **Descuadres de caja** → pagos solo por RPC transaccional con `corte_id`
   al momento del cobro; totales server-side; cierre bloqueado con cuentas
   abiertas relevantes o tarjeta sin voucher.
3. **Auditoría falsa en tablets compartidas** → dispositivo + PIN por acción;
   eventos append-only con `device_id`, `actor`, `corte_id`.
4. **Inventario distorsionado** → stock por evento de línea (no heurística
   posterior); cancelación pre-preparación reversa, post-preparación queda
   como merma/cortesía auditada; RLS con InitPlan wrap (historial de
   timeouts en `rdb`).
5. **Adopción bajo presión** (73% del volumen 19-23 h) → UI sin modales,
   agregar item < 1 s, restauración de sesión si la tablet se duerme,
   práctica sin impacto antes del cutover.
6. **Dependencia de internet** → red UniFi + Starlink con WAN2 Telcel de
   respaldo; modo degradado explícito (si cae todo: papel + captura
   posterior, runbook en S3).
7. **Soporte post-cutover** → el POS es código propio: bugs críticos de
   venta los atiende CC como P0; runbook de rollback a Waitry vigente
   mientras el contrato siga activo (mensual).

## Métricas de éxito

- Corte de Tiendita cuadra sin intervención manual durante el piloto
  (criterio de cutover: N días consecutivos, N a definir en S3 con Beto).
- Cero pares en detectores de duplicados post-cutover (dejan de tener
  materia prima).
- Configuración de producto en un solo lugar (BSOP).
- Tiempo de captura por item ≤ Waitry (validado con la hostess).
- Contrato Waitry cancelado (ahorro mensual + fin de la dependencia).

## Bitácora

- **2026-07-02** — **S2** (PR abierto, UI sin auto-merge): módulo `/rdb/pos`
  con routed tabs — Captura (catálogo táctil por categoría, carrito, cuentas
  abiertas, PIN por acción, cobro efectivo/tarjeta/mixto con propina y
  cambio, void/merma), Cocina (KDS realtime + polling fallback 5 s + alerta
  sonora + ACK listo/entregado) y Admin (estaciones y operadores/PIN,
  solo-admin). Migración `20260702192331`: módulos RBAC `rdb.pos` +
  sub-slugs con backfill (captura/kds a los 7 roles RDB; admin sin backfill)
  - RPCs `fn_pos_admin_*`. Checklist ADR-014/030 completo (NAV_ITEMS,
    ROUTE_TO_MODULE, HUB_PARENT_BY_ROUTE, EXPECTED_DB_MODULE_SLUGS,
    MODULE_DEPS).
- **2026-07-02** — **S1**: migración `20260702182440_rdb_pos_schema` — 7
  tablas `pos_*`, guards de estado, trigger de inventario espejo
  (`erp.fn_trg_pos_to_movimientos`), 8 RPCs idempotentes, vista
  `v_ventas_canonicas`, RLS InitPlan y realtime para KDS. Smoke test SQL
  end-to-end (13 bloques) en `supabase/tests/pos_smoke_test.sql`, verificado
  contra shadow: PIN, doble-tap idempotente, receta 2×355 ml → 2 botellas,
  cobro mixto con propina/cambio, inmutabilidad, merma con autorizador,
  auditoría atribuida. Ajuste vs ADR-056: umbral de descuento con autorizador
  queda en 15% (hardcode v1; configurable después si hace falta).

- **2026-07-02** — **S0 cerrado**: [ADR-056](../adr/056_rdb_pos_modelo.md)
  fija el modelo técnico (tablas `pos_*`, máquinas de estados, RPCs con
  `client_action_id`, identidad dispositivo+PIN, inventario por evento de
  línea, vista canónica, RLS/RBAC con slugs `rdb.pos`/`.captura`/`.kds`/`.admin`).
  Índice de ARCHITECTURE.md §5 actualizado. Próximo: S1 (migración).
- **2026-07-02** — Promoción (PR #1189). Evaluación pre-promoción con 6 revisores
  independientes (5 agentes: arquitectura de datos, UX operativa,
  seguridad/anti-fraude, rollout/piloto, completitud; + codex/gpt-5.5 como
  arquitecto externo). Consenso: build correcto con alcance brutal; KDS se
  adelanta a S2; piloto por estación en vez de paralelo-total; cuentas
  abiertas post-piloto; identidad dispositivo+PIN; hallazgos únicos
  (RBAC faltante, espejo Coda, transición de conciliación Playtomic, export
  final Waitry) incorporados al plan. Decisiones operativas cerradas con
  Beto (propina, promos, empleados, catálogo completo, Coda, respaldo WAN2).
