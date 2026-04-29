# ADR-021 — Print pattern (`<PrintLayout>` + Tailwind `print:` utilities)

- **Status**: Accepted
- **Date**: 2026-04-29
- **Authors**: Beto, Claude Code (iniciativa `print-pattern`)
- **Related**: [ADR-010](./010_data_table.md), [ADR-018](./018_drawer_anatomy.md), [ADR-019](./019_responsive_policy.md), [ADR-020](./020_a11y_baseline.md)

---

## Contexto

El repo BSOP imprime varios tipos de documentos:

- **Cortes / marbete** (`components/cortes/marbete-conciliacion.tsx`).
- **RH / contrato** (`components/rh/contrato-printable.tsx`).
- **RH / finiquito** (`components/rh/finiquito-printable.tsx`).
- **Inventario / kardex** (drawer en `<StockDetailDrawer>`).
- **Levantamientos / reporte de diferencias** (`app/rdb/inventario/levantamientos/[id]/reporte/page.tsx`).
- **Ordenes de compra**, **requisiciones** (header de impresión).
- **Documento legal** (`<DocumentoDetailSheet>` con membrete impreso).

Cada uno hace su propia implementación. El audit muestra **213 usos de `print:` Tailwind** distribuidos en ~10 archivos. Patrones detectados:

- ✅ `print:hidden` para ocultar UI no-imprimible (botones, filters, scroll bars).
- ✅ `print:p-0` / `print:max-w-full` para que el contenido use el ancho completo.
- ✅ Headers de membrete por empresa (logos `<img src="/brand/<empresa>/header-email.png">` con `hidden print:block`).
- ⚠️ **Sin convención de tamaño de papel** — algunos asumen carta, otros A4, otros etiqueta térmica. El browser usa lo que el usuario tenga configurado.
- ⚠️ **Page breaks no controlados** — tablas largas se cortan en medio de filas.
- ⚠️ **Headers/footers de página repetidos** — solo aparecen en la primera página; lo correcto sería que se repitieran via `@page` rules.

ADR-010 DT3 ya cubrió el print stylesheet de `<DataTable>` (revierte sticky, density, etc.). ADR-018 DD5 cubrió el de `<DetailDrawer>` (max-w-full, hidden footer). Falta el ADR umbrella para "documentos imprimibles" que codifique el patrón general.

## Decisión

Componente `<PrintLayout>` en `components/print/` para envolver superficies imprimibles. Hook `useTriggerPrint()` como wrapper de `window.print()`. Las 5 reglas (P1-P5) codifican convenciones del patrón Tailwind `print:`.

API minimalista:

```tsx
<PrintLayout
  size="letter"
  header={<img src="/brand/dilesa/header-email.png" alt="DILESA" />}
  footer={<small>DILESA · Contrato individual de trabajo</small>}
>
  <h1>Contrato</h1>
  ...
</PrintLayout>
```

### Las 5 reglas (P1–P5)

#### P1 — Tailwind `print:` utilities como base; sin CSS modules nuevos

Toda la lógica de impresión vive en clases `print:` inline. No se introducen nuevos CSS modules ni archivos `.css` para print.

```tsx
<div className="hidden print:block">{/* solo imprime */}</div>
<button className="print:hidden">{/* solo en pantalla */}</button>
<table className="text-sm print:text-xs">{/* shrink al imprimir */}</table>
```

> **Por qué**: el repo ya tiene 213 usos del patrón. Codificarlo es elegir lo que ya funciona vs introducir un sistema nuevo. CSS modules globales obligan a navegar entre archivos para entender un componente; `print:` inline mantiene contexto.

#### P2 — Tamaños de papel canónicos: `letter` / `a4` / `label-58mm` / `label-80mm`

`<PrintLayout size>` acepta:

- **`letter`** (default) — 8.5×11", la mayoría de los documentos en MX.
- **`a4`** — para reportes corporativos formales (raro en el repo, pero soportado).
- **`label-58mm`** y **`label-80mm`** — etiquetas térmicas para marbetes/QR.

El componente aplica `data-print-size` y reglas globales de `@page` (futuro — v1 confía en el default del browser; el atributo permite hookear `@page { size: letter; }` cuando se requiera).

> **Por qué**: 4 tamaños cubren los casos del repo. Tamaños arbitrarios (`5×7"`, `legal`) emergen rara vez; cuando aparezca, se evalúa.

#### P3 — Print-only header/footer via slots; screen-only UI con `print:hidden`

El `<PrintLayout header>` y `<PrintLayout footer>` solo se renderizan al imprimir (`hidden print:block`). El contenido normal del page sigue visible en pantalla.

