---
titulo: 'Fase 2 — Asignada (autorización)'
modulo: dilesa.ventas.autorizar
version: '1.0.0'
actualizado: '2026-06-11'
---

## ¿Qué es esta fase?

La **autorización de la asignación**: Dirección revisa que el expediente de la
solicitud esté completo y en regla, y autoriza. Con esto la vivienda queda
formalmente asignada al cliente.

**Quién la captura:** Dirección (rol autorizador configurado).

## Requisitos para autorizar

- La venta está en fase **Solicitud** (1).
- La solicitud es **líder de la cola** del apartado de esa vivienda.
- Los documentos firmados están cargados: **solicitud de asignación firmada**,
  **aviso de privacidad**, **FICU** y **expediente digital**.

## Qué se hace en la pantalla

Se revisan los 4 documentos (se pueden abrir y también subir aquí si falta
alguno) y se pulsa **Autorizar asignación**. La venta pasa a fase Asignada.

## Al cerrar

Sigue la **Fase 3 — Formalizada**: imprimir el contrato de promesa de
compraventa, firmarlo con el cliente y subirlo.

## Preguntas frecuentes

**Veo la pantalla pero no puedo autorizar.**
Autorizar requiere permiso de **escritura** sobre la autorización (lo tiene
Dirección). Si te toca autorizar y no puedes, pide el ajuste de permisos.

**El botón dice que la solicitud no es líder de la cola.**
Hay otra solicitud más antigua sobre la misma vivienda. Se autoriza la de
adelante, o se espera a que expire su apartado.
