# Iniciativa — Rediseño del Resumen Diario al Consejo (DILESA)

**Slug:** `dilesa-resumen-consejo-rediseno`
**Empresas:** DILESA
**Schemas afectados:** `dilesa` (tabla `kpi_snapshot` para deltas — ya creada; lectura de `v_proyecto_avances`, `ventas`, `venta_fases`, `venta_fase_catalogo`, `unidades`, `proyectos`, `v_inventario_prototipo`, `v_margen_prototipo`, `v_contratista_obra`, `v_unidad_hold_queue`), `erp` (lectura `v_cuenta_saldo_actual`, `cxc_cargos`, `cxc_pagos`, `cxp_pagos`), `core` (`notification_log`). Mayormente render del correo (`lib/dilesa/resumen-consejo-email.ts`) + el cron. La fusión Margen+Inventario, el split de tubería y **la absorción + meses de inventario + backlog (Sprint 4)** se hacen en JS (sin vista nueva).
**Estado:** in_progress
**Próximo hito:** Sprint 5 — cutover + closeout (smoke E2E lado a lado + revisar preview con Beto + cerrar iniciativa). Sprint 4 (absorción + meses de inventario + backlog de escrituración) en preview de revisión de Beto.
**Dueño:** Beto
**Creada:** 2026-06-13
**Última actualización:** 2026-07-01 (base híbrida de escrituras: mes por fecha_escritura, tile «registradas hoy» con nota de fechas reales)

> **Continuación de** [`dilesa-resumen-consejo`](dilesa-resumen-consejo.md) (cerrada 2026-06-08, v1 = paridad 1:1 con Coda). Aquella es la **referencia técnica** del correo (7 bloques, vistas, cron, guard de domingo, fechas DST). Esta iniciativa es la **Fase 2** que aquel doc dejó anotada: pasar de "réplica de Coda" a un reporte que el Consejo espere a diario.

## Problema

El correo diario "Operación Dilesa" llega al Consejo (L–S 20:00 CST) pero es una **réplica 1:1 de Coda: 7 tablas planas apiladas, sin tesis, sin deltas, sin el dinero arriba**. Un panel de revisión (6 lentes: editor ejecutivo, CFO de vivienda, arquitectura de información, engagement, factibilidad contra prod, crítico adversarial) convergió en un diagnóstico:

- **No tiene titular.** Abre con "Saldos Bancos" y obliga al consejero —el lector más ocupado— a derivar él mismo el estado del negocio leyendo ~80 celdas. Sin un "¿estamos bien o mal hoy?" arriba, el correo se abre 3 días y se archiva el resto.
- **No tiene dinero de verdad.** Tesorería = saldo de bancos y nada más. La **cobranza (CxC) no aparece** pese a estar viva en prod: **$87.5M abierto** (pendiente+parcial) y **$8.2M vencido** que nadie está viendo. (Nota: la cifra inicial del audit —$133.2M / $47.5M en 195 cargos— estaba inflada porque incluía 102 cargos `cancelado`; el filtro correcto `estado IN (pendiente, parcial)` da los números reales. Corregido en Sprint 3.)
- **El asunto nunca cambia** ("Resumen Diario Operación Dilesa 🏘️"), igual el día que se vendieron 8 casas que el día que no pasó nada → entrena a no abrir.
- **Redundancia que erosiona confianza:** "casas en construcción" aparece en 3 bloques (Avances, Inventario, Contratistas) calculado distinto; no cuadran → el consejo desconfía de todo.
- **La tubería miente por escala:** la fila histórica "Operación Terminada" (1,093 ops / $1,060M) aplasta 10× el funnel vivo (107 / $110M).
- **El "Análisis de Margen" lista prototipos muertos:** de 11 con valor capturado, solo 5 tienen inventario u obra; 6 son zombis.
- **Saldos manuales sin frescura visible:** Afirme stale desde el 31-may, BBVA USD en $0 (07-jun). Un saldo viejo disfrazado de actual contamina la credibilidad de todo el correo (caso Finamex en Coda).