Patrón inverso: cualquier UI que no debe imprimirse (toolbars, botones, filtros, drawers laterales) recibe `print:hidden`. ADR-010 DT3 y ADR-018 DD5 ya aplican esto.

> **Por qué**: el header del documento (membrete, fecha, empresa) lo necesita el papel; la toolbar lo necesita la pantalla. Slots dedicados evitan que el caller arme `<header className="hidden print:block">` cada vez.

#### P4 — Page breaks via `break-before-page` / `break-after-page` / `break-inside-avoid`

Tailwind expone:

- `break-before-page` — fuerza salto antes del elemento.
- `break-after-page` — fuerza salto después.
- `break-inside-avoid` — el elemento no se parte entre páginas (ideal para filas de tabla, secciones, tarjetas).

Para tablas largas, agregar `print:break-inside-avoid` en `<tr>` (o en el row wrapper si es virtualizado). Para forzar nueva página por sección, `print:break-before-page` en el `<section>`.

> **Por qué**: el browser corta cualquier elemento por default donde caiga el corte de página. Sin reglas explícitas, una fila de 3 líneas puede partirse a la mitad. `break-inside-avoid` lo previene en el lugar donde tiene sentido.

#### P5 — Trigger via `useTriggerPrint()`; nunca `window.print()` directo en JSX

```tsx
const triggerPrint = useTriggerPrint();
<Button onClick={triggerPrint}>Imprimir</Button>;
```

El hook envuelve `window.print()` para SSR-safety + para tener un punto único de extensión (futuro: callbacks `onBefore`/`onAfter`, fallback en browsers sin print).

> **Por qué**: minimalismo hoy con espacio para crecer mañana sin romper callsites.

### Print stylesheet checklist (referencia para code review)

Componentes nuevos imprimibles:

- [ ] Wrappear en `<PrintLayout>` con `size` apropiado.
- [ ] UI no-imprimible (botones, filters) con `print:hidden`.
- [ ] Header/footer del documento via `header`/`footer` props.
- [ ] Tablas largas: `print:break-inside-avoid` en filas.
- [ ] Imágenes con `alt` (también se imprime — el alt no, pero en accessible PDFs sí).
- [ ] Trigger via `useTriggerPrint()`, no `window.print()` inline.

### A11y mínimo

- `<PrintLayout>` rendea como `<article>` semántico — screen readers (que también soportan PDF accessibility) tratan el contenido como una unidad.
- `print:` utilities preservan estructura semántica (h1/h2/etc.); no esconden con `display: none` el contenido principal.

## Implementación

- **Sprint 1** (este PR): foundation — `components/print/print-layout.tsx` + `components/print/use-trigger-print.ts` + index. ADR-021. Sin migración masiva — los printables existentes siguen como están y se actualizan al tocarse.
- **Sprint 2+** (postponed): migrar `<ContratoPrintable>`, `<FiniquitoPrintable>`, `marbete-conciliacion` como golden paths. Adoptar `<PrintLayout>` cuando se toquen por feature work.

## Consecuencias

### Positivas

- **Anatomía consistente** para superficies imprimibles nuevas.
- **Tamaños semánticos** (`size="letter"`) eliminan el supuesto del default del browser.
- **`useTriggerPrint()`** es 1 línea vs `window.print()` con guards SSR cada vez.
- **Checklist explícito** para code review de printables.

### Negativas

- **Sin migración inmediata** — los 213 usos de `print:` siguen funcionando como están. Adopción de `<PrintLayout>` es opt-in cuando se toque cada printable.
- **`@page` rules globales** no se inyectan en v1 — el `size` es informativo. Si surge necesidad real de forzar tamaño (etiquetas térmicas), se agrega.

### Cosas que NO cambian

- ADR-010 DT3 (`<DataTable>` print stylesheet) — sigue válido.
- ADR-018 DD5 (`<DetailDrawer>` print stylesheet) — sigue válido.
- Componentes printable existentes (`<ContratoPrintable>`, `<FiniquitoPrintable>`, marbetes) — siguen funcionando.
- Tailwind `print:` utilities — siguen siendo el mecanismo principal.

## Fuera de alcance v1

- **PDF generation server-side** (jsPDF, Puppeteer). El print del browser cubre el repo hoy.
- **Email de PDFs** (envío automático de contratos firmados, etc.). Feature aparte.
- **Print preview personalizado**. Usar el del browser.
- **`@page` rules globales** con header/footer repetido en cada página. Postergable hasta caso real.
- **Page numbering automático** (X de Y). Postergable.

## Referencias

- Componentes: [components/print/](../../components/print/)
- Iniciativa: [docs/planning/print-pattern.md](../planning/print-pattern.md)
- ADR-010 DT3 — `<DataTable>` print stylesheet.
- ADR-018 DD5 — `<DetailDrawer>` print stylesheet.
