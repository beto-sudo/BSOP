# Iniciativa — Cuentas por Cobrar (CxC)

**Slug:** `cxc`
**Empresas:** todas (golden: DILESA; rollout RDB/COAGAN/ANSA en sub-iniciativas posteriores)
**Schemas afectados:** `erp` (nuevas `cxc_cargos`, `cxc_pagos`, `cxc_pago_aplicaciones`; extiende `movimientos_bancarios` con referencia polimórfica), `dilesa` (originación `fn_generar_plan_pagos`; absorbe `venta_pagos`), `core` (helper de roles)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-06-01
**Última actualización:** 2026-06-01 (Sprints 1-3 en prod: backend + fix del FIFO + UI estado de cuenta + captura + comprobante + módulo CxC. Pendiente: estado de cuenta imprimible, recordatorios, limpieza de los $2.0M de saldos a favor, retiro de Coda. Ver Bitácora.)

## Problema

DILESA captura los depósitos de clientes en `dilesa.venta_pagos`
(migrado del módulo Coda "Depositos Clientes": cliente, fecha, monto,
tipo, comprobante, recibo de caja). Eso registra **que entró dinero y de
quién**, pero no modela el adeudo. Hoy **no existe**:

- **Plan de pagos / cargos**: qué debe el cliente y cuándo vence
  (enganche en parcialidades, mensualidades de crédito propio, evento de
  disposición del crédito institucional).
- **Aplicación del abono a cargos específicos**: un depósito solo apunta
  a la venta, no a la mensualidad que cubre. No hay parciales limpios, ni
  saldo a favor, ni anticipos.
- **Saldo y antigüedad** por cliente/venta: el "¿cuánto me debe cada
  quién y cuánto falta para saldo 0?" vive en Coda y en la cabeza del
  operador.
- **Cobranza activa**: vencidos, estados de cuenta, recordatorios.

Toda venta —pague el cliente el enganche, un crédito propio, o lo pague
una institución (INFONAVIT / FOVISSSTE / banco)— genera un adeudo que
hay que rastrear **hasta saldo 0**, sin importar la fuente del pago. Hoy
ese seguimiento no es trazable en BSOP.

Resultado operativo: doble captura entre Coda y la realidad, nula
visibilidad de cobranza a futuro, y un módulo Coda que registra abonos
sueltos sin saldo. El mes que se cae, se cae feo.

## Outcome esperado

- **Cada venta DILESA genera su plan de cargos automáticamente**,
  anclado al **`valor_escrituracion`** de `dilesa.ventas` — el valor
  definitivo por el que se expide la factura (normalmente =
  `precio_asignacion`, pero puede ajustarse por promociones posteriores
  a la asignación) — y desglosado según `enganche_requerido` +
  `tipo_credito`. El operador no teclea mensualidad por mensualidad.
- **Cada depósito se aplica a cargos específicos** (FIFO por default +
  override manual), soportando pagos parciales y saldo a favor.
- **Saldo y aging 100% derivados**, cero captura — se recalculan solos
  (mismo espíritu que los KPIs reactivos de ADR-034).
- **Cobranza activa**: bandeja de vencidos, estado de cuenta imprimible
  por cliente, recordatorios por email con branding por empresa —
  distinguiendo `fuente='cliente'` (se cobra) de `fuente='institucion'`
  (solo visibilidad del adeudo).
- **Cada abono cobrado emite un movimiento bancario** (`referencia_tipo=
'cxc_pago'`), dejando listo el enganche para `conciliacion-bancaria`.
- **CFDI lo sigue generando CONTPAQi**; BSOP solo registra el adeudo/
  abono y **referencia el `uuid_sat`** cuando existe.
- **Recibo de caja imprimible** por abono (reemplaza el PDF de Coda,
  patrón de print ADR-021).
- **El módulo Coda "Depositos Clientes" se retira**; BSOP pasa a ser el
  system-of-record.
- **DILESA golden**; RDB/COAGAN/ANSA replican con la misma maquinaria
  (núcleo genérico + originación por empresa, ADR-037 D5).

## Alcance v1

