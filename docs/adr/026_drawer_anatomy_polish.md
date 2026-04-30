# ADR-026 — Anatomía de drawers · Polish (DD7-DD11)

- **Status**: Accepted
- **Date**: 2026-04-30
- **Authors**: Beto, Claude Code (iniciativa `drawer-anatomy-polish`)
- **Companion to**: [ADR-018](./018_drawer_anatomy.md) (DD1-DD6 base), [ADR-016](./016_forms_pattern.md) (`<FormActions>` + `useDirtyConfirm`)

---

## Contexto

ADR-018 fijó la anatomía base del `<DetailDrawer>` con DD1-DD6. Tras
cerrar `drawer-anatomy` y migrar 7 drawers core, una auditoría visual
encontró 5 fricciones que ADR-018 no cubría:

1. **Header collision X/título/actions**. El botón X (cierre) está
   absolute en `top-3 right-3`, ocupando 12-40px del borde derecho. El
   `<SheetTitle>` no reserva espacio del X — con títulos largos se
   solapa visualmente. Las `actions` tienen `mr-8` defensivo, pero
   están escondidas en mobile (`hidden sm:flex`); el usuario pierde
   funcionalidad sin aviso.

2. **Sub-secciones internas**. Cada drawer pinta sus secciones con
   espaciados ad-hoc (`space-y-4`/`space-y-6`, divisores propios). El
   doble-padding entre `<DetailDrawerContent>` y secciones internas
   produce el reflejo "quitar todo padding" → drawer pegado al borde.

3. **Loading state**. Cuando `<DetailDrawer>` abre con fetch async
   (caso típico al hacer click en un row), cada caller inventa su
   skeleton. Falta patrón estándar.

4. **Form mode**. El `footer` prop existe pero no hay convención de
   cuándo va `<FormActions>` ahí vs inline. Drawers create/edit
   duplican layout.

5. **Print en callers**. DD5 dice "por construcción", pero los callers
   siguen agregando `print:` ad-hoc en cada bloque. DD7+DD10 reducen
   ese ruido al mover el grueso al componente base.

## Decisión

5 reglas adicionales DD7-DD11 que extienden ADR-018 sin invalidarlo.
Sub-componentes nuevos: `<DetailDrawerSection>` + `<DetailDrawerSkeleton>`.

### DD7 — Header reserva espacio fijo del X

`<DetailDrawerHeader>` aplica `pr-14` (56px) por construcción al
container del header. El X de cierre ocupa 12-40px del borde derecho;
56px deja 28px de buffer + el X.

Consecuencia: el `mr-8` defensivo en actions se elimina. El título
puede crecer hasta el borde de `pr-14` sin solapamiento.

```tsx
<SheetHeader className="... px-6 pt-6 pb-4 pr-14 print:pr-6">
```

> **Por qué**: el solapamiento del X con el título o las actions es un
> bug visual cuando títulos llegan al borde derecho. Reservar el espacio
> en el contenedor en lugar de en cada hijo cierra la fuente.

### DD8 — Título line-clamp-2 break-words

`<SheetTitle>` aplica `line-clamp-2 break-words` por default. Títulos
largos cortan a 2 líneas en lugar de invadir 4+ líneas o desbordar.

```tsx
<SheetTitle className="text-base font-semibold leading-tight line-clamp-2 break-words">
  {title}
</SheetTitle>
```

> **Por qué**: títulos como "Pedido #ABC-12345 · Cliente largo" o
> "Editar Documento Legal · Acta Constitutiva" pueden romper el layout
> si crecen sin límite. 2 líneas es el techo razonable para un drawer.

### DD9 — Mobile actions stack vertical

Actions del header cambian de `hidden sm:flex` a layout responsive
visible:

```tsx
<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
  <div className="min-w-0 flex-1 space-y-1">{/* title + description + meta */}</div>
  {actions ? (
    <div className="shrink-0 flex flex-wrap items-center gap-2 print:hidden">{actions}</div>
  ) : null}
</div>
```

En mobile (<640px): título arriba, actions abajo en flex-row con
flex-wrap. En desktop: inline a la derecha del título.

> **Por qué**: esconder actions en mobile rompe funcionalidad (Imprimir,
> Editar, Cerrar Corte). Stack vertical preserva todo.

### DD10 — `<DetailDrawerSection>` canónico

Sub-componente para sub-secciones internas:

```tsx
<DetailDrawerSection title="Pagos" description="Movimientos del corte">
  <div>...</div>
</DetailDrawerSection>
```

Props:

- `title?: string` — heading de la sección (h3 implícito).
- `description?: string` — texto pequeño debajo.
- `divider?: boolean` — default `true` después del primero. Aplica `pt-4 border-t`.
- `padding?: 'default' | 'none'` — default `'default'` (`px-0` ya viene
  del wrapper; el padding interno aplica solo a la separación entre
  secciones).
- `className?: string`.

