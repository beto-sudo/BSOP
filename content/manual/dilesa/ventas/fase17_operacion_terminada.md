---
titulo: 'Fase 17 — Operación Terminada'
modulo: dilesa.ventas.fase17_operacion_terminada
version: '1.1.0'
actualizado: '2026-06-16'
---

## ¿Qué es esta fase?

El **sello final del expediente**. No es una revisión manual: el sistema
re-verifica solo las 4 condiciones y, si todo está en orden, habilita el
cierre.

**Quién la captura:** Dirección.

## Las 4 verificaciones

1. **Pipeline completo** — fases 1 a 16 cerradas.
2. **Expediente documental completo** — todos los documentos que la venta
   amerita están cargados (los que no aplican a esta venta no cuentan en
   contra).
3. **Cuadratura cubierta** — el dinero recibido cubre el valor de
   escrituración.
4. **Conformidad registrada** — la encuesta del cliente tiene respuesta (o
   constancia de "sin respuesta").

## Cómo se cierra

Si las 4 están en verde, el botón de cierre se habilita y la operación queda
**Terminada**. Si algo falta, la pantalla te dice exactamente qué es — igual
que el copiloto del expediente.

## Qué cambia al terminar

Al cerrar esta fase, la venta pasa a estado **Terminada** y **sale del pipeline
vivo**: ya no aparece en las tarjetas de Fases ni en la lista de Ventas con el
filtro por defecto (Activas) — la encuentras con el filtro "Terminadas" o
"Todos". Sigue recibiendo las encuestas de conformidad programadas. Si hubo un
error, **Dirección** puede regresarla a una fase anterior y vuelve a Activa.
