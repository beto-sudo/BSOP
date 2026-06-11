---
titulo: 'Fase 13 — Facturada'
modulo: dilesa.ventas.fase13_facturada
version: '1.0.0'
actualizado: '2026-06-11'
---

## ¿Qué es esta fase?

Contabilidad **registra la facturación** de la operación: sube la factura (y
nota de crédito / aviso PLD si aplican) y captura los montos finales de la
cuadratura.

**Quién la captura:** Contabilidad (también Gerencia Ventas y Dirección).

## Requisitos

Fase 12 (Detonada) cerrada.

## Qué se captura

- **Factura** (PDF, requerida) · **Nota de crédito** y **Aviso PLD** (opcionales).
- **Valor de escrituración** (requerido — contra él se mide la cuadratura),
  valor real venta DILESA, valor facturado y monto de la nota de crédito.
- Los **depósitos del cliente** se muestran como referencia (de Cobranza).

## Al cerrar

La operación pasa a la etapa de **Entrega** (fases 14-17).
