# Iniciativa — Filters URL-sync

**Slug:** `filters-url-sync`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-04-26
**Última actualización:** 2026-04-26 (alcance v1 cerrado al arrancar)

## Problema

Los filtros de cada `<ModuleFilters>` viven en `useState` local: refrescar
la página los pierde, no se pueden compartir como link, browser back no
funciona, y bookmarks no sirven. Inconsistente con el patrón de routed
tabs (ADR-005) que ya gana share/bookmark/back para la nav primaria.

A eso se suma que cada módulo implementa "Limpiar filtros" y el contador
de "N filtros activos" por su cuenta — duplicación y deriva.

## Outcome esperado

- Los filtros viven en la URL (`?almacen=X&estado=activo&q=texto`).
- Refresh, share y browser back funcionan igual que con routed tabs.
- "Limpiar todo" y contador de filtros activos como pattern compartido.
- Hook compartido (ej. `useUrlFilters`) que cada `<ModuleFilters>` usa.

## Alcance v1 (tentativo — refinar al arrancar)

- [ ] Hook `useUrlFilters` que lee/escribe `searchParams` con tipos.
- [ ] Convención de nombres de query params (snake_case vs camelCase,
      booleanos como `1`/`0` vs `true`/`false`).
- [ ] Componente / API para "Limpiar todo" + contador de filtros
      activos (badge en el filter bar).
- [ ] Migrar 1-2 módulos de prueba (probable: Ventas e Inventario).
- [ ] ADR-007 documentando la decisión.

## Fuera de alcance

- Persistencia server-side de filtros por usuario (ej. "mis vistas
  guardadas"). Eso es feature de producto, no convención de UI.
- Filtros complejos con AND/OR explícito — v1 asume AND implícito
  entre todos los filtros activos.

## Métricas de éxito

- Compartir un link con filtros aplicados reproduce la misma vista en
  otro browser.
- Browser back navega correctamente entre estados de filtros.
- Cero `useState` local para filtros en módulos migrados.

## Riesgos / preguntas abiertas

- [ ] Compatibilidad con Next.js App Router — `useSearchParams` es
      cliente, hay que confirmar que no rompe SSR ni revalidate.
- [ ] Filtros con muchos valores (multi-select largo) en URL — ¿hay
      límite de longitud? ¿hash vs ids?
- [ ] Coexistencia con `?tab=...` de routed tabs (ADR-005). Definir
      orden y conflict resolution.

## Sprints / hitos

- **Fase 1 — hook + chip + adopción inicial.** ⏳ **En curso (PR abierto).** Salida: `useUrlFilters<T>` (`hooks/use-url-filters.ts`) + `<ActiveFiltersChip>` (`components/module-page/`) + ADR-007 con 6 reglas (F1-F6) + adopción en Ventas (`<VentasFilters>`) e Inventario (`/rdb/inventario`). Próximo hito: Beto smoke + merge.
- **Fase 2 — adopción incremental en módulos restantes.** ⏸️ Sin PR único. Cada futura migración a `<ModulePage>` adopta `useUrlFilters` por construcción.

## Decisiones registradas

- **2026-04-26 (CC) — Alcance v1 cerrado localmente, no vía Cowork.** Beto autorizó decantar el alcance en sesión (sin pasar por Cowork) porque las decisiones de diseño eran chicas y derivadas del doc preliminar. Excepción documentada en CLAUDE.md ("si Cowork no está disponible y el cambio es chico, puedo hacerlo yo y dejar registro claro en la bitácora").
- **2026-04-26 (CC) — `tab` y `productoSearch` de Ventas quedan local, NO en URL.** El alcance v1 captura "filtros del módulo", no toda la URL state. El tab Pedidos/Por-producto es navegación sub-vista que conceptualmente cabría en routed tabs (ADR-005) pero ese refactor es ortogonal — sale por iniciativa separada si se considera valor. `productoSearch` aplica solo cuando el tab está en "Por producto"; si lo serializamos siempre, ensucia URLs del tab "Pedidos".
- **2026-04-26 (CC) — Sort key (sortKey/sortDir) NO se sincroniza a URL en v1.** Mismo argumento: ortogonal a filters; menor blast radius. Si un usuario quiere compartir "ordenado por X", el destinatario hace click en la columna — costo bajo.
- **2026-04-26 (CC) — Booleanos como `1`/`0` en vez de `true`/`false`.** Compactos, robustos a parsing, convencionales en query strings. `?show_bajo_minimo=1` en vez de `?show_bajo_minimo=true`.
- **2026-04-26 (CC) — Defaults dinámicos (e.g. `todayRange()`) requieren `useMemo([])`.** El hook no hace deep-equal sobre `defaults` — si la referencia cambia entre renders, los `useCallback` internos se invalidan y la URL se reescribe innecesariamente. Caller responsable de estabilidad. Documentado en F5 del ADR-007.
- **2026-04-26 (CC) — Cierre de iniciativa `module-states` se bundlea en este PR.** Acordado con Beto (Opción B): este PR mueve `module-states` a `## Done` en INITIATIVES.md y cierra la Fase 1 en `docs/planning/module-states.md`, además de arrancar `filters-url-sync`. Minimiza ediciones a INITIATIVES.md (regla 1 del CLAUDE.md, hotspot reduction).

## Bitácora

- **2026-04-26 (CC)** — Fase 1 implementada. Branch `feat/ui-filters-url-sync`. Hook nuevo `hooks/use-url-filters.ts` con API `{ filters, setFilter, setFilters, clearAll, activeCount }`, encoding camelCase↔snake_case + bool→1/0 + arrays→CSV + defaults no serializados + preservación de query params no-relacionados. Componente nuevo `components/module-page/active-filters-chip.tsx` (renderiza nada cuando count=0). Migraciones: `components/ventas/ventas-view.tsx` migra search/statusFilter/corteFilter/dateFrom/dateTo/presetKey a URL (tab y productoSearch quedan locales); `components/ventas/ventas-filters.tsx` recibe `activeCount` + `onClearAll` y renderiza `<ActiveFiltersChip>`; `app/rdb/inventario/page.tsx` migra los 6 filtros a URL (search, showServicios, showBajoMinimo, categoriaFiltro, clasificacionFiltro, fechaCorte); el useEffect de fetch ahora reacciona a `fechaCorte` directamente (antes era manual en cada handler). Empty con `activeCount > 0` para distinguir filtros activos de módulo virgen (alineado con ADR-006 §S3). ADR-007 creado con 6 reglas (F1-F6). INITIATIVES.md: `filters-url-sync` proposed → in_progress; `module-states` movida a `## Done`.
