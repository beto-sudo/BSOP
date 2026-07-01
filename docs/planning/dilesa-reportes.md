# Iniciativa — Reportes operativos (DILESA)

**Slug:** `dilesa-reportes`
**Empresas:** DILESA (arranca en Ventas; el patrón es replicable módulo-por-módulo y a las otras empresas)
**Schemas afectados:** Principalmente UI + lectura — **sin schema nuevo en v1** (los presets viven como config en código, versionados). Lee de `dilesa` (`ventas`, `unidades`, `proyectos`, `productos`, `venta_fases`), `erp` (`personas`, `cxc_cargos`/`cxc_pagos` para cartera) y `core` (RBAC). Nuevo sub-slug RBAC por sección de reportes (ADR-014/030, con backfill defensivo de permisos). PDF vía `@react-pdf/renderer` (ya en deps) o patrón print ADR-021. Diferido a fase 2: tabla de «vistas guardadas» del usuario.
**Estado:** in_progress
**Próximo hito:** Los **8 reportes de Ventas están en prod** (#967 mergeado). Próximo: Beto elige el siguiente módulo donde replicar el molde (Compras · Construcción · Cobranza · …) — el patrón `reporte = preset + vista + PDF` (ADR-047) ya está probado end-to-end y los 3 patrones de loader (compartido / propio-tabla / vista-DB) cubren los casos.
**Dueño:** Beto
**Creada:** 2026-06-19
**Última actualización:** 2026-07-01 (9º reporte de Ventas: «Unidades escriturables» — obra terminada + extracción RUV, inventario + asignadas sin escriturar)

> Detonante: Beto quiere generar reportes de los módulos de DILESA, **empezando por Ventas**, y no tenía claro el modelo de presentación (¿filtros libres? ¿presets? ¿una página de reportes por módulo o un módulo central?). Esta iniciativa cierra ese modelo y lo aterriza en los primeros reportes de Ventas.

## Problema

Hoy los datos de DILESA viven en **pantallas operativas filtrables** (cada módulo ya trae KPIs reactivos vía `deriveKpis` + `<ModuleKpiStrip>`, filtros sincronizados a la URL y `<DataTable>`). Eso resuelve la _exploración_, pero NO hay una capa de **reportes**:

- **No hay reportes con nombre / reproducibles.** Pedir "ventas del mes", "cartera vencida" o "productividad por vendedor" obliga a re-armar filtros volátiles cada vez; el corte no es reproducible ni compartible.
- **No hay salida presentable.** Más allá de 2 documentos imprimibles _por registro_ en Ventas (estado de cuenta, recibo de caja), no se puede sacar un corte agregado en PDF con branding para imprimir/mandar.
- **No hay catálogo / descubribilidad.** No existe un lugar que liste "qué reportes hay".
- **No hay export de datos** (CSV/Excel) en DILESA — aunque Beto confirmó que esto **no** es prioridad del v1.

Falta una capa de reportes **curados, reproducibles y presentables**, montada encima de las pantallas que ya son ~70% un reporte.

## Decisiones de diseño (conversación de promoción, 2026-06-19)

Beto eligió, sobre tres ejes:

1. **Audiencia v1 → operativa por área.** No ejecutiva/Consejo. Cada equipo (ventas primero) explora cortes de su módulo. ⇒ el peso va en reportes **por módulo**; el hub queda delgado.
2. **Salida → pantalla + PDF** (sin Excel/CSV). ⇒ el "motor" reúsa filtros + KPIs + tabla que ya existen, y agrega (a) **presets con nombre** como entrada y (b) **"Exportar PDF"** con branding como salida. No se construye export de datos.
3. **Arquitectura → híbrida** (recomendación aprobada). El hub `/dilesa/reportes` es **índice de un libro, no una bodega aparte**: los reportes de un módulo viven en el módulo (con su sub-slug RBAC y reusando sus componentes); el hub es catálogo + buscador (se engancha al Cmd+K de `ux-consolidacion`) y la **casa de los reportes cross-módulo**. Se descarta el módulo-central-monolítico (duplica lógica/permisos y se desincroniza).

Marco mental de los 4 tipos de reporte (de la conversación): **A** vista operativa filtrable (ya existe) · **B** reporte de gestión recurrente (= presets, el foco aquí) · **C** documento formal en PDF (la salida) · **D** analítico cross-módulo (territorio de `analytics`/Metabase, fuera de alcance salvo los 2 cross-módulo listados).

## Outcome esperado

Un set de **reportes de Ventas con nombre** que abren ya armados (preset), se afinan con filtros (fechas, proyecto, vendedor), se ven en pantalla y se exportan a **PDF con branding DILESA**; descubribles desde un hub `/dilesa/reportes` que es índice. El patrón (`reporte = preset + vista + PDF`, documentado en ADR) queda **replicable** módulo-por-módulo y empresa-por-empresa, sin reescribir el motor.

## Alcance

**Sprint 1 — Patrón + golden (Pipeline por fase).** Establece el contrato y los componentes reutilizables, probados end-to-end en un reporte real.

- **ADR del patrón** «reporte = preset + vista + PDF»: contrato `ReportePreset` (nombre, módulo, columnas, agrupación, filtros default, rango de fecha default), componentes (`<ReporteView>` = `<ModuleKpiStrip>` + tabla agrupable + botón "Exportar PDF"), y dónde viven los presets (config en código).
- **Hub `/dilesa/reportes`**: catálogo + buscador. Los reportes de módulo son deep-links a su sección; los cross-módulo viven aquí. Sub-slug RBAC + entrada en `NAV_ITEMS`/`ROUTE_TO_MODULE` + backfill de permisos (ADR-014/030).
- **Reporte «Pipeline por fase»** completo (pantalla + PDF) como golden.

**Sprint 2 — Resto del núcleo de Ventas.** Los otros 2 reportes ⭐: **Ventas del periodo** + **Productividad por vendedor**.

**Sprint 3 — Completar Ventas.** Inventario disponible · Ventas estancadas · Escrituración programada · Por tipo de crédito.

**Cross-módulo (cuando Ventas esté listo).** Cartera por venta (ventas + cobranza) · Avance de obra de lo vendido (ventas + construcción). Viven físicamente en el hub.

**Fuera de alcance v1** (siguientes olas):

- **Otros departamentos / empresas** — se replica el patrón módulo-por-módulo después de Ventas (decisión de Beto: "después vamos viendo los demás departamentos").
- **«Vistas guardadas» del usuario** — fase 2 (requiere tabla `dilesa`/`core`); en v1 los presets son del sistema (config en código).
- **Export a Excel/CSV** — Beto no lo pidió; entra solo si surge la necesidad.
- **Exploración ad-hoc libre** — es la iniciativa `analytics`/Metabase, no esto.

## Catálogo de reportes (v1, Ventas)

| #   | Reporte                       | Tipo         | Sprint | Qué muestra                                                                                  |
| --- | ----------------------------- | ------------ | ------ | -------------------------------------------------------------------------------------------- |
| 1   | **Pipeline por fase** ⭐      | módulo       | 1      | Ventas y $ en cada una de las 17 fases; filtrable por proyecto/vendedor/fecha. Embudo.       |
| 2   | **Ventas del periodo** ⭐     | módulo       | 2      | Escrituradas en un rango, por proyecto/vendedor, con monto. Cierre mensual.                  |
| 3   | **Productividad vendedor** ⭐ | módulo       | 2      | Ventas, pipeline $, % escrituradas, avance promedio por vendedor. Ranking / base comisiones. |
| 4   | Inventario disponible         | módulo       | 3      | Unidades por proyecto/prototipo: disponibles vs vendidas vs no-vendibles.                    |
| 5   | Ventas estancadas             | módulo       | 3      | Ventas con > X días sin avanzar de fase (fechas de `venta_fases`). Dónde se atora.           |
| 6   | Escrituración programada      | módulo       | 3      | Firmas agendadas (fase 10) y cuándo. Qué se va a escriturar.                                 |
| 7   | Por tipo de crédito           | módulo       | 3      | Distribución INFONAVIT/FOVISSSTE/bancario/contado.                                           |
| 8   | Cartera por venta             | cross-módulo | post   | Saldo por cobrar por cliente/venta (ventas + cobranza).                                      |
| 9   | Avance de obra de lo vendido  | cross-módulo | post   | Para vendidas, en qué va la obra de su unidad (ventas + construcción). Entregas.             |

## Riesgos

- **Duplicar lógica vs. las pantallas operativas.** Un reporte de módulo debe **reusar** el fetch/KPIs del módulo, no reimplementarlos. El ADR fija el contrato para evitarlo.
- **Solapamiento con `analytics`/Metabase.** Delimitado: reportes **curados** dentro de la app ≠ exploración **ad-hoc** libre. No compiten; se complementan. (Decisión registrada.)
- **Solapamiento con el Resumen al Consejo.** Misma data, distinto canal (push email vs pull en app). Reusar vistas/helpers de derivación donde aplique; no clonar fórmulas.
- **PDF — gotchas de `@react-pdf/renderer` v4.5.x.** `gap` no soportado (usar margins); cuidado al importar constantes desde client components a un route handler (ver memoria `feedback_use_client_constants_import`). Seguir el patrón ya probado en estimaciones/contratos de Construcción.
- **RBAC.** Cada sección de reportes nueva = sub-slug + **backfill defensivo de permisos**; sin él, agregar el slug **esconde** el módulo a no-admins (ADR-014/030).

## Métricas de éxito

- Los **3 reportes núcleo de Ventas** operativos (pantalla + PDF) y usados por el equipo.
- "Dame el reporte X" = **2 clics** (abrir preset + ajustar fecha), no re-armar filtros desde cero.
- Patrón **documentado (ADR) y replicado** a ≥1 reporte cross-módulo sin reescribir el motor.
- **0 duplicación** de lógica de derivación vs. módulos / Resumen Consejo.

## Bitácora

- **2026-06-19** — Promovida. Conversación de diseño: se ordenó "reportes" en 4 tipos (vista operativa / gestión recurrente / documento formal / analítico cross-módulo). Mapa del estado actual de DILESA (18 módulos; Ventas ya con KPIs+filtros+tabla; 2 printables por-registro; sin presets ni export). Beto eligió audiencia **operativa por área**, salida **pantalla + PDF** (sin Excel), arquitectura **híbrida** (hub-índice + reporte en su módulo). Arranca por Ventas con 3 reportes núcleo (Pipeline por fase · Ventas del periodo · Productividad por vendedor); demás departamentos después. PR de promoción: [#964](https://github.com/beto-sudo/BSOP/pull/964) (merged).
- **2026-06-19 (Sprint 1 — patrón + golden)** — Construido el molde completo y el primer reporte end-to-end. **Patrón** ([ADR-047](../adr/047_reportes_preset_vista_pdf.md)): `reporte = preset (ReporteDef en registry, config en código) + vista + PDF`, con motor puro compartido por pantalla y PDF (paridad garantizada), cáscara reutilizable (`<ReporteCatalogo>` + `<ReporteShell>`), y la regla híbrida (reporte en su módulo + hub-índice). **Reporte golden «Pipeline por fase»** (Ventas): fetch enfocado de `venta_fase_catalogo` + ventas activas, agrupación por fase con conteo/monto/%, filtros proyecto/vendedor/mes en la URL, KPIs, tabla-embudo, y export PDF con branding DILESA (reusa `lib/dilesa/pdf` + route `renderToBuffer`). **Hub** `/dilesa/reportes` (catálogo + buscador filtrado por RBAC) + **tab Reportes** en Ventas. **RBAC**: 2 módulos nuevos (`dilesa.reportes`, `dilesa.ventas.reportes`) en los 4 lugares (nav-config, ROUTE_TO_MODULE, EXPECTED_DB_MODULE_SLUGS, migración con backfill desde `dilesa.ventas.lista`). Motor con 9 tests. Migración `20260619223958_modulos_dilesa_reportes.sql` **dejada como archivo** (otorga permisos → la aplica Beto); preview revisable como admin. **[PR #965](https://github.com/beto-sudo/BSOP/pull/965) mergeado** (Beto: "se ve muy bien"). **Aprendizaje:** el build de Vercel destapó 2 fallos de prerender que el typecheck no ve (icon función cruzando boundary RSC; useSearchParams en página RSC) → fix `'use client'` en las pages; desde ahora correr `next build` (no solo typecheck) en PRs con páginas nuevas.
- **2026-06-19 (Sprint 2 — Ventas del periodo + Productividad por vendedor)** — Los otros 2 reportes ⭐ de Ventas, calcando el molde. **Loader compartido** (`lib/dilesa/reportes/ventas-data.ts` puro: tipos + `normalizarVentas` + helpers; `use-ventas-reporte` hook browser; `ventas-data-server` para las rutas de PDF) — un solo fetch+normalización para ambos reportes, sin tocar `pipeline-por-fase`. **Ventas del periodo**: escrituradas en rango (filtro de fechas + proyecto/vendedor), desglose por mes + detalle + ticket promedio. **Productividad por vendedor**: scorecard (cartera, pipeline, escrituradas, % cierre, monto), filtro por proyecto, ordenado por monto escriturado. Ambos con KPIs, tabla y PDF con branding. Sin RBAC nuevo (mismo `dilesa.ventas.reportes`). 14 tests de motores + normalización (1932 total). Verificado con `next build` + env real (118 páginas sin error). **[PR #966](https://github.com/beto-sudo/BSOP/pull/966) mergeado.**
- **2026-06-20 (migración RBAC aplicada a prod)** — Con OK de Beto, aplicada `20260619223958_modulos_dilesa_reportes.sql` vía MCP (el CLI `--db-url` se cuelga en este entorno, igual que `psql`). Resultado: 2 módulos (`dilesa.reportes`, `dilesa.ventas.reportes`, sección heredada `operaciones`) + 16 permisos backfilleados (8 roles con `dilesa.ventas.lista` × 2). **Ledger reconciliado** al timestamp del archivo vía `execute_sql` (el MCP registra con timestamp de aplicación → se hizo `UPDATE` de la versión huérfana a `20260619223958` para no romper `db push`). El módulo Reportes ya es visible para el equipo (no-admins) en prod.
- **2026-06-20 (Sprint 3a — Escrituración programada + Por tipo de crédito)** — Los 2 reportes de Ventas que reusan el loader compartido (solo se enriqueció `VENTAS_SELECT` + `normalizarVentas` con `tipo_credito`, `fecha_firma_programada`, `hora_firma_programada`). **Escrituración programada**: firmas agendadas pendientes (fase 10, `fecha_firma_programada` con número de escritura aún nulo) por fecha, filtros rango+proyecto. **Por tipo de crédito**: distribución de la cartera por `tipo_credito` (conteo/monto/%), filtro por proyecto. Ambos KPIs+tabla+PDF. 9 tests nuevos. Verificado con `next build` + env real. Sin auto-merge.
- **2026-06-20 (fix Escrituración programada)** — Beto reportó el reporte en blanco. Diagnóstico (query a prod): de 1316 ventas, 388 tienen `fecha_firma_programada` pero **las 388 ya escrituraron** (el flujo avanza rápido de fase 10 a escriturada) → el filtro "solo pendientes" dejaba 0. **Fix:** muestra TODAS las firmas agendadas con flag de estado (Pendiente/Escriturada), orden por fecha desc, KPI de pendientes + columna Estado en pantalla y PDF. Va al mismo PR #967.
- **2026-06-20 (Inventario disponible)** — 6º reporte. Loader propio de `dilesa.unidades` (`inventario-data` puro + `use-inventario-reporte` hook + `inventario-data-server`) con el MISMO criterio de "vendible hoy" del módulo Inventario (estado `en_construccion`/`terminada`, `activo_id IS NULL`, no muestra) — sin las RPC de precio (esas son para cotizar). Agrupa por proyecto + prototipo con desglose en construcción/terminadas; filtros proyecto/prototipo; KPIs+tabla+PDF. 5 tests. En #967.
- **2026-06-20 (Ventas estancadas + Ventas desasignadas — cierran Ventas)** — Beto pidió seguir con estancadas y agregar desasignadas. **Ventas estancadas** (enfoque "pipeline por antigüedad" — query a prod mostró solo 10 activas, 0 estancadas, así que un filtro estricto vaciaría el reporte; se muestran todas ordenadas por días en fase, con umbral de alerta): vista nueva **`dilesa.v_ventas_pipeline_antiguedad`** (`security_invoker`, calcula la fecha de entrada a la fase actual y los días en la base — evita traer ~14k filas de `venta_fases`), aplicada vía MCP + ledger reconciliado a `20260620164600` + `db:types`/`schema:ref` regenerados. **Ventas desasignadas** (119 en prod; loader propio enfocado a `estado='desasignada'` con `motivo_desasignacion`): clasificación heurística **Reubicación** (el cliente se mueve a otra unidad — no es pérdida) vs **Baja** (cancelación/desperfilado/sin capacidad), agrupado por mes, KPIs (total/reubicaciones/bajas/% bajas). Ambos KPIs+tabla+PDF, 11 tests. **Los 8 reportes de Ventas quedan completos** en #967 (1957 tests, `next build` + env real verde). El molde ADR-047 probado end-to-end: 8 reportes, 3 patrones de loader (compartido / propio-tabla / vista-DB).
- **2026-06-24 (fix — filtro de Proyectos con nombres duplicados)** — Beto reportó que el selector de Proyectos de los reportes de Ventas mostraba proyectos repetidos en algunos reportes. **Causa raíz:** el catálogo `dilesa.proyectos` tiene 3 nombres duplicados (cascarones del import de Coda sin inventario ni ventas: «Ampliación Lomas de los Encinos», «Loma Escondida», «Lomas de las Delicias», cada uno con una fila `completado`/`aprobado` vacía además de la real `ejecutando`). Los 5 reportes basados en ventas armaban el dropdown listando **todo el catálogo** por id (`proyectosPresentes(proyectos)` / map inline en pipeline) → mostraban los duplicados y además proyectos sin ninguna venta. Los otros 3 (inventario/estancadas/desasignadas) ya derivaban del dataset y salían limpios — de ahí el "en algunos". **Fix (UI, sin tocar datos):** `proyectosPresentes` ahora deriva de las **ventas presentes** (únicos por id, ordenados por nombre), simétrico con `vendedoresPresentes`; pipeline calca el patrón con un `useMemo`. El value sigue siendo el `id` → el filtrado por `proyectoId` en los motores no cambia. Como los 5 proyectos con ventas tienen nombre 1:1 con su id, el dropdown queda sin duplicados y sin proyectos vacíos. 3 tests nuevos (dedup + exclusión del duplicado sin ventas + dataset vacío). 6 checks de CI verdes. **Aclaración (corrige el diagnóstico inicial — NO borrar nada):** los 3 nombres «repetidos» **no son duplicados**: son **pares anteproyecto→desarrollo** legítimos (`fn_proyecto_promote_anteproyecto`). La fila `tipo='anteproyecto'` / `estado='completado'` es el anteproyecto **promovido** (vive en la pestaña Anteproyectos como «Promovido», `sucesores=1`); la fila `tipo='desarrollo'` es el desarrollo activo que la referencia por `proyecto_predecesor_id` (Ampliación 358 lotes · Delicias 165 · Loma Escondida `aprobado` aún sin lotes, promovida 2026-06-10 — cargará sus lotes con el patrón de `reference_dilesa_carga_lotes_plano`). En el módulo **Proyectos** no se ven repetidos (excluye `tipo='anteproyecto'`); solo aparecían en el **filtro de reportes** porque listaba el catálogo completo sin mirar `tipo` — exactamente lo que arregla este PR (derivar de las ventas, que los anteproyectos no tienen). Confirmado con Beto el 2026-06-24: no se borra ninguna fila. (Nicety opcional, fuera de alcance: los pickers de proyecto de costeo/construcción/compras todavía listan el catálogo completo y podrían excluir `tipo='anteproyecto'` también.)
- **2026-06-20 (feedback de Beto sobre 2 reportes)** — (1) **Inventario disponible**: de conteos agrupados a **lista de cada unidad con precio DESGLOSADO** (base + excedente de terreno + esquina + frente verde + venta futuro = total), vía la RPC `fn_calcular_precio_venta` (mismo cálculo del módulo Inventario); + área y características; PDF en landscape; KPI de valor disponible. (2) **Ventas desasignadas — fecha real**: las fechas salían todas recientes porque BSOP solo tenía `updated_at` (pisado en el cutover); la fecha real vivía en Coda (`F📅Desasigna🚫`) sin importarse. Se agregó la columna `dilesa.ventas.fecha_desasignacion` (migración `20260620172528`, aplicada vía MCP + ledger reconciliado) + script de backfill (`scripts/backfill_dilesa_fecha_desasignacion.ts`): **119/119 pobladas** (113 de Coda + 6 del timestamp en `notas`), repartidas en **23 meses** (2024-07 a 2026-06). El import (`import_dilesa_ventas.ts`) ahora captura la fecha para re-imports futuros. El reporte usa `fecha_desasignacion`. En #967.

- **2026-07-01 (Unidades escriturables — 9º reporte de Ventas)** — Beto pidió un reporte para el depto. de ventas de qué unidades ya se pueden escriturar, apoyado en los hitos del RUV. **Definición (Beto):** escriturable = **extracción capturada** (`dilesa.unidades.fecha_extraccion`, que en el trámite siempre va después del DTU) + **obra terminada**; universo = inventario vendible + unidades de ventas `activa`s aún sin escriturar (`numero_escritura IS NULL`), sin importar la fase. Loader propio (`escriturables-data` puro + hook + server) que cruza unidades × ventas activas × `dilesa.construccion` (obra terminada del físico, porque el estado comercial pisa al físico en asignadas); motor `construirUnidadesEscriturables` con KPIs del embudo (escriturables · inventario/asignadas · falta extracción · obra en proceso) y toggle «Solo escriturables / Todas las candidatas»; vista + PDF landscape. 14 tests. **Trabajo hermano (PR aparte):** chips DTU/EXT + filtro multi-select de características (`<FilterMultiCombobox>` nuevo) en las tablas de Inventario y Ventas.

## Decisiones registradas

- **2026-06-19** — **Audiencia v1 = operativa por área** (no ejecutiva). El peso va en reportes por-módulo; el hub es delgado (catálogo).
- **2026-06-19** — **Salida = pantalla + PDF.** NO export a Excel/CSV en v1 (Beto no lo pidió).
- **2026-06-19** — **Arquitectura híbrida.** Reportes de un módulo viven en el módulo (con sub-slug RBAC, reusando sus componentes); `/dilesa/reportes` es catálogo + buscador y casa de los cross-módulo. Se **descarta** el módulo-central-monolítico (duplica lógica/permisos, se desincroniza).
- **2026-06-19** — **Presets = config en código en v1** (versionados, sin migración). «Vistas guardadas» del usuario = fase 2 (tabla).
- **2026-06-19** — **Límite vs `analytics`/Metabase:** reportes curados en la app ≠ exploración ad-hoc libre. No se construye BI ad-hoc aquí.
- **2026-06-19 (Sprint 1)** — **Motor puro compartido pantalla↔PDF** (ADR-047 R2): el filtrado y la agregación viven en funciones puras (`filtrarVentas`, `construirPipelinePorFase`) que consumen ambas superficies → el PDF refleja exactamente lo que se ve. Es la garantía de paridad y lo testeable.
- **2026-06-19 (Sprint 1)** — **El reporte vive en su módulo** (`/dilesa/ventas/reportes/<id>`), con sub-slug `dilesa.ventas.reportes`; el hub `/dilesa/reportes` (módulo `dilesa.reportes`) solo lo descubre. Backfill de ambos desde `dilesa.ventas.lista` (quien ve la lista de ventas, ve sus reportes y el hub).
- **2026-06-19 (Sprint 1)** — **Gate del endpoint PDF por RLS + auth, no por sub-slug** (como los PDFs de estimaciones). El dato ya es visible en otras pantallas de ventas; el gate fino de endpoint es mejora futura (anotado en ADR-047).
