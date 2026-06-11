# Iniciativa — Contratos y estimaciones: devengo claro + liga a CxP (DILESA)

**Slug:** `dilesa-contratos-estimaciones`
**Empresas:** DILESA
**Schemas afectados:** `erp` (`facturas.contrato_id` nuevo, `cxp_pagos.obra_estimacion_id` nuevo, redefinición de la capa "ejercido" en `v_partida_control`), `dilesa` (`obra_estimaciones`: ciclo de estados + autorización), UI en `app/dilesa/construccion/**` y `app/dilesa/cxp/**`
**Estado:** in_progress
**Próximo hito:** Beto revisa Preview de S2 (PR #804) → OK para aplicar migraciones `20260610223000` + `20260610224834` a prod → merge S2. En paralelo: Sprint 3 (pago desde estimación + hilo del gasto + glosario)
**Dueño:** Beto
**Creada:** 2026-06-10
**Última actualización:** 2026-06-10

> **Coordinación:** iniciativa hermana de `dilesa-presupuesto-baseline` (corre en
> paralelo en otra sesión). Zonas de contacto: `erp.v_partida_control` (esta
> iniciativa redefine la capa ejercido; la hermana NO la toca) y el tab Gasto
> (`GastoActividad` aquí gana estimaciones; la hermana agrega columnas de
> baseline a `CosteoModule`). Regla 2 de `CLAUDE.md` (rebase preventivo) aplica
> con cuidado extra en `components/dilesa/*`.

## Problema

El análisis del 2026-06-10 (sesión de control del gasto) confirmó la
sensación de Beto de que contratos y estimaciones están "revueltos":

- **Dos sistemas distintos se llaman igual.** `dilesa.estimaciones` es el
  pago semanal a contratistas por tareas terminadas (destajo de MO de
  vivienda, ciclo borrador→aprobada→facturada→pagada, SIN liga a CxP);
  `dilesa.obra_estimaciones` es el avance de un contrato de obra
  (anticipo/№/finiquito, montos directos, SIN ciclo de estados ni
  autorización, con botón "Emitir a CxP"). El operador no sabe cuál es "la"
  estimación.
- **El listado de Contratos no distingue tipos.** La DB sí (columna `tipo`:
  vivienda | urbanizacion | obra_cabecera | tarea_menor, ADR-038), pero la
  UI muestra todo en una sola tabla sin badge ni filtro.
- **El caso real "factura total del contrato + abonos por estimación" no
  cabe.** `erp.facturas.obra_estimacion_id` (UNIQUE activa) asume 1 factura
  POR estimación; la factura total no puede ligarse al contrato (no hay
  `contrato_id`); y el "ejercido" de `v_partida_control` cuenta facturas —
  una factura total anticipada mostraría 100% ejercido con la obra al 20%.
- **La estimación de obra no tiene gobierno**: sin estados, sin
  autorización, sin rastro de quién aprobó pagar un avance.

Lo que SÍ está sólido: CxP soporta N pagos parciales a una factura con
saldo (`cxp_pago_aplicaciones`), y el contrato ya compromete la partida en
las 3 capas (ADR-042).

## Outcome

1. **El contrato es un estado de cuenta legible**: contratado | estimado
   (devengado) | facturado | pagado | anticipo amortizado | retenciones, en
   su detalle.
2. **La estimación es el devengo autorizado**: ciclo borrador → autorizada
   (Dirección) → pagada; el "ejercido" del control presupuestal refleja
   avance real de obra, no documentos fiscales.
3. **Ambos modos de facturación conviven**: factura por estimación (actual)
   y factura total del contrato saldada con pagos por estimación (caso
   frecuente de Beto) — con rastro completo contrato → estimación → pago →
   factura.
4. **Vivienda y obra de proyecto dejan de estorbarse**: sub-vistas por tipo
   en Contratos y vocabulario distinto (destajos semanales vs estimaciones
   de contrato).

## Alcance

### Dentro

- **Modelo (S1):**
  - `erp.facturas.contrato_id` (FK a `dilesa.contratos_construccion`): la
    factura total se liga directo; las facturas por estimación lo heredan.
  - `dilesa.obra_estimaciones`: estados `borrador → autorizada → pagada`
    (+ `cancelada` existente), `autorizado_por/at`, gate Dirección
    (decisión D2; reusar `erp.fn_es_direccion` de la iniciativa hermana).
  - `erp.cxp_pagos.obra_estimacion_id`: la estimación autorizada genera el
    pago programado en CxP (por el neto), aplicado a la factura que
    corresponda (propia o la total del contrato); la estimación pasa a
    `pagada` cuando su pago se ejecuta.
  - `erp.v_partida_control`: en partidas con contrato, la capa **ejercido**
    pasa a Σ estimaciones autorizadas (las facturas siguen alimentando
    "pagado" vía aplicaciones; el gasto directo/OC no cambia).
- **UI (S2):** sub-vistas Vivienda | Obra de proyecto en el tab Contratos
  (filtro + badge + KPIs por tipo); detalle de contrato de obra con estado
  de cuenta y estimaciones con ciclo (autorizar = Dirección); captura de
  factura total ligada al contrato.
- **Cierre (S3):** flujo estimación→pago en CxP end-to-end; estimaciones
  visibles en `GastoActividad` y refs clickeables en el paso "Estimada" del
  hilo del gasto; glosario ("Destajos semanales" vs "Estimaciones de
  contrato") + doc del manual.

### Fuera (no-goals duros)

- **No** integrar los destajos semanales de vivienda (`dilesa.estimaciones`)
  a CxP — decisión deliberada del ADR-038 D2 que se mantiene; Beto sí lo
  quiere eventualmente: **iniciativa futura al terminar esta** (decisión
  D3).
- **No** convenios modificatorios del contrato (aditivas/deductivas de
  `valor_total` con orden de cambio) — fase 2 natural tras esta iniciativa,
  con el patrón de `dilesa-presupuesto-baseline`.
- **No** re-modelar `dilesa.estimaciones` (vivienda) ni `contrato_lotes`.
- **No** tocar el comprometido de `v_partida_control` (ADR-042 queda igual).
- **No** rollout multi-empresa.

## Diseño (resumen de decisiones de forma)

- **La estimación es el devengo; la factura es flexible.** El avance
  financiero del contrato lo marcan las estimaciones autorizadas, no los
  CFDIs. La relación estimación↔factura deja de ser estructural (1:1) y se
  vuelve de aplicación de pagos: cada estimación autorizada → 1 pago
  programado → aplicado a la factura correspondiente.
- **El UNIQUE actual (`facturas.obra_estimacion_id`) se conserva** para el
  modo factura-por-estimación; el modo factura-total usa `contrato_id` sin
  estimación de origen. Backfill: facturas existentes con
  `obra_estimacion_id` heredan `contrato_id` de su estimación.
- **Gate Dirección server-side** en autorizar estimación (mismo patrón que
  el gobierno presupuestal: action valida + RPC/guard en DB) + audit_log.
- **Migraciones robustas a Preview** (sin asumir datos) y el cambio de capa
  "ejercido" se valida contra los datos reales ANTES de mergear (query
  comparativa vieja vs nueva — los proyectos en vuelo no deben saltar de
  números sin explicación).

## Riesgos

| Riesgo                                                                                              | Mitigación                                                                                                                      |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Cambiar la capa "ejercido" mueve números que Dirección ya consulta (tab Gasto, resumen al consejo)  | Query comparativa antes/después sobre datos reales en el PR; comunicar el cambio de semántica (devengo por avance, no por CFDI) |
| Colisión con `dilesa-presupuesto-baseline` (S2/S3 en paralelo) en `components/dilesa/*` y tab Gasto | Nota de coordinación en ambos docs; Regla 2 (rebase preventivo); zonas de contacto enumeradas arriba                            |
| Estimaciones históricas (sin estados) quedan en limbo al introducir el ciclo                        | Backfill: existentes → `autorizada` (ya operaron); solo las nuevas entran por el ciclo                                          |
| El pago programado desde estimación duplica pagos si el operador también programa manual en CxP     | El pago generado lleva `obra_estimacion_id` y la UI de CxP lo muestra ligado; validación de no-duplicado por estimación         |
| Facturas totales históricas sin `contrato_id`                                                       | Solo backfill derivable (vía estimación); el resto se liga a mano desde la UI (S2) — bandeja "facturas de obra sin contrato"    |

## Métricas de éxito

- El caso "factura total + N pagos por estimación" se captura completo sin
  pasos fuera del sistema, con rastro contrato → estimación → pago →
  factura en el hilo del gasto.
- "¿Cómo va este contrato?" se responde en 1 pantalla (estado de cuenta en
  el detalle del contrato).
- El ejercido de una partida con contrato = Σ estimaciones autorizadas
  (avance real), verificado contra los proyectos en vuelo.
- Toda estimación autorizada tiene quién/cuándo (Dirección) en DB +
  audit_log.
- Contratos de vivienda y de obra navegables por separado (0 confusión de
  tipo en el listado).

## Sprints

- **S1 — Modelo**: migración (facturas.contrato_id + backfill, estados y
  autorización en obra_estimaciones + backfill `autorizada`,
  cxp_pagos.obra_estimacion_id, v_partida_control ejercido por
  estimaciones) + query comparativa de validación. Migración con OK de Beto.
- **S2 — UI del contrato**: sub-vistas por tipo en Contratos, estado de
  cuenta del contrato, ciclo de estimaciones con autorización Dirección,
  captura/liga de factura total.
- **S3 — CxP + hilo + lenguaje**: pago programado desde estimación
  autorizada, aplicación a factura con saldo, estimaciones en
  GastoActividad y en el paso "Estimada" del hilo (refs clickeables),
  glosario + manual.

## Decisiones registradas

- **2026-06-10 — Iniciativa hermana en sesión nueva (D1).** Beto delegó la
  decisión; CC eligió hermana (vs extender `dilesa-presupuesto-baseline` a
  6 sprints) por la convención "una iniciativa = una sesión" y porque son
  dominios distintos (gobierno del presupuesto vs ciclo contrato-devengo-
  pago) con zonas de contacto acotadas.
- **2026-06-10 — Autoriza Dirección (D2).** Las estimaciones de contrato
  las autoriza Dirección (consistente con el gobierno presupuestal).
  Decidido por Beto.
- **2026-06-10 — Destajos semanales → CxP queda fuera; iniciativa futura
  (D3).** Beto sí quiere la integración, pero al terminar esta iniciativa —
  no se mezcla aquí. Decidido por Beto.
- **2026-06-10 — La estimación es el devengo (D4).** El "ejercido" de
  partidas con contrato se deriva de estimaciones autorizadas, no de
  facturas — una factura total anticipada ya no distorsiona el avance.
- **2026-06-10 — Factura flexible (D5).** `facturas.contrato_id` nuevo +
  `obra_estimacion_id` existente conviven: factura-por-estimación y
  factura-total-del-contrato son ambos válidos; la liga estimación↔pago
  (`cxp_pagos.obra_estimacion_id`) es la que cierra el rastro.
- **2026-06-10 — Implementación S1 (CC, decisiones de forma).** (a) La
  emisión a CxP (`cxp_factura_desde_estimacion`) exige estimación
  `autorizada` desde S1 — el gobierno no espera a S3; transición: aplicar
  la migración junto con la UI de S2. (b) El mismo RPC bloquea el modo
  mixto: contrato con factura TOTAL activa no emite facturas por
  estimación (duplicaría el cargo). (c) Las facturas de estimación heredan
  `partida_id` del contrato — sin eso la capa "pagado" de
  `v_partida_control` no ve los pagos de obra. (d) El paso a `pagada` es
  un trigger de sync sobre `erp.cxp_pagos` (con reversa si el pago se
  cancela/rechaza/re-apunta), no una modificación a los RPCs de CxP —
  menos invasivo al flujo vivo. (e) Backfill a `pagada` solo con factura
  activa `estado_cxp='pagada'` (en prod resultó: 0 casos).

## Bitácora

- **2026-06-10 — S2 (UI del contrato) — PR #804, abierto SIN auto-merge
  (gated por aplicar la migración de S1 a prod).** Sub-vistas Vivienda |
  Obra de proyecto en el tab Contratos (segmented control, badge de tipo,
  KPIs propios `deriveKpisObra`); estado de cuenta del contrato
  (`lib/dilesa/contratos-estado-cuenta.ts`, derivación pura + tests:
  contratado/devengado/por devengar/pendiente de autorizar/facturado/
  pagado/retenciones/anticipo); ciclo de estimaciones con botón Autorizar
  (Dirección vía `useEffectiveUser().direccionEmpresaIds`, re-validado
  server-side) y emisión a CxP solo de autorizadas; captura de factura
  TOTAL del contrato vía RPC nueva `erp.cxp_factura_total_contrato`
  (migración `20260610224834`, como archivo — espejo de
  `cxp_factura_desde_estimacion`, bloquea modo mixto y tope = valor del
  contrato). El Supabase Preview del PR corre ambas migraciones → el
  Vercel Preview es funcional para revisión. Secuencia de salida: Preview
  OK → aplicar 2 migraciones a prod + regenerar SCHEMA_REF/types → merge.
- **2026-06-10 — S1 (modelo) — PR #802.** Migración `20260610223000`:
  `erp.facturas.contrato_id` (+ índice + backfill desde
  `obra_estimacion_id`, que también hereda `partida_id` del contrato para
  la capa "pagado"); ciclo `borrador → autorizada → pagada` en
  `dilesa.obra_estimaciones` (+ `autorizada_por/at`, `pagada_at`, CHECK,
  guard trigger con flag `app.obra_estimacion_gate`: estado y montos
  inmutables post-autorización); RPC `dilesa.obra_estimacion_autorizar`
  (gate `erp.fn_es_direccion` + `core.audit_log`) y
  `obra_estimacion_cancelar` actualizado (estado + bloqueos por
  pago/pagada); `erp.cxp_pagos.obra_estimacion_id` (FK + UNIQUE parcial
  anti-duplicado + trigger de integridad + sync pago-ejecutado→estimación
  pagada con reversa); `cxp_factura_desde_estimacion` exige autorizada,
  hereda contrato/partida y bloquea modo mixto; `v_partida_control`:
  ejercido de partidas con contrato = Σ estimaciones autorizadas.
  **Validación contra prod** (query comparativa read-only): 275
  estimaciones activas (0 canceladas, 0 con factura ligada — el puente
  ADR-039 nunca operó) → todas backfillean a `autorizada` (Σ $42.67M; 18
  negativas de amortización, 21 anticipos). 16 partidas (urbanización de
  Lomas de los Encinos / Lomas del Sol) ganan ejercido que hoy es $0:
  total $306K → $42.59M, delta = exactamente la Σ de estimaciones de los
  31 contratos con partida — el devengo de obra era invisible al control
  presupuestal y los montos cuadran contra su comprometido. **La
  migración queda como archivo; se aplica a prod con OK de Beto,
  idealmente junto con S2** (la emisión a CxP ahora exige estimación
  autorizada y la UI de autorizar llega en S2).
- **2026-06-10 — Promovida (estado inicial: `planned`).** Nace del análisis
  de contratos/estimaciones pedido por Beto en la sesión de control del
  gasto (la misma que promovió `dilesa-presupuesto-baseline`): mapeo DB+UI
  confirmó los dos sistemas de estimaciones homónimos, el listado de
  contratos sin distinción de tipo, el supuesto 1-factura-por-estimación
  que rompe el caso factura-total, y la falta de gobierno en
  `obra_estimaciones`. Beto decidió D2 y D3, delegó D1; alcance v1 cerrado.
  Ejecución: sesión nueva (chip generado desde esta sesión).