- [ ] **Sprint 1 — Schema (DB-puro) + ADR-037**:
  - Nueva `erp.cxc_cargos` (documento de adeudo, ADR-037 D1):
    `id`, `empresa_id`, `cliente_id` (FK → `erp.clientes`), `origen_tipo`
    (`'venta_dilesa'` en v1), `origen_id` (uuid → `dilesa.ventas`),
    `tipo_cargo` (`'enganche'|'mensualidad'|'credito'|'contado'|'otro'`),
    `numero` (orden dentro del plan), `concepto`, `monto`,
    `fecha_vencimiento`, `monto_pagado` (numeric default 0, recalculado
    por trigger), `saldo` (generated `monto - COALESCE(monto_pagado,0)`),
    `estado` (CHECK `'pendiente'|'parcial'|'liquidado'|'cancelado'`),
    `fuente_esperada` (`'cliente'|'institucion'`, para gobernar
    cobranza), `notas`, timestamps, `deleted_at`.
  - Nueva `erp.cxc_pagos` (el abono): `id`, `empresa_id`, `cliente_id`
    (denormalizado), `fecha`, `monto_total`, `fuente`
    (`'cliente'|'institucion'`, ADR-037 D6), `forma_pago`
    (efectivo/transferencia/cheque/...), `referencia`,
    `cuenta_bancaria_id` (FK → `erp.cuentas_bancarias`, null hasta
    conocer cuenta), `uuid_sat` (nullable — referencia al CFDI de
    CONTPAQi), `comprobante_adjunto_id`, `notas`, `registrado_por`,
    timestamps, `deleted_at`, `coda_row_id` (para la migración).
  - Nueva `erp.cxc_pago_aplicaciones`: `id`, `empresa_id`, `pago_id`
    (FK), `cargo_id` (FK), `monto_aplicado`, `created_at`. `CHECK Σ
aplicaciones ≤ pago.monto_total` (permite saldo a favor).
  - Extender `erp.movimientos_bancarios`: agregar `referencia_tipo` +
    `referencia_id` (ADR-037 D4). **Esta extensión la entrega CxC y la
    consume CxP.**
  - Trigger: `AFTER INSERT/UPDATE/DELETE ON cxc_pago_aplicaciones`
    recalcula `cargo.monto_pagado` y `cargo.estado` con `SELECT SUM`
    directo (sin recursión, ADR-037 D3).
  - RPCs:
    - `dilesa.fn_generar_plan_pagos(venta_id)` — **originación**: deriva
      los cargos desde `dilesa.ventas`, anclando el total al
      **`valor_escrituracion`** (el valor de la factura; fallback a
      `precio_asignacion` si aún no se define). Idempotente (regenerable
      mientras no haya abonos aplicados). Enganche → **N parcialidades
      con fecha**; crédito propio → mensualidades; crédito institucional
      → evento único `fuente_esperada='institucion'`.
    - `erp.cxc_pago_registrar(...)` — alta de abono + auto-aplicación
      FIFO al cargo abierto más viejo + emite `movimientos_bancarios`
      si trae `cuenta_bancaria_id`.
    - `erp.cxc_pago_aplicar(pago_id, [{cargo_id, monto}])` — override
      manual de la aplicación (reasignar).
    - `erp.cxc_pago_cancelar(pago_id, motivo)`.
    - `erp.cxc_cargo_ajustar(cargo_id, ...)` — descuento/condonación con
      audit.
  - **Migración** de `dilesa.venta_pagos` → `erp.cxc_pagos` (preservar
    `coda_row_id`, `tipo`→`forma_pago`, `fecha`, `monto`, `notas`).
  - **Backfill**: generar planes de cargos para ventas activas + aplicar
    los pagos históricos FIFO para reconstruir saldos.
  - RLS canónica (`core.fn_has_empresa OR core.fn_is_admin`) + escritura
    a `audit_log` en cada transición.
  - **Regenerar `SCHEMA_REF.md` + `types/supabase.ts`** y commitear.

- [ ] **Sprint 2 — Plan de pagos + captura de abono (DILESA, en el detalle de venta)**:
  - Sección "Estado de cuenta" en el detalle de `dilesa.ventas`: cargos
    con vencimiento, abonos aplicados, saldo corriente, badge de estado.
  - Generar/regenerar plan desde los términos de la venta.
  - Captura de abono inline (reemplaza el form de Coda): cliente, fecha,
    monto, `fuente`, forma de pago, comprobante. Auto-aplicación FIFO
    visible + override manual.
  - Recibo de caja imprimible por abono (ADR-021).

