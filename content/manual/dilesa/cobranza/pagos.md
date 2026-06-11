---
titulo: 'CxC — Pagos'
modulo: dilesa.cobranza.pagos
version: '1.0.0'
actualizado: '2026-06-07'
---

## ¿Qué es y para qué sirve?

Es la **captura de abonos de clientes** (cobranza). Buscas al cliente, ves sus
ventas con saldo y registras el abono — sin entrar venta por venta. El abono se
aplica solo a los **cargos abiertos** de esa venta.

## Cómo llegar

**Sidebar → DILESA → Administración → CxC → pestaña Pagos.**

## Cómo registrar un abono (paso a paso)

1. Escribe el **nombre del cliente** y pulsa **Buscar**.
2. Aparecen sus ventas con su **Unidad** y **Saldo** pendiente.
3. **Registrar abono** → captura **fecha**, **monto**, **fuente** (Cliente o
   Institución), y opcionalmente **forma de pago**, **referencia**, **notas** y el
   **comprobante**.
4. **Registrar abono** — queda aplicado a los cargos abiertos de esa venta.

## La "fuente" del abono

- **Cliente** — el cliente pagó directo (enganche, mensualidad…).
- **Institución** — el dinero viene de **INFONAVIT / FOVISSSTE / banco** (la
  disposición del crédito).

> **Efecto en ventas:** al registrar un abono de **Institución** aplicado a
> una venta que está **Escriturada**, la venta avanza sola a la fase
> **Detonada** — con la fecha del depósito, el registro en su bitácora y el
> comprobante copiado a su expediente. Un solo registro cierra el ciclo del
> dinero y el del proceso.

Es una etiqueta para la cobranza; no cambia cómo se aplica el abono.

## Preguntas frecuentes

**El botón "Registrar abono" está deshabilitado en una venta.**
Esa venta está **Desasignada** o **Expirada** (aparece con etiqueta ámbar): se
muestra solo como historial y no admite abonos.

**¿A qué cargo se aplica el abono?**
A los cargos abiertos de esa venta, del más antiguo al más nuevo.

## Si algo no cuadra

Si el saldo de una venta se ve mal, revisa sus cargos en el **estado de cuenta**
de la venta. El abono que registras aquí queda con su comprobante para auditoría.