## Outcome esperado

Un correo que **un consejero entiende en 15 segundos desde el móvil** y que espera a diario:

1. **Tesis arriba** — tarjeta ejecutiva "Hoy en DILESA" (5-6 cifras con su delta) + asunto dinámico que cuenta el titular del día.
2. **El dinero primero** — sección Tesorería con liquidez + frescura + cobranza (CxC) real.
3. **Señal, no archivo** — 4 secciones limpias (Tesorería → Ventas → Proyectos → Construcción), sin tablas redundantes, con alertas por excepción.
4. **Sin pérdida de paridad** — todo lo que el Consejo ya lee sigue ahí (o mejor); nada se pierde, se reordena y se prioriza.

## Decisiones registradas (cierre de alcance con Beto, 2026-06-13)

- **D1 — Orden de secciones: dinero arriba.** Contra el orden tentativo de Beto (Tesorería/Proyectos/Ventas/Construcción), se adopta el del panel: **① Tesorería → ② Ventas → ③ Proyectos → ④ Construcción.** Razón: a diario "¿vendimos/cobramos?" pesa más que "¿cómo va la obra?".
- **D2 — Todo, todos los días.** Se descarta el "modelo de dos velocidades" (diario corto + bloques lentos solo lunes). El correo diario mantiene las 4 secciones completas cada día (L–S).
- **D3 — Contratistas a línea de excepción.** El detalle por-contratista (efectividad/vencidas) baja a **una línea de excepción** ("N casas en obra · M con hito vencido") + deep-link al módulo. Beto: "siempre hemos medido eso, pero acepto el cambio y si lo extrañamos te digo" → reversible.
- **D4 — Objetivos trimestrales: pendientes.** "Avance vs plan" queda **fuera de alcance** hasta que Beto/dirección definan bien las metas (la columna `dilesa.proyectos.objetivo_trimestral` existe pero está vacía). No se promete "vs plan" en el correo hasta entonces.
- **D5 — Las 2 capas, a la vez.** Beto pidió ejecutar la Capa 1 (reestructura + tarjeta + credibilidad) y la Capa 2 (utilidad potencial, absorción, alertas, ganchos) **en la misma iniciativa**, no en olas separadas. Se ejecutan en sprints pero sin esperar entre capas.
- **D6 — El correo es consejo-facing en producción.** El PR que toca el correo vivo se revisa con Beto en preview **antes de mergear** (excepción UI/visible de `CLAUDE.md`); migraciones y vistas van con auto-merge normal tras OK.

## Modelo conceptual

### Estructura nueva: 7 bloques → 4 secciones

| # actual | Bloque actual                                     | → Sección          | Tabla/elemento nuevo                                                                                        |
| -------- | ------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| —        | (nuevo)                                           | **(cabecera)**     | **Tarjeta ejecutiva "Hoy en DILESA"** (6 cifras + delta) + asunto dinámico + franja de alertas              |
| 1        | Resumen Saldos Bancos                             | **① Tesorería**    | **Saldos en Bancos** (con semáforo de frescura) + línea **Cobranza (CxC)**: abierto / cobrado 30d / vencido |
| 5        | Tubería                                           | **② Ventas**       | **Pipeline vivo** (solo fases activas, con barras) + **Histórico** (1 línea al pie)                         |
| 6        | Asignaciones y Ventas del mes                     | **② Ventas**       | **Asignaciones y Escrituras del Mes**                                                                       |
| 2        | Avances Proyectos                                 | **③ Proyectos**    | **Avance por Desarrollo** (rollup por desarrollo)                                                           |
| 3 + 4    | Análisis de Margen **+** Inventario por Prototipo | **③ Proyectos**    | **Inventario y Margen por Prototipo** (fusión, solo prototipos vivos, + utilidad potencial)                 |
| —        | (nuevo, Capa 2)                                   | **③ Proyectos**    | **Absorción y meses de inventario** por desarrollo                                                          |
| 7        | Operación Contratistas                            | **④ Construcción** | **1 línea de excepción** + deep-link (D3)                                                                   |

