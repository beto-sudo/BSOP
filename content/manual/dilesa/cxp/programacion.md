---
titulo: 'CxP — Programación'
modulo: dilesa.cxp.programacion
version: '1.0.0'
actualizado: '2026-06-07'
---

## ¿Qué es y para qué sirve?

Aquí **programas los pagos** de las facturas por pagar: seleccionas facturas y el
sistema arma órdenes de pago **agrupadas por proveedor**. Programar **no saca
dinero todavía** — deja los pagos en estado "Programado", pendientes de aprobación.

## Cómo llegar

**Sidebar → DILESA → Administración → CxP → pestaña Programación.**

## La tabla

Lista las facturas con **saldo abierto** (por pagar o parciales). Cada renglón:
una **casilla** para seleccionar, **Proveedor** (con RFC), **Vence** (con etiqueta
de urgencia: rojo si vencida, ámbar si vence pronto), **Total** y **Saldo**. Abajo,
al seleccionar, ves cuántas elegiste, de cuántos proveedores y el **total a
programar**.

## Cómo programar (paso a paso)

1. **Selecciona** las facturas a pagar (puedes marcar todas las visibles).
2. **Programar pago(s)** → en el diálogo eliges **método de pago** (transferencia,
   cheque…), **fecha** y, opcional, la **cuenta bancaria**.
3. **Confirmar** — se crean los pagos (uno por proveedor) en estado **Programado**.
   Quedan pendientes de **aprobación de Dirección** (pestaña Pagos).

## Preguntas frecuentes

**¿Al programar ya pagué?**
No. Programar solo prepara la orden; el dinero sale cuando Dirección **aprueba** y
luego se **marca como pagado** (pestaña Pagos).

**Una factura no me deja programarla.**
Tiene que tener un **proveedor ligado**. Si no, el diálogo te avisa y esa factura
no se puede programar.

**Seleccioné 10 facturas de 3 proveedores, ¿cuántos pagos salen?**
Tres (uno por proveedor): los pagos se agrupan por proveedor.

## Si algo no cuadra

Si elegiste la cuenta bancaria, al marcarse pagado se genera el movimiento
bancario solo. Si no elegiste cuenta, tendrás que conciliarlo a mano.
