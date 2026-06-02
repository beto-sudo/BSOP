# ADR-039 — Puente Capa B (contratos de obra) → CxP: la estimación como factura de egreso

**Fecha:** 2026-06-01
**Estado:** Aceptado
**Iniciativa:** `dilesa-contratos-obra` (Fase 2) + `cxp`

## Contexto

ADR-038 §5 fijó que el contrato de obra es el **compromiso** y el pago vive en
CxP, con una **Fase 2** en la que "cada estimación emite un cargo al subledger
CxP contra el proyecto", pero dejó abierto el **cómo**. Hoy ya existen las dos
piezas:

- **Capa B cargada a prod** (traspaso LDLE+LDS): 32 contratos
  (`dilesa.contratos_construccion` tipo no-vivienda) + 275 estimaciones
  (`dilesa.obra_estimaciones`), con saldo simple v1 (`valor_total − Σ
estimaciones`). Las estimaciones traen anticipo (`es_anticipo`), amortizaciones
  del anticipo (filas negativas / NC) y finiquito.
- **CxP (ADR-037, subledger gemelo)**: el documento de adeudo es `erp.facturas`
  (extendida: `estado_cxp`, `saldo` generado, `proveedor_id`, retenciones); el
  pago corre por `erp.cxp_pagos` + `cxp_pago_aplicaciones` con el flujo
  `programar → aprobar (rol Dirección) → marcar_pagado (movimiento bancario) →
conciliar`. CxP es **RDB-first**; DILESA entra en el Sprint 6 de `cxp`.

El nudo: la obra es **anticipo-first** (anticipo 15–60% _antes_ de facturar,
amortizado en cada estimación), justo el caso de "anticipos a proveedores" que
CxP v1 dejó **fuera de alcance** (su flujo es factura → pago). Hay que definir la
frontera sin re-modelar ni el contrato ni el subledger.

## Decisión

1. **La unidad que cruza a CxP es la _estimación_, no el contrato.** Cada
   estimación pagable se promueve a una **factura de egreso** en `erp.facturas`
   (`flujo='egreso'`, `proveedor_id` = el `contratista_id` del contrato),
   enlazada con una columna nueva **`erp.facturas.obra_estimacion_id`** (FK →
   `dilesa.obra_estimaciones`, nullable). El contrato queda como **agregador**:
   su saldo es `valor_total − Σ (estimaciones pagadas vía CxP)`. Esto reúsa el
   mismo patrón con que CxP ya promueve `erp.gastos → facturas` (su Sprint 6): la
   estimación es otra **fuente** de factura de egreso, no un documento de adeudo
   nuevo.

2. **Go-forward, no backfill.** El histórico ya pagado (el grueso de las 275
   estimaciones traspasadas, cuyo "Total Pagado" ya reconcilió contra el Excel)
   queda como **registro** en `obra_estimaciones`; **no** genera facturas-por-
   pagar vivas en CxP (crearía 275 cuentas por pagar de algo ya liquidado). Solo
   lo **pendiente** entra a CxP conforme se factura: el remanente por estimar de
   contratos activos (ej. `PAVIMENTACION` S4: valor \$5.2M, \$772k facturado →
   \$4.45M por venir) y las estimaciones futuras programadas (las 7 de SIMAS,
   \$2.56M).

3. **Neto a CxP** (decisión de Beto, 2026-06-01). A CxP va el **neto** de cada
   estimación (`monto_total − amortización del anticipo` = lo que realmente se
   transfiere al contratista). El **anticipo** inicial se emite como **una sola
   factura de egreso "anticipo de obra"**. Las filas de **amortización** (las
   negativas / NC) **no** se emiten como facturas separadas: se reflejan en el
   neto de la estimación que amortizan. Esto evita la maquinaria de
   aplicación-de-anticipos que CxP v1 difirió, a costa de no llevar el bruto y la
   recuperación del anticipo a nivel de subledger (ese detalle vive en obra).

4. **Reúsa el flujo CxP tal cual.** La factura de egreso emitida desde una
   estimación pasa por `cxp_pago_programar → cxp_pago_aprobar (rol Dirección) →
cxp_pago_marcar_pagado (emite `movimientos_bancarios`) → conciliación`, sin
   ningún RPC nuevo del lado de pagos. Lo único que se agrega es la **emisión**:
   un RPC `erp.cxp_factura_desde_estimacion(estimacion_id, …)` (o un parámetro en
   `cxp_factura_alta`) que crea la factura con el `obra_estimacion_id` poblado.
   Captura inclusiva: la factura nace con o sin `uuid_sat` (el contratista timbra
   después y se adjunta).

5. **Estado de pago reflejado en obra.** El módulo de obra deriva el estado de
   cada estimación leyendo la factura ligada (`estado_cxp`: por_pagar / parcial /
   pagada / programada). Las estimaciones históricas sin factura CxP se muestran
   como "pagada (histórico)" por su `nota_pago`. El saldo del contrato y el
   rollup de costeo (Sprint 3) suman pagado-histórico + pagado-vía-CxP.

6. **Dependencia de secuencia.** El puente aterriza cuando **CxP llega a DILESA**
   (Sprint 6 de `cxp`) o se adelanta DILESA como caso. Esta ADR fija el diseño;
   la columna `obra_estimacion_id` + el RPC de emisión + la UI de "emitir a CxP"
   son una migración/PR de Fase 2, no de ahora.

## Consecuencias

- La obra reúsa **toda** la maquinaria de CxP: aging por proveedor, calendario de
  pagos, aprobación por Dirección, emisión de movimiento bancario y conciliación.
  Cero duplicación del motor de pagos.
- El **neto** mantiene correcto el saldo y la operación, pero el bruto y la
  recuperación del anticipo no quedan trazados a nivel CxP (sí en
  `obra_estimaciones`). Aceptable para v1; si se necesita fidelidad fiscal del
  anticipo (CFDI de anticipo + REP), es una evolución futura (ver Alternativas).
- **SIMAS** (calendario fijo de 15 pagos) se puede **pre-cargar** como facturas
  de egreso programadas con `fecha_pago_programada`, alimentando el calendario de
  CxP directo.
- El costeo del Sprint 3 (Capa A + Capa B) es **independiente** de este puente:
  es UI de lectura sobre lo ya cargado; no espera la Fase 2.
- Sin re-modelar `contratos_construccion` ni el subledger: la única DDL futura es
  la columna `erp.facturas.obra_estimacion_id`.

## Alternativas consideradas

- **El contrato (no la estimación) como unidad a CxP** — rechazada: una cuenta
  por pagar por contrato pierde la granularidad real del pago, que es por
  estimación/avance; el calendario y la aprobación operan por estimación.
- **Estimación como documento de adeudo polimórfico** (de primera clase junto a
  `erp.facturas` en `cxp_pago_aplicaciones`) — rechazada: complica el subledger
  con una tercera forma de documento (CxC usa `cxc_cargos`, CxP usa `facturas`,
  ADR-037 D2); "promover a factura de egreso" reúsa el patrón existente sin tocar
  el núcleo.
- **Anticipo formal completo** (factura de anticipo + aplicaciones contra las
  estimaciones reales, con su CFDI/REP) — rechazada para v1: es justo lo que CxP
  difirió a sub-iniciativa; el **neto** resuelve saldo y operación. Queda como
  evolución si la fiscalización del anticipo lo exige.
- **Mandar el bruto + las amortizaciones como facturas separadas** (la
  amortización como nota de crédito que reduce saldo) — rechazada: arrastra a CxP
  la complejidad del anticipo sin beneficio operativo en v1.
