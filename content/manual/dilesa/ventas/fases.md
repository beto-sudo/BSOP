---
titulo: 'Ventas — Fases'
modulo: dilesa.ventas.fases
version: '1.1.0'
actualizado: '2026-06-16'
---

## ¿Qué es y para qué sirve?

Es la vista del **pipeline de ventas**: las fases por las que pasa cada venta
(desde Asignada hasta Operación Terminada) mostradas como tarjetas, con cuántas
**ventas activas** hay parada en cada fase. Sirve para ver de un vistazo dónde se
está atorando el proceso.

## Cómo llegar

**Sidebar → DILESA → Inmobiliario → Ventas → pestaña Fases.**

## Cómo se lee

Cada **tarjeta** es una fase: su número de orden, su nombre, el rol responsable (si
aplica) y un contador de **cuántas ventas activas** están en esa fase. Las fases
con más ventas señalan congestión.

Arriba, los indicadores resumen el pipeline (total de ventas activas, etc.) y se
recalculan con los filtros.

## Lo que puedes hacer

- **Filtrar** — por **proyecto**, **vendedor** y **mes** de creación de la venta.
- **Limpiar filtros** — aparece cuando hay alguno activo.
- **Clic en una fase** — te lleva a la lista de **Ventas** para revisar las que
  están ahí.

## Preguntas frecuentes

**¿Por qué una venta no aparece en ninguna fase?**
Solo se cuentan las ventas en estado **Activa** (el pipeline vivo). Las
operaciones **Terminadas** (con la Fase 17 cerrada) salen del conteo — para
verlas, usa la lista de Ventas con el filtro de estado en "Terminadas" o
"Todos". Y si a una venta activa le falta su fase actual, no se ubica en ninguna
tarjeta (aparece un aviso de dato faltante).

**El filtro de "mes" ¿es por avance de fase?**
No: es por el **mes en que se creó** la venta. Sirve para ver cohortes de ventas
nuevas, no la velocidad de cada fase.

## Si algo no cuadra

Si los conteos no cuadran con lo que esperas, recuerda que reflejan solo **ventas
activas** y la **fase actual** registrada en cada una.