**Reglas de consolidación (petición C de Beto, con bisturí):**

- **Fusionar** Margen (3) + Inventario (4) → misma llave (prototipo), el consejero los lee juntos ("¿cuánto gano y cuánto me queda por vender?").
- **NO fusionar** Avances (2) / Inventario (4) / Contratistas (7) aunque los tres toquen "casas en construcción": son granos y audiencias distintas. Regla de oro: **un grano por tabla**.
- **Fuente única de verdad para "casas en obra":** `dilesa.construccion` (estado `en_progreso`) es la autoritativa (ya lo es para Avances/Inventario tras el fix de `dilesa-resumen-consejo` 2026-06-11). Inventario por prototipo **no** repite la columna "En constr."; el detalle de obra vive solo en Construcción.

### Cifras de la tarjeta ejecutiva (delta diario solo para flujos)

`Ventas hoy (# · $)` · `Escrituras hoy (# · $)` · `Cobrado hoy ($)` · `Liquidez total ($, con flag de stale)` · `CxC abierto (con vencido)` · `Casas en obra (# · vencidas)`.

**Disciplina de deltas (recomendación del CFO):** flecha ▲▼ diaria **solo para flujos** (ventas, escrituras, cobranza, caja). Los ratios (margen, absorción, meses de inventario) van como **tendencia mensual/semanal**, nunca con delta diario — un margen no se mueve día a día y un delta diario invita a sobre-reaccionar a ruido.

### Alertas por excepción (cap duro: 3)

Bloque "⚠️ Requiere atención" que **solo aparece si dispara algo** (cero alertas = no se imprime la sección): CxC vencido, saldo bancario stale > N días, hitos de obra vencidos, holds por expirar ≤ 48h. Máximo 3 a la vez para evitar fatiga.

## Hallazgos de factibilidad (verificados contra prod `ybklderteyhuugzfmxbi`, 2026-06-13)

- **CxC vivo** — `erp.cxc_cargos` / `cxc_pagos`, filtro `estado IN (pendiente, parcial)`: **$87.5M abierto** (saldo), **$8.2M vencido** (con `fecha_vencimiento < hoy`). FACTIBLE. El "$133.2M / $47.5M en 195 cargos" del audit incluía `cancelado` (sobreestimación) — corregido en Sprint 3. _(Depende de la iniciativa `cxc`, in_progress.)_
- **CxP casi sin uso** — `erp.cxp_pagos`: $0.5M en 2 pagos. Va como **cifra**, no como tabla.
- **Saldos** — `erp.v_cuenta_saldo_actual` está **limpio**: 5 cuentas, una fila por cuenta (Monex $128.7M 12-jun, BBVA $1.37M 12-jun, Finamex $5M 11-jun, BBVA USD **$0** 07-jun, Afirme **$9.5K stale 31-may**). El "hay 2" que reportó Beto = **dos superficies de captura** (`cuenta_saldos` diario, de `tesoreria` — lo que lee el correo; y `estados_cuenta`, de `conciliacion-bancaria`), por diseño, **no un duplicado**. El correo no double-cuenta.
- **Margen vivo** — `v_margen_prototipo ⋈ v_inventario_prototipo` por `prototipo_id`, filtro `inventario_disponible>0 OR inventario_construccion>0`. Solo 5/11 prototipos vivos. **Utilidad potencial ~$103M** concentrada en LDLE-ISC ($75.2M / 153 casas) y LDS-RMC ($16M). FACTIBLE.
- **Tubería** — `dilesa.ventas.estado`: activa 107/$110M vs terminada 1,093/$1,060M (10×). Split = `WHERE`. FACTIBLE.
- **Deltas del día** — `dilesa.ventas` (`fecha_escritura`, `created_at`, `expira_at`), `venta_fases.fecha`, `cxc_pagos.fecha`. FACTIBLE. _Caveat:_ días con cero movimiento → el copy dice "sin movimiento hoy", no se rompe.
- **Absorción / meses de inventario** — derivable de `venta_fases` (serie de tiempo) + disponibles por desarrollo. FACTIBLE (vista nueva).
- **Objetivo trimestral** — `dilesa.proyectos.objetivo_trimestral` existe pero **vacía → GAP** (D4, fuera de alcance).
- **Riesgo de fórmula** — `v_contratista_obra.efectividad_pct` da **>100%** (Ana Sarahi 115%): revisar antes de exponer al Consejo (aunque Construcción pase a línea de excepción, el conteo de vencidas sale de esa vista).

