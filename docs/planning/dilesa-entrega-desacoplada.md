# Iniciativa — Entrega y pre-entrega desacopladas del candado de factura (DILESA)

**Slug:** `dilesa-entrega-desacoplada`
**Empresas:** DILESA
**Schemas afectados:** `dilesa` (pipeline de ventas: `venta_fases`, `ventas`, triggers de auto-cierre `fn_auto_preparada_entrega`/`tg_*`; posible columna de fecha de entrega física), `erp.adjuntos` (checklist pre-entrega ya existe como rol). UI: páginas de captura `app/dilesa/ventas/[id]/capturar/13-facturada`, `14-preparada-entrega`, `15-entregada`, `16-conformidad`.
**Estado:** in_progress
**Próximo hito:** Sprint 2 — captura de pre-entrega (desde 11) y entrega (desde 12) como eventos con fecha editable, sin avanzar fase (columnas `fecha_pre_entrega`/`fecha_entrega` + action `registrarEventoEntrega`)
**Dueño:** Beto
**Creada:** 2026-06-26
**Última actualización:** 2026-06-27 (Sprint 1 cerrado: ADR-052 + off-by-one corregido — ver Bitácora)

## Problema

La factura (fase 13) es un **candado duro** del pipeline: una venta no debe pasar
de "Facturación" hasta que exista el CFDI. Pero dos acciones físicas —la
**revisión de pre-entrega** (checklist) y la **entrega** de la vivienda— ocurren
con frecuencia **antes** de que Contabilidad facture, y con fecha real propia.

El modelo actual confunde "ejecutar la acción" con "avanzar de fase":

