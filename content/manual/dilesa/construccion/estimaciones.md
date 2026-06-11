---
titulo: 'Construcción — Estimaciones (destajos semanales de vivienda)'
modulo: dilesa.construccion.estimaciones
version: '1.1.0'
actualizado: '2026-06-10'
---

## ¿Qué es y para qué sirve?

Son los **destajos semanales de vivienda**: cada estimación agrupa las tareas
terminadas de un periodo, aplica la retención y queda lista para pagar. El ciclo
típico es **cierre el miércoles → pago el jueves**.

> **No confundir** con las **estimaciones de contrato de obra** (urbanización,
> cabecera, tareas menores), que miden el avance de un contrato y las autoriza
> Dirección. Esas viven en **Contratos → sub-vista "Obra de proyecto"** y
> tienen su propia guía: _Contratos de obra y sus estimaciones_.

## Cómo llegar

**Sidebar → DILESA → Inmobiliario → Construcción → pestaña Estimaciones.**

## Lo que ves arriba (indicadores)

**Estimaciones**, **Pendientes de pago**, **Pagadas**, **Neto total** y
**Pendiente de pago $**.

## La tabla

Cada renglón: **Código**, **Fecha de cierre**, **Pago programado**, **Pagada**
(fecha real), **Contratista**, **Tareas** (cuántas agrupa), **Bruto**, **Neto**
(ya con la retención aplicada) y **Estado**.

## Lo que puedes hacer

- **Buscar / filtrar** — por código o contratista, por **estado**, y por rango de
  fechas de **cierre** o de **pago**.
- **Nueva estimación** — captura una estimación nueva (requiere permiso de
  escritura).
- **Abrir una estimación** — clic en el renglón para ver el desglose por obra.

## Estados

| Estado        | Significa                            |
| ------------- | ------------------------------------ |
| **Borrador**  | En captura, aún no aprobada.         |
| **Aprobada**  | Validada, lista para facturar/pagar. |
| **Facturada** | Ya tiene su factura asociada.        |
| **Pagada**    | Liquidada al contratista.            |
| **Cancelada** | Anulada.                             |

## Preguntas frecuentes

**¿La retención ya está aplicada?**
Sí: el **Neto** es el monto después de la retención. El **Bruto** es antes.

**¿Qué cuenta como "pendiente de pago"?**
Todo lo que está en Borrador, Aprobada o Facturada (es decir, lo que aún no se
paga ni se canceló).

## Si algo no cuadra

Si un monto no cuadra, abre la estimación: el desglose te muestra obra por obra
qué tareas la componen.
