# ADR-047 — Reportes operativos: preset + vista + PDF

- **Status**: Accepted
- **Date**: 2026-06-19
- **Authors**: Beto, Claude Code
- **Iniciativa**: [`dilesa-reportes`](../planning/dilesa-reportes.md)

---

## Contexto

Las pantallas operativas de DILESA ya son **~70% un reporte**: cada módulo trae
KPIs reactivos (`<ModuleKpiStrip>` + `deriveKpis`, ADR-034), filtros sincronizados
a la URL y `<DataTable>`. Lo que faltaba era una capa de **reportes**:

- **Reportes con nombre / reproducibles.** "Pipeline por fase", "Ventas del mes" —
  cortes que abren ya armados, no filtros volátiles que se re-arman cada vez.
- **Salida presentable.** Un PDF con branding DILESA para imprimir/mandar, más allá
  de los 2 documentos imprimibles _por registro_ que ya existían.
- **Catálogo / descubribilidad.** Un lugar que liste "qué reportes hay".

En la conversación de promoción, Beto fijó tres ejes: audiencia **operativa por
área**, salida **pantalla + PDF** (sin Excel), arquitectura **híbrida**. Este ADR
fija el patrón que materializa esas decisiones, validado con el reporte golden
**Pipeline por fase** (Ventas).

## Decisión

Un **reporte = preset (def) + vista + PDF**. Reglas:

1. **R1 — Registry declarativo.** Cada reporte es un `ReporteDef`
   (`lib/dilesa/reportes/tipos.ts`): id, nombre, descripción, módulo dueño +
   sub-slug RBAC, `href` de su vista, ícono, `pdf`. El registry
   (`lib/dilesa/reportes/registry.ts`) los reúne — **config en código,
   versionada**. Las «vistas guardadas» del usuario son una capa posterior (fase
   2), no esto.

2. **R2 — Motor puro compartido.** La lógica de cada reporte (filtrar + agregar)
   vive en funciones puras (`construirPipelinePorFase`, `filtrarVentas`) que
   reciben datos ya cargados y devuelven el resultado. **La vista y el PDF
   consumen el MISMO motor** → el documento exportado refleja exactamente lo que
   se ve. Es testeable sin red ni DOM.

3. **R3 — Arquitectura híbrida (hub-índice + reporte en su módulo).** El reporte
   **vive en su módulo** (`/dilesa/ventas/reportes/<id>`, con su sub-slug RBAC,
   reusando los componentes del módulo). El hub `/dilesa/reportes` es **el índice
   del libro, no una bodega**: catálogo + buscador que descubre y enlaza; es la
   casa de los reportes cross-módulo. Se **descarta** el módulo-central-monolítico
   (duplica lógica/permisos y se desincroniza).

4. **R4 — Cáscara reutilizable.** `<ReporteCatalogo>` (buscador + tarjetas, lo
   montan el hub y cada módulo) y `<ReporteShell>` (breadcrumb + encabezado +
   botón «Exportar PDF» + barra de filtros) son comunes; cada reporte solo aporta
   su cuerpo (KPIs + tabla/gráfico) y arma su `pdfHref` con los filtros actuales.

5. **R5 — PDF sobre el branding compartido.** El documento reusa
   `lib/dilesa/pdf/` (`HeaderBand`/`FooterBand`/`styles`). Se genera en un **route
   handler** (`renderToBuffer`, `runtime = 'nodejs'`) que recibe los filtros por
   query params y los aplica con el mismo motor (R2). Gotchas @react-pdf v4.5.x:
   sin `gap` (usar widths/márgenes), isotipo base64 server-side.

6. **R6 — RBAC por sección + hub (ADR-014/030).** Un módulo que gana reportes
   libera un sub-slug `<modulo>.reportes` (gate del tab); el hub-índice es su
   propio módulo `dilesa.reportes`. Ambos con **backfill defensivo** clonando los
   permisos del tab principal del módulo (`dilesa.ventas.lista`), si no el módulo
   nuevo queda escondido para no-admins.

7. **R7 — Agregar un reporte = una entrada + su vista (+ PDF/route).** Sumar un
   reporte al catálogo es una entrada en el registry + su componente de vista, y
   si lleva PDF, su documento y su route. No se toca la cáscara.

## Consecuencias

**A favor**

- **Replicable** módulo-por-módulo y empresa-por-empresa sin reescribir el motor;
  los próximos reportes calcan el golden.
- **Paridad pantalla/PDF garantizada** por el motor puro compartido (R2).
- **No duplica** la lógica de las pantallas operativas: el reporte hace un fetch
  enfocado y reusa KPI strip + componentes del módulo.
- **Descubrible** vía el hub-índice, que se engancha al Cmd+K de `ux-consolidacion`.

**Costos / deuda aceptada (v1)**

- **Presets en código, no en runtime.** Un reporte nuevo requiere deploy. Es
  deliberado para v1 (versionado, sin migración); las vistas guardadas del usuario
  son fase 2.
- **Gate del endpoint PDF por RLS, no por módulo.** El route confía en RLS
  empresa-scoped + auth (como los PDFs de estimaciones), no verifica el sub-slug.
  El dato ya es visible en otras pantallas de ventas; el gate fino de endpoint es
  mejora futura.
- **Visibilidad del hub por su slug propio**, no derivada de "tiene cualquier
  reporte". En v1 el backfill resuelve el caso (quien ve ventas ve el hub);
  derivar la visibilidad de cualquier reporte accesible es refinamiento posterior.
- **Normalización de datos duplicada vista↔route** (resolución de vendedor). Es
  acotada; si crece, se extrae a un loader compartido.

## Alternativas descartadas

- **Módulo central monolítico** (`/dilesa/reportes` con todos los reportes
  adentro): se ve ordenado el día 1 y a los meses pelea con cada módulo; re-implementa
  permisos. Rechazado en la conversación de promoción.
- **Export a Excel/CSV en v1**: Beto no lo pidió; entra solo si surge la necesidad.
- **Presets en DB desde v1**: sobre-ingeniería sin caso; se difiere a las vistas
  guardadas (fase 2).
- **Reporte ad-hoc / exploración libre**: es la iniciativa `analytics`/Metabase,
  no esto. Esta capa es de reportes **curados**.
