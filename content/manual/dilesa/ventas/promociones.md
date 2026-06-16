---
titulo: 'Ventas — Promociones'
modulo: dilesa.ventas.promociones
version: '1.0.0'
actualizado: '2026-06-16'
---

## ¿Qué es y para qué sirve?

Es el **catálogo de promociones de venta**. Cada promoción define un **tope de
descuento autorizado** para uno o varios prototipos. Cuando se captura una
venta, el sistema **auto-asigna** la promoción que aplica y usa su monto como
límite: el descuento que finalmente entra a la cuadratura es
`mínimo(lo otorgado al cliente, el tope de la promo)`. Así el descuento nunca
rebasa lo autorizado.

## Cómo llegar

**Sidebar → DILESA → Inmobiliario → Ventas → pestaña _Promociones_.**

## La tarjeta de promoción, dato por dato

Cada promo se ve como una tarjeta:

- **Nombre** y **estado** (_Activa_ / _Inactiva_). Solo las activas y vigentes se
  auto-asignan a ventas nuevas.
- **Monto** — el **tope de descuento** en pesos. No es lo que se descuenta
  siempre; es el máximo que la cuadratura permite aplicar.
- **Prototipos aplicables** — a qué prototipos aplica. Si dice **"Todos los
  prototipos"** (no se eligió ninguno), aplica a toda la oferta.
- **Vigencia** — rango de fechas en que la promo está vigente. Sin fechas, no
  caduca.

## Lo que puedes hacer

> Crear, editar y activar/desactivar promociones es **solo para Dirección**
> (igual que los topes de descuento en la Cuadratura). Los demás perfiles ven el
> catálogo en modo lectura.

- **Nueva promoción** — captura nombre, monto (tope), descripción, vigencia y los
  prototipos a los que aplica (ninguno = todos). Nace activa.
- **Editar** — ajusta cualquier dato de una promo existente.
- **Activar / Desactivar** — prende o apaga la promo sin borrarla. Una promo
  inactiva deja de auto-asignarse a ventas nuevas.
- **Refrescar** — recarga el catálogo.

## Cómo se aplica a una venta

1. Al **capturar una venta** (Fase 1), el sistema busca una promo **activa,
   vigente y aplicable al prototipo** de esa unidad y la asigna sola.
2. En la **Cuadratura**, el descuento que se aplica es el menor entre lo otorgado
   al cliente y el tope de la promo.
3. El **desglose de precio se congela al asignar** la venta (Fase 2): cambiar una
   promo después **no re-tarifa** ventas ya asignadas — solo afecta ventas nuevas.

## Preguntas frecuentes

**Cambié el monto de una promo y una venta vieja no cambió. ¿Por qué?**
Es lo correcto: el precio y el descuento se congelan cuando la venta se asigna.
Las ediciones al catálogo solo aplican a ventas capturadas de ahí en adelante.

**¿Qué pasa si dos promos podrían aplicar al mismo prototipo?**
El catálogo está pensado para que cada prototipo tenga su promo vigente clara.
Si ves un solape, desactiva la que no quieras que se use.

**Dejé los prototipos vacíos sin querer.**
Vacío significa "todos los prototipos". Edita la promo y selecciona solo los que
correspondan.

**No me aparece el botón "Nueva promoción".**
La administración del catálogo es solo de Dirección. Si necesitas un alta o un
cambio, pásalo con Dirección.

## Si algo no cuadra

Si una venta entró con un descuento distinto al esperado, revisa en su
**Cuadratura** qué promo se le asignó y con qué tope; recuerda que manda el menor
entre lo otorgado y el tope. Si el catálogo tiene una promo mal capturada,
solo Dirección puede corregirla — anota el nombre de la promo y avísale.
