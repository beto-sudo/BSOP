---
titulo: 'CxP — Pagos'
modulo: dilesa.cxp.pagos
version: '1.1.0'
actualizado: '2026-06-16'
---

## ¿Qué es y para qué sirve?

Es donde viven los **pagos a proveedores** y su ciclo: **Programado → Aprobado →
Pagado** (o Cancelado). Aquí Dirección aprueba, se ejecuta el pago y se da
seguimiento.

## Cómo llegar

**Sidebar → DILESA → Administración → CxP → pestaña Pagos.**

## La tabla

Cada renglón es un pago (un proveedor con una o más facturas): **Proveedor**,
**Estado**, **Método**, fecha **Programada**, fecha **Pagada** y **Monto**. Filtras
por estado.

## El ciclo (paso a paso)

1. **Aprobar** — en un pago **Programado**, Dirección lo aprueba (pasa a
   **Aprobado**).
2. **Marcar pagado** — en un pago **Aprobado**, capturas **fecha** y **referencia**
   (folio del cheque / SPEI) y lo marcas pagado. Si tiene cuenta bancaria ligada,
   se registra el egreso. **Es la salida real de dinero.**
3. **Cancelar** — con motivo; las facturas vuelven a quedar abiertas.

Clic en un renglón abre el detalle: método, referencia, cuenta, fechas, y las
**facturas aplicadas** a ese pago.

### Control por partida

Cuando las facturas del pago están ligadas a una **partida** de obra, el detalle
muestra un bloque de **Control por partida**: para cada partida ves lo
**contratado** (del contrato vigente, o el presupuesto aprobado si no hay
contrato), lo **abonado antes**, **este pago** y **cómo queda** (total abonado y
qué porcentaje del contratado representa), con el **historial** de abonos
anteriores. Sirve para no pasarte de lo contratado en una partida.

## Estados

| Estado         | Significa                                      |
| -------------- | ---------------------------------------------- |
| **Programado** | Creado, espera aprobación de Dirección.        |
| **Aprobado**   | Aprobado; listo para ejecutar el pago.         |
| **Pagado**     | El dinero salió (egreso registrado). Final.    |
| **Cancelado**  | Anulado; las facturas vuelven a saldo abierto. |

## Preguntas frecuentes

**Le di "Aprobar" y me marcó error de permiso.**
**Solo Dirección** puede aprobar pagos (se valida en el servidor). El botón se ve,
pero la acción la rechaza si no tienes ese rol.

**"Marcar pagado" ¿se puede deshacer?**
Es la confirmación del egreso real; pide referencia y confirmación fuerte. Para
revertir, hay que cancelar manualmente.

## Si algo no cuadra

Si un pago se hizo por error, **cancélalo con motivo**: las facturas se
des-aplican y vuelven a quedar por pagar. Todo queda en el rastro de auditoría.
