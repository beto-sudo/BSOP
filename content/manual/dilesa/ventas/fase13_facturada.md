---
titulo: 'Fase 13 — Facturada'
modulo: dilesa.ventas.fase13_facturada
version: '2.0.0'
actualizado: '2026-06-16'
---

## ¿Qué es esta fase?

Contabilidad **registra la facturación** de la operación ante el SAT y deja en
regla el aviso de **PLD** (Prevención de Lavado de Dinero): sube los XML
fiscales, revisa el aviso, lo presenta en el portal y guarda el acuse.

**Quién la captura:** Contabilidad (también Gerencia Ventas y Dirección).

## Requisitos

Fase 12 (Detonada) cerrada.

## Los documentos (se guardan al subirse)

No hace falta cerrar la fase para que un documento quede guardado: **cada
archivo se guarda en el expediente en cuanto lo subes**, con tu nombre y la
fecha. Así varias personas pueden ir aportando documentos sin perder el trabajo,
y "Cambiar" conserva las versiones anteriores.

- **XML de la factura (CFDI)** — requerido. Al subirlo el sistema lo **valida
  solo**: que el emisor sea DILESA, el receptor sea el cliente de la venta, que
  esté timbrado y que el folio fiscal no esté usado en otra venta. Si algo no
  cuadra, lo rechaza y te dice por qué.
- **PDF de la factura** — opcional (el documento fiscal es el XML).
- **XML / PDF de la nota de crédito** — solo si la operación lleva nota de
  crédito.
- **PDF del Aviso PLD** — se habilita cuando ya hay XML de factura válido.
- **PDF del Acuse de envío PLD** — se habilita hasta que la revisión del aviso
  quede en verde (ver abajo).

> Los montos —**valor facturado** y **monto de la nota de crédito**— se sacan
> **del XML**, no se capturan a mano. El valor de escrituración viene de la
> Fase 8 y es contra el que se mide la cuadratura.

## El ciclo PLD, en dos pasos

### Paso 1 — Revisar el aviso

1. Sube el XML de la factura y el **PDF del Aviso PLD**.
2. Pulsa **Revisar operación**: el sistema lee el aviso con IA y lo **cruza
   contra el expediente** (sujeto obligado, datos del cliente, valor pactado vs.
   escrituración, domicilio y metros, notario e instrumento de la Fase 11,
   avalúo, depósitos, plazo del aviso…).
3. Si todo sale **en verde**, el aviso queda **congelado** (ya no se puede
   cambiar; solo Dirección podría reemplazarlo) y aparece el aviso de
   **"preséntalo en el portal SPPLD"**. Se habilita el slot del acuse.
4. Si algo sale en rojo, la pantalla te dice qué — corrige el dato o el
   documento y vuelve a revisar.

### Paso 2 — Acuse y cierre

5. Presenta el aviso en el portal **SPPLD** y sube el **Acuse de envío**.
6. El sistema revisa el acuse (que el estatus sea **ACEPTADO**, que corresponda
   a este aviso y dentro del plazo legal).
7. Con la revisión del aviso **y** del acuse en verde, se habilita **Cerrar
   Fase 13**.

## Al cerrar

Validaciones de cierre:

- **Nota de crédito documentada** si la cuadratura la pide (cuando el monto de
  nota de crédito es mayor a cero).
- Revisión PLD vigente en verde.

Si la revisión no está en verde, **Dirección** puede autorizar el cierre con un
**motivo** (queda en el rastro de auditoría); los demás roles solo ven el aviso
de que falta autorización.

La operación pasa a la etapa de **Entrega** (fases 14-17). Cuando más adelante
se cierra la Fase 17, la venta pasa a estado **Terminada**.

## Después de cerrar

Con la fase cerrada los documentos quedan congelados: **solo Dirección** puede
reemplazar un archivo (vuelve a versionar y obliga a re-revisar el PLD). Para
entrar a una fase ya cerrada usa **"Ver / corregir"** desde el expediente.

## Si algo no cuadra

Si la revisión marca un dato en rojo que tú sabes correcto (por ejemplo el
número de instrumento), revisa la Fase 11: el número que cruza el PLD es el
**del notario**, no el folio interno. Corrige ahí y vuelve a revisar.
