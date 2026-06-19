# Iniciativa — Reportes operativos (DILESA)

**Slug:** `dilesa-reportes`
**Empresas:** DILESA (arranca en Ventas; el patrón es replicable módulo-por-módulo y a las otras empresas)
**Schemas afectados:** Principalmente UI + lectura — **sin schema nuevo en v1** (los presets viven como config en código, versionados). Lee de `dilesa` (`ventas`, `unidades`, `proyectos`, `productos`, `venta_fases`), `erp` (`personas`, `cxc_cargos`/`cxc_pagos` para cartera) y `core` (RBAC). Nuevo sub-slug RBAC por sección de reportes (ADR-014/030, con backfill defensivo de permisos). PDF vía `@react-pdf/renderer` (ya en deps) o patrón print ADR-021. Diferido a fase 2: tabla de «vistas guardadas» del usuario.
**Estado:** in_progress
**Próximo hito:** Beto revisa el preview del Sprint 2 (Ventas del periodo + Productividad por vendedor); al OK, mergear. Pendiente operativo: aplicar la migración RBAC `20260619223958_modulos_dilesa_reportes.sql` (expone el módulo a no-admins). Luego Sprint 3 (Inventario disponible · Ventas estancadas · Escrituración programada · Por tipo de crédito).
**Dueño:** Beto
**Creada:** 2026-06-19
**Última actualización:** 2026-06-19 (Sprint 1 mergeado #965; Sprint 2 construido — Ventas del periodo + Productividad por vendedor con loader compartido + PDFs; en preview para revisión de Beto)

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
- **2026-06-19 (Sprint 2 — Ventas del periodo + Productividad por vendedor)** — Los otros 2 reportes ⭐ de Ventas, calcando el molde. **Loader compartido** (`lib/dilesa/reportes/ventas-data.ts` puro: tipos + `normalizarVentas` + helpers; `use-ventas-reporte` hook browser; `ventas-data-server` para las rutas de PDF) — un solo fetch+normalización para ambos reportes, sin tocar `pipeline-por-fase`. **Ventas del periodo**: escrituradas en rango (filtro de fechas + proyecto/vendedor), desglose por mes + detalle + ticket promedio. **Productividad por vendedor**: scorecard (cartera, pipeline, escrituradas, % cierre, monto), filtro por proyecto, ordenado por monto escriturado. Ambos con KPIs, tabla y PDF con branding. Sin RBAC nuevo (mismo `dilesa.ventas.reportes`). 14 tests de motores + normalización (1932 total). Verificado con `next build` + env real (118 páginas sin error). Sin auto-merge: Beto revisa el preview.

## Decisiones registradas

- **2026-06-19** — **Audiencia v1 = operativa por área** (no ejecutiva). El peso va en reportes por-módulo; el hub es delgado (catálogo).
- **2026-06-19** — **Salida = pantalla + PDF.** NO export a Excel/CSV en v1 (Beto no lo pidió).
- **2026-06-19** — **Arquitectura híbrida.** Reportes de un módulo viven en el módulo (con sub-slug RBAC, reusando sus componentes); `/dilesa/reportes` es catálogo + buscador y casa de los cross-módulo. Se **descarta** el módulo-central-monolítico (duplica lógica/permisos, se desincroniza).
- **2026-06-19** — **Presets = config en código en v1** (versionados, sin migración). «Vistas guardadas» del usuario = fase 2 (tabla).
- **2026-06-19** — **Límite vs `analytics`/Metabase:** reportes curados en la app ≠ exploración ad-hoc libre. No se construye BI ad-hoc aquí.
- **2026-06-19 (Sprint 1)** — **Motor puro compartido pantalla↔PDF** (ADR-047 R2): el filtrado y la agregación viven en funciones puras (`filtrarVentas`, `construirPipelinePorFase`) que consumen ambas superficies → el PDF refleja exactamente lo que se ve. Es la garantía de paridad y lo testeable.
- **2026-06-19 (Sprint 1)** — **El reporte vive en su módulo** (`/dilesa/ventas/reportes/<id>`), con sub-slug `dilesa.ventas.reportes`; el hub `/dilesa/reportes` (módulo `dilesa.reportes`) solo lo descubre. Backfill de ambos desde `dilesa.ventas.lista` (quien ve la lista de ventas, ve sus reportes y el hub).
- **2026-06-19 (Sprint 1)** — **Gate del endpoint PDF por RLS + auth, no por sub-slug** (como los PDFs de estimaciones). El dato ya es visible en otras pantallas de ventas; el gate fino de endpoint es mejora futura (anotado en ADR-047).
