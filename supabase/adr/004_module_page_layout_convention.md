# ADR-004 — Convención de layout para páginas de módulo (`<ModulePage>`)

- **Status**: Accepted
- **Date**: 2026-04-25
- **Authors**: Beto (auditoría visual Cowork-BSOP-UI), implementación inicial en PR `feat/module-page-component-fase1`
- **Supersedes**: —

---

## Contexto

BSOP creció de 4 a ~20 módulos en pocos meses. Cada módulo se construyó con su propio scaffolding ad-hoc, lo que produjo deriva visual y estructural entre páginas que conceptualmente son la misma cosa: **una vista tabular con header, tabs, KPIs, filtros y contenido**.

La auditoría del 2026-04-25 sobre `/rdb/ventas` (limpio) e `/rdb/inventario` (con deriva) detectó tres síntomas reproducibles:

1. **Doble navegación** — un `InventarioTabs` routed (Stock & Movimientos / Levantamientos / Análisis) montado encima del toggle local Stock ↔ Movimientos. Dos niveles de "dónde estoy" compitiendo.
2. **KPIs huérfanos** — el strip principal de 4 cards (Productos, Bajo mínimo, Sin stock, Valor) seguido inmediatamente por un grid de 7 cards "por categoría" que en realidad son filtros disfrazados de KPI. Esto produce el card huérfano "$342,479 / 216 prod." que no es parte del estado del negocio sino una vista de la dimensión categoría.
3. **Acciones secundarias en el filters bar** — "Imprimir lista" mezclado con los toggles "Ver no inventariables" y "Solo bajo mínimo", sin separación visual entre filtro y acción.

Sin una convención compartida, cada módulo nuevo tiene 50% de probabilidad de heredar la deriva. Antes de migrar los ~20 módulos pendientes, fijamos la anatomía.

## Decisión

Introducimos `<ModulePage>`: un componente raíz compartido que enforza la **anatomía canónica** de toda página tabular de módulo en BSOP. La anatomía se compone de cinco slots verticales en orden estricto:

```
ModulePage
├── ModuleHeader        (título + subtítulo + 1 acción primaria)
├── ModuleTabs          (1 nivel; underline; oculto si <2 tabs)
├── ModuleKpiStrip      (≤5 KPIs ortogonales)
├── ModuleFilters       (filtros + 1 slot opcional para acciones secundarias + count)
└── ModuleContent       (la tabla / lista / grid de datos)
```

Drawers, dialogs y banners contextuales (error, fecha histórica, etc.) **no** son slots — viven fuera del árbol del wrapper o entre filters/content según corresponda.

Ventas (`components/ventas/ventas-view.tsx` líneas 186-294) ya implementa esta anatomía a mano y sirve como baseline visual. Inventario es la primera migración explícita al componente compartido.

### Las 10 reglas (R1–R10)

#### R1 — Un solo nivel de tabs

Una página de módulo tiene **un** `<ModuleTabs>` o ninguno. Si conceptualmente hay un agrupador padre (e.g. "Inventario" como módulo), se resuelve vía sidebar — no vía un segundo strip de tabs.

> **Por qué**: La doble navegación obliga al usuario a parsear "¿en qué nivel estoy?". Un solo strip = una sola pregunta.

#### R2 — Orden vertical canónico es no-negociable

Header → Tabs → KPIs → Filtros → Contenido. `<ModulePage>` no enforza el orden con runtime checks (sería un componente pesado), pero el código ejemplo y el barrel `index.ts` exponen los slots en este orden. Code review valida.

> **Por qué**: La consistencia entre módulos es lo que hace que el segundo módulo se sienta "obvio".

#### R3 — Máximo 5 KPIs en el strip principal

`<ModuleKpiStrip>` acepta hasta 5 stats. >5 es un problema de producto, no de layout: o (a) están sobrando KPIs, o (b) hay dos dimensiones distintas que merecen secciones separadas. El componente trunca a 5 + warning en dev.

> **Por qué**: Más de 5 cards en una fila se vuelven ruido — el ojo no los procesa como un estado, sino como una sopa.

#### R4 — Tabs estilo underline, no pills

Misma estética que Ventas: borde inferior emerald en activo, transparente en inactivo. El estilo "pills" (botones con fondo gris en un contenedor) está prohibido — es ambiguo con los toggles de filtro y rompe la jerarquía visual.

> **Por qué**: Pills compiten con botones de acción y con toggles segmentados. Underline es la única forma sin colisión semántica.

#### R5 — Acciones secundarias van en `<ModuleFilters actions={…}>`

"Imprimir", "Exportar", "Limpiar filtros" — todo lo que **depende del estado de filtros** vive en el slot `actions` del filter bar (alineado a la derecha, antes del count). No se mezclan con los controles de filtro.

> **Por qué**: Una acción que opera sobre los datos filtrados pertenece al filter bar conceptualmente. Mezclarla con los toggles confunde — el usuario no sabe si va a aplicar un filtro o disparar una acción.

