# ADR-009 — Anatomía de páginas de detalle (`<DetailPage>`)

- **Status**: Accepted
- **Date**: 2026-04-26
- **Authors**: Beto, Claude Code (iniciativa `detail-page`)
- **Companion to**: [ADR-004](../../supabase/adr/004_module_page_layout_convention.md) (`<ModulePage>` para tabulares)

---

## Contexto

ADR-004 fija la anatomía de **páginas tabulares de módulo** (header → tabs → KPIs → filters → content) vía `<ModulePage>`. Pero excluye explícitamente las páginas no-tabulares — y las páginas de detalle (`/<modulo>/[id]`) son justo eso: vista de una entidad, no una lista.

Auditoría sobre detail pages existentes:

- `app/dilesa/terrenos/[id]/page.tsx` — header artesanal con back + eyebrow + título + subtitle + status badge + acción.
- `app/dilesa/prototipos/[id]/page.tsx` — anatomía **idéntica** al header de terrenos.
- `app/dilesa/proyectos/[id]/page.tsx` — header similar pero con DropdownMenu de acciones y sub-tabs `?section=…`.
- `app/dilesa/anteproyectos/[id]/page.tsx` — mismo patrón.
- `app/rdb/inventario/levantamientos/[id]/page.tsx` — UI dependiente del estado del levantamiento (5 estados con UIs distintas). **No encaja** en una anatomía simple.
- Drawers: `<OrderDetail>` (Ventas), `<StockDetailDrawer>` (Inventario), `<CorteDetail>` (Cortes), `<DocumentoDetailSheet>` (Documentos).

Patrón común detectado en DILESA detail pages: `back + eyebrow + título + subtitle + meta + actions`. Cada uno lo armaba a mano, idéntico píxel a píxel — perfecto para abstraer.

## Decisión

Introducimos `<DetailPage>`, `<DetailHeader>` y `<DetailContent>` en `components/detail-page/`. Anatomía canónica:

```
DetailPage
├── DetailHeader      (back + eyebrow + title + subtitle + meta + actions)
├── (banners)         (errores de mutación → toast por T1; banners contextuales)
├── (sub-nav)         (tabs internos opcionales — ver D5)
└── DetailContent     (sections, grid, drawers — caller-defined)
```

`<DetailHeader>` recibe slots tipados:

```tsx
<DetailHeader
  back={{ onClick: () => router.push('/dilesa/terrenos'), label: 'Volver a Terrenos' }}
  eyebrow="DILESA · Terreno"
  title={terreno.nombre}
  subtitle={terreno.clave_interna}
  meta={<EtapaBadgeLarge etapa={terreno.etapa} />}
  actions={<Button onClick={() => setArchiveOpen(true)}>Archivar</Button>}
/>
```

### Las 5 reglas (D1–D5)

#### D1 — Header tiene 6 slots, en orden de izquierda a derecha

`back · eyebrow / title / subtitle · meta · actions`. En desktop, todo en una fila. En mobile (`< sm`), `meta + actions` cae a una segunda fila debajo del título. Los slots son opcionales excepto `title`.

> **Por qué**: la anatomía artesanal que ya tenían los 4 detail pages de DILESA es exactamente esta — el componente solo elimina la duplicación.

#### D2 — Drawer vs página: criterio por densidad y profundidad

Decisión binaria según dos preguntas:

1. ¿La info es ≥3 secciones lógicas distintas, o tiene sub-tabs internos? → **Página**.
2. ¿Es la "verdad operativa" del registro (expediente terreno, corte de caja, levantamiento)? → **Página**.

Si ambas respuestas son "no" → **Drawer** (Sheet de shadcn) como hijo del listado padre. La elección NO depende del tamaño en líneas — un drawer de 200 líneas con 1 sección sigue siendo drawer.

> **Por qué**: el drawer mantiene el contexto del listado (el usuario sigue viendo la fila padre detrás). La página rompe ese contexto pero gana share/bookmark/back. Para entidades que merecen su propio link (terrenos, cortes), la página es correcta.

#### D3 — Tabs internos de detalle son **routed** (URL state), no `useState`

