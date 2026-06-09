---
titulo: 'Compras — Requisiciones'
modulo: dilesa.compras.requisiciones
version: '1.0.0'
actualizado: '2026-06-07'
---

## ¿Qué es y para qué sirve?

Son las **solicitudes de compra** previas a la orden: alguien pide lo que necesita
(contra una partida del presupuesto), se autoriza, y de ahí **se genera la orden de
compra con un clic**.

## Cómo llegar

**Sidebar → DILESA → Compras → Requisiciones.** Se trabaja **un proyecto a la
vez** (o en modo **"Gasto suelto"** para compras sin proyecto).

## Lo que ves arriba (indicadores)

**Requisiciones**, **Pendientes**, **Autorizadas**, **Con orden** y **Estimado por
comprar**.

## La tabla

Cada renglón: **Folio**, **Solicitante**, **Estado**, **Orden** (la OC ligada si
ya se generó), **Líneas**, **Estimado** y **Fecha**.

## Cómo funciona (paso a paso)

1. **Nueva requisición** → eliges si es de **proyecto** (cada línea con su
   partida) o **gasto suelto** (solo descripción), y capturas las líneas.
2. Desde el menú del renglón, **Marcar autorizada**.
3. **Generar orden de compra** → crea la OC heredando las líneas y su partida (así
   la orden sí compromete el presupuesto). La OC nace en Borrador.

## Estados

| Estado         | Significa                              |
| -------------- | -------------------------------------- |
| **Pendiente**  | Creada, falta autorizar.               |
| **Autorizada** | Aprobada, lista para generar la orden. |
| **Con orden**  | Ya generó su orden de compra.          |

## Preguntas frecuentes

**¿Qué es "Gasto suelto"?**
Una requisición **sin proyecto** (las líneas no llevan partida). Útil para compras
generales; su orden tampoco se carga a un presupuesto de proyecto.

**Generé la orden, ¿también se autorizó la requisición?**
Sí: al generar la OC, la requisición queda autorizada automáticamente.

## Si algo no cuadra

Si no puedes generar la orden, revisa que la requisición esté **autorizada** y que
no tenga ya una orden ligada.

> **Ver también:** **El viaje de una compra (flujo del gasto)** — en [el manual](/dilesa/manual) — el mapa completo Solicitar → Cotizar → Ordenar → Recibir → Facturar → Pagar, con glosario.
