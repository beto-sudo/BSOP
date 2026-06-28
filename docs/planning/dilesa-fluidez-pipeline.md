# Iniciativa — Fluidez del pipeline de ventas (DILESA)

**Slug:** `dilesa-fluidez-pipeline`
**Empresas:** DILESA (módulo Ventas; el patrón de "tiempo por fase + calificación de proceso" es replicable a otros pipelines por fases)
**Schemas afectados:** Lectura + objetos derivados en `dilesa`. Vistas nuevas sobre `dilesa.venta_fases` / `dilesa.ventas` / `dilesa.venta_fase_catalogo` (duraciones limpias, benchmark por fase, antigüedad para toda la lista). Tabla nueva `dilesa.fase_metas` (metas editables, S3). Sin tocar `core`/`erp` salvo RBAC ya existente. PDF vía `@react-pdf/renderer`. Reusa la capa de reportes ([[dilesa-reportes]], ADR-047).
**Estado:** planned
**Próximo hito:** Arrancar **S1** — días-en-fase en el chip de la lista de ventas (generalizar `v_ventas_pipeline_antiguedad` a `v_ventas_lista_antiguedad` sin filtro de estado) + render inline en `ventas-module.tsx` y en el expediente. Es el sprint sin dependencia de benchmark.
**Dueño:** Beto
**Creada:** 2026-06-28
**Última actualización:** 2026-06-28 (Beto confirmó R1–R5; alcance v1 cerrado → `planned`)

> Detonante: Beto quiere ver, en cada venta, **cuántos días lleva en su fase actual** (en el chip de la lista y en el reporte), y una **puntuación de fluidez del proceso** por venta basada en los tiempos por fase. Y, de fondo, **calificar cada una de las 17 fases** del pipeline (medianas, tendencia) para detectar dónde se atora el proceso —filtrable por mes/trimestre/semestre/año/solo-activas— y así dirigir mejoras a las fases lentas.

## Problema

El pipeline de ventas de DILESA tiene 17 fases ([[reference_dilesa_fases_venta_fuente_unica]]). Hoy el sistema sabe **en qué fase** está cada venta, pero no expone **cuánto tiempo** lleva ahí ni cuánto tardó en las fases pasadas, salvo en un reporte aislado (Ventas estancadas). Falta:

- **Tiempo en fase visible en el flujo de trabajo.** El chip de fase en la lista solo pinta el nombre (`<Badge>{fase_actual}</Badge>`); no dice "18 días aquí". El operador no ve qué se está enfriando.
- **Una medida de fluidez por venta.** No hay forma de ordenar "¿qué ventas van fluidas y cuáles arrastrando?" de un vistazo.
- **Una calificación por fase para gestionar el proceso.** No se puede responder "¿qué paso del pipeline andamos bajos este trimestre?" para enfocar mejoras. Este es el valor de gestión de fondo.

## Hallazgos de la investigación (datos de prod, 2026-06-28)

Reconocimiento sobre las **1,459 ventas** reales antes de diseñar:

**Lo que ya tenemos (a favor):**

- **Sí existe historial temporal por fase.** `dilesa.venta_fases` es un log: una fila por fase alcanzada con `fecha` (DATE) de entrada, `registrado_por`, `UNIQUE(venta_id, fase)`. Se puede reconstruir cuánto tardó cada venta en cada fase. 1,202/1,459 (82%) tienen ≥2 fechas distintas (timeline real).
- **"Días en fase actual" ya se calcula** en la vista `dilesa.v_ventas_pipeline_antiguedad` (`CURRENT_DATE − fecha_entrada`), pero filtrada a activas-sin-escritura y solo la consume el reporte de estancadas.
- **Capa de reportes madura** ([[dilesa-reportes]], ADR-047 `preset+vista+PDF`, motores puros, hub `/dilesa/reportes`). El reporte de fase y el score se enchufan ahí.

**Lo que los datos exigen limpiar (la parte incómoda):**

| Síntoma                        | Evidencia (prod)                           | Implicación                                                                                                               |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Duraciones **negativas**       | Fase 1 mediana **−626 d**                  | El orden por `posicion` ≠ orden cronológico de `fecha` (migración Coda). Hay que ordenar por fecha y descartar negativos. |
| Fases terminales **infladas**  | Fase 15 "Entregada" mediana **1,535 d**    | Ventas viejas selladas al migrar. Excluir fases terminales del cálculo.                                                   |
| **18% sin timeline real**      | 257 ventas con todas las fases misma fecha | Envenenan el benchmark. Flag `confiable` / excluir.                                                                       |
| **Salto de fases** por crédito | Avalúo/Dictamen n≈389 vs 1,209             | Contado salta Infonavit. No penalizar fase saltada; segmentar benchmark por `tipo_credito`.                               |