Si el detalle tiene sub-vistas (e.g. proyecto con secciones Info / Lotes / Prototipos / Presupuesto / Documentos), cada sub-vista vive en `?section=…` (consistente con [ADR-005](./005_module_with_submodules_routed_tabs.md) para módulos con sub-módulos). Underline style — NO pills (R4 de ADR-004).

> **Por qué**: misma justificación que ADR-005 para módulos. Browser back, share, bookmark; el fragmento del expediente que estás revisando es parte de la URL.

#### D4 — Una sola acción primaria en `actions`

Mismo principio que ADR-004 R8: si hay 2 acciones de peso similar, una de las dos no es primaria. Para múltiples acciones secundarias, usar un `<DropdownMenu>` con `<MoreVertical />` (ver `proyectos/[id]` como referencia).

> **Por qué**: el header no es el lugar para una barra de toolbar. Las acciones contextuales del registro viven cerca de la sección que afectan; la acción primaria del registro completo vive arriba.

#### D5 — Excepciones documentadas (state-machine UIs)

Detalles cuya UI cambia drásticamente según un estado interno (ej. `levantamientos/[id]` con 5 estados, `cortes/[id]` con abierto/cerrado) son **excepciones aceptables** a `<DetailPage>` — pueden seguir con su anatomía custom siempre que justifiquen la divergencia en un comentario JSDoc al inicio del archivo.

`<DetailPage>` no se sobre-diseña para acomodar todas las posibles UIs de detalle. Si el módulo tiene un flujo state-machine complejo, su lectura es más clara con código local que con slots forzados.

> **Por qué**: el costo de hacer `<DetailPage>` lo suficientemente flexible para state-machines es mayor al beneficio. La regla "anatomía canónica con excepciones documentadas" sigue siendo más clara que "todos los detalles deben usar el wrapper".

### A11y mínimo

- `<DetailHeader>` usa `<h1>` semántico para el título.
- Back button con `aria-label` explícito (e.g. "Volver a Terrenos").

## Implementación

- **PR de creación + adopción** (este PR): los 3 componentes + ADR-009 + migración de `prototipos/[id]` y `terrenos/[id]` (DILESA).
- **`proyectos/[id]` y `anteproyectos/[id]` no migrados en este PR** — tienen sub-tabs `?section=…` y la migración requiere extender el wrapper (D3, futuro). Quedan para PR de seguimiento o para adopción incremental cuando se les toque por otro motivo.
- **`levantamientos/[id]` no migrará** — excepción documentada por D5.

## Consecuencias

### Positivas

- Detalles nuevos heredan anatomía consistente sin reinventar el header.
- Code review tiene check binario: ¿usa `<DetailPage>` + `<DetailHeader>` o tiene comentario JSDoc justificando la excepción?
- El componente `<DetailHeader>` tipado obliga a llenar `title`, hace opcionales los demás. Olvidar back en una página de detalle (que rompe el flujo) ya no es un descuido — es una omisión visible.

### Negativas

- 2 anatomías compitiendo (`<ModulePage>` para tabulares, `<DetailPage>` para detalles). Aceptable: son dos preguntas distintas del usuario ("¿cómo está mi negocio?" vs "¿qué es esta cosa específica?").
- `<DetailHeader>` no soporta hoy edición inline del title (rename click-to-edit). Postergado — ningún módulo lo pide en v1.

### Cosas que NO cambian

- Drawers existentes (`<OrderDetail>`, `<StockDetailDrawer>`, etc.) — siguen siendo drawers. D2 valida la elección.
- Detalles state-machine (`levantamientos/[id]`) — siguen con su anatomía custom por D5.
- Módulos que ya usan `<ModulePage>` — sin cambios.

## Referencias

- Componentes: [components/detail-page/](../../components/detail-page/)
- Iniciativa: [docs/planning/detail-page.md](../planning/detail-page.md)
- PR de implementación: `feat/ui-detail-page`
- ADR-004 — anatomía de módulos tabulares.
- ADR-005 — routed tabs (D3 referencia este patrón).