#### R6 — KPIs muestran estado, no filtros

Una card en `<ModuleKpiStrip>` debe representar un agregado real del estado del negocio (productos totales, monto en pesos, % cumplimiento). Si la card es realmente "número de productos en categoría X" y al click filtra la tabla, **es un filtro visual, no un KPI** — pertenece a un componente separado (e.g. `<CategoryFilterStrip>`).

> **Por qué**: El KPI strip debe contestar "¿cómo está el negocio?". Si lo que muestra es "¿cuánto pesa cada categoría?", esa es otra pregunta — vive en otro componente.

#### R7 — KPIs por dimensión (categoría, segmento) van fuera del strip principal

Corolario de R6. Cuando hay valor en mostrar la descomposición por una dimensión (categoría, ubicación, segmento), va en su propio componente local del módulo, debajo del filter bar o entre KPIs y filtros — nunca dentro de `<ModuleKpiStrip>`.

> **Por qué**: Mantiene el strip principal con 4-5 KPIs ortogonales (R3) y deja claro que la descomposición es una herramienta de filtrado / inspección, no un dashboard.

#### R8 — Una sola acción primaria (CTA) en el header

`<ModuleHeader action={…}>` acepta exactamente un nodo. "Registrar Movimiento", "+ Nuevo", "Crear Reporte". Si el módulo tiene dos acciones de peso similar, una de las dos no es realmente primaria — repensar.

> **Por qué**: La acción primaria es la respuesta a "¿qué hago aquí ahora?". Dos respuestas = ninguna respuesta.

#### R9 — Drawers, dialogs y popovers viven fuera de los slots

Componentes de overlay (Sheet, Dialog, Drawer, Popover global) van como hermanos de `<ModulePage>` o al final del árbol — no dentro de un slot. Su posición en el DOM no importa visualmente porque se renderizan en portal; ponerlos en un slot solo confunde la lectura del JSX.

> **Por qué**: Los slots son las regiones visuales fijas de la página. Los overlays son condicionales y portal-rendered — no compiten por espacio físico.

#### R10 — Banners contextuales viven entre filters y content

Errores de fetch, banners de fecha histórica, alertas de estado del módulo — todo va **después de `<ModuleFilters>` y antes de `<ModuleContent>`**, no como un slot del wrapper.

> **Por qué**: Un banner es una pieza condicional, no estructural. Modelarlo como slot obliga a ramificar el wrapper para cada nuevo tipo de banner. Mejor dejar la región abierta y que cada módulo renderice los banners que necesite, en el lugar canónico.

## Implementación por fases

- **Fase 1 (este PR)** — Crear `components/module-page/` y migrar `/rdb/inventario` como prueba. Sin cambios en Ventas (que ya cumple la anatomía a mano).
- **Fase 2** — Migrar el resto de módulos al componente compartido. Cada migración es un PR separado, sin cambios funcionales esperados. Empezar por Ventas (porque ya cumple, es paridad pura) y luego avanzar por orden de tráfico de usuarios.
- **Fase 3 (opcional)** — Lint rule custom que detecte páginas en `app/**/page.tsx` que usan `<h1>` sin `<ModulePage>` arriba, para evitar deriva futura.

## Consecuencias

### Positivas

- Una página nueva de módulo se escribe en ~30 líneas de JSX. La forma es obvia.
- Code review tiene un check binario: "¿usa `<ModulePage>` con los slots en orden?"
- Cuando el sistema de diseño ajusta el espaciado, color de tabs, tamaño de KPI cards — se cambia en un lugar.
- Onboarding de nuevos colaboradores baja drásticamente: la anatomía es visible en `components/module-page/index.ts`.

### Negativas

- Páginas no-tabulares (dashboards, formularios largos, vistas custom) no encajan en la anatomía. **Esto es por diseño** — `<ModulePage>` no es para "todas las páginas", es para "todas las páginas tabulares de módulo". Las excepciones son explícitas y conscientes.
- Una migración mal hecha puede introducir regresiones visuales sutiles (gaps, paddings). Mitigación: screenshots before/after en cada PR de migración.

### Cosas que NO cambian

- Queries, fetches, RPCs, lógica de filtrado, lógica de impresión — todo el código no-estructural se preserva 1:1 en cada migración.
- Routing, permisos (`<RequireAccess>`), navegación de sidebar.
- Drawers y dialogs específicos del módulo — siguen siendo locales al módulo.

## Referencias

- Auditoría visual del 2026-04-25 (Beto, Cowork-BSOP-UI).
- Baseline visual: `components/ventas/ventas-view.tsx` líneas 186-294.
- Rúbrica de QA UI: `docs/qa/ui-rubric.md` (módulo audit log).
- PR de implementación inicial: `feat/module-page-component-fase1` (Inventario como primer migrado).
