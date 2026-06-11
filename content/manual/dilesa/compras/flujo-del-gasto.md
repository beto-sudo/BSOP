---
titulo: 'El viaje de una compra (flujo del gasto)'
modulo: dilesa.compras
version: '1.0.0'
actualizado: '2026-06-09'
---

## El flujo en una línea

Toda compra de DILESA recorre el mismo camino:

**Solicitar → Cotizar (opcional) → Ordenar → Recibir → Facturar → Pagar**

Cada paso vive en una pantalla, pero es **una sola historia**: desde cualquier
documento puedes ver el **Hilo del gasto** (la tira de pasos con palomas) y
brincar al documento anterior o siguiente con un clic.

## Paso a paso

1. **Solicitar** — _Compras › Requisiciones._ Capturas qué necesitas, con su
   partida del presupuesto. Dirección la **autoriza**.
2. **Cotizar** _(opcional)_ — _Compras › Cotizaciones._ Si quieres comparar
   proveedores, desde la requisición autorizada usa **"Pedir cotizaciones
   (RFQ)"**: se crea la solicitud con las mismas líneas, invitas proveedores y
   comparas precios lado a lado. Al **adjudicar**, el sistema genera la orden
   (o el contrato, si es obra) solito.
3. **Ordenar** — _Compras › Órdenes._ La orden de compra formal al proveedor.
   Al **enviarla**, su monto queda **comprometido** contra el presupuesto del
   proyecto.
4. **Recibir** — _Compras › Recepciones._ Registras lo que llegó (puede ser en
   partes). Lo recibido se vuelve gasto **ejercido**.
5. **Facturar** — _CxP › Facturas._ Subes el XML del SAT; el sistema sugiere
   la orden del proveedor y hereda su partida.
6. **Pagar** — _CxP › Programación y Pagos._ Programas el pago, Dirección lo
   **aprueba**, Tesorería lo **marca pagado**. El monto queda **pagado** en el
   control del proyecto.

### Variante: obra (contratistas)

Para mano de obra, la RFQ se hace tipo **obra**: al adjudicar se genera un
**contrato** (no una orden). El avance se registra con **estimaciones**
(_Construcción › Estimaciones_) que se facturan y pagan igual que arriba.

### Variante: gasto directo (sin orden)

Una factura que llega **sin orden previa** también cuenta — solo asígnale su
**partida** en el drawer de la factura. **Ojo:** una factura sin orden y sin
partida es **invisible para el presupuesto** (la verás marcada con el aviso
"Sin partida" en la lista). Asignarla toma 10 segundos y mantiene el control
del proyecto completo.

## ¿Dónde veo cuánto va gastado?

En el proyecto: **Proyectos → (tu proyecto) → pestaña Gasto**. Ahí están las 4
capas por partida: **Presupuesto · Comprometido · Ejercido · Pagado** (y el
disponible). Si el disponible sale en rojo, esa partida está
sobre-contratada.

## Glosario rápido

| Término                              | Qué significa                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| **Requisición**                      | La solicitud interna: "necesito esto". Aún no compromete dinero.                            |
| **RFQ / Cotización**                 | Pedir precios a varios proveedores para comparar. Opcional.                                 |
| **Orden de compra (OC)**             | El pedido formal al proveedor. Al enviarse, **compromete** presupuesto.                     |
| **Recepción**                        | Registrar lo que llegó. Convierte lo comprometido en **ejercido**.                          |
| **Contrato de obra**                 | El equivalente de la OC para obra con contratistas: compromete su partida.                  |
| **Estimación de contrato**           | El avance de un contrato de obra. Dirección la **autoriza** y ahí se vuelve ejercido.       |
| **Destajos semanales**               | El pago semanal a contratistas de **vivienda** por tareas terminadas (otra cosa, otro tab). |
| **Factura**                          | El documento fiscal (XML) del proveedor. Entra a Cuentas por Pagar.                         |
| **Pago**                             | La salida de dinero. Se programa → se aprueba → se paga.                                    |
| **Partida**                          | El renglón del presupuesto del proyecto al que se carga todo lo anterior.                   |
| **Comprometido / Ejercido / Pagado** | Las 3 capas del gasto: lo prometido, lo recibido, lo liquidado.                             |
| **Autorizar vs Aprobar**             | "Autorizar" es para requisiciones; "Aprobar" es para pagos. Misma idea, documento distinto. |
| **Promovido** (anteproyecto)         | El anteproyecto ya se convirtió en desarrollo activo. No significa "terminado".             |