**Pero la señal real existe y es accionable:** Formalizada p90=120 d, Escriturada mediana 12/p90 53, Facturada mediana 13 — esos son cuellos internos reales que el análisis va a destapar.

## Decisiones de diseño (conversación de promoción, 2026-06-28)

Beto eligió, sobre tres ejes:

1. **Naturaleza del score → híbrido.** El benchmark por fase es la **mediana histórica** (default), y habrá **metas editables** por fase (Dirección) que la sustituyen. El score compara la duración de cada venta vs. ese benchmark efectivo (`COALESCE(meta, mediana)`).
2. **Composición del score → un solo score total en v1** (sin separar interno vs. terceros). _Ver refinamiento R1 abajo: el estresado adversarial recomienda matizar esto; queda a confirmación._
3. **Entrega → por sprints** (S1 chip → S2 score+reporte → S3 metas). Valor visible desde la semana 1.

### Refinamientos pendientes de confirmar (del estresado adversarial)

- **R1 — Score sobre fases controlables.** Infonavit y notaría son fases que el equipo **no controla**. Un único score total castiga al vendedor por demoras de terceros, y eso quema la adopción ("la primera vez que un gerente vea su score hundido por una notaría dormida, descarta el sistema"). Mitigación barata: **clasificar las 17 fases como `interna | tercero | mixta`** (metadata estática en `fases.ts`) desde el día 1. El score visible se calcula sobre **fases controlables**; el tiempo de terceros se reporta aparte como dato informativo (insumo de negociación con Infonavit, no castigo). Esto **no contradice** "un solo score visible" —solo define sobre qué fases se compone—. **Recomendación: adoptar R1.**
- **R2 — Presentar el score como banda, no como número crudo.** `fecha` es DATE (resolución ±1 día); un 0-100 de dos dígitos sobre eso es falsa precisión y dispara discusiones estériles ("¿por qué bajé de 73 a 71?"). Mitigación: la **presentación primaria es banda Verde/Ámbar/Rojo**; el número 0-100 queda disponible (tooltip / ordenamiento) pero no es el protagonista. **Recomendación: adoptar R2.**
- **R3 — Cohort confiable + snapshots.** (a) El score solo se calcula sobre ventas con `timeline_confiable` (sin fechas colapsadas/negativas; idealmente iniciadas post-cutover BSOP). Mejor universo chico y creíble que 1,459 con ruido. (b) "Regresar a fase" es **destructivo** ([[reference_dilesa_captura_fase_correccion_post_cierre]]): reescribe historial, así que un score live es retroactivamente mutable. Los reportes de periodo deben ser **snapshots fechados** para ser reproducibles. **Recomendación: adoptar R3(a) en v1; R3(b) snapshots a partir de S2.**
- **R4 — Radar de fases primero, score sofisticado después (Codex + adversarial convergen).** El valor de gestión está en el **reporte de cuellos por fase**, no en el número por venta. Empezar el score **simple**: por fase `dias / benchmark` → bandas (verde ≤ meta · ámbar ≤ 1.5× · rojo > 1.5× o > p90); por venta = **peor banda actual + nº de fases en rojo**, no promedio ponderado. El 0-100 (log-ratio + MAD) queda como evolución posterior, no como entrega visible de v1. Razón: una fórmula compleja muere en la primera objeción operativa ("no entiendo por qué me puso rojo"); Dirección debe poder explicar la regla en 30 segundos. El score individual visible en v1 es, a lo más, una banda "atención requerida" subordinada al drill-down. **Recomendación: adoptar R4 — relaja la ingeniería y de-riesga la adopción.**
- **R5 — Definir el ancla temporal del reporte (gap que el doc no capturaba).** "Calificación de la fase X en Q2" cambia por completo según qué cuente: ¿la fase **inició** en el periodo, **terminó** en el periodo, la **venta se creó** en el periodo, o **sigue abierta**? Hay que fijar la semántica explícitamente (recomendado por default: **fase terminada en el periodo** para medianas cerradas estables + un corte aparte de **abiertas hoy** para el backlog vivo). Además, `tipo_credito` **no basta** como segmentación: proyecto/desarrollo, vendedor, banco/notaría también separan procesos distintos — exponerlos como dimensiones del reporte (no necesariamente del benchmark v1). **Recomendación: fijar ancla temporal en S2; segmentación rica como filtros del reporte.**

## Outcome esperado

- En la **lista de ventas** y en el **expediente**, cada venta muestra **días en su fase actual** (color por umbral) y una **banda de fluidez** del proceso.
- Un reporte **"Calificación por fase"** que, por cada fase, da mediana/p90/n, meta, semáforo y **tendencia vs. periodo anterior**, filtrable por mes/trimestre/semestre/año/solo-activas, con drill-down a las ventas que componen cada número y export PDF con branding DILESA.
- El insumo de gestión: "estas N fases andan bajas este trimestre" → enfocar mejoras donde duele.

