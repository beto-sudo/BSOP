# Iniciativa — Cuentas por Cobrar (CxC)

**Slug:** `cxc`
**Empresas:** todas (golden: DILESA; rollout RDB/COAGAN/ANSA en sub-iniciativas posteriores)
**Schemas afectados:** `erp` (nuevas `cxc_cargos`, `cxc_pagos`, `cxc_pago_aplicaciones`; extiende `movimientos_bancarios` con referencia polimórfica), `dilesa` (originación `fn_generar_plan_pagos`; absorbe `venta_pagos`), `core` (helper de roles)
**Estado:** in_progress
**Próximo hito:** Aplicar la migración de limpieza de saldos a favor (`20260628190355`, requiere `finanzas-ok` de Beto) + retiro del módulo Coda "Depositos Clientes" → cierre v1. Sprint 4 (recordatorios de vencimiento + forecast) **descopeado** a follow-up proposed (`dilesa-cobranza-recordatorios`).
**Dueño:** Beto
**Creada:** 2026-06-01
**Última actualización:** 2026-06-28 (cierre v1: Ahumada ✅ resuelto en prod; migración de limpieza de los $2.0M de saldos a favor de Coda — 186 pagos / 185 ventas / $2,015,311.81, todas terminada, corregidas a $0 como artefacto de captura; Sprint 4 descopeado a follow-up)

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

### 2026-06-28 — Cierre v1: limpieza de saldos a favor de Coda como artefacto + descope de Sprint 4

Beto en chat, tras la radiografía de prod (read-only):

- **Ahumada ya está resuelto** — Contabilidad registró los 2 abonos; ambos
  cargos liquidados, saldo $0 (enganche $9,200 + disposición Infonavit
  $930,800). El pendiente operativo del "Próximo hito" desaparece.
- **Saldos a favor = artefacto de captura de Coda, se corrigen (todo).**
  Radiografía 2026-06-28: **186 pagos / 185 ventas / $2,015,311.81** de saldo
  a favor, **todas `terminada`**, **todas de origen Coda** ($1.94M institución
  - $73.6K cliente). Ninguna es cartera viva. Regla aprobada: reducir cada
    abono de Coda a lo realmente aplicado (saldo a favor → $0). NO mueve dinero
    (no es CFDI ni movimiento bancario): corrige el monto sobre-capturado del
    depósito. Mismo espíritu que el LIQ-HIST. Migración `20260628190355`
    data-only, self-verificante, idempotente, con rastro en `core.audit_log` +
    `notas`. Se aplica con `finanzas-ok` de Beto.
- **EXCLUIDOS del barrido masivo**: 3 pagos nativos BSOP ($64,341.01, incl.
  Nancy Villarreal $33,076) → conciliación individual; LIQ-HIST sintéticos
  (sin saldo a favor); cualquier venta no-terminada.
- **Sprint 4 (recordatorios de vencimiento + forecast) se descopa** a una
  sub-iniciativa follow-up `proposed` (`dilesa-cobranza-recordatorios`). CxC
  v1 cierra con: schema + UI + módulo Cobranza + aging + printables (Sprints
  1-3, en prod) + limpieza de datos + retiro de Coda.

### 2026-06-12 — El XML del recibo manda; F12 manual solo Dirección; FIFO sin fuente es canon

Del caso Ahumada Castillo (F12 cerrada a mano sin abono en CxC) y la
mejora pedida por Beto en chat:

- **El recibo de caja (CFDI de CONTPAQi) se sube en XML al registrar el
  abono y los datos se EXTRAEN del XML** (fecha, monto, forma de pago,
  referencia, `uuid_sat`) en lugar de capturarse a mano. Verificación
  del receptor contra el cliente de la venta: RFC (fuerte) con fallback
  a nombre normalizado; emisor vs RFC de la empresa como warning.
- **Mismatch de receptor ≠ bloqueo**: con coacreditados el recibo puede
  venir a nombre del cónyuge → alerta + confirmación explícita del
  operador, que queda en `notas` del pago y en `metadata` del adjunto.
- **XML opcional** (no bloquea registrar el abono el día que cae el
  depósito; el recibo a veces se emite después). El estado de cuenta
  marca cada abono "XML ✓ …folio" o "sin XML" para perseguir el faltante.
- **Folio fiscal único**: unique parcial sobre `(empresa_id, uuid_sat)`
  vivos — un recibo no se registra dos veces.
