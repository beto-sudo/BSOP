---
titulo: 'Fase 7 — Solicitud de Dictaminación'
modulo: dilesa.ventas.fase07_solicitud_dictamen
version: '1.0.0'
actualizado: '2026-06-11'
---

## ¿Qué es esta fase?

Se **manda la operación al notario**: se elige el notario del catálogo y el
sistema le envía la solicitud de dictamen por correo, con una liga para que
suba la carta de instrucción directamente.

**Quién la captura:** Gerencia Ventas (también Dirección).

## Requisitos

Fase 6 (Inscrita) cerrada.

## Qué se captura

- **Notario** — del catálogo de notarios.
- **Fecha de la solicitud** (default hoy).
- Sin documento — el dictamen llega en la Fase 8.

## Al cerrar

El notario recibe el correo con su liga. Cuando suba la carta de instrucción,
la **Fase 8 — Dictaminada** se cierra sola (o se captura manual).
