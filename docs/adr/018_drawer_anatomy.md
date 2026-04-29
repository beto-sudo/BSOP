# ADR-018 — Anatomía de drawers (`<DetailDrawer>`)

- **Status**: Accepted
- **Date**: 2026-04-29
- **Authors**: Beto, Claude Code (iniciativa `drawer-anatomy`)
- **Companion to**: [ADR-009](./009_detail_page.md) (`<DetailPage>` para páginas), [ADR-016](./016_forms_pattern.md) (`<Form>` + `useDirtyConfirm`)

---

## Contexto

ADR-009 D2 fija drawer-vs-página como decisión binaria. Pero solo gobierna **cuándo** usar drawer; no fija la **anatomía** del drawer en sí. Auditoría de drawers existentes:

- `<StockDetailDrawer>` (Inventario) — sheet `sm:max-w-[600px]`, `<SheetHeader>` con title + description + acción imprimir flotando absolute, `<ScrollArea>` con `h-[calc(100vh-8rem)]`.
- `<OrderDetail>` (Ventas) — sheet, header con folio + meta inline.
- `<CorteDetail>` (Cortes) — sheet, header + secciones de pagos/movimientos/vouchers.
- `<DocumentoDetailSheet>` (Documentos) — sheet `sm:max-w-[640px]`, `<SheetHeader>` + acciones absolute + `<ScrollArea flex-1 min-h-0>`.
- `<TasksUpdatesSheet>`, `<DocumentoCreateSheet>`, etc.

Síntomas observables:

- **Header inconsistente**: a veces `<SheetHeader>`, a veces `<div>` artesanal con title + meta + actions inline. La X de cerrar es nativa de `<SheetContent>` pero algunos drawers ponen acciones absolute para no chocar.
- **Scroll**: a veces `<ScrollArea h-[calc(100vh-8rem)]>` (alto fijo), a veces `<ScrollArea flex-1 min-h-0>` (flexible). El primero rompe en pantallas chicas; el segundo solo funciona si `<SheetContent>` es `flex flex-col`.
- **Padding**: `pr-1`, `pr-4`, `p-6`, `pb-6`, `pt-2` — disperso.
- **Footer sticky**: ausente en la mayoría. Cuando hay acciones de save/cancel (forms-pattern), terminan en línea con el contenido y se pierden al scrollear.
- **Print stylesheet**: solo `<StockDetailDrawer>` y `<DocumentoDetailSheet>` lo manejan; el resto imprime mal.

ADR-009 ya cubre páginas (`<DetailPage>`), ADR-016 ya cubre forms (`<Form>` + `<FormActions>` + `useDirtyConfirm`). Falta el wrapper para "drawer de detalle/edit".

## Decisión

Componente `<DetailDrawer>` en `components/detail-page/` (junto a `<DetailPage>`). Anatomía canónica:

```
DetailDrawer (Sheet, side="right")
├── DetailDrawerHeader  (title + description + meta + actions)
├── DetailDrawerContent (scrollable, fills available height)
└── DetailDrawerFooter  (sticky, optional)
```

API ergonómica: el caller pasa `title`/`description`/`meta`/`actions`/`footer` directamente al `<DetailDrawer>`; los sub-componentes están exportados para usos avanzados (drawer con sub-tabs internos, etc.).

```tsx
<DetailDrawer
  open={open}
  onOpenChange={setOpen}
  title={item.nombre}
  description={`${item.categoria} · ${item.unidad}`}
  meta={<Badge tone="warning">Bajo mínimo</Badge>}
  actions={<Button onClick={() => window.print()}>Imprimir</Button>}
>
  <DetailDrawerContent>...sections...</DetailDrawerContent>
</DetailDrawer>
```

### Las 6 reglas (DD1–DD6)

#### DD1 — Side `"right"` por default; `size` semántico (sm/md/lg/xl)

`<DetailDrawer side>` default `"right"`. Override solo cuando hay justificación visual (rara en este repo). `size` mapea a max-width semántico:

- `sm` → `sm:max-w-md` (~28rem) — drawer chico (forms simples).
- `md` → `sm:max-w-[600px]` (default) — drawer estándar (detail con KPIs + lista).
- `lg` → `sm:max-w-[800px]` — drawer grande (admin panels, settings).
- `xl` → `sm:max-w-[1000px]` — drawer hero (dashboards embebidos).

> **Por qué**: tamaños arbitrarios (`sm:max-w-[640px]`, `sm:max-w-[700px]`, `sm:max-w-[2xl]`) crean drift visual. 4 sizes cubren el repo entero; cuando emergencia un caso fuera de ese rango, se documenta como excepción.

#### DD2 — Header sticky con anatomía 4-slot: `title + description + meta + actions`

`<DetailDrawerHeader>` rendea:

- **`title`** — obligatorio, semántico `<SheetTitle>` (h2 implícito en shadcn).
- **`description`** — opcional, `<SheetDescription>` debajo del título (texto pequeño + muted).
- **`meta`** — opcional, badges/dates abajo de description.
- **`actions`** — opcional, top-right alineado, esconde la X nativa visualmente con `mr-8` para no colisionar.

Header tiene `border-b border-[var(--border)]` que separa visualmente del content scrolleable.

> **Por qué**: la X nativa de `<SheetContent>` no se puede mover; las acciones del caller necesitan espacio. `mr-8` reserva el espacio. Header sticky (queda visible al scroll) mantiene el contexto del drawer.

#### DD3 — Content fills el espacio entre header y footer; `<ScrollArea>` por default

`<DetailDrawerContent>` envuelve el contenido en `<ScrollArea>` con `h-full print:h-auto`. Combinado con `<SheetContent flex flex-col>`, el header y footer quedan sticky mientras el body scrollea sin alto fijo (`h-[calc(100vh-8rem)]` ya no es necesario).

`scroll={false}` permite desactivar para drawers que ya scrollean internamente (e.g. drawer con sub-tabs lazy-loaded).

> **Por qué**: alto fijo `calc(100vh-Nrem)` falla en mobile keyboard / status bar / split-screen. Layout flex-column con scroll solo en el child es más robusto.

#### DD4 — Footer sticky opcional para acciones primarias

Pasar `footer` al `<DetailDrawer>` rendea un `<div border-t px-6 py-3 print:hidden>` debajo del content. Es donde van los `<FormActions>` (ADR-016 F5) cuando el drawer tiene un form.

```tsx
<DetailDrawer ... footer={<FormActions onCancel={onClose} />}>
  <DetailDrawerContent>
    <Form form={form} onSubmit={...}>...fields...</Form>
  </DetailDrawerContent>
</DetailDrawer>
```

> **Por qué**: acciones de save/cancel tienen que estar siempre visibles (no scrollearse). El footer sticky cumple esa función + se imprime con `print:hidden` (no tiene sentido imprimir botones).

#### DD5 — Print stylesheet por construcción

`<DetailDrawer>` aplica `print:max-w-full print:p-0`. `<DetailDrawerHeader>` aplica `print:px-0 print:pt-0 print:border-0 print:hidden` para acciones. `<DetailDrawerContent>` desactiva el `<ScrollArea>` con `print:h-auto`. `<DetailDrawerFooter>` se oculta entero con `print:hidden`.

> **Por qué**: el patrón "drawer imprimible" ya lo necesitan `<StockDetailDrawer>` (kardex) y `<DocumentoDetailSheet>` (PDF). Centralizarlo evita que cada drawer lo redescubra (o lo olvide).

#### DD6 — Dirty confirm via `useDirtyConfirm` cuando el drawer tiene un form

Si el drawer contiene un `<Form>` con state, el `onOpenChange` del `<DetailDrawer>` debe pasar por `requestClose()` de `useDirtyConfirm` (ADR-016 F6):