- **La pantalla F12 deja de capturar para el equipo**: queda como guía
  con botón directo a "Registrar abono" (`?abono=1`). El form manual es
  cierre de emergencia EXCLUSIVO de Dirección/admin con advertencia de
  que no registra el dinero. Razón: el slot de imagen en la fase hacía
  creer que el depósito quedaba registrado (2 casos en 2 días).
- **FIFO sin fuente se restaura como decisión vigente**: el fix
  `20260601201000` pisó por accidente a `20260601180854`; con el filtro
  por fuente, el enganche exentado (el crédito lo cubre — práctica
  frecuente de DILESA confirmada por Beto) dejaba cargo de enganche
  pendiente eterno + saldo a favor fantasma del mismo monto.

### 2026-06-11 — El bucket "cerrada" por fase tiene falso positivo en ventas recientes; reversión acotada por fecha de escritura

Beto detectó un abono fantasma de $1,622 (12-may) en la venta de Josue
Daniel Cruz Valverde (M10-L23-LDLE-ISC, fase Detonada, escritura
2026-05-12): era el LIQ-HIST de la liquidación histórica. Causa: el
bucket clasificó "cerrada = ya cobrada en la realidad" por fase
(`Escriturada/Detonada/Facturada/...`) sin piso de fecha hacia el
presente, pero las ventas con escritura reciente siguen cobrando — el
pago institucional llega semanas después de escriturar (en esta misma
venta el Infonavit real entró el 1-jun) y los residuos de cliente se
cobran al final. Regla de corrección: revertir LIQ-HIST donde
`fecha_escritura >= 2026-03-01` y monto > 0 (31 ventas / 44 pagos /
$10,485,164.71, de los cuales $9.86M son escrituras may–jun con pago
institucional sintético que tapaba cobranza Infonavit en tránsito).
Migración `20260611182924_cxc_revert_liq_hist_ventas_en_flujo.sql`
data-only, self-verificante e idempotente — **se aplica solo con OK
explícito de Beto** (cambio financiero).

### 2026-06-11 — Captura del recibo de caja: paridad con las 2 columnas de Coda

El import de Coda sí trajo las dos columnas de "Depositos Clientes"
(`Comprobante Deposito` → adjunto rol `comprobante_deposito`, 753 filas;
`PDF Recibo de Caja` → rol `recibo_caja`, 747 filas) colgadas del
`cxc_pago`, y el estado de cuenta las muestra; pero la captura nativa
solo subía un archivo con rol `comprobante` (rol sin datos en prod) y no
había forma de adjuntar el recibo/factura DESPUÉS del registro — que es
el flujo real de CxC. Como la cuadratura deriva "Valor Facturado" de
`tieneRecibo` (rol `recibo_caja`), los abonos nativos jamás sumaban.
Cierre: slot opcional "Recibo de caja / factura" en
`<AbonoCaptureDrawer>` + el rol del comprobante alineado a
`comprobante_deposito` + botón "Subir recibo" por fila de abono en el
estado de cuenta del detalle de venta.

### 2026-06-10 — Beto aprueba la liquidación histórica de los 3 buckets

Tras revisar el CSV de 948 ventas (`cxc_saldos_revision_2026-06-10.csv`),
Beto decidió en chat: _"Hay que borrar los 3 bloques y dejar solo lo que
está en proceso"_. Regla ejecutable: desasignadas (53) → cancelar cargos;
cerradas pre-Coda (646) y era-Coda (180) → abono sintético `LIQ-HIST` por
fuente con fecha = `fecha_escritura` (sentinela 2023-12-31 si NULL), sin
movimiento bancario; en_proceso (69) → intacto. Sobre las desasignadas se
verificó antes que ninguna unidad tiene otra venta activa (ni directa ni
por lote duplicado) — el adeudo no es transferible; son clientes caídos o
reubicados cuya fase "Entregada" venía heredada del lote en Coda.

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

### 2026-06-28 — Cierre v1: Ahumada resuelto + limpieza de $2.0M de saldos a favor + descope Sprint 4

Sesión de destrabe pedida por Beto ("no sé qué falta, ayúdame a cerrarla").
Radiografía de prod (read-only) que actualiza el diagnóstico viejo del doc:

