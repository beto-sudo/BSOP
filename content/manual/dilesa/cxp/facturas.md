---
titulo: 'CxP — Facturas'
modulo: dilesa.cxp.facturas
version: 1.0.0
actualizado: 2026-06-07
---

## ¿Qué es y para qué sirve?

Es el registro de las **facturas de proveedor por pagar** (cuentas por pagar).
Aquí entran las facturas (subiendo su XML), ves cuánto se debe de cada una, su
estado y qué tan urgente es su vencimiento. Es la pestaña que abre por defecto
dentro de CxP.

> CxP es un hub con 5 pestañas: **Facturas** (esta), **Programación**,
> **Pagos**, **Saldos** y **Proveedores**. El pago se hace en las otras
> pestañas — aquí registras y consultas las facturas.

## Cómo llegar

**Sidebar → DILESA → Administración → CxP.** Abre en **Facturas**.

## La tabla

Cada renglón es una factura. Trae el **Proveedor** (y su RFC), el **Folio
fiscal** (UUID del SAT), la fecha de **Emisión**, cuándo **Vence**, el **Total**,
el **Saldo** pendiente, el **Estado**, y la **OC** ligada (si vino de una orden
de compra).

Arriba, un contador te dice cuántas facturas coinciden con tu búsqueda.

## Lo que puedes hacer

- **Cargar XML** — el botón principal. Subes uno o varios XML de CFDI; el
  sistema lee emisor, montos y fechas, valida que la factura sea **para DILESA**
  y que no esté duplicada, y la liga al proveedor por su RFC. Queda en
  **Borrador**.
- **Buscar / filtrar** — por proveedor, RFC, folio u OC; y filtro por **Estado**.
- **Actualizar** — refresca la lista.
- **Abrir una factura** — clic en el renglón: se abre un panel con el desglose
  (subtotal, IVA, retenciones, total, pagado, saldo), forma de pago y uso de
  CFDI, la OC ligada, la **partida de presupuesto** (si se le asignó), los pagos
  aplicados, y los archivos (XML / PDF).

## Estados de una factura

| Estado        | Significa                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| **Borrador**  | Recién cargada, todavía no lista para pagar.                                                            |
| **Por pagar** | Validada y lista; el badge muestra los días para vencer (ámbar si vence pronto, **rojo** si ya venció). |
| **Parcial**   | Se le aplicó un pago pero queda saldo.                                                                  |
| **Pagada**    | Saldo en cero.                                                                                          |
| **Cancelada** | Anulada (con motivo, antes de cualquier pago).                                                          |

## Flujo de una factura

1. **Cargar XML** → queda en **Borrador**.
2. Se valida → pasa a **Por pagar**.
3. En la pestaña **Programación** se le programa el pago; en **Pagos** se ejecuta.
4. Según lo que se pague, queda **Parcial** (si falta) o **Pagada** (si se
   liquidó).

## Preguntas frecuentes

**¿Puedo editar el monto o la fecha de una factura?**
No. Esos datos vienen del CFDI (son fiscales, inmutables). Si la factura está
mal, se cancela y se sube la correcta.

**¿Quién puede cancelar una factura?**
Solo un administrador, y solo si está en Borrador o Por pagar y **sin pagos
aplicados**. Pide motivo (queda en el rastro de auditoría).

**¿Para qué asigno una "partida de presupuesto"?**
Para ligar el gasto a un proyecto y concepto (control de presupuesto). No es
obligatorio para pagar, pero sí para que el gasto cuente contra la obra. Esta
opción solo aparece en DILESA.

**Cargué un XML y no aparece la factura.**
Revisa el mensaje de la carga: el sistema rechaza facturas que no son para DILESA
(RFC receptor distinto) o que ya estaban cargadas (folio repetido).

## Si algo no cuadra

Si un saldo o un estado se ve mal, **no edites a mano** — anota el proveedor y el
folio y avísale a administración. El estado se deriva de los pagos aplicados, así
que casi siempre se corrige desde Pagos/Programación.
