# ADR-052 — Pre-entrega y entrega como eventos físicos desacoplados de la posición de fase

- **Status**: Proposed (Sprint 1 — pendiente del OK de Beto al mergear)
- **Date**: 2026-06-27
- **Authors**: Beto, Claude Code
- **Iniciativa**: [`dilesa-entrega-desacoplada`](../planning/dilesa-entrega-desacoplada.md)
- **Relacionado**: [`dilesa-fases-venta-fuente-unica`] (convención "fase = último paso completado", `lib/dilesa/fases.ts`); ADR-051 (separación captura↔avance); hotfix `20260627010103` (revierte el gate F14 a Facturada(13))

---

## Contexto

El pipeline de ventas confunde **ejecutar una acción física** con **avanzar de fase**. Dos hechos del mundo real —la **revisión de pre-entrega** (checklist interno) y la **entrega** de la vivienda al cliente— ocurren con frecuencia **antes** de que Contabilidad facture, y tienen **fecha real propia**. Pero el modelo actual los representa como fases del pipeline (14 "Preparada para Entrega", 15 "Entregada"), de modo que registrarlos **avanza la posición**.

Eso produjo el incidente de jun-2026: subir el checklist de pre-entrega **brincaba** la venta a la fase 14 saltándose la facturación (candado duro 13). Se "adelantaban solas". El hotfix `20260627010103` restauró el candado (`fn_auto_preparada_entrega` exige hoy la 13 cerrada antes de auto-cerrar la 14), pero dejó vivo el acople de fondo: **no hay forma de registrar "la casa ya se entregó el día X" mientras la venta sigue, correctamente, atorada en facturación.**

Además, el retroceso manual (`regresarAFase`, [actions.ts:232](../../app/dilesa/ventas/[id]/actions.ts)) soft-borra las filas `venta_fases` posteriores y baja el caché — pero **el disparador del auto-avance volvía a empujar la venta** porque su condición seguía cumplida. Ese loop (regresas → se re-adelanta) es la segunda mitad del incidente y hay que cerrarlo de raíz.

## Decisión

**D1 — Pre-entrega y entrega son EVENTOS con fecha, no fases.** El hecho "se hizo la pre-entrega el día X" y "se entregó el día Y" se modela como dato fechado en `dilesa.ventas`, independiente de `fase_posicion`. La **posición de fase** se vuelve una proyección de "factura + eventos", no su causa.

**D2 — Dos columnas nuevas en `dilesa.ventas`: `fecha_pre_entrega` y `fecha_entrega` (`date`, nullable).** Sigue el patrón existente de hitos fechados (`fecha_escritura`, `fecha_detonacion`, `fecha_validacion_patronal`, …). Se descarta modelar el evento como fila en `venta_fases` (rompería la invariante "fila = fase cerrada") y se descarta usar el `created_at` del adjunto checklist (es fecha de captura, no la fecha real del evento, que puede ser anterior — regla 5). Los checklists (`checklist_pre_entrega`, `checklist_entrega`) siguen siendo el **documento soporte** requerido para registrar el evento (vía `FASE_ROLES`), pero **la fecha es la fuente de verdad** que lee el motor de avance.

**D3 — La factura (13) es candado duro; los eventos no avanzan la fase mientras no exista la 13.** Se pueden **registrar**:

- pre-entrega desde la **Escritura (11)** cerrada;
- entrega desde la **Detonación/pago (12)** cerrada.

Pero mientras la **13 no esté cerrada**, registrarlos **solo persiste la fecha + el documento** — la `fase_posicion` no se mueve (permanece donde el candado la dejó). Sin factura no hay avance, punto.

**D4 — Al cerrar la 13, la fase salta al ÚLTIMO paso físico ya ejecutado (Beto, 2026-06-27).** Semántica confirmada — consistente con la convención "fase = último paso COMPLETADO" de `fases.ts` y con el comportamiento ya en prod:

| Estado al facturar               | `fase_posicion` resultante                                                |
| -------------------------------- | ------------------------------------------------------------------------- |
| solo facturó                     | **13** — Facturada (el "brinco natural" siguiente es preparar la entrega) |
| facturó + pre-entrega registrada | **14** — Preparada para Entrega                                           |
| facturó + entrega registrada     | **15** — Entregada (dispara encuesta posventa)                            |

> Esto **corrige el off-by-one** del planning doc original (decía 15/16). La regla correcta es 14/15. Beto: _"si ya se preparó la entrega pasa a la 14 que es preparada para entrega y si ya se entregó pasa a la 15 que es entregada"_.

**D5 — Un solo motor `fn_avanzar_post_factura(venta_id)` reemplaza a `fn_auto_preparada_entrega`.** Generaliza el caso 14 actual a 14 **y** 15. Es idempotente, nunca retrocede, y **rellena las filas intermedias de `venta_fases` con su fecha real** (no la de hoy) para que la timeline no quede con huecos. Contrato:

```
fn_avanzar_post_factura(p_venta_id):
  if not (13 cerrada en venta_fases, deleted_at is null): return          -- candado duro
  leer fecha_pre_entrega, fecha_entrega, fase_posicion, empresa_id

  objetivo := 13
  if fecha_entrega     is not null: objetivo := 15
  elsif fecha_pre_entrega is not null: objetivo := 14

  if objetivo <= coalesce(fase_posicion, 0): return    -- ya está ahí o más adelante; no redispara

  -- rellenar huecos con fechas REALES, en orden, sin duplicar
  if objetivo >= 14 and no existe vf(14):
     insert venta_fases(14, fecha := coalesce(fecha_pre_entrega, fecha_entrega), nota := 'auto: post-factura')
  if objetivo >= 15 and no existe vf(15):
     insert venta_fases(15, fecha := fecha_entrega, nota := 'auto: post-factura')

  update ventas set fase_posicion=objetivo, fase_actual=nombre(objetivo)
   where id=p_venta_id and coalesce(fase_posicion,0) < objetivo
```

