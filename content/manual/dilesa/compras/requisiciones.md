---
titulo: 'Compras — Requisiciones'
modulo: dilesa.compras.requisiciones
version: '1.2.0'
actualizado: '2026-06-24'
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
ya se generó), **Líneas**, **Estimado** y **Fecha**. **Haz clic en un renglón**
para abrir el detalle: ahí ves el hilo del gasto, las líneas y **los botones de
acción** (generar orden, pedir cotizaciones, cancelar).

## Cómo funciona (paso a paso)

1. **Nueva requisición** → eliges si es de **proyecto** (cada línea con su
   partida) o **gasto suelto** (solo descripción), y capturas las líneas.
2. Haz clic en la requisición y, en el detalle, sigue por uno de dos caminos:
   **Pedir cotizaciones (RFQ)** para comparar proveedores antes de comprar, o
   **Generar orden de compra** para convertirla directo (las mismas acciones
   viven en el menú ⋯ del renglón).
3. **Generar orden de compra** crea la OC heredando las líneas y su partida, y
   marca la requisición como autorizada. **La OC nace en Borrador**: asígnale
   proveedor y márcala **Enviada** en la pestaña **Órdenes** —ahí compromete el
   presupuesto.

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