- **Ahumada — ✅ resuelto.** La venta (JESUS SANTIAGO AHUMADA **Carrillo**, el
  doc decía "Castillo" por error) está detonada (10-jun, $940,000) y en
  "Preparada para Entrega"; sus 2 cargos liquidados, saldo $0. Contabilidad
  ya registró los abonos. Pendiente cerrado.
- **Saldos a favor — caracterizados y migración lista (sin aplicar).** Medición
  actual: **188 ventas / $2,079,652.82** total. Desglose: $1.94M institución +
  $73.6K cliente de **origen Coda** en ventas **terminada** (artefacto), +
  $64.3K en **3 pagos nativos BSOP** (revisión individual, excluidos). Se
  descartó la hipótesis "doble enganche" del doc (0 casos donde favor =
  enganche). Migración `20260628190355_cxc_limpieza_saldos_favor_coda.sql`:
  congela el set 186 pagos / 185 ventas / $2,015,311.81, lo verifica contra lo
  aprobado y reduce cada abono a lo aplicado; rastro en `core.audit_log` +
  `notas`. Sin tocar aplicaciones/cargos → ningún trigger de saldo se dispara;
  el de comprobante (`AFTER UPDATE OF comprobante_adjunto_id`) tampoco.
  **Construida en este PR; se aplica con `finanzas-ok` de Beto** (crea/edita
  datos financieros).
- **Sprint 4 descopeado** a follow-up `proposed`; v1 cierra tras aplicar la
  migración + retirar Coda. Ver Decisiones registradas 2026-06-28.
