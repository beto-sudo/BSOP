---
titulo: 'Fase 15 — Entregada'
modulo: dilesa.ventas.fase15_entregada
version: '1.2.0'
actualizado: '2026-06-22'
---

## ¿Qué es esta fase?

La **entrega física de la vivienda al cliente**: se recorre la casa con él,
se palomea el Checklist de Entrega (22 conceptos, SÍ/NO), firman el cliente y
Atención a Clientes, y se sube el documento firmado.

**Quién la captura:** Vendedor / Atención a Clientes (también Dirección).

## Requisitos

- **Fase 14 (Preparada para Entrega) cerrada.**
- **Fase 12 (Detonada) cerrada — el pago ya recibido.** No se entrega la vivienda
  sin que haya entrado el pago. Si falta, la pantalla lo bloquea con un aviso. El
  pago lo registra **Cobranza** (no es paso de Atención a Clientes); al detonarse
  el crédito la entrega se desbloquea sola.

> Este pendiente aparece en la bandeja de **Atención a Clientes** (cola
> "Entrega"), que te trae directo a esta pantalla. Si todavía falta el pago, la
> tarjeta sale marcada con un badge rojo **"Falta pago"**.

## Cómo se trabaja

1. **Imprimir el checklist** (prellenado con vivienda y cliente).
2. Recorrer la casa **con el cliente**, palomeando cada concepto.
3. Firmas: el **cliente** y **Atención a Clientes**.
4. **Escanear y subir el PDF firmado** — al subirlo, la fase se cierra.

## Al cerrar

El sistema **programa la encuesta de conformidad** al cliente (se envía sola
2 días después): es la **Fase 16**, que normalmente se cierra sin que nadie
capture nada.
