# ADR-007 — URL-sync de filtros de módulo

- **Status**: Accepted
- **Date**: 2026-04-26
- **Authors**: Beto, Claude Code (iniciativa `filters-url-sync`)
- **Related**: [ADR-004](../../supabase/adr/004_module_page_layout_convention.md), [ADR-005](./005_module_with_submodules_routed_tabs.md)

---

## Contexto

ADR-005 movió la navegación entre sub-módulos (e.g. `Inventario / Stock | Movimientos | Levantamientos`) a routed tabs — la URL es la fuente de verdad y el browser back / share / bookmark "simplemente funcionan". Pero **dentro** de un módulo, los filtros (`search`, `statusFilter`, `dateFrom`, etc.) siguen viviendo en `useState` local.

Costos observados:

1. **Refresh pierde el contexto.** Un cajero filtra "ventas del corte X" y le da F5 — se pierde el filtro y vuelve a "hoy". Productividad operativa.
2. **No se pueden compartir links.** Beto manda "mira este pedido raro" por WhatsApp con una URL — al abrir, el receptor ve la lista sin el filtro. Cada uno tiene que reconstruir el contexto.
3. **Browser back no navega entre filter states.** Cambias status → cambias date → quieres volver al status anterior — back te saca del módulo en vez de retroceder un filtro.
4. **Cada módulo implementa "Limpiar filtros" y "N filtros activos" por su cuenta** — duplicación + drift.

A 20 módulos en el horizonte, el costo se amortiza al revés: ahora cada migración a `<ModulePage>` gana share/back/bookmark gratis si la convención está fijada.

## Decisión

Un hook compartido `useUrlFilters` + un componente compartido `<ActiveFiltersChip>` en `components/module-page/`. La URL es la fuente de verdad para todos los filtros; el componente local lee/escribe vía el hook.

```tsx
const FILTER_DEFAULTS = { search: '', activo: true, categoria: '' };

const { filters, setFilter, setFilters, clearAll, activeCount } =
  useUrlFilters(FILTER_DEFAULTS);

// In JSX:
<Input value={filters.search} onChange={(e) => setFilter('search', e.target.value)} />
<ActiveFiltersChip count={activeCount} onClearAll={clearAll} />
```

### Las 6 reglas (F1–F6)

#### F1 — camelCase en TS, snake_case en URL

`dateFrom` (TS) ↔ `?date_from=…` (URL). El hook hace la conversión automática vía `camelToSnake`. URLs con snake_case son convencionales en query strings y más legibles cuando un usuario las comparte.

> **Por qué**: `?dateFrom=…` se ve raro mezclado con `?utm_source=…` o `?session_id=…`. El TS code conserva la idiomática JS.

#### F2 — Booleanos como `1` / `0`, arrays como CSV

`showBajoMinimo: true` → `?show_bajo_minimo=1`. `categorias: ['alimentos', 'bebidas']` → `?categorias=alimentos,bebidas`. Compactas, legibles, no requieren JSON.parse.

> **Por qué**: `true`/`false` doblan la longitud. `[ "a","b" ]` requiere encoding. CSV es la forma más compacta que sigue siendo human-readable.

#### F3 — Defaults NO se serializan

Si `filters.search === defaults.search`, NO aparece en la URL. La URL queda **vacía** cuando no hay filtros activos, y eso es lo que `activeCount` cuenta.

> **Por qué**: una URL `/rdb/inventario` es más legible que `/rdb/inventario?search=&show_servicios=0&show_bajo_minimo=0&categoria_filtro=&clasificacion_filtro=&fecha_corte=`. También: el "estado vacío" es semánticamente distinto de "estado con valores que casualmente coinciden con defaults".

#### F4 — Query params no-relacionados se preservan

Cuando el hook escribe a la URL, hace `delete` solo de las keys que conoce (sus defaults). Otros params (`?tab=stock` de routed tabs, `?utm_*=…`, `?id=…` de drawers) se preservan.

> **Por qué**: el hook es un actor más en la URL, no el dueño. Coexiste con routed tabs (ADR-005), deep-links a drawers, tracking params.

#### F5 — `defaults` debe ser estable

