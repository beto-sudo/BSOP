# ADR-030 — Sub-module permissions (sub-slugs)

**Estado:** Aceptado
**Fecha:** 2026-05-09
**Iniciativa:** [`submodule-permissions`](../planning/submodule-permissions.md) — closeada 2026-05-09 (PRs #460, #461, este PR)
**ADRs relacionados:** [ADR-005](005_module_with_submodules_routed_tabs.md), [ADR-014](014_sidebar_taxonomia.md), [ADR-024](024_access_denied_ux.md)

## Contexto

El RBAC de BSOP gobierna acceso por **slug raíz de módulo** vía `core.modulos` × `core.permisos_rol`. Con [ADR-005](005_module_with_submodules_routed_tabs.md) (módulos con sub-módulos como routed tabs) un módulo puede tener N sub-páginas hermanas (ej. `rdb.inventario` con tabs Stock / Movimientos / Levantamientos). El RBAC original concedía acceso al módulo entero — todo o nada.

Use case real: usuarios que necesitan ver/configurar solo algunas tabs específicas (ej. un consultor que ve Catálogo de productos pero no Auditoría). Antes de esta iniciativa, no había forma de granular sin crear módulos completamente separados (over-engineering) o gates ad-hoc en código (config no-DB-driven).

## Decisión

**Sub-slugs como módulos hijos en `core.modulos`.** Cuando un módulo tiene sub-páginas (routed tabs), se declara 1 sub-slug por tab adicional al slug raíz. Cada sub-slug es una fila independiente en `core.modulos` con la convención de naming `<padre>.<sub>` (ej. `rdb.inventario.stock`). La maquinaria existente (`canAccessModulo`, `<RequireAccess>`, UI Settings/Roles) consume sub-slugs sin cambios — un sub-slug es idéntico a un slug, solo con punto adicional.

**Modelo:**

- **Padre** (`rdb.inventario`) actúa como **umbrella** — gobierna visibilidad del módulo en sidebar.
- **Sub-slug** (`rdb.inventario.stock`) gobierna **acceso real al contenido** específico de cada sub-página.

## Reglas SS1-SS8

### SS1 · Sub-slug por tab

Cuando un módulo tiene sub-páginas (siguiendo [ADR-005](005_module_with_submodules_routed_tabs.md) routed tabs), declarar 1 sub-slug por tab desde el inicio. Aplicable a módulos nuevos y a módulos existentes con tabs.

**Naming:** `<padre>.<sub>` con punto adicional. Ejemplos:

- `rdb.inventario.stock`, `rdb.inventario.movimientos`, `rdb.inventario.levantamientos`.
- `rdb.productos.catalogo`, `rdb.productos.recetas`, `rdb.productos.auditoria`, `rdb.productos.analisis`.

El padre (`rdb.inventario`) se preserva — sigue actuando como umbrella en sidebar.

### SS2 · ROUTE_TO_MODULE granular

Cada URL de sub-página mapea a su sub-slug en `lib/permissions.ts`:

```ts
'/rdb/inventario':                 'rdb.inventario.stock',          // tab default
'/rdb/inventario/movimientos':     'rdb.inventario.movimientos',
'/rdb/inventario/levantamientos':  'rdb.inventario.levantamientos',
```

**La URL default del módulo (`/<modulo>`) apunta al sub-slug del primer tab.** No al padre. El gate de contenido del landing es el del primer tab, y el manual in-app deriva su doc de este mapa (`resolveHelpSlug`).

> ⚠️ **Corrección 2026-06-10 (ver SS8).** La justificación original asumía que "si el rol tiene cualquier tab, el módulo aparece en sidebar vía alguna URL accesible" — falso: el sidebar solo lista la URL **default** de cada hub, así que un rol con tabs internas pero sin el primer tab perdía la puerta de entrada a todo el hub (caso real: Gerente de Proyectos con Requisiciones/Cotizaciones/Recepciones pero sin Órdenes no veía Compras). La visibilidad del sidebar ya NO se decide con este mapa sino con `canSeeNavRoute` (SS8).

### SS3 · Backfill defensivo al introducir sub-slugs

Cuando se agregan sub-slugs a un módulo **existente** (con roles ya configurados sobre el padre), la migración SQL DEBE incluir un backfill que clone los permisos del padre a cada hijo:

```sql
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, child.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos parent ON parent.id = pr.modulo_id
JOIN core.modulos child  ON child.empresa_id = parent.empresa_id
WHERE
  (parent.slug = '<padre>' AND child.slug IN ('<padre>.<a>', '<padre>.<b>', ...))
ON CONFLICT (rol_id, modulo_id) DO NOTHING;
```

**Razón:** sin backfill, agregar sub-slugs **esconde** las tabs a no-admin users que tenían acceso al padre — `canAccessModulo` retorna `false` cuando el slug no está en `permissions.modulos`. El backfill preserva 100% del status quo: estado pre-PR = estado post-PR para todos los roles.

Plantilla canónica: [`supabase/migrations/20260509162620_modulos_subscope_permissions.sql`](../../supabase/migrations/20260509162620_modulos_subscope_permissions.sql).

### SS4 · `<RoutedModuleTabs>` filtra tabs

`RoutedModuleTab` declara campo opcional `module?: string`. Si está set, [`<RoutedModuleTabs>`](../../components/module-page/routed-module-tabs.tsx) filtra por `canAccessModulo(perms, module)`. Tabs sin permiso quedan **ocultas del tab-strip**.

Comportamiento durante `permissions.loading`: muestra todas las tabs sin filtrar — evita flash. Admin bypass: aplica via `canAccessModulo` (admin ve todas).

Tab sin `module` declarado: siempre visible (compat con módulos sin granularidad).

### SS5 · Cada sub-page con `<RequireAccess>` específico

Cada sub-page tiene su propio gate con su sub-slug:

```tsx
<RequireAccess empresa="rdb" modulo="rdb.inventario.stock">
  <InventarioStockBody />
</RequireAccess>
```

Esto da el AccessDenied específico del sub-slug si el usuario entra por URL directa sin permiso. El layout NO debe tener `<RequireAccess>` umbrella sobre el árbol — duplica gate y opaca el `required` line del AccessDenied (mostraría el padre cuando el verdadero faltante es el sub-slug).

Excepción documentada: layout puede tener umbrella si todas las sub-pages comparten el mismo gate (módulo sin sub-slugs, no aplicable a este patrón).

### SS6 · Body separado para hooks dinámicos

Si la sub-page usa `useSearchParams` (directo o vía `useUrlFilters`), DEBE separar el cuerpo a un componente interno wrappeado por `<RequireAccess>`:

```tsx
export default function InventarioStockPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.inventario.stock">
      <InventarioStockBody />
    </RequireAccess>
  );
}

function InventarioStockBody() {
  const { filters } = useUrlFilters(...);  // useSearchParams aquí
  // ...
}
```

**Razón:** Next.js 16 + Turbopack rompe el build con `useSearchParams() should be wrapped in a suspense boundary` cuando el hook se ejecuta en el outer component de un client page. `<RequireAccess>` decide montar/no el body según el estado de permisos — durante prerender estático está en loading state y NO renderiza el body, los hooks dinámicos no se ejecutan, build pasa. `force-dynamic` no funciona en este escenario (no honra para client components).

Plantilla canónica: [`app/rdb/productos/recetas/page.tsx`](../../app/rdb/productos/recetas/page.tsx) y [`app/rdb/inventario/page.tsx`](../../app/rdb/inventario/page.tsx).

### SS7 · Test de drift `EXPECTED_DB_MODULE_SLUGS`

Cada sub-slug debe agregarse a la lista canónica en [`lib/permissions.test.ts`](../../lib/permissions.test.ts) en el mismo PR que extiende `ROUTE_TO_MODULE`. El test `'every slug in ROUTE_TO_MODULE has an expected DB row'` falla si olvidas — recordatorio explícito de que la migración SQL debe acompañar.

### SS8 · Visibilidad de hub: padre O cualquier sub-slug + aterrizaje accesible

_(Agregada 2026-06-10 — fix del caso "rol con permisos parciales no ve el hub".)_

Dos piezas en el mismo PR al liberar un hub:

1. **`HUB_PARENT_BY_ROUTE`** ([lib/permissions.ts](../../lib/permissions.ts)): entrada `'/<empresa>/<hub>': '<empresa>.<hub>'` (URL landing → slug padre umbrella). El sidebar y los paneles de empresa deciden visibilidad con `canSeeNavRoute(perms, href)`: la entrada del hub se muestra si el usuario lee el sub-slug mapeado, el padre umbrella **o cualquier sub-slug** del hub (`canAccessModuloOrChild`). Un test de sync en `permissions.test.ts` valida que cada entrada sea coherente con `ROUTE_TO_MODULE` y exista en DB.
2. **`<HubAccessRedirect tabs={TABS} />`** en el `layout.tsx` del hub (junto a `<RoutedModuleTabs>`, mismos TABS): si el usuario está parado en la URL de un tab cuyo sub-slug no puede leer (típico: el landing default), lo redirige al primer tab que sí puede. Sin ningún tab accesible es no-op y el `<RequireAccess>` de la sub-page muestra su AccessDenied (SS5 intacto).

Los gates de contenido NO cambian: `ROUTE_TO_MODULE` y `<RequireAccess>` por sub-page siguen igual — SS8 solo gobierna puerta de entrada (visibilidad) y aterrizaje.

## Consecuencias

### Positivas

- **Granularidad sin reescribir RBAC.** Reusa `core.modulos`, `core.permisos_rol`, `canAccessModulo`, UI Settings/Roles existente.
- **Compat con código actual.** `<RequireAccess module="rdb.inventario">` (padre) sigue funcionando si no se migra. La granularidad es opt-in por módulo.
- **Discoverable por admins.** Los sub-slugs aparecen en la UI Settings/Roles como rows independientes — admin puede otorgar/revocar sin entender el modelo padre/hijo.
- **Backfill preserva status quo.** Al introducir sub-slugs a un módulo con roles configurados, ningún usuario pierde acceso a tabs que ya tenía.

### Negativas

- **Más rows en `core.modulos`.** Un módulo con 4 tabs pasa de 1 a 5 rows (padre + 4 hijos). Marginal — `core.modulos` tiene < 50 rows totales.
- **"Liberación de módulo nuevo" más pesada.** Si el módulo tiene N tabs, hay N+1 entries por mantener (1 padre + N hijos) en sidebar (NAV_ITEMS), `ROUTE_TO_MODULE`, `EXPECTED_DB_MODULE_SLUGS`, y migración SQL. Mitigación: plantilla en CLAUDE.md repo y migración canónica como referencia.
- **Tres puntos de gate** (sidebar visibility + tab-strip filter + page-level RequireAccess). Mitigación: helper único `canAccessModulo(subSlug)` consumido por los 3 — sin lógica duplicada.

### Estados inconsistentes posibles

- **Padre sin hijos (admin quita todos los sub-slugs pero deja padre):** módulo aparece en sidebar, pero al entrar todas las tabs están ocultas y la URL default da AccessDenied. La matriz de Settings/Roles agrupa los sub-slugs bajo su hub (con acciones "Todo/Nada") para hacer esta config visible de un vistazo.
- **Hijos sin padre (admin quita padre pero deja sub-slug):** desde SS8 el hub sigue visible en sidebar (`canSeeNavRoute` considera cualquier sub-slug) y `<HubAccessRedirect>` aterriza en el tab accesible. El padre queda como slug del hub para backfills y agrupación, ya no como única llave de visibilidad.

Ambos estados son creables solo manualmente por admin desde Settings/Roles; con SS8 ninguno deja al usuario sin puerta de entrada a contenido que sí tiene permitido.

## Alternativas consideradas

- **B. Acciones/scopes por módulo.** Extender `core.permisos_rol` con `acciones jsonb` (ej. `{stock: true, movimientos: false}`). Pros: 1 slug por módulo. Cons: modelo nuevo, UI de Settings/Roles más compleja, no reusa la maquinaria existente. Postergado — opción para el futuro si emerge necesidad de granular **acciones** dentro de una misma tab (ej. "ver vs aprobar"); para granular **vistas/tabs**, A es más simple.
- **C. Padre/hijo con herencia explícita.** Tabla `modulos_subscope` con FK al padre. Modelo limpio para múltiples niveles. Cons: over-engineering para 2 niveles de anidamiento que es el único caso real. Si emerge sub-sub-slugs, ADR nuevo.
- **D. Per-page guard hardcoded en código.** Mapa de sub-permisos en `lib/permissions.ts`. Cons: la fuente de verdad vive en código (no DB-driven), Beto/admins no pueden config sin deploy. Descartado.

## Implementación

- **Sprint 1** (PR #460) — Migración `20260509162620_modulos_subscope_permissions.sql` con 7 sub-slugs (3 `rdb.inventario.*` + 4 `rdb.productos.*`) y backfill defensivo.
- **Sprint 2** (PR #461) — `<RoutedModuleTabs>` extendido con filter, `ROUTE_TO_MODULE` granular, `<RequireAccess>` por sub-page, layouts con TABS filtradas, body separado en Stock para `useSearchParams`.
- **Sprint 3** (este PR) — ADR-030, regla en CLAUDE.md repo, refresh ARCHITECTURE.md §4 y §5, cierre en INITIATIVES.md.

Ver [planning doc](../planning/submodule-permissions.md) para bitácora completa y decisiones D1-D4.