## Sprints

### Sprint 1 — Snapshot diario + deltas (la base de todo)

1. Tabla `dilesa.kpi_snapshot` (cierre diario: ventas/escrituras/cobranza/liquidez/CxC/casas-en-obra del día). Migración (OK de Beto).
2. El cron, al enviar, **escribe el snapshot del día**; los deltas = hoy vs último snapshot. Día 1 sin delta; vivo desde el día 2.
3. Helpers puros + tests. Sin esto no hay tarjeta ni asunto dinámico.

### Sprint 2 — Reestructura: 4 secciones + consolidaciones + títulos

1. Reordenar a Tesorería → Ventas → Proyectos → Construcción (D1); quitar "Resumen", títulos con señal (petición A).
2. Fusionar Margen+Inventario → **Inventario y Margen por Prototipo** (vivo, filtro B, columna utilidad potencial); vista `v_margen_inventario_prototipo`.
3. Partir tubería viva vs histórico (1 línea al pie).
4. Contratistas → línea de excepción + deep-link (D3); fuente única de "casas en obra".

### Sprint 3 — Tarjeta ejecutiva + asunto dinámico + alertas + frescura + ganchos

1. Tarjeta "Hoy en DILESA" (6 cifras con delta de flujo).
2. Asunto dinámico (titular del día; "[PRUEBA]" se conserva en modo test).
3. Franja de alertas por excepción (cap 3): CxC vencido, saldo stale, hitos vencidos, holds por expirar.
4. Semáforo de frescura agresivo en saldos (verde ≤2d / ámbar 3-7 / rojo >7; el stale sale del total de liquidez). **Verificar el lag de captura de cobranza** antes de prometer "cobrado hoy".
5. Deep-links por sección + "Número del día".

### Sprint 4 — KPIs de tendencia (homebuilder)