El caller pasa `defaults` como objeto **estable** — declarado fuera del componente, memoizado con `useMemo`, o construido una vez. El hook no hace deep-equal: si `defaults` cambia de referencia entre renders, los `useMemo`/`useCallback` se invalidan y el hook reescribe la URL.

> **Por qué**: el costo de defensa contra defaults inestables (deep equal en cada render) supera el beneficio. Documentado + ESLint exhaustive-deps cubren el 99% de los casos.

#### F6 — `setFilters` (batch) cuando un cambio toca 2+ keys

Cuando un cambio de UI implica setear varias keys a la vez (e.g. seleccionar un preset que también define dateFrom/dateTo), el caller usa `setFilters({...})` — no 3× `setFilter`. Eso produce un solo `router.replace`, evita race conditions, y deja una sola entry en el history stack.

> **Por qué**: 3× `setFilter` = 3 entries en browser history. El usuario presiona back y nada parece pasar (porque solo deshace 1 de 3).

### A11y mínimo

- `<ActiveFiltersChip>` con `aria-label="Limpiar N filtros activos"`.
- El chip se renderiza solo cuando `activeCount > 0` para no introducir ruido.

## Implementación

- **PR de creación + adopción** (este PR): hook `useUrlFilters` + `<ActiveFiltersChip>` + adopción en Ventas (`<VentasFilters>`) e Inventario (`/rdb/inventario`). Las dos páginas usadas como golden path para la convención.
- **Adopción incremental**: cada futura migración a `<ModulePage>` adopta el hook como parte estándar. No se hace un PR de "migrar todo a useUrlFilters" — eso es churn.

## Consecuencias

### Positivas

- Refresh, share, browser back y bookmarks "simplemente funcionan" para filtros.
- Una página nueva escribe `useUrlFilters(DEFAULTS)` y lee/escribe via la API tipada — cero gestión manual de history.
- "Limpiar todo" + contador de filtros activos viven en un solo componente.
- `activeCount` se vuelve un primitivo confiable que el código usa para distinguir "vacío sin filtros" vs "vacío con filtros activos" (S3 de ADR-006).

### Negativas

- Cada cambio de filter dispara `router.replace` → un re-render más por cambio. Aceptable: en perf observado de Ventas/Inventario no hay flicker. Si aparece en módulos pesados, se mitiga con `transition` o debouncing del search.
- URLs pueden volverse largas con multi-select (e.g. `?categorias=alimentos,bebidas,licores,…`). Si surge un caso real de límite (~2KB en algunos browsers), se considera hash-encoding en una iniciativa futura.
- `defaults` con valores dinámicos (e.g. `todayRange()`) requiere `useMemo([])` para ser estable; al volver al día siguiente, la default sigue siendo la de ayer hasta que el usuario haga clearAll. Aceptado — el usuario ve la URL explícita y puede limpiar.

### Cosas que NO cambian

- Routing de páginas, `<RequireAccess>`, sidebar — todo el sistema de navegación a nivel de página.
- ADR-005 (routed tabs) — los tabs siguen siendo routes; los filters viven en query params; ambos coexisten por F4.
- Estado UI no-filter (drawers, dialogs, sortKey) — sigue en `useState` local. v1 no tipea esos como "URL state".

## Fuera de alcance v1

- **Vistas guardadas server-side** ("Mis filtros favoritos" persistentes por usuario en DB). Es feature de producto, no convención de UI.
- **Multi-select con AND/OR explícito**. v1 asume AND implícito entre filtros.
- **Hash-encoding de URLs largas**. Postergado hasta encontrar caso real que rompa.
- **Sort key en URL**. Ortogonal a filters; queda local en v1.
- **Tab local (e.g. Pedidos / Por producto en Ventas)** — sigue en `useState`. Si en el futuro se decide rutearlo, sale por iniciativa separada (probable extensión de ADR-005 a tabs sub-vista no-routed).

## Referencias

- Hook: [hooks/use-url-filters.ts](../../hooks/use-url-filters.ts)
- Componente: [components/module-page/active-filters-chip.tsx](../../components/module-page/active-filters-chip.tsx)
- Iniciativa: [docs/planning/filters-url-sync.md](../planning/filters-url-sync.md)
- PR de implementación: `feat/ui-filters-url-sync`
