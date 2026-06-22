# Iniciativa — UX consolidación (que el repo se sienta como UN producto y los guards bloqueen el drift)

**Slug:** `ux-consolidacion`
**Empresas:** todas (cross-empresa por diseño)
**Schemas afectados:** principalmente UI (Next.js); lectura — sin cambios de schema salvo vistas para paginación/perf (`v_ventas_lista` y similares)
**Estado:** in_progress
**Próximo hito:** Beto revisa el Vercel Preview del switcher de empresa (Sprint Sidebar foco) y mergea; decidir si se suma el peek por hover en desktop. Luego elegir el siguiente sprint (Cmd+K es el quick-win de mayor apalancamiento).
**Dueño:** Beto
**Creada:** 2026-06-12
**Última actualización:** 2026-06-21 (arranca el Sprint «Sidebar con foco contextual» — switcher de empresa que reemplaza los toggles manuales de visibilidad)

## Problema

La revisión general confirmó que **el sistema de diseño ganó donde hay enforcement automático** (DataTable 40+ usuarios, DetailDrawer 59 con test de invariantes, RequireAccess 127, cero `<Sheet>` raw) **y se erosiona donde el guard es solo convención** — y el drift está ocurriendo en el código MÁS NUEVO, no en el legacy:

- **Drift en lo reciente.** El Sprint 4c del ciclo PLD (mergeado 2026-06-12) rendea status pills a mano (`rounded-full bg-red-100 …`) teniendo `<Badge tone>` desde abril; 21 archivos definen mapas estado→tone inline pese a `lib/status-tokens.ts`.
- **Feedback bifurcado.** 48 `alert()` nativos conviven con el patrón canónico toast/ADR-008; `undoable()` del design system tiene **cero callers**; 4 `window.confirm`/`prompt` en acciones destructivas con `ConfirmDialog` disponible; catches "non-fatal" sin telemetría.
- **Deep-linking inconsistente.** `useUrlFilters` (ADR-007) en solo 10 de ~40 list-modules; en la mayoría los filtros mueren al refresh/compartir (en CxP sí funcionan). Un operador no puede mandar por WhatsApp la vista filtrada de ventas.
- **Sin búsqueda global ni Cmd+K.** El primitivo `cmdk` ya está instalado y wrappeado (con título "Command Palette"), el RBAC para filtrar rutas ya existe — pero el header no tiene búsqueda y no hay breadcrumbs. Con 5 empresas, 10+ hubs y un pipeline de 17 fases, la orientación depende 100% del sidebar.
- **Tablas raw interactivas** en superficies financieras de uso diario (cobranza CxC) sin sort/densidad/sticky de DataTable; 22 páginas recientes sin perfil `@responsive` (incluidas las 3 token-públicas que externos abren en celular); links muertos en el sidebar (Integraciones/Preferencias → 404).
- **El enforcement prometido nunca llegó a CI.** `scripts/audit-ui.ts` existe pero no corre en CI; los specs `axe` de a11y (ADR-020) están fuera de CI, se auto-skipean por auth stale y apuntan a una ruta muerta (`/dilesa/terrenos`).

Y un puñado de **fixes de performance de alto ROI** que tocan la misma superficie de uso diario: el conteo de tareas de estimaciones baja 129k filas y se trunca en silencio (dato incorrecto hoy); waterfalls de 5-6 queries secuenciales donde 2 bastan; sin paginación sistémica (`@tanstack/react-virtual` instalado con 0 imports).

## Outcome esperado

- **El repo se siente como un solo producto**: misma anatomía de header, mismos tonos de estado, mismo feedback de acciones en DILESA, RDB y los compartidos.
- **Los guards de UI bloquean el drift en CI**, no dependen del ojo en el Preview: `audit-ui.ts` corriendo, checks nuevos (pills fuera de `ui/`, `@responsive` declarado, h1 canónico), a11y nightly con rutas reales.
- **Búsqueda global Cmd+K** que aterriza en cualquier ruta accesible + entidades frecuentes — alto apalancamiento para operar 5 empresas desde un hub.
- **Filtros compartibles** (URL-sync) en los módulos de más tráfico.
- **Los datos correctos**: el conteo de estimaciones deja de truncarse; las cargas de los módulos diarios bajan de ~1s de latencia secuencial.

## Alcance v1 (sprints propuestos — pendientes de aprobación)

