# Iniciativa — Module-page sub-módulos (routed tabs at layout)

**Slug:** `module-page-submodules`
**Empresas:** RDB (primero), todas (el patrón es cross-empresa)
**Schemas afectados:** n/a (UI)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-04-25
**Última actualización:** 2026-04-25

## Problema

Después del PR #202 (ADR-004 Fase 1 — `<ModulePage>` migrado a `/rdb/inventario`), surgió un gap visible: los sub-módulos de un módulo (ej. Levantamientos dentro de Inventario) no tienen un patrón claro de presentación.

PR #203 intentó resolverlo agregando "Levantamientos" como entrada hermana en el sidebar bajo "Operaciones" (junto a Ventas, Cortes, Productos, Inventario, etc.). Aplicado y revisado por Beto el 2026-04-25, el resultado se ve incorrecto: visualmente, Levantamientos aparenta ser un módulo independiente al mismo nivel que Inventario, cuando funcionalmente es una vista del módulo Inventario (mismos productos, mismo almacén, mismo permiso `rdb.inventario`).

Adicionalmente, la implementación actual deja una inconsistencia visible:

- En `/rdb/inventario` solo se ven los state tabs internos `Stock | Movimientos` (estilo underline, vía `<ModuleTabs>`).
- En `/rdb/inventario/levantamientos/*` se monta `InventarioTabs` (estilo pill, viejo) con `Stock & Movimientos | Levantamientos | Análisis`.

Dos navegaciones distintas, dos estilos visuales, sin coherencia de "dónde estoy". Aunque cada page individual cumple ADR-004 R1 (un solo nivel de tabs por page), en la práctica el módulo entero tiene navegación inconsistente.

El patrón que necesitamos resuelve esto en general: cualquier módulo con sub-módulos (Inventario → Levantamientos hoy; Cortes → Conciliación / Marbete / Vouchers después; Productos → Variantes / Categorías / SKUs después) debe tener UNA forma canónica de exponerlos.

## Outcome esperado

- Levantamientos vive como tab del módulo Inventario, no como entry de sidebar.
- Patrón generalizable a otros módulos con sub-módulos.
- Un solo strip de tabs visible en cualquier ruta de Inventario, mismo estilo (underline emerald-500, vía `<ModuleTabs>`).
- URL refleja el tab activo (bookmark-eable, share-able, browser back/forward funciona entre tabs).
- Sub-detalles profundos (`/[id]`, `/[id]/capturar`, `/[id]/diferencias`, `/[id]/reporte`, `/nuevo`) mantienen el strip de tabs visible para que el usuario pueda navegar entre Stock/Movimientos/Levantamientos sin perder contexto. (Decisión confirmada como Opción A en discusión 2026-04-25.)

## Alcance v1

- [ ] **Revertir** la entrada `Levantamientos` del sidebar (deshacer PR #203 en `components/app-shell/nav-config.ts`).
- [ ] **Crear `app/rdb/inventario/layout.tsx`** que renderiza el shell de `<ModulePage>` (header + `<ModuleTabs>`) con 3 tabs routed: Stock, Movimientos, Levantamientos. Tab activo derivado de `usePathname()`.
- [ ] **Splittear el page actual** (que hoy tiene state tabs internos):
  - `app/rdb/inventario/page.tsx` → solo Stock view (default landing del módulo).
  - `app/rdb/inventario/movimientos/page.tsx` (nuevo) → Movimientos view extraído del page actual.
  - `app/rdb/inventario/levantamientos/page.tsx` → ya existe, hereda el nuevo layout.
- [ ] **Sub-detalle de Levantamientos** (`[id]`, `[id]/capturar`, `[id]/diferencias`, `[id]/reporte`, `nuevo`) hereda el layout — los 3 tabs siguen visibles arriba con "Levantamientos" como tab activo.
- [ ] **Borrar `components/inventario/inventario-tabs.tsx`** — el viejo componente pill queda obsoleto. Verificar con `git grep` que ningún otro page lo importe antes de borrar.
- [ ] **Estados `loading` / `empty` / `error`** consistentes en cada tab (preservar lo que ya tiene cada page).
- [ ] **Responsive (375px mínimo):** los 3 tabs caben sin scroll horizontal en pantalla angosta. Si no caben, primero intentar reducir padding del tab antes de truncar texto.
- [ ] **A11y:** `role="tablist"` en el strip, `aria-current="page"` en el tab activo de los routed tabs (Next.js convención para routed tabs).

## Fuera de alcance

- Cortes (Conciliación / Marbete / Vouchers) y otros módulos con sub-módulos — vendrá en iniciativas siguientes una vez validado el patrón en Inventario.
- Cambios en lógica de queries, fetches, RLS, permisos del módulo.
- Cambios en `<ModulePage>`, `<ModuleHeader>`, `<ModuleTabs>` (componentes ya existen y se reusan tal cual).
- Migración de otros módulos sin sub-módulos (Ventas, Productos hoy) — si no tienen sub-módulos, no aplica este patrón.

## Métricas de éxito

- 0 inconsistencias visuales entre `/rdb/inventario`, `/rdb/inventario/movimientos`, `/rdb/inventario/levantamientos`, y sub-detalles. Verificar con screenshots before/after en el PR.
- 0 entradas duplicadas u huérfanas en sidebar (RDB queda con módulos top-level únicamente).
- Tiempo subjetivo del equipo RDB para encontrar Levantamientos: "obvio en <3s" desde abrir Inventario.
- Build passing, type-check passing, lint passing en el PR.
- Smoke manual: refresh sobre cada ruta no rompe; browser back/forward navega entre tabs correctamente.

## Riesgos / preguntas abiertas

- [ ] **Compat con state tabs actuales** — la migración de Stock/Movimientos de state-based a routed implica perder el state tab logic actual. Revisar handlers que dependen de `tab === 'stock'` vs `tab === 'movimientos'` (ej. en filters bar). CC debe garantizar que cada page nuevo tenga sus propios filtros/KPIs/handlers correspondientes.
- [ ] **Default landing del módulo** — `/rdb/inventario` queda como Stock view (default). Confirmado 2026-04-25.
- [ ] **Estado del sub-detalle profundo** — al estar dentro de `/rdb/inventario/levantamientos/[id]/capturar`, los tabs de Inventario siguen visibles. Si el usuario hace click en "Stock" o "Movimientos", pierde el progreso de captura no guardado. CC decide si agregar pop-up de confirmación durante implementación; no bloquea v1.
- [ ] **Mobile (≤375px)** — 3 tabs underline con texto "Stock | Movimientos | Levantamientos" caben aprox 250px. Validar en dispositivo. Si no caben, considerar reducir padding antes de truncar texto o aplicar scroll horizontal.
- [ ] **Permisos por tab** — actualmente `rdb.inventario` cubre stock + movimientos + levantamientos. Si en el futuro Levantamientos requiere permiso específico (ej. `rdb.inventario.levantamientos`), el layout deberá esconder el tab para usuarios sin acceso. No bloquea v1.
- [ ] **`InventarioTabs` borrado** — antes de borrar, `git grep -l "InventarioTabs\|inventario-tabs"` y migrar cualquier consumidor restante al nuevo layout.

## Sprints / hitos

_(se llena cuando arranque ejecución, vía Claude Code)_

## Decisiones registradas

_(append-only, fechadas — escrito por Claude Code)_

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_
