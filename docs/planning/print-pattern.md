# Iniciativa — Print pattern (stylesheets + page layout)

**Slug:** `print-pattern`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-04-27
**Última actualización:** 2026-04-27

> **Bloqueada hasta cierre de `a11y-baseline`.** Alcance v1 detallado se
> cierra cuando arranque su turno.

## Problema

Múltiples módulos imprimen documentos pero cada uno hace su propia
implementación de print:

- Cortes: marbete impreso (entregado en `cortes-conciliacion`).
- RH: `components/rh/contrato-printable.tsx`,
  `components/rh/finiquito-printable.tsx`.
- Inventario: lista de stock con botón "Imprimir lista" (referenciado
  en ADR-004 R5 como ejemplo).
- Levantamientos: reporte de diferencias.
- Futuro: órdenes de compra, requisiciones, recibos de venta,
  facturas, expedientes de terreno.

Síntomas:

- Print stylesheets dispersos. Algunos en CSS modules, otros en
  Tailwind `print:` utilities, otros con componente "printable"
  separado del componente normal.
- Headers / footers de impresión inconsistentes: a veces hay logo
  - fecha + página, a veces nada.
- Page breaks no controlados — tablas largas se cortan en medio de
  filas.
- Tamaño de papel: a veces carta, a veces A4, sin convención.
- Print de `<DataTable>` ya respeta `@media print` por DT3 de
  ADR-010, pero el header/footer de la página completa sigue siendo
  del módulo.

## Outcome esperado

- Componente `<PrintLayout>` con header/footer convencionales (logo
  empresa, título doc, fecha emisión, página N de M).
- Convención de tamaños de papel por tipo de documento (carta para
  recibos/marbetes, A4 para reportes, etiqueta térmica para algunos
  marbetes).
- Helper para `window.print()` con preview opcional.
- `print:` Tailwind utilities documentadas: qué oculta, qué expande,
  qué fuerza page break.
- ADR documentando reglas (probable ADR-014).

## Alcance v1 (tentativo — refinar al arrancar)

- [ ] Auditar implementaciones existentes (cortes/marbete,
      rh/contrato, rh/finiquito, inventario/stock, levantamientos
      reporte).
- [ ] `<PrintLayout>` componente con slots: `header`, `content`,
      `footer`. Page numbering automático.
- [ ] Helpers de `lib/print/`: `useTriggerPrint`, page-size config.
- [ ] Migrar 2-3 printables como golden path.
- [ ] ADR documentando reglas (page break, font size mínimo,
      headers obligatorios, qué se oculta).

## Fuera de alcance

- PDF generation server-side (jsPDF, Puppeteer). Print del navegador
  es suficiente para hoy.
- Email de PDFs. Feature aparte.
- Print preview personalizado — usar el del browser.

## Métricas de éxito

- Cero stylesheets `@media print` ad-hoc en módulos nuevos.
- Marbetes/recibos imprimen idénticos visualmente desde cualquier
  módulo.
- Tablas largas (>1 página) usan page breaks correctos en filas, no
  cortan en medio.

## Riesgos / preguntas abiertas

- [ ] **Etiquetas térmicas vs papel A4/carta** — ancho de etiqueta
      varía. Probable: 2 layouts (`PrintLayout.Page` y
      `PrintLayout.Label`).
- [ ] **Logos por empresa** — ANSA, DILESA, RDB, COAGAN tienen logos
      distintos. El header del print debe seleccionar el logo
      correcto según el contexto del documento.
- [ ] **Coordinación con `<DataTable>` (DT3 de ADR-010)** — ya
      respeta print pero no sabe del page break entre filas. v1
      probable: agregar `data-print-page-break` opcional al wrapper.
- [ ] **A11y de printables** — los reportes impresos los lee gente
      con discapacidad visual también. Pasa por `a11y-baseline` v2
      probablemente.

## Sprints / hitos

_(se llena cuando arranque ejecución, vía Claude Code)_

## Decisiones registradas

_(append-only, fechadas — escrito por Claude Code)_

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_