1. Vista `v_absorcion_desarrollo` (absorción 3M móvil + meses de inventario) por desarrollo.
2. Backlog de escrituración (comprometido por cerrar: # y $).
3. Render como tendencia (no delta diario).

### Sprint 5 — Cutover + closeout

1. Smoke E2E a `RESUMEN_CONSEJO_TEST_TO`; comparar lado a lado con el correo actual (nada se pierde).
2. **Revisar el preview con Beto antes de mergear el cambio del correo vivo** (D6).
3. Closeout + barrido de Reminders + actualizar este doc + `INITIATIVES.md`.

## Dependencias

- **`cxc`** (in_progress) — provee `cxc_cargos`/`cxc_pagos` para la sección Cobranza. El bloque CxC del correo madura junto con esa iniciativa.
- **`conciliacion-bancaria`** (in_progress) — `cuenta_saldos` + `estados_cuenta` (frescura de saldos).
- **`tesoreria`** (done) — saldos bancarios vía `v_cuenta_saldo_actual`.

## Riesgos

1. **Credibilidad por un solo número malo** — un saldo stale, `efectividad_pct>100%`, o "cobranza hoy $0" por lag de captura, hacen que el Consejo desconfíe de todo. Mitiga: flag de frescura, validar fórmulas y lag antes de exponer.
2. **Correo vivo a producción al Consejo** — cambio visible; revisar preview antes de mergear (D6).
3. **Dependencia de `cxc`/`conciliacion-bancaria`** (in_progress) — si CxC no está estable, el bloque Cobranza arranca con lo disponible y madura después.
4. **Sobre-ingeniería de la Capa 2** — meter todo (CxC + alertas + absorción + número del día) sin disciplina recrea el muro de tablas, ahora bonito. Mitiga: cap de alertas, deltas solo en flujos, una cifra por idea (no una tabla por idea).

## Métricas de éxito

- El Consejo entiende el día en un vistazo móvil; el correo se mantiene verde L–S (paridad de contenido, nada perdido).
- La cobranza vencida ($8.2M hoy, cifra real) deja de ser invisible.
- Cero quejas por números que se contradicen entre secciones.
- 100% de envíos trazables en `core.notification_log` (heredado de v1).

## Bitácora

- **2026-07-01 (base híbrida de escrituras — registro vs fecha real)** — En el
  primer correo tras el fix de TZ (iniciativa `fechas-tz`), Beto notó "7
  escrituras hoy" que se REGISTRARON hoy pero cuyas escrituras reales son de
  junio (y 2 con `fecha_escritura` futura, 25/27-jul — firmas programadas o
  error de captura, se revisan aparte). Regla de Beto: **los reportes siempre
  cuentan por la fecha de la escritura, no la del registro** (alineado con el
  módulo de Reportes, #1140). Decisión (opción híbrida, elegida por Beto):
  el **mes** (tile, tabla por prototipo y asunto) se cuenta por
  `ventas.fecha_escritura` en [inicio de mes, hoy] — las futuras aún no
  cuentan; el tile **"hoy" pasa a "Escrituras registradas hoy"** (pulso
  operativo, única forma de que el consejo vea registros tardíos de meses ya
  cerrados) con nota "f. reales: …" cuando difieren, y el asunto dice
  "N escrituras registradas". Asignaciones siguen por fase 2 (evento interno,
  su fecha es la real).

- **2026-06-19 (fix del pipeline vivo — valor desde la asignación)** — Beto notó que
  en el correo las primeras fases (Solicitud de Asignación, Asignada) y parte de
  Formalizada mostraban **$0 de valor de escrituración**. Causa: `valor_escrituracion`
  no se captura hasta la **Fase 8 (Dictaminada)**, pero `armarTuberiaSplit` sumaba
  `valor_escrituracion ?? 0` (la función hermana `armarBacklog` ya usaba el fallback
  correcto — inconsistencia entre dos funciones del mismo archivo). **Fix:** el
  pipeline vivo ahora usa `valor_escrituracion ?? precio_asignacion ?? 0` — el valor
  comprometido congelado al asignar. **Sin tocar datos.** Efecto medido en prod:
  Asignada $0→$4.75M, Formalizada $21.8M→$26.5M, Solicitud de Dictaminación +$0.93M.
  ("Solicitud de Asignación" sigue $0: es pre-asignación, aún no hay precio congelado.)
  Se descartó escribir `valor_escrituracion` en la DB desde la asignación (adelantaría
  un dato que la captura de Fase 8 pisaría y mezclaría semántica). +1 test del fallback.
  Pulido del correo dentro del rediseño, no Sprint nuevo. (El backfill de 6 ventas
  nativas con columnas de desglose en NULL se hizo en paralelo, en `dilesa-cuadratura-sobreprecio`.)

- **2026-06-16 (auditoría de consistencia "casas en obra" + blindaje + fix de avance)** —
  Beto detectó números distintos para los mismos conceptos comparando el módulo
  Construcción con un preview del correo. Auditoría (workflow + queries a prod):
  los datos REALES **cuadran** (12 casas en obra = 2 Lomas de los Encinos + 10
  Lomas del Sol) y las 3 vistas derivan de la MISMA fuente física
  `dilesa.construccion.estado='en_progreso'` (gracias al fix del 12-jun
  `20260612025311` que antes daba 11 vs 12). La discrepancia que vio Beto era un
  **preview MOCK con datos de relleno** que mandé sin rotular (error de
  comunicación, no del correo). **Blindaje (en este PR):** la línea "N casas en
  obra" del correo ahora cuenta **unidades distintas** (suma de
  `v_proyecto_avances.casas_en_construccion`) en vez de **filas** de
  `v_contratista_obra.viviendas` — elimina la fragilidad de doble conteo si una
  casa tuviera 2 arranques (hoy 0 multi-módulo, verificado). Vencidas/MO siguen de
  contratista. **Fix relacionado (PR aparte #913, aplicado a prod):** obras
  terminadas/DTU quedaban en 97.53%/99.86% por desacople estado↔avance; corregido
  por DB (invariante "estado post-obra ⇒ 100%" en `fn_calcular_avance_construccion`
  - trigger) + backfill de 65 obras. Mejora de paso el `avance_const_pct` del correo.

- **2026-06-16 (Sprint 4 — absorción + meses de inventario + backlog, en preview)** —
  ③ Proyectos suma **Absorción y Meses de Inventario** por desarrollo (ritmo =
  asignaciones de los últimos 3 meses ÷ 3; meses de inventario = disponible ÷
  ritmo) y ② Ventas suma la línea **Backlog de Escrituración** (ingreso
  comprometido por cerrar = ventas vivas en fase ≥ Asignada sin escriturar,
  valuadas a `valor_escrituracion`/`precio_asignacion`). Ambas como **tendencia,
  sin delta diario ▲▼** (disciplina del CFO: los ratios no llevan flecha del
  día). Funciones puras `armarAbsorcion`/`armarBacklog` + render
  (`renderAbsorcion`/`renderBacklog`) + extensión de `fetchResumenConsejoData`
  (query `venta_fases` fase='Asignada' 3M + liga venta→unidad→proyecto;
  `ventas` extendida con `fecha_escritura`/`precio_asignacion`). **7 tests
  nuevos** (41 del módulo verdes), typecheck/lint/format/coverage OK.
  **Validado contra prod (DRY RUN 2026-06-16):** Lomas de los Encinos 153 disp /
  58 asignadas 3M → 7.9 meses; Lomas del Sol 18 / 10 → 5.4 meses; Lomas del Valle
  2 / 0 → sin ritmo. Backlog ~67 ops / ~$81M (corte fase ≥ 2 excluye "Solicitud
  de Asignación" tentativa, evita inflar). PR **sin auto-merge** (D6, correo
  consejo-facing) — revisión en preview de Vercel. Pendiente vivo: Sprint 5
  (cutover + closeout). Ver decisión registrada 2026-06-16 (JS vs vista SQL).

- **2026-06-13 (hotfix — CxC marcado PRELIMINAR + limpieza de cargo de prueba)** — Revisando el "vencido" con Beto: (1) un cargo huérfano de la venta de prueba "ADALBERTO PRUEBA PRUEBA" ($909K) seguía vivo aunque la venta ya estaba hard-borrada — soft-delete del cargo (`erp.cxc_cargos` `fea0755c…`, reversible, con nota de auditoría); el vencido bajó $8.2M → $7.31M. (2) Hallazgo de fondo: los cargos de CxC están completos (plan de pagos entero) pero **los pagos no están cargados** — sobre todo los desembolsos de crédito Infonavit/banco; muchas ventas muestran solo el enganche o $0 pagado, y hay ventas `terminada` con saldo abierto (imposible: no se entrega sin pago completo). O sea el "abierto/vencido" sobreestima — es backlog de la iniciativa `cxc` (in_progress), no cartera real. **Decisión de Beto:** marcar CxC como **"preliminar — en reconciliación"** en el correo (flag `cxc_preliminar`/`CXC_EN_RECONCILIACION`): muestra solo el abierto con la etiqueta, **no emite alerta ni asunto de cobranza vencida** (el vencido es mayormente fantasma). Apagar el flag cuando la reconciliación de pagos esté al día.

- **2026-06-13 (Sprint 3 — cerebro del correo, en preview)** — Tarjeta ejecutiva "Hoy en DILESA" (6 cifras: ventas/escrituras/cobrado/liquidez/CxC/obra) con delta ▲▼ vs el snapshot previo; **asunto dinámico** (titular del día, reemplaza el template estático); **franja de alertas por excepción** (cap 3: cobranza vencida, saldo stale, obra vencida — vacía no se imprime); **semáforo de frescura** en saldos (verde ≤2d / ámbar ≤7 / rojo >7, el stale se marca); **línea de Cobranza (CxC)** en Tesorería (abierto/cobrado mes/vencido/CxP). El cron computa la cabecera (reusa `computeKpisDelDia` + `fetchSnapshotPrevio` + 2 queries de mes/CxP) y la pasa al render. **Corrección de datos:** la cobranza vencida real es **$8.2M** (no $47.5M — el audit incluía cargos `cancelado`); abierto **$87.5M**. 11 tests nuevos del módulo. Pendiente menor de S3: deep-links por sección + "número del día" (polish, no bloquea). PR pendiente de revisión de Beto en preview (D6). Los deltas ▲▼ salen sin flecha el día 1 (snapshot previo aún no existe) y se activan desde el 2026-06-14.

- **2026-06-13 (Sprint 2 — reestructura visible, mergeada #886)** — El correo pasa a 4 secciones dinero-arriba (① Tesorería → ② Ventas → ③ Proyectos → ④ Construcción), títulos sin "Resumen", Margen+Inventario fusionados en una tabla por prototipo vivo + utilidad potencial, tubería partida en pipeline vivo vs línea de histórico, contratistas a línea de excepción. **Hecho en JS sin tocar la DB** (fusión/split desde las vistas existentes), así el preview de Vercel renderiza contra prod de inmediato. Verificado con datos reales (DRY): 5 prototipos vivos, utilidad potencial total **$102.3M**, histórico **1,093 / $1,060M**, 12 casas en obra — cuadra con la auditoría de factibilidad. PR pendiente de revisión de Beto en preview antes de mergear (D6). 20 tests del módulo. La tarjeta ejecutiva + asunto dinámico + alertas + CxC van en Sprint 3.

- **2026-06-13 (Sprint 1 — snapshot diario, #884)** — Tabla `dilesa.kpi_snapshot` (flujos del día + stocks de cierre) + el cron escribe el cierre al enviar (upsert idempotente, no-fatal). Base de los deltas ▲▼. Migración aplicada a prod con OK de Beto (vía MCP); `SCHEMA_REF`/`types` regenerados (#885). El primer snapshot se captura el 2026-06-13 a las 20:00. 14 tests. No cambia el correo visible.

- **2026-06-13 (promoción)** — Beto pidió estresar al máximo el correo al Consejo. Panel de 6 lentes (workflow) + verificación en prod. Beto cerró alcance (D1–D6) y aprobó ejecutar las 2 capas. Iniciativa promovida a `in_progress`. Mockup del rediseño presentado en chat.

## Decisiones registradas

- **2026-06-13 — D1 dinero arriba / D2 todo diario / D3 contratistas a excepción / D4 objetivos pendientes / D5 dos capas juntas / D6 preview antes de mergear el correo vivo.** Ver "Decisiones registradas (cierre de alcance)" arriba.

- **2026-06-16 — Absorción/meses de inventario/backlog en JS, no como vista SQL.** El plan listaba una vista `dilesa.v_absorcion_desarrollo`; se implementa en JS puro (`armarAbsorcion`/`armarBacklog` + cómputo en `fetchResumenConsejoData`) por consistencia con S2 (Margen+Inventario y split de tubería también en JS), para evitar una migración a prod (menos fricción/riesgo) y para que el **preview de Vercel renderice contra prod de inmediato** — clave porque el correo es consejo-facing y se revisa en preview (D6). Mismo outcome. Si a futuro Analytics/BI necesita la absorción como vista, se crea aparte. La absorción cuenta **ventas distintas** asignadas en la ventana (no eventos de fase): una venta con varias filas 'Asignada' cuenta 1 vez.