- [~] **Sprint Sidebar foco — Switcher de empresa (en revisión).** El sidebar deja de listar las 4 empresas siempre: muestra solo Inicio + la empresa en la que estás (derivada de la ruta) + Configuración. Un chip-switcher arriba del árbol despliega las empresas accesibles (reusa el filtro RBAC + denylist que ya calcula el sidebar) y al elegir una re-enfoca. Cierra por click-afuera/Escape; funciona colapsado, en teclado y mobile. Reemplaza los toggles manuales `core.sidebar_oculto` por enfoque automático; el panel de Configuración → Empresas se reduce a un solo switch **«Modo presentación»** (esconde SANREN + Personas Físicas para presentar BSOP a empleados — único caso que el switcher no cubre). Sin schema nuevo. Decidido con Beto: switcher por click (no hover puro), comportamiento para todos los operadores. Va a Preview sin auto-merge (UI visible).
- [ ] **Sprint 1 — Cmd+K global (la joya).** Command palette en el header: rutas de `NAV_ITEMS` filtradas por `canSeeNavRoute` (la lógica ya existe) + segundo nivel con entidades frecuentes (ventas por cliente/unidad, proveedores, obras) usando las queries que los módulos ya tienen. El primitivo y el RBAC están listos; es ensamblar.
- [ ] **Sprint 2 — Enforcement en CI.** `audit-ui.ts` corre en CI con checks nuevos: pills `rounded-full + bg-*-100` fuera de `ui/`, `@responsive` declarado en toda page, h1 fuera de la clase canónica. Los 2 specs `axe` actualizados (quitar `/dilesa/terrenos`, agregar 1 fase + 1 hub) corriendo nightly sin self-skip silencioso.
- [ ] **Sprint 3 — Barridos mecánicos.** `alert()`→toast/feedback (48 sitios); pills→`<Badge tone>` en las fases 10-17; `window.confirm`→`ConfirmDialog` (4 sitios); `@responsive` en las 22 pages (token-públicas → mobile-first); regla ESLint `no-restricted-globals` (confirm/alert/prompt).
- [ ] **Sprint 4 — Deep-linking + tablas.** `useUrlFilters` en los 5-6 módulos de más tráfico (ventas-module, cobranza, compras hub, construcción obras, proveedores); cobranza CxC y los paneles de settings/empresas a `<DataTable>`. Registrar en ADR-007 que list-module nuevo DEBE usar `useUrlFilters`.
- [ ] **Sprint 5 — Performance de alto ROI.** Conteo de estimaciones a agregación server-side (arregla el dato truncado); `Promise.all` en los waterfalls de ventas-module/cxp; paginación client-side de TanStack en `<DataTable>` (+ umbral para server-side); `gen-schema-ref` a `pg_catalog` (saca 3.2h/trimestre de carga a prod). Links muertos fuera del sidebar.

## Riesgos

- **Bajo en general** (UI mecánico, reversible). El mayor cuidado es el Cmd+K (S1) por ser feature nueva — pero reusa RBAC y queries existentes.
- **Barridos masivos tocan muchos archivos** — diffs grandes. Mitigación: un sprint = un tipo de cambio (pills, luego alerts, luego responsive), revisable por separado.
- **Fixes de performance tocan vistas/queries calientes** (S5). Mitigación: medir con `EXPLAIN ANALYZE` antes/después; el conteo de estimaciones es el de mayor retorno y menor riesgo (cambio de agregación).

## Métricas de éxito

- 0 `alert()` en `components/`; `audit-ui` verde en CI y bloqueando drift nuevo.
- Cmd+K en uso; `useUrlFilters` en los módulos top.
- 22→0 pages sin perfil `@responsive`.
- Conteo de estimaciones correcto; carga de ventas-module sin los ~0.6-1.2s de latencia secuencial.

## Decisiones registradas

- **2026-06-21 — Enfoque del sidebar por empresa (switcher), no toggles manuales.** Beto pidió reemplazar los toggles de «Visibilidad del menú lateral» (prender/apagar cada empresa, tedioso a diario) por enfoque automático contextual. Razón: opera una empresa a la vez; el ruido de ver las 4 siempre no aporta. Mecanismo elegido: **switcher por click** (chip que despliega las empresas accesibles), descartado el hover puro porque se rompe en touch/teclado y es nervioso. La empresa activa se deriva de la ruta (`getActiveEmpresaHref`); la lista del dropdown reusa el filtro RBAC + denylist que el sidebar ya calculaba.
- **2026-06-21 — El panel viejo se reduce a «Modo presentación» (no se elimina).** Los toggles `core.sidebar_oculto` resolvían un caso real que el switcher no cubre: esconder los módulos personales (SANREN + Personas Físicas) al presentar BSOP a empleados. Se conserva ese caso como un único switch sobre el mismo denylist, en vez de 4 toggles per-empresa.
- **2026-06-21 — Comportamiento para todos los operadores, no preferencia personal.** El foco contextual aplica igual a Beto, Alejandra y Michelle (todos operan multi-empresa). Más simple que una preferencia por-usuario y el beneficio es el mismo.

## Bitácora

- **2026-06-21** — Arranca el Sprint «Sidebar con foco contextual». Switcher de empresa (`components/app-shell/empresa-switcher.tsx`) + `NavIcon` extraído a `nav-icon.tsx` + helpers puros `isEmpresaNavItem`/`getActiveEmpresaHref` (con tests) + sidebar refactorizado a foco (Inicio + empresa activa + Configuración) + panel «Modo presentación» (`modo-presentacion-panel.tsx`, reemplaza `visibilidad-sidebar-panel.tsx`). Sin schema. PR a Preview sin auto-merge para revisión visual de Beto.
- **2026-06-12** — Promovida desde la revisión general 2026-06-12 (dimensiones ui-ux + performance). El reporte identificó `cxp-facturas-module` como best-in-class a canonizar y juntas/cobranza/fases de captura como mayor drift.
