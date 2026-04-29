# Iniciativa — Drawer anatomy (`<DetailDrawer>`)

**Slug:** `drawer-anatomy`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** done
**Dueño:** Beto
**Creada:** 2026-04-27
**Última actualización:** 2026-04-30 (cierre)

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

| #   | Sprint                                                                                    | Estado | PR   |
| --- | ----------------------------------------------------------------------------------------- | ------ | ---- |
| 1   | Foundation + ADR-018 + golden Stock drawer                                                | done   | #308 |
| 2   | Migrar drawers de detalle (Order, Corte, Documento, OC)                                   | done   | #316 |
| 3   | Migrar drawers de creación/edición (TasksUpdates, NuevaEmpresa, DocumentoCreate) + cierre | done   | TBD  |

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

### 2026-04-30 — Sprint 3 mergeado (cierre)

3 drawers de creación/edición migrados:

- `<TasksUpdatesSheet>` — sheet "Avances de tarea" con composer + history
  list. `<Sheet>` artesanal → `<DetailDrawer size="sm">` con `title` +
  `description` (titulo de la tarea).
- `<NuevaEmpresaDrawer>` (settings) — drawer multi-state (drop → processing
  → preview+form) para alta de empresa con CSF. Header con icon Sparkles
  - copy descriptivo en `description`. State machine interno preservado.
- `<DocumentoCreateSheet>` — drawer "Nuevo Documento" con `<Form>`+zod.
  Eliminado `<ScrollArea>` artesanal (heredado de DD3).

**Excepciones documentadas (fuera de v1)**:

- `<EmpleadoAltaWizard>` — multi-step con state machine compleja, vive
  en la iniciativa `wizard-pattern` (spin-out de forms-pattern Sprint 6).
- DILESA list pages (`terrenos`, `prototipos`, `proyectos`, `anteproyectos`)
  — sus sheets "Nuevo X" ya migraron a `<Form>` en forms-pattern Sprint 4.
  Cambiar el shell a `<DetailDrawer>` ahora sería doble churn sin valor;
  se actualizan cuando se toquen por feature work.
- `<Settings/Acceso>` y otros sheets state-machine (Productos, Requisiciones,
  Proveedores list, RH dept/puestos) — postergables al patrón
  "drawer + sub-tabs" que sale como ADR aparte si emerge necesidad.

**Outcome final**: 7 drawers core migrados (Stock + Order + Corte +
Documento detail + OC + TasksUpdates + NuevaEmpresa + DocumentoCreate).
Patrón establecido y documentado en ADR-018. PRs nuevos no se aprueban
con `<Sheet>` directo + header artesanal.

### 2026-04-30 — Sprint 2 mergeado

4 drawers de detalle migrados a `<DetailDrawer>`:

- `<OrderDetail>` (Ventas) — header con folio + fecha + acción "Imprimir"
  via `useTriggerPrint()`. Bug colateral fixed: el botón Imprimir
  estaba duplicado en el header artesanal (líneas 64-73 idénticas).
- `<CorteDetail>` (Cortes) — header con corte_nombre + caja + horario,
  acciones "Cerrar Corte" (state-machine: solo si `estaAbierto`) +
  "Marbete" (print). Print-only logo strip preservado como hijo del
  drawer (antes del content). Modales internos (`RegistrarMovimientoDialog`,
  `VoucherLightbox`) ahora son hijos del `<DetailDrawer>` directamente,
  no del `<SheetContent>`.
- `<DocumentoDetailSheet>` (Documentos) — header dinámico (cambia
  título cuando `editing=true`), acciones condicionales (Procesar IA +
  Editar + Eliminar admin-only) que se ocultan en modo edit. Dialog de
  delete confirm queda como sibling del `<DetailDrawer>` (antes era hijo
  del `<SheetContent>`).
- OC drawer en `app/rdb/ordenes-compra/page.tsx` — header con folio +
  proveedor + fecha + req, acción "Imprimir OC" con guard de proveedor
  asignado. Footer con acciones operativas (Asignar proveedor, Marcar
  Enviada, Recibir, Cerrar) queda inline como antes — no usa `footer`
  prop porque depende del state-machine y necesita scroll junto con el
  content.

Convenciones aplicadas: `useTriggerPrint()` reemplaza `window.print()`
inline (P5 de ADR-021). `<ScrollArea>` artesanal eliminado en cada
caller. Print stylesheets de los drawers heredan DD5 por default.

Sprint 3 cubrirá los drawers restantes (`<TasksUpdatesSheet>`,
`<NuevaEmpresaDrawer>`, `<DocumentoCreateSheet>`).

PR: pendiente.

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
