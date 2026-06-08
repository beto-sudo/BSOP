---
titulo: 'Compras — Órdenes de compra'
modulo: dilesa.compras.ordenes
version: '1.0.0'
actualizado: '2026-06-07'
---

## ¿Qué es y para qué sirve?

Son las **órdenes de compra (OC)** de DILESA. Cada línea de la orden se ancla a una
**partida del presupuesto** de un proyecto; cuando envías la orden, ese monto queda
**comprometido** contra esa partida.

> Es parte del ciclo de Compras: **Requisición → Cotización → Orden → Recepción →
> Factura**. Las pestañas del hub son Órdenes, Requisiciones, Cotizaciones y
> Recepciones.

## Cómo llegar

**Sidebar → DILESA → Compras → Órdenes de compra.** Se trabaja **un proyecto a la
vez** (lo eliges arriba).

## Lo que ves arriba (indicadores)

**Órdenes**, **Borrador**, **Enviadas**, **Cerradas** y **Comprometido** (la suma
de lo que has amarrado).

## La tabla

Cada renglón: **Folio**, **Proveedor**, **Estado**, **Líneas** (cuántas trae),
**Total** y **Fecha**.

## Cómo crear una orden (paso a paso)

1. Elige el **proyecto** arriba.
2. **Nueva orden** → eliges proveedor y agregas **líneas**: cada una con su
   **partida** del presupuesto, descripción, cantidad, unidad y precio.
3. **Crear orden (borrador)** — queda en Borrador (todavía no compromete nada).
4. Desde el menú del renglón, **Marcar enviada** → ahí sí compromete el monto
   contra las partidas.
5. Cuando ya no falta nada por recibir, **Cerrar orden**. Si te equivocaste,
   **Cancelar** (con motivo) la anula y libera el presupuesto.

## Estados

| Estado        | Significa                                        |
| ------------- | ------------------------------------------------ |
| **Borrador**  | Capturada; aún **no** compromete presupuesto.    |
| **Enviada**   | Activa; compromete el monto contra las partidas. |
| **Parcial**   | Algunas líneas ya se recibieron, otras no.       |
| **Cerrada**   | Completada.                                      |
| **Cancelada** | Anulada; libera el presupuesto comprometido.     |

## Preguntas frecuentes

**El botón "Nueva orden" está deshabilitado.**
Tienes que **elegir un proyecto** primero (arriba).

**¿Por qué cada línea pide una partida?**
Porque la orden se controla contra el presupuesto del proyecto: la partida es a
qué concepto se carga el gasto.

**¿Dónde recibo lo que compré?**
En la pestaña **Recepciones**. El recibir devenga (ejercido) contra la partida.

## Si algo no cuadra

Si una orden quedó en Borrador, recuerda que **no compromete** presupuesto hasta
que la marques **Enviada**.