```tsx
const { requestClose, confirmDialog } = useDirtyConfirm({
  isDirty: form.formState.isDirty,
  onConfirmClose: () => setOpen(false),
});

<DetailDrawer open={open} onOpenChange={(v) => (v ? setOpen(true) : requestClose())}>
  {confirmDialog}
  ...
</DetailDrawer>;
```

`<DetailDrawer>` no integra el dirty-check internamente porque solo conoce su `open`; el form state lo conoce el caller.

> **Por qué**: API minimalista. El cruce drawer↔form lo hace el caller pero con un patrón estándar (no inventa el suyo).

### A11y mínimo

- `<SheetTitle>` y `<SheetDescription>` shadcn ya proveen aria-labelledby/aria-describedby al diálogo.
- X nativa de `<SheetContent>` con `aria-label="Close"` (default shadcn).
- Focus trap activo mientras el drawer está abierto (default shadcn/Radix).
- ESC y click fuera cierran el drawer (default shadcn).

## Implementación

- **Sprint 1** (este PR): foundation — `components/detail-page/detail-drawer.tsx` con los 4 componentes + index export. ADR-018. Migrar `<StockDetailDrawer>` (Inventario) como golden — ya tenía print stylesheet manual y header artesanal con acciones absolute.
- **Sprint 2+**: migrar drawers existentes uno por uno. Targets en orden: `<DocumentoDetailSheet>`, `<DocumentoCreateSheet>`, `<OrderDetail>`, `<CorteDetail>`, `<TasksUpdatesSheet>`, `<NuevaEmpresaDrawer>`, etc. PRs nuevos no se aprueban con `<Sheet>` directo.
- **Sprint final**: cierre de iniciativa cuando los drawers identificados estén migrados.

## Consecuencias

### Positivas

- **Anatomía consistente**: todos los drawers tienen el mismo header/content/footer + scroll + print behavior.
- **Time-to-build**: drawer nuevo se arma en ~15 líneas de JSX (vs ~50 con `<Sheet>` + `<SheetHeader>` + `<ScrollArea h-calc(...)>` + acciones absolute).
- **Print por default**: todos los drawers heredan stylesheet de impresión.
- **Sizes semánticos**: `size="md"` reemplaza `sm:max-w-[600px]` literal — cambiar el "md size" se hace en un lugar.

### Negativas

- **Coexistencia con `<Sheet>` directo** durante la migración (≈12+ drawers). Lo mismo que pasó con `<DataTable>` (ADR-010 DT8) — deprecación incremental.
- **`useDirtyConfirm` es opt-in** (DD6). Drawers viejos sin form no lo necesitan; drawers con form que olvidan integrarlo pierden la confirmación. Code review chequea.

### Cosas que NO cambian

- ADR-009 D2 (drawer-vs-página) — el criterio sigue válido.
- shadcn `<Sheet>` y `<SheetContent>` — primitives intactas; `<DetailDrawer>` los wrappea.
- Drawers excepción de ADR-009 D5 (state-machine UIs) — siguen sin migrar; documentado en JSDoc del archivo.

## Fuera de alcance v1

- **Mobile bottom sheet** (drawer que sale desde abajo en mobile). El default `side="right"` cubre 95% del repo. Si surge caso real, se evalúa.
- **Drawer con sub-tabs internos** (similar a `<DetailPage>` D3). Si surge, sale como `<DetailDrawerTabs>` aparte; no inventamos hoy.
- **Inline-edit del title** (rename click-to-edit). Postergable.
- **Animaciones custom** de apertura. Default shadcn cubre.

## Referencias

- Componente: [components/detail-page/detail-drawer.tsx](../../components/detail-page/detail-drawer.tsx)
- Iniciativa: [docs/planning/drawer-anatomy.md](../planning/drawer-anatomy.md)
- ADR-009 — `<DetailPage>` (criterio drawer-vs-página).
- ADR-016 — `<Form>` + `useDirtyConfirm` (DD6 referencia).
- ADR-010 — modelo de migración incremental (DT8).