**D6 — Disparadores: facturar O registrar un evento ya facturado.** El motor corre desde dos puntos (simétrico al `tg_auto_preparada_entrega` actual, que ya escuchaba factura + checklist):

- `AFTER INSERT ON venta_fases WHEN (NEW.posicion = 13)` — facturó teniendo eventos previos.
- `AFTER UPDATE ON ventas WHEN (fecha_pre_entrega/fecha_entrega cambió)` — registró el evento estando ya facturado (caso normal: facturas, entregas semanas después).
  Envuelto en `BEGIN/EXCEPTION WHEN OTHERS` (fail-open: nunca tumba el INSERT/UPDATE disparador), igual que hoy.

**D7 — `regresarAFase` anula los eventos de las fases que deshace (cierra el loop del incidente).** Cuando se regresa una venta por debajo de 15, `fecha_entrega := null`; por debajo de 14, `fecha_pre_entrega := null`. Semánticamente correcto (regresar de "Entregada" = deshacer la entrega ⇒ ya no hay fecha de entrega) y **estructuralmente impide que el motor la re-empuje** (sin fecha, `objetivo` baja). Es la corrección de fondo del "regresas y se re-adelanta" que el hotfix solo curó con datos.

**D8 — Captura = registrar evento, no avanzar fase.** Las pantallas `14-preparada-entrega` y `15-entregada` dejan de llamar `marcarFase` (que inserta `venta_fases` + avanza). Pasan a una server action `registrarEventoEntrega(tipo, fecha, docs)` que: sube el checklist a `erp.adjuntos` + setea la columna de fecha (editable, permite fecha pasada — regla 5). El avance lo decide el motor D5. Hereda el patrón de ADR-051 (captura desacoplada del avance) y reusa `marcarFase` solo para el resto del pipeline.

## Side-effects a respetar

- **Encuesta posventa** (`fn_programar_encuesta_posventa`, `AFTER INSERT venta_fases WHEN posicion=15`): cuando el motor inserta la fila 15 con la **fecha real de entrega**, la encuesta se programa para `fecha_entrega + 2`. Si esa ventana ya venció (entrega retroactiva), el cron la emite en su próxima corrida — aceptable (el cliente ya habita la casa). _Decisión abierta DA-2 si Beto prefiere otro disparo._
- **`fn_sync_unidad_estado_por_fase`** (`AFTER INSERT/UPDATE ventas`): el salto a 14/15 sincroniza `dilesa.unidades.estado` por el camino ya existente — verificar en implementación que el estado físico de la unidad quede coherente (entregada).
- **`fn_ventas_sync_estado_terminada`**: solo deriva de la 17; el salto a 14/15 no la toca.
- **Correos de avance**: no hay (confirmado en el mapeo); el único efecto es la encuesta.

## Decisiones abiertas (con recomendación — Beto decide al revisar el PR)

- **DA-1 — Entrega sin pre-entrega previa.** Si llega `fecha_entrega` pero nunca se registró `fecha_pre_entrega`, el motor inserta la fila 14 con la misma `fecha_entrega` (la entrega presupone preparación). _Recomendado: sí, rellenar la 14 con la fecha de entrega._
- **DA-2 — Timing de la encuesta retroactiva.** _Recomendado: programar desde `fecha_entrega` real y dejar que el cron la emita aunque haya vencido._ Alternativa: `max(fecha_entrega, fecha_factura) + 2`.
- **DA-3 — Nombres de fase confusos (Beto, 2026-06-27: "está un poco confuso por el nombre de las fases").** NO se renombran las fases (estabilizarlas costó varios PRs — ver `fases.ts`). En su lugar, el sprint de UI mostrará los **eventos como hechos fechados** ("✓ Pre-entrega: 12 jun · ✓ Entrega: 20 jun") separados del badge de fase, para que se lea sin ambigüedad. Se trata en Sprint 4.

## Consecuencias

- Operación puede registrar pre-entrega y entrega **con su fecha real** sin romper el candado de factura ni "adelantar" la venta.
- Al facturar, la venta se pone al día sola hasta el último hito físico, con la timeline completa (filas 14/15 con fechas reales, sin huecos).
- El loop "regresas de fase y se re-adelanta" queda **estructuralmente cerrado** (D7), no solo curado con datos.
- Un único motor (`fn_avanzar_post_factura`) gobierna el tramo 13→15, reemplazando la función de caso único.

## Alternativas consideradas

- **Evento como fila en `venta_fases` con flag `es_evento`**: descartado — rompe la invariante "fila = fase cerrada" que leen el detalle, el copiloto de cierre y `regresarAFase`; obliga a parchear cada consumidor.
- **Usar el `created_at` del adjunto checklist como fecha del evento**: descartado — es fecha de captura, no la fecha real (regla 5 exige editable y posiblemente anterior).
- **Mantener el avance en `marcarFase` con gates más estrictos**: descartado — sigue acoplando "registrar" con "avanzar"; el candado se volvería a saltar por cualquier camino nuevo de captura. El desacople por dato fechado + motor único es la raíz.
- **Que `regresarAFase` conserve las fechas y el motor lleve un "piso" anti-redisparo**: descartado frente a D7 — anular la fecha es más simple y semánticamente honesto (deshacer la entrega borra su fecha).