Espaciado canónico: `mt-4` entre secciones, `pt-4 border-t border-[var(--border)]`
cuando `divider`. Title con `text-sm font-semibold mb-2`.

> **Por qué**: 6+ drawers reinventan secciones internas con
> `space-y-4`/`space-y-6` + `<h3>` ad-hoc + divisores manuales. El
> componente lo consolida y elimina la causa del doble-padding.

### DD11 — `<DetailDrawerSkeleton>` para loading state

Sub-componente que rendea placeholder shimmer dentro del body:

```tsx
{
  loading ? <DetailDrawerSkeleton /> : <DetailDrawerContent>...</DetailDrawerContent>;
}
```

Layout: 3 stat cards arriba (grid-cols-3), 4 líneas de texto, una
sub-sección con título + 5 rows. Todo con `bg-muted/40` + animate-pulse.

No replica el header — el caller pasa `title` ya conocido (del row
clickeado).

> **Por qué**: cada drawer reinventa loading state (algunos con
> skeleton, otros con spinner, otros con nada). Un patrón canónico
> reduce ruido visual entre drawers.

## Form mode idiomático

ADR-018 DD4 ya cubre footer sticky. Esta iniciativa formaliza el
patrón cuando el drawer contiene un `<Form>`:

```tsx
<DetailDrawer
  open={open}
  onOpenChange={(v) => (v ? setOpen(true) : requestClose())}
  title="Editar empleado"
  size="lg"
  footer={<FormActions onCancel={requestClose} />}
>
  {confirmDialog}
  <DetailDrawerContent>
    <Form form={form} onSubmit={onSubmit}>
      <DetailDrawerSection title="Datos personales">...</DetailDrawerSection>
      <DetailDrawerSection title="Compensación">...</DetailDrawerSection>
    </Form>
  </DetailDrawerContent>
</DetailDrawer>
```

- `<FormActions>` (ADR-016 F4) en el `footer` prop, sticky.
- `<DetailDrawerSection>` por sub-grupo del form.
- `useDirtyConfirm` (ADR-016 F6 ↔ DD6) en `onOpenChange`.

## A11y

Sin cambios respecto a ADR-018. `<SheetTitle>` con `line-clamp-2`
preserva el aria-labelledby (el texto truncado visualmente sigue
completo en el DOM).

## Implementación

- **Sprint 1** (este PR): foundation — fix `<DetailDrawerHeader>`
  (DD7+DD8+DD9), nuevos `<DetailDrawerSection>` (DD10) y
  `<DetailDrawerSkeleton>` (DD11), ADR-026, golden re-aplicación a
  `<StockDetailDrawer>`.
- **Sprint 2**: aplicar a 7 drawers core ya migrados.
- **Sprint 3**: migrar las "excepciones documentadas" en
  `drawer-anatomy` v1 (DILESA, Settings, Productos, Requisiciones,
  Proveedores, RH, Tasks create/edit, Juntas list/detail).
- **Sprint 4**: cierre.

## Consecuencias

### Positivas

- **Cero solapamientos del X**: DD7+DD8 cierran el bug visual reportado.
- **Mobile-friendly por default**: DD9 mantiene actions visibles.
- **Sub-secciones idiomáticas**: DD10 elimina espaciados artesanales.
- **Loading state canónico**: DD11 reduce ruido entre drawers.
- **Form mode formalizado**: convención clara para drawers create/edit.

### Negativas

- **Re-aplicación a drawers ya migrados**: Sprint 2 toca 7 drawers core
  que ya cumplían DD1-DD6 — adoptar Section/Skeleton es opt-in pero el
  fix DD7-DD9 es automático (lo hereda el componente base).
- **Migrar las excepciones de v1**: contradice el "se actualizan cuando
  se toquen por feature work" original. Costo: ~13 archivos. Beneficio:
  cierra el patrón end-to-end.

### Cosas que NO cambian

- ADR-018 DD1-DD6 — todas siguen válidas.
- ADR-009 D2 (drawer-vs-página).
- shadcn `<Sheet>` primitives.

## Fuera de alcance v1

- **URL state / deep-link** (`?detail=<id>`). Cambio mayor que toca
  routing en cada page. Sale como sub-iniciativa si emerge.
- **Drawer con sub-tabs internos**. Sigue postergado de v1.
- **Skeleton del header**. No hay caso real en el repo (el caller
  siempre conoce el `title` del row clickeado).
- **Nested drawers**. Print logic ya cuenta con `PRINT_SHEET_COUNT_ATTR`.

## Referencias

- Componente: [components/detail-page/detail-drawer.tsx](../../components/detail-page/detail-drawer.tsx)
- Iniciativa: [docs/planning/drawer-anatomy-polish.md](../planning/drawer-anatomy-polish.md)
- ADR-018 — DD1-DD6 base.
- ADR-016 — `<FormActions>` + `useDirtyConfirm`.
- ADR-009 — criterio drawer-vs-página.
