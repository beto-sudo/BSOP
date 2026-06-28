# Iniciativa — Contrato de obra desde la adjudicación (requisición → OC/Contrato con condiciones) DILESA

**Slug:** `dilesa-adjudicacion-contrato-obra`
**Empresas:** DILESA
**Schemas afectados:** `erp` (`requisiciones`: flag `es_mano_obra` + términos ofrecidos; lectura de `cotizaciones`/`ordenes_compra`), `dilesa` (`contratos_construccion`: condiciones capturadas — `forma_pago`, `modalidad_precio`, retención fiscal ISR/IVA aparte de la garantía, `es_mano_obra`/`repse_requerido`, FK `orden_compra_id`), `core` (lectura `contratistas_datos.repse` para el warning). UI en `components/compras/**` y `app/dilesa/construccion/contratos/**`. **Línea roja:** NO toca el runtime de CxP de obra (amortización de anticipo / retención acumulada / tope) — eso es de [`dilesa-obra-estimaciones-cxp`](dilesa-obra-estimaciones-cxp.md).
**Estado:** done
**Próximo hito:** — (cerrada; Sprints 0-3 en prod: #1088 S0 · #1117 S1 · #1119 S2 · S3 en este PR)
**Dueño:** Beto
**Creada:** 2026-06-26
**Última actualización:** 2026-06-28

> **Origen:** Beto cerró sin querer la OC-2026-0001 (el botón "Cerrar orden" no pedía
> confirmación y, sin nada recibido, la dejó Cancelada). Al revisar el flujo surgió la
> idea mayor: que **el contrato de obra siempre nazca del ciclo de compras**
> (requisición → cotización → adjudicación → OC y/o Contrato), capturando sus
> condiciones (anticipo, retenciones, forma de pago, mano de obra) y ligándolo a CxP,
> igual que se están ligando las estimaciones de vivienda y de obra en
> [`dilesa-obra-estimaciones-cxp`](dilesa-obra-estimaciones-cxp.md).

> **Hallazgo del stress-test (5 agentes, 2026-06-26):** **casi todo ya existe.**
> `dilesa.contratos_construccion` ya trae `anticipo_pct`, `retencion_pct` (garantía),
> `iva_tasa`, `valor_subtotal/iva`, `cotizacion_id`, `objeto`, `fianza_pct`,
> `periodicidad_estimaciones_dias`, fechas. La pantalla de captura
> ([`app/dilesa/construccion/contratos/nuevo-obra/page.tsx`](../../app/dilesa/construccion/contratos/nuevo-obra/page.tsx))
> y el PDF del contrato ya existen. La adjudicación **ya bifurca** `tipo='obra'`→contrato,
> `tipo='compra'`→OC. Esto es **cablear piezas existentes**, no construir de cero.

## Problema

Hoy el contrato de obra puede nacer de tres formas inconexas (alta directa, insert
silencioso en la adjudicación de obra, o backfill histórico — 266 contratos), y cuando
nace de la adjudicación lo hace **sin capturar condiciones**: `tipo='urbanizacion'`
hardcodeado, sin anticipo/retención/forma de pago, sin distinguir mano de obra. Tres
consecuencias:

1. **La adjudicación de obra es muda.** El comprador adjudica y el contrato aparece sin
   que nadie capture sus términos; las condiciones reales quedan fuera del sistema.
2. **La requisición no sabe si es mano de obra.** El spawn de la RFQ desde la requisición
   hardcodea `tipo='compra'` ([`requisiciones-module.tsx:657`](../../components/compras/requisiciones-module.tsx)),
   así que el trabajo (destajos, urbanización contratada) nunca llega al ramo de contrato
   por la vía canónica.
3. **"Retención" está mal modelada.** Un solo concepto mezcla dos cosas opuestas: la
   **retención de garantía** (civil — DILESA la guarda y la regresa al contratista en el
   finiquito) y la **retención fiscal** (ISR/IVA — DILESA la retiene y la **entera al
   SAT**). Y no hay control de **REPSE** para mano de obra a disposición (riesgo fiscal:
   gasto no deducible + IVA no acreditable + responsabilidad solidaria IMSS).

Y el detonante operativo: cerrar/cancelar una OC no tenía red de seguridad (un clic en
"Cerrar orden" la cancelaba en silencio).

## Outcome esperado

- **Una ruta canónica y visible al contrato de obra:** requisición (declara mano de obra y
  términos ofrecidos) → cotización → adjudicación → **abre la pantalla de condiciones** →
  genera el Contrato (con PDF). El alta directa queda como **escape** para single-source
  (sin licitar).
- **Las condiciones del contrato se capturan donde se comprometen** (en la adjudicación),
  con **retención de garantía y retención fiscal modeladas por separado** y un **warning
  REPSE** para mano de obra a disposición.
- **El contrato es el insumo de configuración** que consume el runtime de CxP de obra
  ([`dilesa-obra-estimaciones-cxp`](dilesa-obra-estimaciones-cxp.md)): esta iniciativa
  **llena** `anticipo_pct`/`retencion_pct`/condiciones; esa sesión las **gasta**
  (amortización/retención acumulada/tope).
- **Cerrar/cancelar una OC pide confirmación** y nunca deja la cotización huérfana.

## Decisiones de Beto (2026-06-26) — cierran las 4 bifurcaciones del stress-test

1. **Un artefacto por adjudicación, derivado del tipo.** `tipo='obra'`→Contrato,
   `tipo='compra'`→OC. "OC **y** Contrato" no es el default (duplicaría el compromiso de
   presupuesto y la OC no aporta a mano de obra pura); queda como **opt-in explícito** para
   el caso raro labor + compra de material (Sprint 3).
2. **Requisición canónica + escape directo.** La ruta normal es requisición→RFQ→
   adjudicación, pero se conserva el alta directa (`/contratos/nuevo-obra`) para contratos
   single-source. Los 266 históricos no se tocan (go-forward).
3. **Captura fiscal aparte + warning REPSE con override admin.** Retenciones fiscales
   (ISR/IVA) en campos separados de la garantía; si es mano de obra a disposición y el
   contratista no tiene REPSE vigente, **advertencia fuerte** pero el admin puede
   continuar (consistente con la política admin-nunca-bloqueado). Registrar en audit.
4. **Seam con `dilesa-obra-estimaciones-cxp`:** esta iniciativa es dueña de la **captura
   de condiciones + wiring (requisición→contrato, link OC↔Contrato)**; la otra sesión
   sigue dueña del **runtime de CxP** (amortización/retención/tope/factura en espera). Se
   coordina el orden de migraciones.

## Alcance / Sprints

| #   | Scope                                                                                                                                                                                                                                                                                                                                                           | Estado |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 0   | **Prevención (detonante).** Confirmación adaptativa antes de cerrar una OC: con algo recibido = cierre normal; **sin nada recibido = se trata como cancelación** (pide motivo y usa `cancelar()`, que reabre la cotización — ya no la deja huérfana). Reusa `<ConfirmDialog>`.                                                                                  | done   |
| 1   | **Wiring requisición → contrato.** `erp.requisiciones.es_mano_obra` (+ términos ofrecidos suaves); el spawn de RFQ deja de hardcodear `tipo='compra'` y usa `'obra'` cuando es mano de obra; la adjudicación de obra **rutea a la pantalla de condiciones** (pre-llenada con cotización/proveedor/partida/valor) en vez del insert silencioso.                  | done   |
| 2   | **Condiciones completas + REPSE.** Agregar a la pantalla y a `contratos_construccion`: `forma_pago`, `modalidad_precio` (alzado/unitarios/administración), **retención fiscal ISR/IVA separada** de la garantía, `es_mano_obra`/`repse_requerido`. Warning REPSE (lee `contratistas_datos.repse`) con override admin auditado. Campos materiales fluyen al PDF. | done   |
| 3   | **Liga OC↔Contrato + opt-in "ambos".** FK `dilesa.contratos_construccion.orden_compra_id` (→ `erp.ordenes_compra`, `ON DELETE SET NULL`, índice único parcial). Opción explícita de generar OC **y** Contrato para labor + material.                                                                                                                            | done   |

> El **runtime de CxP de obra** (estimación autorizada → factura en espera del XML,
> amortización lineal del anticipo, retención acumulada + liberación en finiquito, tope vs
> contrato) **NO está en esta iniciativa** — es [`dilesa-obra-estimaciones-cxp`](dilesa-obra-estimaciones-cxp.md).
> El handshake: esta iniciativa escribe la config; esa la consume.

## Riesgos / coordinación

- **Seam en `contratos_construccion` con `dilesa-obra-estimaciones-cxp` (otra sesión activa).**
  Esa sesión agrega **acumuladores de runtime** (anticipo amortizado, retención acumulada,
  topes) y **lee** `anticipo_pct`/`retencion_pct`. Esta iniciativa agrega **config**
  (forma_pago, modalidad, retención fiscal, es_mano_obra, repse, FK OC). Frontera clara:
  **config (esta) vs acumuladores/enforcement (esa)**; nunca se escriben las columnas del
  otro. **Coordinar el orden de migraciones** (las suyas son financieras → las aplica Beto;
  abrir el PR temprano para que `db:new` vea los timestamps). Recomendación del panel:
  dejar aterrizar el schema S2–S4 de la otra sesión y rebasar, o que esta solo agregue
  columnas de config sin tocar nombres de acumuladores.
- **`SCHEMA_REF.md` stale + drift del ledger.** El destajo de vivienda
  ([`dilesa-estimaciones-cxp`](dilesa-estimaciones-cxp.md), #1043) ya está en prod pero sus
  archivos de migración pueden no estar en `main`; regenerar `SCHEMA_REF.md`/`types` solo
  después de confirmar que esos archivos aterrizaron, para no capturar columnas sin su
  migración. Si se aplica algo por MCP, reconciliar el ledger en la misma sesión
  (norma anti-drift de `CLAUDE.md`).
- **Migraciones additivas y defensivas.** Columnas nullable/`DEFAULT` + FK + índice parcial
  (sin reescribir filas, sin lock). RLS heredada (`contratos_construccion` y `requisiciones`
  ya son empresa-scoped set-membership). Backfill — si se quiere inferir `es_mano_obra` para
  contratos de obra existentes — con JOIN a `core.empresas` para no tumbar el Preview branch.
  `NOTIFY pgrst, 'reload schema'` al final.
- **Modelado fiscal (no improvisar).** La retención del 6% de IVA **ya no es regla general**
  de outsourcing post-reforma 2021; aplica solo a servicios especializados REPSE con personal
  a disposición. Estructurar destajos como **obra a resultado** saca a DILESA del régimen.
  La pantalla pregunta "¿personal a disposición?" (no solo "¿mano de obra?") para detonar el
  warning correcto. IVA 8% frontera por contrato (`iva_tasa`).
- **No forzar fricción al caso común.** Las compras de material (≈99%) no cambian: un toggle
  OFF por default en la requisición; la adjudicación de compra sigue 1 clic → OC.

## Métricas de éxito

- 0 OC cerradas/canceladas por accidente (toda transición terminal pasa por confirmación).
- 100% de los contratos de obra **nuevos** nacen con condiciones capturadas (anticipo,
  retención de garantía, forma de pago, modalidad) — ya no insert silencioso.
- Retención de garantía y retención fiscal **siempre separadas** (0 contratos con un solo
  campo ambiguo).
- Todo contrato de mano de obra a disposición sin REPSE vigente queda **marcado** (warning +
  override auditado), 0 silenciosos.

## Decisiones registradas

### 2026-06-26 — Promoción + stress-test multi-agente

- Promovida tras estresar la estructura con 5 agentes (proceso P2P, control financiero/fiscal,
  modelado legal del contrato, esquema DB, UX). Las 4 bifurcaciones las cerró Beto con las
  opciones recomendadas (ver "Decisiones de Beto" arriba).
- **Reframe clave:** la mayoría de la infraestructura ya existe (columnas de condiciones,
  pantalla de captura, PDF, bifurcación de adjudicación). El trabajo es wiring + los gaps
  chicos (mano de obra en requisición, retención fiscal separada, REPSE, FK OC↔Contrato).
- **Pushback aceptado a la idea original:** (a) "OC **y** Contrato siempre" → un artefacto
  derivado del tipo, "ambos" solo opt-in; (b) "todo por requisición" → canónico pero blando,
  con escape directo; (c) "preguntar si se genera contrato" → derivarlo del tipo y abrir la
  pantalla de condiciones.

## Bitácora

- **2026-06-26 — Promovida + Sprint 0.** Origen: cierre accidental de OC-2026-0001 (revertida
  en la misma sesión: estado `cancelada`→`enviada`, línea `cantidad_cancelada` 5→0, cotización
  RFQ-MQSADDFP intacta, audit `oc_reabrir_correccion`). Stress-test con 5 agentes; estructura
  cerrada con las 4 decisiones de Beto. **Sprint 0** (confirmación adaptativa antes de cerrar
  OC, con ruteo a `cancelar()` cuando no hay nada recibido) entregado en el PR de promoción.
- **2026-06-28 — Sprints 1-3 (iniciativa completa).** **S1** ([#1117](https://github.com/beto-sudo/BSOP/pull/1117)):
  `erp.requisiciones.es_mano_obra` → la RFQ nace `tipo='obra'` → la adjudicación de obra rutea
  a la pantalla de condiciones pre-llenada (en vez del insert mudo `tipo='urbanizacion'`); al
  guardar crea el contrato + cierra la adjudicación (sin huérfanos). **S2**
  ([#1119](https://github.com/beto-sudo/BSOP/pull/1119)): `forma_pago`, `modalidad_precio`,
  **retención fiscal ISR/IVA separada** de la garantía civil, `es_mano_obra`/`personal_a_disposicion`,
  y warning REPSE (lee `contratistas_datos.repse`) con override de Dirección auditado
  (`repse_override_*`). **S3** (este PR): FK `contratos_construccion.orden_compra_id` (liga
  OC↔Contrato, `ON DELETE SET NULL` + índice único parcial) + opt-in "OC + Contrato" (checkbox
  +OC en la adjudicación) para labor + material; helpers `crearOcEmitida`/`cerrarAdjudicacion`.
  Migraciones additivas aplicadas a prod **al mergear** (db-push-on-merge, label `finanzas-ok`).
  Nota de proceso: el modelo de migraciones había cambiado a `derivados-sin-drift` (validación
  vs shadow, no prod); se corrigió a mitad de camino (regen desde shadow, sin `db push` manual).
