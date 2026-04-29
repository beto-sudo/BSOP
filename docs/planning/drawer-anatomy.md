# Iniciativa — Drawer anatomy (`<DetailDrawer>`)

**Slug:** `drawer-anatomy`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-04-27
**Última actualización:** 2026-04-29

## Problema

ADR-009 D2 fija drawer-vs-página como decisión binaria. Pero solo
gobierna **cuándo** usar drawer; no fija la **anatomía** del drawer en
sí. Los drawers existentes son cada uno su propio diseño:

- `<OrderDetail>` (Ventas), `<StockDetailDrawer>` (Inventario),
  `<CorteDetail>` (Cortes), `<DocumentoDetailSheet>` (Documentos),
  `<TasksUpdatesSheet>`, `<NuevaEmpresaDrawer>`, etc.

Síntomas observables: header inconsistente, scroll variable
(`h-[calc(100vh-Nrem)]` vs `flex-1 min-h-0`), padding disperso, footer
ausente, print stylesheet solo en algunos.

## Outcome esperado

- Componente `<DetailDrawer>` paralelo a `<DetailPage>` (ADR-009).
- Mismos slots conceptuales: `header (title + description + meta +
actions)`, `content (scrollable)`, `footer (sticky opcional)`.
- Anatomía visual consistente: padding, header sticky, scroll natural,
  footer sticky cuando hay acciones, print stylesheet por construcción.
- Sizes semánticos (`sm`/`md`/`lg`/`xl`) en lugar de literales.
- Cierre estándar: X, ESC, click fuera (con `useDirtyConfirm` integrable
  cuando el drawer contiene un form).
- ADR documentando la anatomía.

## Alcance v1 (cerrado 2026-04-29 — ver ADR-018)

- [x] `<DetailDrawer>` + `<DetailDrawerHeader>` + `<DetailDrawerContent>` + `<DetailDrawerFooter>` en `components/detail-page/`.
- [x] Index export actualizado.
- [x] ADR-018 con 6 reglas (DD1-DD6).
- [x] Golden migration: `<StockDetailDrawer>` (Inventario) — ya tenía
      print stylesheet manual y header artesanal con acciones absolute.
- [ ] Migración del resto de drawers — Sprints 2+ (≈12+ targets).

## Decisiones tomadas al cerrar alcance

- **Sub-componentes hermanos, no extender `<DetailHeader>`**: el header
  de drawer no tiene `back` (la X cumple ese rol). API distinta justifica
  componentes separados con base común (Sheet primitives), no extender.
- **`size` semántico** (`sm`/`md`/`lg`/`xl`) en lugar de literales
  (`sm:max-w-[640px]`, `sm:max-w-[700px]`, etc.). 4 sizes cubren el repo
  entero.
- **`useDirtyConfirm` opt-in (DD6)**: el `<DetailDrawer>` no integra
  internamente el dirty-check porque solo conoce su `open`; el form state
  lo conoce el caller. Patrón estándar documentado para que el caller
  cruce drawer↔form sin inventar el suyo.
- **Print stylesheet por default (DD5)**: todos los drawers heredan
  stylesheet de impresión sin escribirlo manualmente.

## Fuera de alcance v1

- **Mobile bottom sheet** (drawer desde abajo). El default `side="right"`
  cubre 95% del repo.
- **Drawer con sub-tabs internos**. Si surge, sale como
  `<DetailDrawerTabs>` aparte.
- **Inline-edit del title** (rename click-to-edit). Postergable.
- **Animaciones custom** de apertura.

## Métricas de éxito

- Drawers migrados se ven idénticos en padding, header, scroll y cierre.
- Cero `<Sheet>` directo con header artesanal en código nuevo.
- Time-to-build de drawer nuevo: ~15 líneas (vs ~50 actuales).

## Sprints / hitos

| #   | Sprint                                     | Estado  | PR  |
| --- | ------------------------------------------ | ------- | --- |
| 1   | Foundation + ADR-018 + golden Stock drawer | done    | TBD |
| 2   | Migrar drawers de detalle                  | pending | —   |
| 3   | Migrar drawers de creación/edición         | pending | —   |
| 4   | Cierre + INITIATIVES move to Done          | pending | —   |

## Decisiones registradas

### 2026-04-29 · ADR-018 — Drawer anatomy (Sprint 1)

Codificado en [ADR-018](../adr/018_drawer_anatomy.md). Las 6 reglas:

- **DD1** — Side `"right"` por default; `size` semántico (sm/md/lg/xl).
- **DD2** — Header sticky con anatomía 4-slot (title + description + meta + actions).
- **DD3** — Content fills el espacio entre header y footer; `<ScrollArea>` por default.
- **DD4** — Footer sticky opcional para acciones primarias.
- **DD5** — Print stylesheet por construcción.
- **DD6** — Dirty confirm via `useDirtyConfirm` (ADR-016 F6) cuando el drawer tiene un form.

## Bitácora

### 2026-04-29 — Sprint 1 mergeado

Foundation:

- `components/detail-page/detail-drawer.tsx` — `<DetailDrawer>` +
  `<DetailDrawerHeader>` + `<DetailDrawerContent>` + `<DetailDrawerFooter>`.
- `components/detail-page/index.ts` — exports actualizados.
- ADR-018 con 6 reglas (DD1-DD6).

Golden migration: `<StockDetailDrawer>` (Inventario). Antes: `<Sheet>` +
`<SheetContent>` + `<SheetHeader>` con acciones `absolute right-12 top-4`

- `<ScrollArea h-[calc(100vh-8rem)]>` artesanal. Después:
  `<DetailDrawer title=... description=... actions={imprimir}>` +
  `<DetailDrawerContent>`. ~25 líneas menos.

Sprint 2+ migra los drawers restantes (Documentos detail/create, Order,
Corte, Tasks updates, Nueva Empresa, etc.).

PR: pendiente.
