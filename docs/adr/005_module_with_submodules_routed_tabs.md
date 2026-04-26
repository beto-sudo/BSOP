# ADR-005 — Módulos con sub-módulos: routed tabs en layout compartido

**Fecha:** 2026-04-25
**Estado:** propuesto
**Iniciativa(s):** `module-page-submodules`

## Contexto

ADR-004 estableció `<ModulePage>` y la regla R1: "un solo nivel de tabs por página, los hermanos viven en sidebar". El primer caso (Inventario en PR #202) se migró con state tabs internos `Stock | Movimientos`, y se decidió que Levantamientos saliera del módulo a entry de sidebar (PR #203, mergeado 2026-04-25).

Aplicado en producción, el resultado se ve incorrecto: Levantamientos aparenta ser un módulo independiente al mismo nivel que Ventas, Cortes, Productos. Funcionalmente NO lo es — comparte permisos (`rdb.inventario`), almacenes, productos. Adicionalmente, las sub-rutas de Levantamientos siguen montando un `<InventarioTabs>` antiguo (pill) con `Stock & Movimientos | Levantamientos | Análisis`, generando dos estilos de navegación coexistiendo en el mismo módulo.

R1 era correcta como anti-pattern (no anidar pills sobre pills) pero demasiado restrictiva como regla. La realidad es que los módulos del ERP tienen sub-módulos (Inventario→Levantamientos hoy; Cortes→Conciliación/Marbete/Vouchers; Productos→Variantes/Categorías/SKUs después), y necesitamos un patrón canónico.

## Opciones

### Opción A — Sub-módulos como sidebar siblings (status quo post-#203)

Cada sub-módulo aparece como entry hermana al módulo padre en el sidebar.

**Pros:**

- Cumple R1 literal (1 nivel por page).
- URL plana.

**Contras:**

- Sidebar bloated: Inventario + Levantamientos + Análisis + Conciliación + Marbete + Vouchers + Variantes + ... = N entradas que el usuario no agrupa mentalmente.
- Visualmente: sub-módulos aparentan ser independientes cuando no lo son.
- Sin breadcrumb claro de pertenencia.
- Validado en uso: Beto reportó 2026-04-25 que se "ve mal".

**Riesgo:** alto — UX se degrada con cada sub-módulo nuevo.

### Opción B — Sub-módulos como state tabs adentro del page raíz (`?tab=...` o estado local)

El page raíz del módulo tiene tab state interno; cambiar tab muta state local sin cambiar URL.

**Pros:**

- Implementación simple.

**Contras:**

- URL no refleja el tab → no bookmark, no share, refresh pierde tab.
- Sub-detalles (`[id]`, `nuevo`, etc.) son rutas reales, así que hay inconsistencia: tabs son state pero los detalles tienen URL real.
- Browser back navega rutas, no tabs.

**Riesgo:** medio — funciona técnicamente, falla en UX.

### Opción C — Sub-módulos como routed tabs en `layout.tsx` compartido (recomendada)

`app/<modulo>/layout.tsx` renderiza el shell de `<ModulePage>` (header + `<ModuleTabs>`) con N tabs que son rutas hermanas:

- `/<modulo>` (sin sub-ruta) = primer tab (default landing).
- `/<modulo>/<sub1>`, `/<modulo>/<sub2>`, ... = tabs adicionales.

Tab activo se deriva de `usePathname()`. Sub-detalles profundos (`/<modulo>/<sub>/[id]`, etc.) heredan el mismo layout para mantener el strip visible.

**Pros:**

- URL refleja el tab → bookmarks y share funcionan.
- Browser back/forward navega entre tabs.
- Un solo strip visible (cumple el espíritu de R1: un nivel visible, no anidación).
- Sub-detalles tienen contexto: el usuario sabe dónde está y puede saltar a otro tab del módulo.
- Patrón estándar Next.js (route groups + layouts).
- Generalizable a Cortes, Productos, etc.

**Contras:**

- Si un sub-detalle muy inmersivo (ej. flujo de captura full-screen) NO debería mostrar el strip, hace falta un layout anidado para "salirse" — overhead manejable.
- Migrar módulos existentes con state tabs requiere split del page.tsx en N rutas. Costo único por módulo.

**Riesgo:** bajo. Estructura estándar de Next.js, regression contained al módulo migrado.

### Opción D — Sub-módulos como pills/segments adentro del page (estilo viejo `InventarioTabs`)

Tabs en el page con estilo distinto al strip principal (pills), tratando de evitar la anidación visual.

**Pros:** intento de R1.

**Contras:**

- Dos estilos de tab distintos confunden al usuario (¿cuál es la nav primaria?).
- Validado: el `InventarioTabs` viejo en `/rdb/inventario/levantamientos/*` no se distingue claramente del strip principal.
- No resuelve URL sync.

**Riesgo:** alto — el patrón ya falló en producción.

## Decisión

**Opción C.** Routed tabs en `layout.tsx` compartido entre rutas hermanas.

## Consecuencias

### Aclaración a ADR-004 R1

R1 originalmente decía: *"Un solo nivel de tabs por página. Si necesitas otro nivel, son módulos hermanos en el sidebar."*

Se aclara: **"Un solo nivel de tabs visible por página."** Los tabs pueden vivir en un `layout.tsx` compartido entre rutas hermanas siempre que solo se vea un strip — la fuente del strip (page o layout) es indistinta para el usuario. Sub-detalles profundos heredan el strip por consistencia, manteniendo "un strip visible".

Sub-módulos NO van al sidebar como hermanos del módulo padre cuando comparten dominio funcional (mismo permiso base, mismas entidades). Solo van al sidebar como hermanos cuando son módulos genuinamente independientes (ej. Ventas vs Cortes vs Productos — entidades distintas, casos de uso distintos).

### Positivas

- Patrón consistente para módulos con sub-módulos.
- URL share-able para cada tab.
- Sidebar limpio: solo módulos top-level.
- Aplicable a Cortes (siguiente candidato natural), Productos, etc.
- Browser back/forward y refresh son intuitivos.

### Neutras / a monitorear

- Sub-detalles muy inmersivos (ej. flujo de captura mobile-first) pueden requerir esconder el strip. Caso edge — manejar con layout anidado en vez de hacer regla nueva.
- Si un sub-módulo crece y eventualmente justifica salir como módulo independiente, el refactor es simétrico (layout tab → sidebar entry).

### Negativas

- Migrar módulos existentes con state tabs implica split de `page.tsx` en N rutas. Costo único por módulo (Inventario primero, Cortes después).
- ADR-004 R1 necesitó aclaración después de aplicarlo en producción — recordatorio de que reglas demasiado estrictas se descubren al chocar con casos reales (PR #203 fue el caso real).