- [ ] **Sprint 3 — Módulo Cobranza + aging (DILESA)**:
  - `/dilesa/cobranza` con sub-rutas (ADR-005 + sub-slugs ADR-030):
    - `estado` — antigüedad por cliente/venta con buckets (vigente /
      1-30 / 31-60 / 61-90 / >90), filtros (`useUrlFilters`).
    - `cargos` — todos los cargos, filtro de vencidos.
    - `abonos` — todos los abonos (la vista "Resumen/Consulta" del Coda).
  - Estado de cuenta PDF por cliente.
  - RBAC: slug `dilesa.cobranza` + sub-slugs + backfill defensivo (regla
    "Liberación de módulo nuevo" del `CLAUDE.md` del repo).

- [ ] **Sprint 4 — Recordatorios + forecast + gancho de conciliación**:
  - Recordatorios de vencimiento por email (catálogo `notificaciones` +
    branding `lib/juntas/email.ts`), **solo `fuente='cliente'`**.
  - Forecast de cobranza (lo que entra por fecha — el inverso del
    calendario de pagos de CxP).
  - Confirmar emisión de `movimientos_bancarios` al cobrar (engancha con
    `conciliacion-bancaria`).

- [ ] **Sprint 5 — Retiro de Coda + closeout**:
  - Validar paridad con Coda, smoke E2E, cutover (pausar Coda).
  - Barrido de Reminders + actualizar planning + INITIATIVES.

## Fuera de alcance v1

- **Interés moratorio** sobre cargos vencidos: **V2** (decisión de
  Beto). Común en venta a plazos; se modela como cargo derivado cuando
  se aborde.
