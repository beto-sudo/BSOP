# Iniciativa — Tabs persistentes del expediente de venta (DILESA)

**Slug:** `dilesa-ventas-expediente-tabs`
**Empresas:** DILESA
**Schemas afectados:** Principalmente UI (Next.js) — refactor de `app/dilesa/ventas/[id]/*`: nuevo `[id]/layout.tsx` + partir el monolito `[id]/page.tsx` (2,642 L) en 6 sub-rutas (`page.tsx`=Operación + `cuadratura/`, `estado-cuenta/`, `pipeline/`, `documentos/`, `bitacora/`). RBAC: `core.modulos` + `core.permisos_rol` (6 sub-slugs nuevos `dilesa.ventas.{operacion,pipeline,cuadratura,estado_cuenta,documentos,bitacora}` + backfill de permisos clonando del padre + `NOTIFY pgrst`), `lib/permissions.ts` (`ROUTE_TO_MODULE`, `HUB_PARENT_BY_ROUTE`), `lib/permissions.test.ts` (`EXPECTED_DB_MODULE_SLUGS`). Lectura de datos sin cambios.
**Estado:** in_progress
**Próximo hito:** Sprints 1 (#948) y 2 (#949) mergeados, en prod (6 tabs persistentes). Sprint 3 (deep-links del copiloto de cierre) en PR — al merge se **cierra la iniciativa** (Estado `done` + barrido de Reminders). Loading-por-tab resultó innecesario (carga única); manual/HubAccessRedirect descartados como bajo retorno (decisión de Beto 2026-06-18).
**Dueño:** Beto
**Creada:** 2026-06-18
**Última actualización:** 2026-06-18 (Sprints 1 y 2 en prod; Sprint 3 = deep-links del copiloto, completo en local, 6 checks verdes; PR por revisar/mergear → cierre)

> **Sucede a** [`dilesa-ventas-expediente`](dilesa-ventas-expediente.md) (cerrada — montó el workspace por venta con cabecera + tabs + copiloto). Esta iniciativa toma esos tabs (hoy `useState` sin URL) y los sube a _routed tabs_ con layout compartido, replicando el patrón ya probado en [`app/dilesa/proyectos/[id]/layout.tsx`](../../app/dilesa/proyectos/[id]/layout.tsx).

## Problema

Dos dolores en la pantalla de detalle de venta (`/dilesa/ventas/[id]`):

1. **El menú del expediente se pierde al capturar una fase.** Los tabs Operación │ Cuadratura │ Documentos │ Bitácora viven como `useState` en `[id]/page.tsx:346` — no tienen URL. Al navegar a `/[id]/capturar/<fase>` el componente se desmonta y el tab muere. Para saltar de la captura a, p.ej., Cuadratura, el operador tiene que volver al detalle y re-elegir el tab. (La barra superior del hub — Ventas │ Inventario │ … — sí persiste porque es `<RoutedModuleTabs>` con URL en `app/dilesa/ventas/layout.tsx`; el problema es solo el segundo nivel.)

2. **"Operación" es un cajón de sastre.** Bajo ese único tab cuelgan: copiloto de cierre + botones de PDF + movimientos administrativos + datos del cliente + datos de la venta + **Pipeline** (las 17 fases) + **Estado de cuenta** (CxC). Es un scroll eterno con jerarquía plana; el Pipeline y el Estado de cuenta —las dos cosas que el operador más consulta— están enterradas.

## Outcome esperado

El expediente de venta se navega como un registro de tabs reales:

1. **Tabs con URL**, montados en un `[id]/layout.tsx` compartido → **persisten en captura** (gratis: `capturar/*` cuelga del layout) junto con la ficha de contexto. El operador siempre está "dentro de la venta".
2. **Pipeline** y **Estado de cuenta** promovidos a tab de primer nivel (salen de Operación).
3. **"Operación"** queda como home limpio: copiloto + PDFs + movimientos + datos cliente/venta.

## Alcance

Set final de tabs (6): **Operación · Pipeline · Cuadratura · Estado de cuenta · Documentos · Bitácora.**

- **Sprint 1 — Layout + routed tabs (paridad).** Nuevo `[id]/layout.tsx` (back-link + ficha persistente `OperacionResumen` vía `useVentaResumen` + `<RoutedModuleTabs>`). Partir `[id]/page.tsx` en `page.tsx`=Operación + `cuadratura/` + `documentos/` + `bitacora/` (sin tabs nuevos todavía; misma funcionalidad). RBAC: 4 sub-slugs (`operacion`, `cuadratura`, `documentos`, `bitacora`) + `ROUTE_TO_MODULE`/`HUB_PARENT_BY_ROUTE`/`EXPECTED_DB_MODULE_SLUGS` + migración `INSERT modulos` + backfill de permisos.
- **Sprint 2 — Pipeline + Estado de cuenta a tab propio.** Extraer ambas `Section` a `pipeline/page.tsx` y `estado-cuenta/page.tsx` (+ 2 sub-slugs). Reconciliar `<CapturarFaseHeader>` para que no duplique la ficha que ahora pone el layout (queda solo el título de fase).
- **Sprint 3 — Pulido.** Loading por tab, deep-link a tab desde el copiloto/banners, manual in-app, KPIs si aplica.

**Fuera:** rediseño del contenido de cada tab (solo se mueve, no se rediseña); cambios en el flujo de captura de fases; el nivel-1 del hub (ya routed).

## Riesgos

- **Estado compartido al partir el monolito.** `cuadInputs` (ajustes de cuadratura), abonos, y el dialog imprimible de estado de cuenta hoy viven en un solo componente. Cada tab pasará a cargar lo suyo; cuidar que la cuadratura que muestra la ficha del header siga consistente entre tabs.
- **Backfill de permisos = punto crítico.** Agregar un sub-slug sin clonar permisos del padre **esconde** el tab a no-admins (`canAccessModulo` → false, ADR-014). Cada migración de sub-slug lleva su backfill `core.permisos_rol` por rol.
- **Mapeo RBAC del landing.** Hoy `/dilesa/ventas/[id]` no está explícito en `ROUTE_TO_MODULE` (cae por fallback) — definir bien `HUB_PARENT_BY_ROUTE` para que la visibilidad del detalle no dependa del sub-slug del primer tab (ADR-030 SS8).
- **Módulo en prod (cutover Coda reciente).** No romper deep-links existentes: `/[id]` debe seguir siendo Operación; `/[id]/capturar/*` intactos.
- **Duplicación de carga por tab** (costo del patrón routed; proyectos ya lo paga). Mitigable con hook/Context de venta compartido si pesa.
- **Drawers/scroll (ADR-018/026).** Mantener los patrones canónicos al mover secciones a páginas nuevas.

## Métricas de éxito

- Desde la captura de una fase puedo saltar a cualquier tab del expediente en **1 click**, sin volver al detalle.
- "Operación" deja de ser scroll-largo; Pipeline y Estado de cuenta accesibles en 1 click.
- **0 regresiones de acceso** (los tests de sync RBAC verdes; nadie pierde visibilidad de un tab que antes veía).

## Decisiones registradas

- **2026-06-18 — Routed tabs con sub-slug por tab** (Beto): el control de acceso del expediente se modela con 6 sub-slugs nuevos de 2º nivel (`dilesa.ventas.<tab>`), no compartiendo el permiso del padre. Habilita gate fino futuro (p.ej. Estado de cuenta solo finanzas) desde el inicio. Naming snake (`estado_cuenta`) por consistencia con las fases (`fase01_solicitud`).
- **2026-06-18 — 6 tabs, sacando Pipeline y Estado de cuenta de Operación** (Beto): "Operación" queda = copiloto + PDFs + movimientos + datos cliente/venta.
- **2026-06-18 — Iniciativa propia** (Beto) en vez de absorberlo en `ux-consolidacion`: refactor acotado con riesgo medio sobre módulo en prod, merece doc + bitácora.
- **2026-06-18 — Posible ADR pendiente:** convención de _routed tabs a nivel de registro `[id]` con sub-slugs de 2º nivel_. `proyectos/[id]` ya hace routed tabs de registro pero reusa sub-slugs del módulo; aquí se crean nuevos. Evaluar en Sprint 1 si amerita ADR o si basta extender la nota de ADR-030.

## Bitácora

- **2026-06-18** — Promovida. Diagnóstico confirmado en código (tabs `useState` en `[id]/page.tsx:346`; cabecera ya persiste en captura vía `<CapturarFaseHeader>`; molde = `proyectos/[id]/layout.tsx`). Arranca Sprint 1.
- **2026-06-18** — **Sprint 1 completo (local, 6 checks verdes).** El monolito de 2,642 L se partió en: `components/dilesa/venta-detalle/{types,provider,ui,shell}.tsx` (cerebro = `VentaDetalleProvider` + context `useVentaDetalle`, sub-componentes y Shell) + `[id]/layout.tsx` (detecta captura: rama expediente monta provider+shell+tabs, rama captura solo persiste la barra de tabs encima del `CapturarFaseHeader` existente) + 4 páginas de tab (`page.tsx`=Operación con Pipeline+Estado de cuenta dentro, `cuadratura/`, `documentos/`, `bitacora/`), cada una con su `<RequireAccess>` fino. Decisión de arquitectura: provider en el layout (carga única, navegación entre tabs instantánea); el provider NO se monta en captura (sin doble carga). RBAC: 4 sub-slugs `dilesa.ventas.{operacion,cuadratura,documentos,bitacora}` en `ROUTE_TO_MODULE` + `EXPECTED_DB_MODULE_SLUGS` + `MODULE_DEPS` (cadena lista→operacion→{capturas,tabs}; ajustados 3 tests de `acceso-rules`/`permissions-deps` por la nueva jerarquía) + migración `20260618155211_modulos_dilesa_ventas_expediente_tabs.sql` (INSERT + backfill de permisos clonando de `dilesa.ventas.lista` — **pendiente de aplicar por Beto**). Pipeline y Estado de cuenta siguen dentro de Operación (salen en S2).
- **2026-06-18** — **Migración aplicada a prod** (con OK de Beto) vía MCP `apply_migration`: 4 sub-slugs creados + permisos clonados de `dilesa.ventas.lista` (8 roles c/u, verificado — nadie pierde acceso). Ledger reconciliado (`20260618155211` quedó 1:1; huérfano MCP `20260618163023` marcado reverted). Drift cross-sesión preexistente (`20260618022906`/`20260618022954` = `dilesa_ventas_geometria_desglose`, de `dilesa-cuadratura-sobreprecio`) **no tocado** — requiere reconciliación de esa sesión. PR [#948](https://github.com/beto-sudo/BSOP/pull/948) listo para revisar preview + mergear.
- **2026-06-18** — **Sprint 1 mergeado** ([#948](https://github.com/beto-sudo/BSOP/pull/948), `ea6b1cc`) — menú persistente confirmado por Beto en preview. De paso, **reconciliado el drift ajeno** (`20260618022906` ya estaba en prod — 4 columnas de geometría verificadas — marcado `applied`; huérfano `20260618022954` `reverted`): ledger de junio 18 quedó 1:1.
- **2026-06-18** — **Sprint 2 completo (local, 6 checks verdes).** Pipeline y Estado de cuenta salen de Operación a tab propio: nuevas `pipeline/page.tsx` y `estado-cuenta/page.tsx` (con sus 3 drawers) consumiendo el context; Operación adelgazada (copiloto + PDFs + movimientos + datos + expediente digital). Set final = 6 tabs (Operación · Pipeline · Cuadratura · Estado de cuenta · Documentos · Bitácora). RBAC: 2 sub-slugs `dilesa.ventas.{pipeline,estado_cuenta}` (deps → operacion) + migración `20260618164920_modulos_dilesa_ventas_pipeline_estado_cuenta.sql`. Nota: la "reconciliación de `<CapturarFaseHeader>`" del plan original resultó **innecesaria** — en captura el layout solo pone la barra de tabs y el header pone su back-link/ficha; no hay duplicado. El único pulido (orden tabs↔back-link en captura) se difiere a un eventual Sprint 3.
- **2026-06-18** — **Sprint 2 mergeado** ([#949](https://github.com/beto-sudo/BSOP/pull/949)) — migración aplicada por MCP (pipeline + estado_cuenta con 8 roles c/u, ledger 1:1). 6 tabs en prod.
- **2026-06-18** — **Sprint 3 = deep-links del copiloto (local, 6 checks verdes).** Cada pendiente del copiloto de cierre se vuelve liga directa a donde se resuelve: el motor `evaluarCierre` ahora expone `destino` semántico por item (`'pipeline' | 'cuadratura' | 'conformidad'`) y el componente `CopilotoCierre` lo traduce al tab/captura (Pipeline completo + Expediente documental → tab Pipeline; Cuadratura → tab Cuadratura; Conformidad → captura F16). Solo los pendientes se vuelven Link (con chevron en hover); los ✓ quedan en texto. Sin migración (puro UI/lib). Decisión de Beto: descartado el resto del pulido (loading ya resuelto por la carga única; manual cae al doc del expediente; HubAccessRedirect sin caso real). **Al merge se cierra la iniciativa.**
