---
titulo: 'Presupuesto del proyecto: autorizarlo y modificarlo'
modulo: dilesa.proyectos.gasto
version: '1.0.0'
actualizado: '2026-06-10'
---

## La idea en una línea

El presupuesto de un proyecto vive en **Proyectos › (tu proyecto) › Gasto** y
tiene dos vidas: **antes** de autorizarse se edita libre (estás armando el
número); **después** de autorizarse queda **congelado** y todo cambio — para
arriba o para abajo — pasa por una **orden de cambio** con motivo y documentos.
Así siempre puedes contestar: _¿cuánto era el presupuesto original, en qué
cambió, quién lo autorizó y por qué?_

## Antes: la formación (edición libre)

Mientras el proyecto no tenga presupuesto inicial autorizado, las partidas se
capturan y corrigen directo en la tabla (el banner ámbar de arriba te lo
recuerda). Los montos llegan de las cotizaciones del checklist, de las RFQ o
los capturas a mano. En esta etapa no hay candados: es trabajo de estimación.

## Autorizar el presupuesto inicial

Cuando el número está listo, **Dirección** presiona **"Autorizar presupuesto
inicial"** (banner del tab Gasto):

1. El sistema **congela una foto completa** de todas las partidas — ese es el
   **presupuesto original** del proyecto. No se puede volver a editar ni
   repetir (es un acto único).
2. Si hay partidas en estado **preliminar**, te pide resolverlas primero
   (autorizarlas o descartarlas) — el original no se congela con pendientes.
3. Puedes dejar una **nota** (p. ej. "aprobado en junta de consejo del 15
   de junio") — queda en el expediente.

A partir de aquí la tabla muestra tres columnas de presupuesto:

| Columna      | Qué es                                                      |
| ------------ | ----------------------------------------------------------- |
| **Original** | La foto congelada al autorizar. Nunca cambia.               |
| **Cambios**  | La suma (±) de las órdenes de cambio **autorizadas**.       |
| **Vigente**  | Original + Cambios. Contra esto se mide el gasto del ciclo. |

## Después: cambios por orden (aditivas y deductivas)

Con el presupuesto congelado, el monto de una partida **no se puede editar**
(el campo aparece bloqueado). Lo que sí puedes hacer es **solicitar una orden
de cambio** con el botón de la balanza (⚖) en el renglón de la partida:

1. Eliges **Aditiva** (incrementa) o **Deductiva** (disminuye) — las dos
   requieren autorización, también las bajadas: una deductiva mal hecha puede
   esconder un sobrecosto moviéndolo de lugar.
2. Capturas el **monto**, la **categoría del motivo** (cambio de alcance,
   precio de mercado, error de estimación, resultado de adjudicación,
   reasignación, otro) y el **motivo** escrito — este texto es obligatorio:
   es el expediente de la decisión.
3. **Adjuntas el soporte**: la cotización, la minuta, el correo — lo que
   ampara el cambio. Quien autorice lo verá antes de decidir.
4. La orden queda **solicitada**. Mientras tanto puedes corregirla o
   **retirarla**; el presupuesto no se mueve.

**Dirección** ve las órdenes pendientes en el panel del tab Gasto (y en el
chip _"cambios de presupuesto por autorizar"_ de la bandeja **Te toca**):

- **Autorizar** — el vigente de la partida se mueve en ese momento, y el
  cambio queda registrado con quién, cuándo y los montos antes/después.
- **Rechazar** — pide un motivo (también queda en el expediente). El
  presupuesto no cambia.

Las órdenes resueltas son **inmutables**: no se editan ni se borran. Son la
historia.

## Reconstruir la historia de una partida

El botón del relojito (🕘) en el renglón abre el **historial de la partida**:
el original congelado, todas las órdenes (autorizadas, rechazadas, retiradas y
pendientes) con su motivo, sus documentos y quién decidió qué y cuándo. Si
algún día te preguntas _"¿por qué esta partida vale esto?"_, la respuesta
está ahí — siempre cuadra: **Original + Cambios = Vigente**.

## Preguntas frecuentes

**¿Por qué no puedo editar el monto de una partida?**
Porque el proyecto ya tiene presupuesto inicial autorizado. El cambio va por
orden (⚖ en el renglón). Los demás campos (clasificación, proveedor, fechas)
siguen editables.

**¿Y si necesito una partida nueva después de autorizar?**
Se crea normal, pero **nace en $0**: su presupuesto se asigna con una orden
aditiva — así también lo nuevo trae motivo y soporte.

**¿Puedo bajar una partida a menos de lo que lleva gastado?**
La deductiva no puede dejar el vigente en negativo; el sistema la rechaza al
autorizar. Revisa el comprometido/ejercido de la partida antes de solicitar.

**¿Quién puede autorizar?**
El presupuesto inicial y las órdenes de cambio los autoriza **Dirección**
(o admin). Solicitar cambios puede hacerlo cualquiera con permiso de
escritura en el tab Gasto.

**¿Qué pasa con las columnas Comprometido / Ejercido / Pagado?**
Nada cambia: siguen llegando solas del ciclo de compras (órdenes, recepciones,
facturas, pagos) contra el **vigente**. Ver _"El viaje de una compra"_ en el
manual de Compras.

## Ver también

- **El viaje de una compra (flujo del gasto)** — Compras: cómo lo
  comprometido/ejercido/pagado llega a cada partida.
- **Proyectos activos** — el detalle del proyecto y sus tabs.