- **Generación de CFDI de ingreso + complemento de pago PPD** desde
  BSOP: CONTPAQi lo genera; BSOP referencia el `uuid_sat`. Sacar la
  facturación a BSOP = sub-iniciativa futura (Beto: "lo sacaremos de
  BSOP, pero por ahorita seguimos con CONTPAQi").
- **Conciliación bancaria completa**: iniciativa hermana
  [`conciliacion-bancaria`](conciliacion-bancaria.md). CxC **solo emite**
  el movimiento bancario; el casamiento contra estado de cuenta vive
  allá.
- **Rollout ANSA / RDB / COAGAN**: la maquinaria queda genérica desde
  Sprint 1, pero la originación y la UI por empresa entran como
  sub-iniciativas (ANSA autos+taller+CFDI, RDB membresías recurrentes,
  COAGAN cosecha net-30).
- **Cobranza activa a instituciones** (INFONAVIT/FOVISSSTE): v1 solo da
  **visibilidad** del adeudo institucional, no gestión de cobranza.
- **Multi-moneda**: MXN asumido en v1.

## Métricas de éxito

- **Saldo correcto**: para toda venta DILESA activa, `Σ
cxc_cargos.saldo = precio − Σ aplicaciones`, y la suma de buckets de
  aging = `Σ saldos por cliente`.
- **Migración sin pérdida**: `count(dilesa.venta_pagos)` previo =
  `count(erp.cxc_pagos WHERE coda_row_id IS NOT NULL)`.
- **Captura ágil**: registrar un abono toma ≤ lo que toma hoy en Coda.
- **Estado de cuenta confiable**: en muestra de 10 clientes, el saldo de
  BSOP coincide con el cálculo manual.
- **Gancho de tesorería**: 100% de los abonos con `cuenta_bancaria_id`
  tienen su `movimientos_bancarios` emitido (listo para conciliar).
- **Coda retirado** sin pérdida operativa tras Sprint 5.

## Riesgos / preguntas abiertas

- [ ] **Disposición del crédito institucional**: el abono es un evento
      único al escriturar. ¿Cómo se entera BSOP? Captura manual en v1;
      integración con RUV/banco = futuro (cruza con `dilesa-ruv`).
- [ ] **Legacy `erp.cobranza` / `erp.pagos` / `erp.ventas_inmobiliarias`**:
      ¿tienen datos vivos? Si sí, migrar a `cxc_*`; si no, deprecar.
      Sprint 1 audita. Beto ya decidió que el modelo activo es
      `dilesa.*`, no el legacy.
- [ ] **Backfill FIFO**: los `venta_pagos` de Coda no dicen a qué
      mensualidad aplican. FIFO es la heurística; documentar y permitir
      reasignación manual post-backfill.
- [ ] **`erp.clientes` ↔ `erp.personas`**: confirmar el link para no
      duplicar identidades (los 1,300 clientes DILESA ya importados).

## Sprints / hitos

| #   | Scope                                                                                                                                                                                                                                    | Estado    | PR  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --- |
| 0   | Promoción: este doc + ADR-037 + esbozo `conciliacion-bancaria` + re-sync `cxp` + fila en INITIATIVES.md                                                                                                                                  | _este PR_ | —   |
| 1   | DB: 3 tablas `cxc_*` + ref polimórfica en `movimientos_bancarios` + trigger de saldo + RPCs (`fn_generar_plan_pagos`, `registrar/aplicar/cancelar`, `cargo_ajustar`) + migrar `venta_pagos` + backfill FIFO + RLS + regenerar SCHEMA_REF | pending   | —   |
| 2   | UI plan de pagos + estado de cuenta + captura de abono en el detalle de venta DILESA + recibo de caja                                                                                                                                    | pending   | —   |
| 3   | Módulo `/dilesa/cobranza` (estado/cargos/abonos) + aging por buckets + RBAC sub-slugs + estado de cuenta PDF                                                                                                                             | pending   | —   |
| 4   | Recordatorios de vencimiento (solo cliente) + forecast de cobranza + confirmar emisión de movimiento bancario                                                                                                                            | pending   | —   |
| 5   | Retiro de Coda "Depositos Clientes" + smoke E2E + cutover + closeout                                                                                                                                                                     | pending   | —   |

## Decisiones registradas

### 2026-06-01 — Cierre de preguntas finas (pre-Sprint 1)

- **Enganche = N parcialidades con fecha** (no monto único abonable
  libre). El plan de enganche es una serie de cargos con vencimiento;
  crédito propio = mensualidades; crédito institucional = evento único.
- **Ancla del cargo total = `valor_escrituracion`** (no
  `precio_asignacion`). Es el valor definitivo por el que se expide la
  factura. Normalmente coincide con `precio_asignacion`, pero puede
  ajustarse por promociones definidas después de la asignación. La RPC
  de originación usa `precio_asignacion` como fallback solo si la
  escrituración aún no está definida, y **regenera el plan** si el valor
  cambia antes de haber abonos aplicados.
- **CxC y CxP avanzan en paralelo** (no CxC primero). Ambas arrancan
  Sprint 1 a la vez; CxC entrega el foundation compartido (extensión
  polimórfica de `movimientos_bancarios` + patrón de subledger ADR-037)
  que CxP reusa.

### 2026-06-01 — Decisiones cerradas por Beto al promover la iniciativa

- **System-of-record = modelo activo `dilesa.*`** (`ventas` /
  `venta_pagos` / `unidades`, con 1,425 ventas y 1,300 clientes ya
  importados). Se jubila el legacy `erp.cobranza` / `erp.pagos` /
  `erp.ventas_inmobiliarias` (la maquinaria genérica vive en `erp.cxc_*`,
  no en esas tablas tempranas).
- **CxC y CxP son gemelas, diseñadas juntas.** Mismo patrón de subledger
  codificado en **ADR-037** (documento → pago → aplicación → saldo →
  aging → movimiento bancario). Se comparten componentes UI y la
  emisión de movimiento bancario.
- **Golden = DILESA**, por el dolor real + datos + el módulo Coda a
  retirar. RDB/COAGAN/ANSA después como sub-iniciativas.
- **Interés moratorio diferido a V2.**
- **CFDI lo sigue generando CONTPAQi**; BSOP registra adeudo/abono y
  referencia el `uuid_sat`. Sacar la facturación a BSOP = follow-up.
- **Todas las ventas generan CxC hasta saldo 0**, sin importar quién
  pague. Cada abono lleva `fuente` (`cliente` | `institucion`): a
  cliente se le cobra (recordatorios, estado de cuenta); a institución
  (INFONAVIT/FOVISSSTE/banco) es solo visibilidad del adeudo.
- **Conciliación bancaria = 3er vértice del triángulo de tesorería**
  (CxC ingresos / CxP egresos / banco realidad). Se construye **encima**
  de `erp.movimientos_bancarios` (ya existe con flag `conciliado`); CxC
  solo emite el movimiento. Iniciativa hermana `conciliacion-bancaria`
  queda `proposed` hasta que CxC+CxP emitan movimientos.

## Bitácora

### 2026-06-01 — Sprint 2 (UI) + fix del cálculo + Sprint 3 (módulo CxC)

Mismo día que Sprint 1, en modo autónomo. Continuación:

- **Fix del FIFO (#619)**: el FIFO separaba cargos/abonos por fuente
  (cliente/institución), produciendo saldo pendiente + saldo a favor
  grandes coexistiendo (el cliente liquidaba el enganche chico y el resto
  quedaba "a favor", mientras la disposición institucional quedaba
  pendiente). Corregido: un abono baja el **saldo total** de la venta (la
  fuente es etiqueta, no barrera del cálculo). Redefine `cxc_pago_registrar`
  - `fn_backfill_cxc` + re-backfill. El saldo a favor global cayó de
    **$69.8M a $2.0M** (sobrepagos reales).
- **Sprint 2 — UI estado de cuenta + captura**:
  - #616: sección "Estado de cuenta" en el detalle de venta (cargos +
    abonos + saldo, read-only), reemplaza la vieja sección Pagos.
  - #620: captura de abono (`<AbonoCaptureDrawer>` → `cxc_pago_registrar`)
    - upload de comprobante (deferred ADR-022, `entidad_tipo='cxc_pago'`)
    - columna comprobante en la tabla de abonos.
- **Sprint 3 — módulo CxC dedicado (#621)**:
  - Módulo `dilesa.cobranza` (nombre visible **"CxC"**, sección
    **Administración**) + sub-slugs `pagos`/`aging` + RBAC (Admin/Contab/
    Dirección capturan; Gerencia Ventas/Vendedor lectura). Slug/URL
    internos quedaron `cobranza` por decisión de no romper rutas.
  - `/dilesa/cobranza` (tab Pagos): captura desde administración (buscar
    cliente → registrar abono, reusa el drawer).
  - `/dilesa/cobranza/aging` (tab Saldos): antigüedad por cliente con
    buckets (vigente / 1-30 / 31-60 / 61-90 / >90).

**Pendiente (próxima sesión):** estado de cuenta imprimible por cliente
(ADR-021) + recordatorios de vencimiento (catálogo `notificaciones`, solo
`fuente=cliente`) + **limpieza de los $2.0M de saldos a favor reales**
(reclasificar fuentes dudosas, revisar enganches mal capturados) + retiro
de Coda "Depositos Clientes" + términos del enganche capturables en la UI
de la venta (hoy default 1 parcialidad). CxP (gemela) sigue `planned`.

### 2026-06-01 — Sprint 1 completo (schema + originación + RPCs + backfill)

Ejecutado en modo autónomo (Beto autorizó), 4 PRs aplicados a prod:

- **PR A1** (#609, mig `20260601152629`): foundation — `movimientos_bancarios`
  +referencia polimórfica + 3 tablas `cxc_*` + trigger de saldo + RLS.
- **PR A2** (#610, mig `20260601155951`): términos del enganche en
  `dilesa.ventas` (3 cols) + RPC `fn_generar_plan_pagos`. Validado: Σ
  cargos = `valor_escrituracion` exacto.
- **PR A3** (#612, mig `20260601164158`): RPCs de pago
  (`cxc_pago_registrar` con FIFO + movimiento bancario, `_aplicar`,
  `_cancelar`, `cxc_cargo_ajustar`) + `cxc_pagos.origen_id`. Validado
  E2E: parcial→liquidado, FIFO no sobre-aplica, cancelar revierte.
- **PR A4** (mig `20260601170826`): `fn_backfill_cxc()`. Ejecutado sobre
  prod: **1,179 planes generados, 989 abonos migrados, 930 aplicaciones,
  $293.7M cobrado**. (Migración requirió 3 fixes pre-ejecución: 2
  colisiones alias/variable `vp`, CHECK de `forma_pago`, skip de monto
  ≤ 0; resueltas vía `migration repair` + re-push, sin datos sucios.)

**Hallazgo abierto para la próxima sesión (limpieza de datos):** el
backfill dejó **$69.8M en saldos a favor** (508 pagos): $34M institución
(222 pagos) + $36M cliente (286). Causa raíz = desajuste Coda↔modelo, NO
bug del FIFO (validado E2E). El grueso institucional viene de pagos
clasificados `institucion` que caen en ventas sin cargo de disposición
que cubrir (enganche ≥ valor, o disposición chica) → quedan sin aplicar.
Los abonos cliente que exceden el `enganche_requerido` capturado también
generan saldo a favor. **Acción pendiente:** sesión de revisión/limpieza
— reclasificar fuentes dudosas, revisar enganches mal capturados, decidir
si el excedente cliente reduce la disposición o queda como crédito. El
backfill es idempotente (`coda_row_id`) y re-ejecutable tras limpiar.

**Pendiente de Sprint 2+:** UI (estado de cuenta en el detalle de venta,
módulo `/dilesa/cobranza`, captura de abono, recibo de caja), recordatorios,
forecast, retiro de Coda. Ver Alcance v1.