- **Fix de aplicación (mismo día):** el primer `db push` (#1124) abortó por
  `cxc_pagos_monto_total_check` (`monto_total > 0`): 3 de los 186 pagos son
  **fantasma** (aplicaron $0, monto = puro saldo a favor, $34,757.10) y no
  pueden ir a `monto_total = 0`. La transacción hizo rollback completo —
  **prod quedó intacta** (0 filas de audit, 186 saldos a favor vivos). La
  migración se corrigió para partir el set: **183 parciales** → reduce a lo
  aplicado; **3 fantasma** → soft-delete (sin aplicaciones huérfanas ni
  movimiento bancario). Reaplicada vía nuevo PR + `finanzas-ok`.

### 2026-06-17 — Auto-generación del plan de pagos en el ciclo de vida de la venta

Cierra el origen del incidente Arizpe Luna (ver también
[dilesa-ventas-expediente] / PR #930): registrar un abono en una venta sin
plan de pagos dejaba el pago flotando sin aplicar y la venta clavada en
Fase 11. El PR #930 lo blindó en UI; este cambio elimina el paso manual de
raíz. La generación del plan (`dilesa.fn_generar_plan_pagos`) era manual —
herencia del cutover (se agregó como botón suelto, nunca enganchada al ciclo
de vida de la venta).

**Migración `20260617215750_cxc_auto_generar_plan_pagos_venta.sql`:** trigger
`trg_venta_auto_plan_pagos` AFTER INSERT/UPDATE sobre `dilesa.ventas` que
llama `fn_generar_plan_pagos` cuando la venta se alista, con guardas
validadas contra prod:

- `valor_escrituracion` (o `precio_asignacion`) **> 0** → salta los 112
  cascarones vacíos sin economía.
- **fase 2-11** (Asignada → Escriturada): el precio se congela al asignar
  (snapshot PR #900) y paramos antes de Detonada (12) para no crear cargos
  fantasma en ventas cerradas/migradas. Las de fase 1 se auto-generan al
  pasar a Asignada.
- **create-once**: si ya hay plan, NO se toca (la regeneración sigue siendo
  manual por botón). `fn_generar_plan_pagos` además se congela tras el 1er
  abono aplicado.
- **fail-open**: si la función falla, WARNING y el guardado de la venta nunca
  se aborta.

**Backfill** (mismo criterio, idempotente): genera el plan de **6 ventas**
vivas en pipeline que hoy no lo tenían (todas institucionales, enganche +
disposición). Diagnóstico previo (read-only): de las ventas sin plan, el
único caso "flotando" era Arizpe (ya corregido), 0 clavadas, 1 sobrepago
nativo (Nancy Villarreal $33,076 — conciliación aparte), y 185 saldos a
favor legacy del cutover (los ~$2.0M del Próximo hito, limpieza con regla
masiva aparte).

Decisión sostenida: **NO** auto-generar dentro de `cxc_pago_registrar`
(acopla originación a un RPC financiero y esconde errores de datos); el
disparador correcto es el ciclo de vida de la venta. Migración construida en
PR; aplicación a prod con OK de Beto (crea cargos = datos financieros).

### 2026-06-12 — Guard-rails de fuente en captura de abono (doble conteo en cuadratura)

Bug operativo detectado en prod: Maribel capturó las disposiciones de
crédito Infonavit de 4 ventas con `fuente='cliente'` (el default del
form). La cuadratura suma depósitos fuente-cliente **y** el crédito de
institución de la venta, así que la disposición mal etiquetada cuenta
dos veces → Disponible inflado (ej. $1,798,000 sobre escrituración de
$899,000) y saldo negativo. Solo código/UI — la corrección de los 4
abonos mal etiquetados es aparte, con aprobación de Beto. Entregado:

- **Comentario falso corregido** en `abono-capture-drawer.tsx`: decía
  que la fuente "no filtra el cálculo" — cierto para el FIFO, falso
  para la cuadratura (`fuente='cliente'` ⇒ depósito directo en el
  Monto Disponible).
- **Prevención en captura**: el drawer trae los cargos abiertos de la
  venta (mismo orden FIFO del RPC) al abrir; si lo siguiente por cubrir
  espera institución, pre-selecciona `fuente='institucion'` (sin pisar
  al usuario si ya tocó el campo). Aviso inline ámbar si deja
  `cliente` y el monto cubriría mayormente cargos de institución.
  Helpers puros en `lib/dilesa/cxc/fuente-abono.ts` (con tests).
- **Flag `posibleDobleConteo`** en el motor (`lib/dilesa/cuadratura.ts`):
  depósitos-cliente + crédito institución > escrituración + gastos
  netos por >5% ⇒ alerta ámbar en la pestaña Cuadratura.

### 2026-06-12 — Migración `20260612173513` APLICADA a prod y verificada

Beto aprobó en chat ("Aplicala por favor") tras revisar el preview y
mergear #863 (CC resolvió el conflicto de INITIATIVES con #862 vía
theirs+regen). `db push` con dry-run previo (solo esa migración
pendiente). Verificación independiente post-aplicación: el RPC ya NO
contiene el filtro `fuente_esperada = p_fuente`, índice
`cxc_pagos_empresa_uuid_sat_uk` creado, `fn_copiar_comprobante_detonacion`
existe, y ambos triggers (`trg_detonar_venta_desde_cxc` +
`trg_comprobante_cxc_actualizado`) habilitados. `types/supabase.ts`
regenerado y mergeado en #865; `SCHEMA_REF.md` sin cambio real. Queda el
paso operativo: Contabilidad registra los 2 abonos de Ahumada.

### 2026-06-12 — Recibo XML + F12 solo Dirección + fix regresión FIFO (caso Ahumada)

Diagnóstico del reporte de Beto (venta Jesus Santiago Ahumada Castillo,
M11-L14-LDLE, Infonavit Unamos): la F12 se cerró por la pantalla manual
el 11-jun 9:48 — **horas antes** de que se deployara el trigger de
detonación por CxC ese mismo día — así que el estado de cuenta quedó sin
los depósitos; el slot único de imagen además descartó silenciosamente
la 1ª de 2 imágenes (coacreditados). En el camino se encontraron 2 bugs
reales: (a) **regresión del FIFO sin fuente** (el fix de movimiento
bancario `20260601201000` pisó a `20260601180854` — ver Decisiones), y
(b) el comprobante del abono **nunca llegaba al expediente** vía trigger
(`comprobante_adjunto_id` jamás se seteaba en el flujo del drawer y el
dedupe por rol limitaba a 1 comprobante). Entregado en PR de esta sesión:

- Migración `20260612173513`: `cxc_pago_registrar` con FIFO sin fuente
  restaurado (conservando movimiento bancario + audit log), unique
  parcial `uuid_sat`, helper `fn_copiar_comprobante_detonacion` (N
  comprobantes, dedupe por adjunto de origen) llamado desde el trigger
  de detonación + nuevo trigger `AFTER UPDATE OF comprobante_adjunto_id`
  (cubre el deferred upload).
- `lib/dilesa/cxc/cfdi-recibo.ts` (15 tests): parse de recibo tipo P
  (complemento de Pagos 2.0) y tipo I, mapeo de claves SAT de forma de
  pago, verificación receptor-vs-cliente RFC/nombre. No toca
  `lib/cxp/cfdi-parser` (PR #862 lo extiende en paralelo para F13).
- Drawer de abono: slot XML que autollena y bloquea los campos (con
  "editar manualmente"), panel de verificación con confirmación para
  receptor distinto, `p_uuid_sat`, mensaje claro en folio duplicado, y
  liga del comprobante al pago (dispara la copia al expediente).
- F12: guía a Cobranza para el equipo; form solo Dirección con banner
  de emergencia. Detalle de venta: deep-link `?abono=1` + columna
  "Recibo fiscal" (XML ✓ / sin XML) en abonos.

**Operativo pendiente (Contabilidad):** registrar los 2 abonos reales de
la institución de la venta Ahumada (uno por depósito, con comprobante y
XML) — idealmente después de aplicar la migración para que salden ambos
cargos ($930,800 disposición + $9,200 enganche, crédito cubre todo).

### 2026-06-11 — Reversión LIQ-HIST APLICADA a prod y verificada

Beto confirmó el criterio en chat (_"la saldada de los créditos era solo
lo que no registrábamos en Coda... todo esto reciente no hay que saldar
nada"_) y eligió el corte ≥ 2026-03-01. La migración `20260611182924` se
aplicó vía `db push` el 2026-06-11 ~13:05 CST tras mergear el PR #831:
44 pagos LIQ-HIST revertidos en 31 ventas ($10,485,164.71), 44
aplicaciones borradas. **Verificación independiente post-aplicación:** 0
LIQ-HIST vivos en ventas con escritura ≥ mar-2026, 0 aplicaciones
huérfanas, aging reabierto a 101 ventas / $91.1M (antes 69 / $79.7M).
Spot-check Josue D. Cruz Valverde: enganche `parcial` con saldo $1,622
(el adeudo real que Coda muestra como "Saldo Cliente") y disposición de
crédito liquidada solo con pagos reales. Los LIQ-HIST de ventas viejas
(pre-mar-2026) quedan intactos, como se aprobó.

### 2026-06-11 — Falso positivo del LIQ-HIST + captura de recibo de caja

Diagnóstico de los 2 reportes de Beto sobre la venta M10-L23-LDLE-ISC
(ver Decisiones registradas de hoy). Entregado: (1) migración de
reversión `20260611182924` lista **sin aplicar** (la dispara Beto);
(2) slot "Recibo de caja / factura" en el drawer de captura (compartido
detalle-venta + cobranza) + botón "Subir recibo" por fila de abono sin
recibo en el estado de cuenta, con rol `recibo_caja` (alimenta el Valor
Facturado de la cuadratura); rol del comprobante de captura alineado a
`comprobante_deposito` (espejo del import Coda; el rol `comprobante`
tenía 0 filas en prod).

### 2026-06-11 — Abono de institución detona la venta (CxC → pipeline F12)

Diseño de Beto al cuadrar la operación Luna Heredia: el registro del
depósito de la detonación debe vivir UNA vez, en Cobranza, y la fase 12 del
pipeline de ventas es consecuencia. Trigger
`dilesa.fn_detonar_venta_desde_cxc` (migración `20260611174917`, AFTER
INSERT en `erp.cxc_pago_aplicaciones`): abono `fuente='institucion'`
aplicado a un cargo de una venta en F11 (Escriturada) → cierra Detonada
con la fecha del pago + `monto_detonado`/`fecha_detonacion` + copia el
comprobante del abono al expediente (`rol='imagen_detonacion'`). Fail-open
(un error degrada a WARNING, nunca bloquea el registro del pago);
cancelar el pago NO revierte la fase (eso es manual de Dirección). La
pantalla F12 queda como respaldo manual. Contexto raíz: F12 no registraba
el abono en CxC, y sin ese abono la cuadratura (Valor Real Venta Dilesa)
quedaba coja para siempre en ventas nuevas post-cutover.

### 2026-06-10 — Migración de liquidación histórica creada y APLICADA a prod

Con la regla aprobada (ver Decisiones registradas), se creó la migración
`20260611032126_cxc_liquidacion_historica_saldos.sql` (data-only):
cancela los cargos de desasignadas + inserta abonos `LIQ-HIST` aplicados
1:1 a los cargos abiertos de pre/era-Coda. **Self-verificante** (aborta con
rollback si los buckets no cuadran con 646/180/53 ventas y sus montos, o si
el estado final ≠ 69 ventas / \$79,722,814), **idempotente** (marcador
`referencia='LIQ-HIST'`) y no-op en Preview vacío. El classifier del
harness bloqueó la ejecución autónoma (correcto para una migración
financiera de \$721.7M); **Beto la disparó en chat** ("adelante aplícala")
y se aplicó vía `db push` el 2026-06-10 ~21:40 CST.

**Verificación post-aplicación (queries independientes a prod):** 102
cargos cancelados (desasignadas) + 1,391 abonos `LIQ-HIST` por
\$676,033,322 con Σ aplicaciones = monto exacto en el 100% (0
desbalanceados). Saldo abierto restante: **69 ventas / \$79,722,814** —
solo cartera en proceso, exacto a lo aprobado. Spot-checks: Irma G.
Hernández \$0, Iván C. García \$0, venta PRUEBA \$0 (1 cargo cancelado).
El aging de `/dilesa/cobranza/aging` queda limpio.

### 2026-06-10 — Radiografía de saldos abiertos históricos (read-only, sin tocar datos)

Beto detectó en el aging (`/dilesa/cobranza/aging`) clientes viejos con saldos
enormes en rojo y pidió revisar. Diagnóstico confirmado: **las ventas
anteriores a la captura en Coda no tienen abonos registrados** — el módulo
Coda "Depositos Clientes" registró su **primer pago el 2024-01-30**; todo lo
cobrado antes quedó sin historial, y aun en la era Coda la captura del pago
institucional fue parcial (862 de 883 ventas con cargo institucional abierto
tienen CERO abonos de institución).

**Números (erp.cxc_cargos, saldo > 0, no cancelados):** 948 ventas, 1,621
cargos, **$801.4M de saldo abierto total**, segmentado en 4 buckets:

| Bucket                                                                      | Ventas | Saldo   | Detalle                                                                                                                                                                            |
| --------------------------------------------------------------------------- | ------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Desasignadas con cargos vivos                                            | 53     | $45.7M  | El plan de pagos no se canceló al desasignar; incluye la venta de PRUEBA de Beto ($3.2M). Cargos a **cancelar**, no abonar.                                                        |
| 2. Cerradas pre-Coda (Entregada/Inscrita/etc., escritura NULL o < feb-2024) | 646    | $516.2M | $488.1M institución + $28.1M cliente. Casas entregadas = cobradas en la realidad. Candidato a **liquidación histórica masiva**.                                                    |
| 3. Cerradas era-Coda (escritura ≥ feb-2024)                                 | 180    | $159.8M | $154.6M institución. Coda ya capturaba pero el pago institucional casi nunca se registró. **Revisar lista con tesorería** antes de liquidar (puede haber cobranza real pendiente). |
| 4. En proceso (Formalizada → Firmas)                                        | 69     | $79.7M  | Cartera real en pipeline. **No tocar.**                                                                                                                                            |

Hallazgos laterales: (a) los enganches generados por `fn_generar_plan_pagos`
en el backfill llevan vencimiento 2026 (default) en ventas viejas → el bucket
"1-30" del aging (~$23-25K por cliente) es ficticio y cae con la limpieza;
(b) **cero traslape** con el frente de $2.0M de saldos a favor (185 ventas) —
son poblaciones disjuntas; (c) Coda sí capturaba pagos institución
($235.9M Infonavit + $29.4M Fovissste + $24.1M Banco en `venta_pagos`) pero
de forma incompleta.

**Propuesta de regla (pendiente OK de Beto, NO ejecutada):** bucket 1 →
cancelar cargos vía `cxc_cargo_ajustar`; bucket 2 → abono sintético
institución/cliente por el saldo del cargo, fecha = `fecha_escritura` (proxy:
fecha de fase Entregada), referencia `LIQ-HIST` + notas estándar, sin
movimiento bancario, vía script idempotente con dry-run CSV; bucket 3 →
CSV de 180 filas para palomeo con tesorería y misma mecánica al OK;
bucket 4 → intacto. También: revisar el flujo de desasignación para que
cancele cargos abiertos (gap de proceso, no solo de datos).

Cierra los dos imprimibles que faltaban del CxC. Decisión de Beto: estado
de cuenta **por venta** (anclado a un lote + su plan), no consolidado por
cliente — encaja con la captura y el detalle, que ya son por venta; el
aging por cliente cubre el agregado. Los dos documentos se hicieron juntos
porque comparten patrón.

- **`<EstadoCuentaPrintable>`** (`components/dilesa/`): membrete DILESA +
  datos del cliente + datos de la operación + tabla de cargos (con total) +
  tabla de abonos + resumen de saldos al corte. Nota de que no es CFDI.
- **`<ReciboCajaPrintable>`**: recibo por abono con folio (`RC-` + id corto),
  fecha, cliente, monto + **monto en letra** (`lib/format/numero-a-letras`),
  concepto (proyecto · unidad), forma de pago + referencia, origen y firma.
- **Patrón de impresión (ADR-021 + mecanismo de drawer del repo)**: cada
  documento se monta dentro de un `<DetailDrawer>` y el aislamiento de
  impresión lo provee la maquinaria del repo — `<SheetContent>` setea
  `data-print-sheet-open` (`components/ui/sheet.tsx`) y el `@media print` de
  `app/globals.css` oculta el app-shell y saca el portal del drawer en flujo.
  Es el mismo patrón del kardex (`StockDetailDrawer`) y de todos los
  documentos que ya imprimen bien. El título del header del drawer va
  `print:hidden` para que el membrete del documento sea el encabezado impreso.
- **Integración en `app/dilesa/ventas/[id]/page.tsx`**: botón "Imprimir
  estado de cuenta" en la sección Estado de cuenta + botón "Recibo" por fila
  de abono → abren un `<DetailDrawer>` con el documento (vista previa) y un
  botón "Imprimir" (`useTriggerPrint`). Se agregó `referencia` al select de
  `cxc_pagos`.
- **Falso arranque corregido**: el primer intento metió un aislamiento propio
  (`body * { visibility:hidden }` + `position:absolute` + toggling de
  `display`) embebido en la página. Salía **en blanco** porque competía con el
  mecanismo del repo en vez de usarlo (el documento no vivía en el portal de
  un sheet, así que el app-shell no se ocultaba). Fix: reescritos como
  contenido puro dentro del `<DetailDrawer>`.
- **Test** `cxc-printables.test.ts`: invariantes source-level (env=node sin
  DOM) — guardan que los documentos NO reintroduzcan el truco propio
  (`visibility:hidden` / `position:absolute`) + membrete + monto en letra.
- **Verificado en el preview** (Chrome MCP, emulando `@media print`): con el
  drawer abierto `data-print-sheet-open='true'`, el app-shell queda
  `display:none` y el documento renderiza con dimensiones reales (membrete
  cargado + 4 filas de cargos) — no blanco. Sin DDL. 5 checks verdes (1142
  tests). PR _(este PR)_.

- **Pulido post-feedback de Beto** (commit posterior): membrete y footer a
  ancho completo (estaban capados a `max-width:540px`, descuadraban vs el
  cuerpo full-width) — ahora `width:100%` alineados al cuerpo, como el `w-full`
  del kardex; header reestructurado (membrete banner + fila título/corte con
  divisor). + Fila **Total** en la tabla de Abonos (Monto/Aplicado/Saldo a
  favor), como en Cargos. Verificado en preview (membrete=footer=cuerpo=754px).

**Pendiente:** recordatorios de vencimiento (catálogo `notificaciones`, solo
`fuente=cliente`) + retiro de Coda. Desde cobranza se puede sumar un disparo
de impresión on-demand si se pide (requiere fetch del estado al click).

**Limpieza de saldos a favor — FRENTE APARTE (no tocar datos sin OK de Beto).**
Surgió cuando Beto vio un estado de cuenta con saldo a favor pese a cargos
liquidados. Diagnóstico 2026-06-01 (read-only, no es defecto del documento ni
del modelo CxC — es dato heredado de Coda): **185 de 1,179 ventas** (~16%)
tienen saldo a favor, total **$2,015,311.81** — **$1,941,717 (96%) de
institución**, $73,594 de cliente. De las 179 ventas con favor de institución,
**140 (78%)** tienen el depósito Infonavit/Fovissste capturado **≥ el precio
completo** en vez de la disposición real (_precio − enganche_), lo que dobla el
enganche (lo pagan institución + cliente). El favor varía $0.88–$89,664 (prom.
$10,847) → no hay corrección por constante; requiere regla + revisión. Beto
decidió tratarlo como tarea/iniciativa aparte (no bloquea la impresión). Al
atacarlo: validar muestra, decidir si el exceso se corrige (abono =
disposición) o queda como crédito real, y ejecutar con aprobación explícita.

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