## Alcance

### Sprint 1 — Días en fase en el flujo de trabajo (rápido)

- Generalizar la vista de antigüedad a **toda la lista** (`dilesa.v_ventas_lista_antiguedad`, sin filtro activas/sin-escritura; la vista actual queda intacta para no romper estancadas).
- **Chip de la lista**: días-en-fase como texto secundario coloreado **inline** al lado del badge de fase (no segundo badge, no columna nueva). Umbral fijo provisional (reusa `UMBRAL_ESTANCADA_DEFAULT`) hasta que S2 traiga el benchmark.
- **Expediente**: días-en-fase en el header (`shell.tsx`) y en el bloque Comercial de `operacion-resumen.tsx`.

### Sprint 2 — Radar de cuellos por fase + score simple (el corazón)

> Orden post-Codex/adversarial (R4): primero el **reporte de cuellos accionable**; el score por venta es derivado y subordinado. Ancla temporal explícita (R5).

- **Capa de datos** (vivas, `security_invoker`, RLS empresa-scoped):
  - `v_venta_fase_duraciones` — duración limpia por tramo `fase→fase` ordenando **por fecha** (neutraliza el bug posición≠fecha), con flags `es_retroceso`/`es_mismo_dia`/`es_tramo_abierto`.
  - `v_fase_benchmark` — mediana/p25/p75/p90 + n por (fase × `tipo_credito`), excluyendo retrocesos, tramos abiertos y negativos; mismo-día (0 d) **cuenta** (fase express legítima).
  - Clasificación de fases `interna|tercero` (R1) en `lib/dilesa/fases.ts`.
- **Motor puro** `lib/dilesa/fluidez.ts` (espejo de `estancadas.ts`, testeado): banda por fase (`dias/benchmark`, R4), exclusión de cohort no confiable, umbral mínimo de n por fase (sin benchmark confiable → no califica, nunca verde/rojo falso). Por venta: peor banda actual + nº de fases en rojo. Distinguir **fluidez observada** (fases ya recorridas) de **riesgo actual** (la fase en curso atorada) — una venta joven "verde" aún no enfrenta las fases difíciles. El 0-100 robusto (log-ratio + MAD, censura asimétrica) queda documentado como evolución, fuera de la entrega visible v1.
- **Reporte "Calificación por fase"** (`registry.ts` + vista `calificacion-por-fase-view.tsx` reusando `ReporteShell`/`useUrlFilters`/`ModuleKpiStrip`): tabla por fase (n, mediana, p90, meta, semáforo, Δ tendencia), filtros temporales (mes/trim/sem/año + solo-activas), KPIs (fluidez global, fases en rojo, cuello de botella, Δ vs. periodo anterior), drill-down, PDF. **Reusa `MODULO_VENTAS_REPORTES`, sin slug RBAC nuevo.**
- **Banda de fluidez** (R2) en lista (columna ordenable) y expediente, con tooltip que traduce el número a lenguaje humano y borde punteado para score parcial (venta en vuelo).
- **Snapshots fechados** del reporte de periodo (R3b) para reproducibilidad.

### Sprint 3 — Metas editables por fase

- Tabla `dilesa.fase_metas` (empresa-scoped, RLS estándar; gate "solo Dirección edita" en la mutación del lado app, consistente con el repo — [[reference_roles_por_empresa]]). `meta_dias` por (fase, opcional `tipo_credito`), `UNIQUE NULLS NOT DISTINCT`.
- El score hace `COALESCE(meta, mediana)`; UI para que Dirección fije/ajuste metas. Hasta entonces, "meta" = mediana (semáforo neutro, el valor de S2 está en mediana/p90/tendencia, no en el cumplimiento de meta).

## Diseño técnico — notas de síntesis

**Score (modelo robusto).** Por fase: contribución basada en log-ratio `ln(d / B)` normalizado por MAD-log, mapeado a 0-100 con logística centrada en 50 (= en benchmark). Por venta: **promedio ponderado** de fases elegibles (peso por `ln(1+B)` × confianza-n), no simple. Distribuciones right-skewed → **mediana + MAD en todos lados, nunca media**. (Detalle de fórmulas en la bitácora técnica del PR de S2.)

**Limpieza (orden importa):** excluir colapsadas → excluir terminales → descartar negativos (no clampar: dato roto, fuera) → winsorizar positivos extremos a ~730 d (señal de atasco saturada). Fase saltada por crédito = no elegible (fuera del denominador), nunca imputar.