- Subir el checklist (o, en el modelo #1075, checklist + pago) **brincaba** la
  venta a "Preparada para Entrega" (14) saltándose la facturación. Eso rompió la
  invariante del candado y provocó que operación viera ventas "adelantarse solas"
  (25–26 jun 2026; ver Bitácora del hotfix).
- No hay forma de registrar "la vivienda ya se entregó" mientras la venta sigue,
  correctamente, atorada en facturación.

## Outcome esperado

El pipeline avanza solo hasta donde el candado de factura permite, pero el
sistema **recuerda** las acciones físicas ya ejecutadas (con su fecha real) y,
al facturar, se pone al día de un salto a la fase que corresponde.

## Alcance — la regla (Beto, 2026-06-26)

1. La **revisión pre-entrega** (checklist) se puede hacer desde la **Escritura
   (11)** — pero NO avanza la fase. Evento con fecha propia.
2. La **entrega física** se puede registrar si ya se detonó el pago (12) — tampoco
   avanza la fase. Evento con fecha propia.
3. Sin factura (13 sin cerrar), la venta **permanece en Facturación** (fase 12),
   aunque ya tenga pre-entrega y/o entrega hechas.
4. **Al facturar** (cerrar 13), el pipeline salta al **último paso físico ya ejecutado**
   (Beto, 2026-06-27 — confirmado contra la convención "fase = último paso completado"):
   - solo facturó → queda en **Facturada (13)**;
   - facturó + pre-entrega hecha → salta a **Preparada para Entrega (14)**;
   - facturó + ya entregada → salta a **Entregada (15)** (dispara la encuesta posventa).
     > Corrige el off-by-one de la redacción original (decía 15/16). Detalle en ADR-052 D4.
5. Las fechas de pre-entrega y entrega pueden ser **anteriores** a la de la
   factura (se respeta la fecha real de ejecución, no la de captura).

### Fuera de alcance (lo resolvió el hotfix previo)

- Restaurar el candado en Facturada(13) y reconciliar las ventas que #1075
  re-adelantó. Ya en prod (ver Bitácora).

## Riesgos

- **Reescribir el tramo 13→17 del pipeline** toca triggers de auto-cierre y la
  convención "fase_actual = última fase COMPLETADA". El salto multi-fase debe
  insertar las filas intermedias en `venta_fases` (14/15) con sus fechas reales,
  no solo mover el caché, o la timeline queda con huecos.
- **Modelar la entrega como evento**: hoy "Entregada" (15) es una fase del
  pipeline. Hay que separar el _hecho_ "entregada el día X" (capturable antes) de
  la _posición_ de fase. Decidir si vive en una columna nueva de `dilesa.ventas`
  (ej. `fecha_entrega_fisica`) o en `venta_fases` con un flag.
- **Correos/efectos secundarios**: avanzar a 15/16 dispara encuesta posventa
  (pos 15) y otros side-effects. El salto automático no debe disparar correos
  fuera de tiempo.
- **Pipeline secuencial** (`marcarFase === posActual+1`): el salto al facturar lo
  hace un trigger, no `marcarFase`. Verificar que registrar la 13 con la venta ya
  más adelante no quede bloqueado (hoy el INSERT de `venta_fases` no está gateado,
  solo el caché).

## Decisiones registradas

- **2026-06-26** — La factura (13) es candado duro; pre-entrega y entrega son
  eventos con fecha que NO avanzan fase hasta facturar. Al facturar, salto
  inteligente según lo ya ejecutado. (Regla de negocio de Beto, base de esta
  iniciativa.)
- **2026-06-27** — **Semántica del salto = último paso físico completado: 13 / 14
  / 15** (no 15/16). Confirmado por Beto y consistente con la convención de
  `fases.ts` ("fase = último paso completado") y con el auto-cierre ya en prod.
  Corrige el off-by-one de la redacción inicial. (ADR-052 D4.)
- **2026-06-27** — **Modelo evento-vs-fase = columnas fechadas + motor único**
  (ADR-052): `dilesa.ventas.fecha_pre_entrega` / `fecha_entrega` como eventos;
  `fn_avanzar_post_factura` (reemplaza a `fn_auto_preparada_entrega`) proyecta la
  posición y rellena `venta_fases` 14/15 con fechas reales. Disparado al facturar
  o al registrar el evento ya facturado.
- **2026-06-27** — **`regresarAFase` anula las fechas de evento que deshace** (D7):
  cierra estructuralmente el loop "regresas de fase y se re-adelanta" que el
  hotfix solo curó con datos.

## Bitácora

- **2026-06-26** — _Hotfix previo (no es parte del rediseño, lo antecede):_
  revertido el gate de la fase 14 de Detonada(12) de vuelta a Facturada(13)
  (migración `20260627010103`, espejo de #1048; revierte #1075) y reconciliadas
  a fase 12 las 4 ventas que el backfill de #1075 había re-adelantado a 14 sin
  factura (Julio César/M11-L4, Nancy/M22-L1, Christopher/M3-L16, Eduardo/M4-L29).
  Checklists conservados. Aplicado a prod por MCP + ledger reconciliado. Esto
  detuvo el síntoma; el rediseño (salto al facturar) queda pendiente.
- **2026-06-27** — _Sprint 1 (diseño, sin código):_ **ADR-052** redactado
  (`docs/adr/052_pipeline_eventos_fisicos_desacoplados.md`) — modelo evento-vs-fase,
  columnas `fecha_pre_entrega`/`fecha_entrega`, motor `fn_avanzar_post_factura`
  (14/15), disparadores, anti-redisparo vía `regresarAFase` (D7), side-effects de
  encuesta. **Off-by-one corregido** (14/15, no 15/16) tras confirmación de Beto.
  Mapeado el tramo 13→17 vivo (triggers en prod + código TS). Decisiones abiertas
  DA-1/DA-2/DA-3 anotadas en el ADR para revisión. Pendiente: OK de Beto al
  mergear → arranca Sprint 2.

## Sprints / hitos

- **Sprint 1 — ✅ hecho (2026-06-27):** ADR-052 (modelo evento-vs-fase + diseño
  del motor de salto al facturar, 13 → 14/15). Sin código de app aún.
- **Sprint 2 (siguiente):** columnas `fecha_pre_entrega`/`fecha_entrega` +
  `registrarEventoEntrega`; captura de pre-entrega desde la 11 y entrega desde la
  12 como eventos con fecha editable, sin avanzar fase.
- **Sprint 3:** motor `fn_avanzar_post_factura` (reemplaza `fn_auto_preparada_entrega`)
  - disparadores + anti-redisparo en `regresarAFase` + manejo de la encuesta.
- **Sprint 4:** UI del listado/detalle que distinga "pre-entrega/entrega hechas,
  pendiente de factura" del estado de fase (atiende DA-3, sin renombrar fases).
