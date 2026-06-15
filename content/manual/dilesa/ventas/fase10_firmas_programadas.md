---
titulo: 'Fase 10 — Firmas Programadas'
modulo: dilesa.ventas.fase10_firmas_programadas
version: '1.1.0'
actualizado: '2026-06-15'
---

## ¿Qué es esta fase?

Se **agenda la firma** en notaría (fecha y hora ya acordadas con el notario) y,
si el dinero no alcanza a cubrir el precio, se configura el **crédito directo
DILESA** con su pagaré.

**Quién la captura:** Gerencia Ventas (también Dirección).

## Requisitos

Fase 9 (Validación Patronal) cerrada. Si queda saldo por cubrir, el crédito
directo debe configurarse para poder cerrar.

## Qué se captura

- **Fecha y hora de la firma**. Se **guarda sola** al capturarla (no hace falta
  cerrar la fase): en cuanto está, se habilita la **Póliza de Garantía**, que
  sale con **esa fecha** como fecha de expedición y de documento (no la del día
  en que se imprime). Si se reimprime, sale la misma fecha.
- **Candado:** una vez que se **expide la póliza** o se **cierra la fase**, la
  fecha de firma queda bloqueada. Si el notario mueve la cita, solo
  **Dirección** puede reprogramarla (desde esta misma pantalla).
- Los **depósitos del cliente** se listan como referencia de cobertura (vienen
  de Cobranza).
- **Crédito directo** (solo si hay saldo): monto, plan de pagos, aval. El
  interés ordinario es TIIE 28 días + 4 puntos (mínimo) y el moratorio 3 veces
  el ordinario — el sistema los propone y quedan pactados en la venta. Desde
  aquí se genera el **Pagaré PDF** (con su tabla de capital + interés por
  parcialidad) para imprimir, firmar y subir.

## Al cerrar

Sigue la **Fase 11 — Escriturada** (después de la firma física en notaría).
