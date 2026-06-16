---
titulo: 'Fase 12 — Detonada'
modulo: dilesa.ventas.fase12_detonada
version: '1.2.0'
actualizado: '2026-06-16'
---

## ¿Qué es esta fase?

La institución **liberó el recurso** del crédito y DILESA recibió el depósito.

**Normalmente se cierra SOLA**: cuando Contabilidad registra el abono de la
institución en **Cobranza** (el depósito real, con su comprobante), la venta
avanza a Detonada automáticamente — un solo registro, en un solo lugar. El
dinero queda en el estado de cuenta del cliente, la cuadratura se completa y
el comprobante se copia al expediente.

## Cómo se detona una venta (camino normal)

1. Llega el depósito de la institución al banco.
2. Contabilidad lo registra en **Cobranza** sobre el cliente, con fuente
   **Institución**, monto, fecha y comprobante.
3. La venta (que debe estar **Escriturada**) pasa a **Detonada** sola, con la
   fecha del depósito y quién lo registró en la bitácora.

## ¿Y esta pantalla?

Es el **respaldo manual** para casos fuera del camino normal (igual que la
captura manual del dictamen en F8). Requiere Fase 11 cerrada y captura fecha,
monto y comprobante a mano.

El cierre manual es **solo de Dirección** (es una salida de excepción, no el
flujo normal). Si no eres Dirección, la pantalla te guía a registrar el abono en
**Cobranza** —que es lo que detona la venta sola— en vez de cerrar a mano.

## Preguntas frecuentes

**Registré el abono en Cobranza y la fase no avanzó.**
Revisa que la venta esté en **Escriturada (11)** — un depósito anticipado se
registra normal pero no avanza la fase (esa se cierra por aquí cuando toque).
Y que el abono sea de fuente **Institución**, no Cliente.

**¿Se puede deshacer?**
Cancelar el abono en Cobranza NO regresa la fase — eso lo hace Dirección
manualmente, con registro en bitácora.

## Al cerrar

Sigue la **Fase 13 — Facturada** (Contabilidad).