**Datos:** vistas vivas, no materializadas (≈14k filas de fases, `percentile_cont` sub-10ms; las MV no respetan `security_invoker`/RLS → materializar rompería el aislamiento por empresa). Si crece a varias empresas/>100k filas, materializar solo el benchmark con refresh post-cierre. `tipo_credito` confirmado en `dilesa.ventas`.

**Flujo:** migraciones con `npm run db:new`, `security_invoker`, `NOTIFY pgrst`, regen de derivados desde **shadow** (`db:regen`), aplicación **al merge** (`db-push-on-merge`). Las vistas de score y `fase_metas` **no son financieras** → auto-merge normal, sin label `finanzas-ok`.

## Riesgos (del estresado adversarial)

- 🔴 **Datos sucios → score preciso-pero-falso** → cohort confiable + exclusión explícita (R3a); nunca un número sobre timeline sintético.
- 🔴 **Atribución injusta (terceros)** → score sobre fases controlables + desglose de tiempo externo (R1).
- 🔴 **Semántica del evento rota (Codex)** — `UNIQUE(venta_id, fase)` no modela transiciones, modela "última fecha conocida por fase"; "Regresar a fase" reescribe historial. Mientras siga así, toda analítica de fluidez es provisional. Snapshots fechados (R3b) la hacen reproducible, **no** arreglan la causa raíz → deuda estructural: `venta_fases` append-only por _transición_ (candidato a ADR antes de v2).
- 🟡 **Benchmark que se mueve solo** ("todo lento parece normal") → la **meta** debe dominar; reportar **tendencia** de medianas como señal primaria, no solo el nivel.
- 🟡 **Gaming** (avanzar fase en el sistema sin completar trabajo real) → presentar como diagnóstico de **proceso**, no KPI individual en v1; cruzar con fechas de artefactos (CFDI, contrato) donde existan.
- 🟡 **Falsa precisión / n bajo** → bandas (R2), `n<5` no se califica, `Math.round`, score parcial marcado.
- 🟢 **Adopción / caja negra** → el entregable que mueve la aguja es el **reporte de cuello de botella accionable con drill-down**, no el número por venta. Cada número se abre a las ventas que lo componen.

## Métricas de éxito

- Días-en-fase visible en el 100% de las ventas de la lista (S1).
- Reporte "Calificación por fase" en prod, filtrable por periodo, con drill-down y PDF (S2).
- Una decisión real de gestión tomada a partir del reporte (ej. "atacar el cuello en Formalización"): la prueba de que no es decoración.

## ADRs pendientes / abiertos

- **(candidato)** `venta_fases` append-only por transición vs. `UNIQUE(venta_id, fase)` destructivo — habilita analítica de proceso reproducible. No bloquea v1 (se aísla con snapshots), pero se decide antes de v2.

## Bitácora

- **2026-06-28** — Promoción. Reconocimiento de datos de prod (1,459 ventas; 82% con timeline real, 18% colapsado; medianas negativas en fase 1, fase 15 inflada). Diseño multi-ángulo (estadístico / data-eng / UX / adversarial). Doc creado en `proposed`.
- **2026-06-28** — Revisión de Codex (2º modelo, independiente). Convergió con el ángulo adversarial: liderar con el **radar de cuellos por fase** + reglas simples; subordinar el score por venta; vender como diagnóstico de proceso, no de personas (el fracaso más probable = desconfianza/percepción de evaluación individual). Aportes nuevos: definir el **ancla temporal** del reporte (R5), segmentación más rica que `tipo_credito`, y que la **semántica del evento** (`UNIQUE` por fase, no por transición) es la fragilidad de raíz. Integrado como R4/R5 y en Riesgos.
- **2026-06-28** — Beto confirmó R1–R5 "como están". Alcance v1 cerrado → `planned`. Listo para arrancar S1.

## Decisiones registradas

- **2026-06-28** — Score **híbrido** (mediana histórica default + meta editable). Razón: autocalibra ahora, permite norte absoluto después.
- **2026-06-28** — Entrega **por sprints** (S1 chip / S2 score+reporte / S3 metas). Razón: valor visible temprano, riesgo escalonado.
- **2026-06-28** — Vistas **vivas** (no materializadas) por volumen bajo y compatibilidad con RLS por empresa.
- **2026-06-28** — Reusar `MODULO_VENTAS_REPORTES` (sin slug RBAC nuevo); el reporte vive en la capa [[dilesa-reportes]].
- **2026-06-28 (confirmado por Beto)** — R1 score sobre fases controlables · R2 banda como presentación primaria del score (0-100 disponible, no protagonista) · R3 cohort confiable + snapshots fechados · R4 radar de cuellos por fase antes que score sofisticado (0-100 robusto diferido) · R5 ancla temporal explícita del reporte + segmentación rica como filtros. Iniciativa pasa a `planned`.
