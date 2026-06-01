# ADR-037 — Patrón de subledger gemelo (CxC / CxP) + movimiento bancario

**Status**: Accepted
**Date**: 2026-06-01
**Initiative**: [cxc](../planning/cxc.md) + [cxp](../planning/cxp.md) (cruza ambas)
**Schemas**: `erp`

## Contexto

BSOP necesita los dos lados del libro auxiliar: **Cuentas por Cobrar**
(CxC, lo que nos deben los clientes) y **Cuentas por Pagar** (CxP, lo
que debemos a proveedores). Son espejos uno del otro. `cxp` ya estaba
`planned` con su propio diseño (extender `erp.facturas` + `cxp_pagos` +
`cxp_pago_aplicaciones`). Al promover `cxc`, Beto pidió **diseñarlas
gemelas** para no inventar dos veces la misma maquinaria.

Además, ambas alimentan tesorería: cada cobro y cada pago real termina
en una cuenta bancaria, y eventualmente hay que **conciliar contra el
estado de cuenta** del banco (iniciativa hermana
[`conciliacion-bancaria`](../planning/conciliacion-bancaria.md)).

El riesgo si cada iniciativa improvisa su propio shape de "pago" y
"aplicación": la lógica de saldo / antigüedad / conciliación se duplica
y diverge, y la conciliación bancaria tendría que entender dos modelos
distintos. Este ADR fija el patrón canónico una sola vez.

## Decisión

### D1 — Tres capas de subledger

| Capa                     | CxC                                                                                          | CxP                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Documento de adeudo**  | `erp.cxc_cargos` (1 fila por cargo: parcialidad de enganche, mensualidad, evento de crédito) | `erp.facturas` (`flujo='egreso'`) — la factura **es** el adeudo |
| **Movimiento de dinero** | `erp.cxc_pagos` (abono del cliente o institución)                                            | `erp.cxp_pagos` (pago al proveedor)                             |
| **Aplicación (N:M)**     | `erp.cxc_pago_aplicaciones`                                                                  | `erp.cxp_pago_aplicaciones`                                     |

La aplicación es lo que conecta un movimiento de dinero con uno o varios
documentos de adeudo. `CHECK Σ aplicaciones.monto_aplicado ≤
pago.monto_total` (el `≤`, no `=`, permite **saldo a favor**: un abono
mayor a la deuda deja crédito sin aplicar).

### D2 — Asimetría deliberada del documento de adeudo

CxP usa `erp.facturas` como documento; CxC usa una tabla nueva
`erp.cxc_cargos`. **No se fuerza una tabla común.** Razón:

- La factura de egreso tiene semántica fiscal SAT propia (`uuid_sat`,
  retenciones IVA/ISR, PPD/PUE, uso CFDI) que **no** aplica al cargo de
  CxC.
- El adeudo de CxC nace **antes y sin** factura: la venta a plazos
  genera cargos (enganche, mensualidades) que se cobran y, por
  separado, CONTPAQi emite el CFDI de ingreso. BSOP solo **referencia**
  el `uuid_sat` cuando existe; no lo genera (ver `cxc` Fuera de alcance).

Una tabla genérica `subledger_documentos` se descartó: generaría
nullable-soup (la mitad de las columnas fiscales nulas en cada fila de
CxC).

### D3 — Saldo derivado por trigger, nunca capturado

- `documento.monto_pagado` lo recalcula un trigger `AFTER INSERT OR
UPDATE OR DELETE ON *_pago_aplicaciones FOR EACH ROW` con un `SELECT
SUM(...)` directo sobre las aplicaciones del documento (patrón seguro
  contra recursión, idéntico al que ya definió `cxp`).
- `documento.saldo` es columna `GENERATED` (`total - COALESCE(monto_pagado, 0)`).
- `documento.estado` se deriva: `pendiente` / `parcial` / `liquidado` /
  `cancelado`. **Vencido NO es un estado almacenado** — es función de
  `fecha_vencimiento < today()` sobre un cargo no liquidado. Esto evita
  un cron que "marque vencidos".

### D4 — Emisión de movimiento bancario (gancho de tesorería)

Al **cobrar** un `cxc_pago` o **ejecutar** un `cxp_pago`, la RPC escribe
un renglón en `erp.movimientos_bancarios` apuntando de vuelta al
subledger con **referencia polimórfica**:

- Se agregan a `erp.movimientos_bancarios` las columnas `referencia_tipo`
  (`'cxc_pago' | 'cxp_pago' | 'gasto' | 'transferencia' | ...`) y
  `referencia_id` (uuid).
- La primera iniciativa que llegue a Sprint 1 (CxC) entrega esta
  extensión; CxP la consume tal cual.

Esto deja el enganche listo para que `conciliacion-bancaria` case el
estado de cuenta del banco contra estos movimientos **sin retrabajo**.

### D5 — Originación por empresa (adaptador)

El núcleo (cargo / pago / aplicación / saldo / aging) es **genérico y
multi-empresa** por `empresa_id`. Lo único que cambia por empresa es
**cómo nacen los cargos**, encapsulado en un RPC de originación por
negocio:

- DILESA: `dilesa.fn_generar_plan_pagos(venta_id)` deriva los cargos
  desde `dilesa.ventas` (términos ya capturados: `precio_asignacion`,
  `enganche_requerido`, `tipo_credito`).
- ANSA / RDB / COAGAN: su propia originación cuando entren (autos +
  taller, membresías recurrentes, cosecha net-30).

`cxc_cargos.origen_tipo` + `origen_id` apuntan al documento de negocio
que originó el cargo (una venta, un contrato, una membresía).

### D6 — Fuente del abono (específico de CxC)

Cada `cxc_pago` lleva `fuente` (`'cliente' | 'institucion'`). Toda venta
genera CxC hasta saldo 0, pero el comportamiento de **cobranza activa**
difiere por fuente: a un cliente se le mandan recordatorios y estado de
cuenta; a una institución (INFONAVIT / FOVISSSTE / banco) el "hasta
saldo 0" es **visibilidad del adeudo**, no gestión de cobranza. El campo
`fuente` es lo que separa ambos comportamientos.

## Consecuencias

- **Componentes UI compartibles** entre CxC y CxP: vista de antigüedad
  por buckets, drawer de aplicación de pago, badge de estado de
  documento. Viven en `components/` y los dos módulos los reusan
  (convención `shared-modules-refactor`, ADR-011).
- **Conciliación bancaria se construye una sola vez** sobre
  `movimientos_bancarios` polimórfico, sin conocer la semántica interna
  de CxC ni CxP.
- **Trade-off aceptado**: la asimetría D2 (factura vs cargo) significa
  que el código que lee "el documento de adeudo" no es 100% idéntico
  entre CxC y CxP. Se acepta porque la semántica fiscal de la factura es
  irreductible. El resto del patrón (pago / aplicación / saldo / aging /
  movimiento bancario) sí es simétrico.

## Alternativas consideradas

- **Tabla única polimórfica `subledger_documentos`** para CxC y CxP:
  rechazada por nullable-soup fiscal (ver D2).
- **Sin capa de aplicación** (el abono apunta 1:1 a un cargo):
  rechazada — no soporta un abono que cubre varias mensualidades, ni
  saldo a favor, ni pagos parciales limpios. Es exactamente la
  limitación del módulo Coda "Depositos Clientes" que CxC viene a
  resolver.
- **Marcar vencidos con un cron** (estado almacenado): rechazada —
  `vencido` derivado de la fecha es siempre correcto y no necesita job
  (ver D3).
