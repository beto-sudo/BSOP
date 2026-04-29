# Iniciativa — Print pattern (stylesheets + page layout)

**Slug:** `print-pattern`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** done
**Dueño:** Beto
**Creada:** 2026-04-27
**Última actualización:** 2026-04-30 (cierre)

## Problema

Múltiples módulos imprimen documentos pero cada uno hace su propia
implementación de print. 213 usos de `print:` Tailwind distribuidos
en ~10 archivos. Sin convención de tamaño de papel, page breaks no
controlados, headers/footers inconsistentes.

## Outcome esperado

- Componente `<PrintLayout>` con header/footer convencionales.
- Tamaños de papel canónicos.
- Helper `useTriggerPrint()` para `window.print()`.
- `print:` Tailwind utilities documentadas.
- ADR fijando reglas.

## Alcance v1 (cerrado 2026-04-29 — ver ADR-021)

- [x] `<PrintLayout>` + `<PrintLayoutHeader>` + `<PrintLayoutFooter>` en `components/print/`.
- [x] `useTriggerPrint()` hook.
- [x] 4 sizes canónicos: `letter`/`a4`/`label-58mm`/`label-80mm`.
- [x] ADR-021 con 5 reglas (P1-P5) + checklist.
- [ ] Migración de printables existentes — Sprint 2+ (incremental, al tocarse).

## Decisiones tomadas al cerrar alcance

- **Tailwind `print:` como base** (P1) — codifica lo que ya hacen 213 usos
  del patrón. CSS modules nuevos descartados.
- **4 sizes canónicos** (P2) — cubren los casos del repo (carta, A4, 2
  etiquetas térmicas).
- **`@page` rules globales no inyectadas en v1** — el `size` prop es
  informativo via `data-print-size`. Si surge necesidad real, se inyecta.
- **Sin migración masiva** — adopción incremental al tocar cada printable.
- **Sin page numbering automático** — postergable; nadie lo pide hoy.

## Fuera de alcance v1

- **PDF server-side** (jsPDF, Puppeteer).
- **Email de PDFs**.
- **Print preview personalizado**.
- **Page numbering automático** (X de Y).
- **`@page` rules globales** repetidas en cada página.

## Métricas de éxito

- Cero stylesheets `@media print` ad-hoc en módulos nuevos.
- Componentes nuevos imprimibles usan `<PrintLayout>` y `useTriggerPrint`.
- Documentos imprimen idénticamente (mismo size + headers + footers) por tipo.

## Sprints / hitos

| #   | Sprint                                                           | Estado | PR   |
| --- | ---------------------------------------------------------------- | ------ | ---- |
| 1   | Foundation + ADR-021 + helpers                                   | done   | #311 |
| 2   | Migrar `window.print()` callsites a `useTriggerPrint()` + cierre | done   | TBD  |

## Decisiones registradas

### 2026-04-29 · ADR-021 — Print pattern (Sprint 1)

Codificado en [ADR-021](../adr/021_print_pattern.md). Las 5 reglas:

- **P1** — Tailwind `print:` utilities como base; sin CSS modules nuevos.
- **P2** — Tamaños de papel canónicos: `letter` / `a4` / `label-58mm` / `label-80mm`.
- **P3** — Print-only header/footer via slots; screen-only UI con `print:hidden`.
- **P4** — Page breaks via `break-before-page` / `break-after-page` / `break-inside-avoid`.
- **P5** — Trigger via `useTriggerPrint()`; nunca `window.print()` directo en JSX.

## Bitácora

### 2026-04-30 — Sprint 2 mergeado (cierre)

Migración de **7 callsites** de `window.print()` directo a
`useTriggerPrint()` (P5 ADR-021):

- `app/rdb/requisiciones/page.tsx` — 2 botones Imprimir (existing + new
  request sheets).
- `app/rdb/inventario/levantamientos/[id]/reporte/page.tsx` — auto-print
  setTimeout 400ms + botón manual.
- `components/rh/empleado-contrato-module.tsx` — botón "Imprimir contrato".
- `components/rh/empleado-finiquito-module.tsx` — botón "Imprimir finiquito".
- `components/proveedores/proveedores-module.tsx` — botón Imprimir en
  detail sheet.
- `components/inventario/stock-detail-drawer.tsx` — botón Imprimir
  (legacy del Sprint 1 de drawer-anatomy, ahora consistente).

Cero callsites con `window.print()` directo en el repo (excepto
JSDoc/comments). El hook `useTriggerPrint()` queda como punto único de
extensión (futuro: callbacks `onBefore`/`onAfter`, fallback en browsers
sin print, telemetry).

**Printables existentes (`<ContratoPrintable>`, `<FiniquitoPrintable>`,
`marbete-conciliacion`)** NO se wrappearon en `<PrintLayout>`: ya cumplen
P1 (Tailwind `print:` utilities) + P3 (print-only via `hidden print:block`)

- P4 (page breaks donde aplica). Wrap a `<PrintLayout>` queda como
  follow-up cuando se necesite header/footer estándar repetido por página
  o cambio de `size` semántico — ningún caso real hoy.

**Outcome final**:

- ADR-021 con 5 reglas (P1-P5).
- `<PrintLayout>` + `<PrintLayoutHeader>` + `<PrintLayoutFooter>` + 4 sizes canónicos.
- `useTriggerPrint()` hook SSR-safe.
- 7 callsites migrados a `useTriggerPrint()` + cero `window.print()` directo.
- 213 usos de `print:` Tailwind preservados (cumplen P1 implícito).

### 2026-04-29 — Sprint 1 mergeado

Foundation:

- `components/print/print-layout.tsx` — `<PrintLayout>` + `<PrintLayoutHeader>` + `<PrintLayoutFooter>` con 4 sizes canónicos.
- `components/print/use-trigger-print.ts` — hook SSR-safe wrappeando `window.print()`.
- `components/print/index.ts` — barrel export.
- ADR-021 con 5 reglas (P1-P5) + checklist para code review.

Sin migración masiva: los 213 usos de `print:` Tailwind existentes siguen
funcionando. Adopción de `<PrintLayout>` es incremental — printables
nuevos lo usan; los viejos se actualizan al tocarse por feature work.

PR: pendiente.
