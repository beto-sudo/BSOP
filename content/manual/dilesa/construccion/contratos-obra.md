---
titulo: 'Construcción — Contratos de obra y sus estimaciones'
modulo: dilesa.construccion.contratos
version: '1.0.0'
actualizado: '2026-06-10'
---

## ¿Qué es y para qué sirve?

Son los **contratos de obra del proyecto** (urbanización, obra de cabecera,
tareas menores) y sus **estimaciones de contrato**: el avance que el
contratista cobra contra el monto contratado. Aquí vive el estado de cuenta
del contrato y el ciclo de cada estimación.

> **No confundir** con los **destajos semanales de vivienda** (pestaña
> Estimaciones): aquellos pagan tareas terminadas de casas, semana a semana.
> Las **estimaciones de contrato** miden el avance de un contrato de obra y
> las autoriza Dirección.

## Cómo llegar

**Sidebar → DILESA → Inmobiliario → Construcción → pestaña Contratos →
sub-vista "Obra de proyecto"** y clic en un contrato.

## El estado de cuenta (arriba del detalle)

- **Contratado** — el valor total del contrato.
- **Devengado** — la suma de estimaciones **autorizadas** (es el avance real;
  también es lo que el costeo del proyecto cuenta como _ejercido_ en esa
  partida).
- **Por devengar** — lo que falta de avance.
- **Pendiente de autorizar** — estimaciones capturadas que Dirección aún no
  autoriza (no cuentan como devengo todavía).
- **Facturado / Pagado** — lo que ya tiene documento fiscal y lo ya liquidado.
- **Retenciones** — el fondo de garantía acumulado (se libera al finiquito).
- **Anticipo por amortizar** — cuánto del anticipo entregado falta por
  descontar de las estimaciones.

## El ciclo de una estimación

| Estado         | Significa                                                                      |
| -------------- | ------------------------------------------------------------------------------ |
| **borrador**   | Capturada, todavía no es avance oficial. Cualquiera con permiso puede crearla. |
| **autorizada** | **Dirección** la autorizó: ya es devengo del contrato y cuenta en el costeo.   |
| **pagada**     | Su pago en Cuentas por Pagar se ejecutó.                                       |
| **cancelada**  | Anulada con motivo; queda visible como rastro pero no suma.                    |

1. **Registrar estimación** — captura etiqueta, fecha, monto (las
   amortizaciones del anticipo van en negativo). Nace en borrador.
2. **Autorizar** (solo Dirección) — el botón aparece en cada borrador. Al
   autorizar, la estimación se vuelve inmutable: si hay un error, se cancela
   con motivo y se captura de nuevo.
3. **Cobrarla** — según el modo de facturación del contrato (abajo).

## Los dos modos de facturación

**A. Factura por estimación** (el clásico): cada estimación autorizada se
**Emite a CxP** con su propia factura, y de ahí se programa su pago.

**B. Factura total del contrato**: el contratista factura todo el contrato por
adelantado. Se captura una sola vez con **"Capturar factura total"** y entonces
cada estimación autorizada se paga con **"Programar pago"** — un pago parcial
aplicado a esa factura, por el **neto** (monto − retención).

Los dos modos **no se mezclan** en un mismo contrato: el sistema lo bloquea
para no duplicar el cargo del mismo trabajo.

## El pago

"Programar pago" crea el pago en **Cuentas por Pagar** por el neto de la
estimación; ahí sigue el ciclo normal (aprobar → pagar). Cuando el pago se
ejecuta, la estimación pasa sola a **pagada**. La retención queda como saldo
de la factura y se libera al finiquito.

## Preguntas frecuentes

**Capturé una estimación y el costeo no se movió.**
Está en borrador: pídele a Dirección que la autorice. El devengo (ejercido)
solo cuenta estimaciones autorizadas.

**¿Por qué no puedo emitir la factura de una estimación?**
O está en borrador (autorízala primero), o el contrato tiene factura total —
en ese modo se programa el pago contra esa factura, sin facturas nuevas.

**Necesito corregir una estimación autorizada.**
Cancélala con motivo y captura una nueva. La autorizada es inmutable a
propósito (es el devengo oficial del contrato).

**¿Quién puede autorizar?**
Solo Dirección (o un administrador). El sistema lo valida también en el
servidor y deja rastro de quién y cuándo.

## Si algo no cuadra

El estado de cuenta sale de las estimaciones y facturas del contrato: si un
número se ve mal, revisa primero si hay estimaciones sin autorizar o
canceladas, y si la factura del contrato está en el modo correcto.
