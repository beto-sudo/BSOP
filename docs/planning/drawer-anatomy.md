# Iniciativa — Drawer anatomy (`<DetailDrawer>`)

**Slug:** `drawer-anatomy`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-04-27
**Última actualización:** 2026-04-27

> **Bloqueada hasta cierre de `badge-system`.** Alcance v1 detallado se
> cierra cuando arranque su turno.

## Problema

ADR-009 D2 fija drawer-vs-página como decisión binaria. Pero solo
gobierna **cuándo** usar drawer; no fija la **anatomía** del drawer en
sí. Los drawers existentes son cada uno su propio diseño:

- `<OrderDetail>` (Ventas) — sheet ancho, header con folio, scroll
  natural.
- `<StockDetailDrawer>` (Inventario) — sheet, header con producto y
  almacén, secciones de KPIs y movimientos.
- `<CorteDetail>` (Cortes) — sheet, header con caja y rango, secciones
  de pagos / movimientos / vouchers.
- `<DocumentoDetailSheet>` (Documentos) — sheet, header con título y
  acciones (descargar, etc.), secciones de meta.

Síntomas observables:

- Header inconsistente: a veces título solo, a veces título + meta
  (badge, fecha, ID), a veces título + acciones inline.
- Footer: algunos tienen botones de acción persistentes, otros no.
  Si la acción está sticky abajo o si vive en el header varía.
- Padding y separación entre secciones varían.
- Cierre: la X arriba a la derecha es estándar, pero el ESC y click
  fuera no siempre se respetan igual.
- Scroll: a veces el header es sticky, a veces se scrollea con el
  contenido.

## Outcome esperado

- Componente `<DetailDrawer>` paralelo a `<DetailPage>` (ADR-009).
- Mismos slots conceptuales: `header (back-context + title + meta +
actions)`, `content (scrolleable)`, `footer (acciones persistentes
opcionales)`.
- Anatomía visual consistente: padding, header sticky, scroll del
  content, footer sticky cuando hay acciones.
- Cierre estándar: X, ESC, click fuera (con confirmación si hay
  cambios sin guardar — integrar con `forms-pattern` `useDirtyConfirm`).
- ADR documentando la anatomía (probable ADR-013).

## Alcance v1 (tentativo — refinar al arrancar)

- [ ] Componente `<DetailDrawer>` en `components/detail-page/` (junto
      a `<DetailPage>` que ya existe), o `components/drawer/` si
      conviene separar.
- [ ] `<DetailDrawerHeader>` con slots: `title`, `meta`, `actions`
      (sin `back` — el equivalente es la X de cerrar).
- [ ] `<DetailDrawerContent>` con scroll natural.
- [ ] `<DetailDrawerFooter>` opcional sticky.
- [ ] Migrar 1-2 drawers existentes como golden path: - probable: `<OrderDetail>` (más simple) - probable: `<StockDetailDrawer>` (más completo)
- [ ] ADR.

## Fuera de alcance

- Drawers de altura variable / mobile bottom sheet. Si surge caso
  real, se extiende.
- Drawers con tabs internos — eso es state-machine que se evalúa
  caso por caso (similar a D5 de ADR-009).

## Métricas de éxito

- Drawers migrados se ven idénticos en padding, header behavior,
  scroll y cierre.
- Cero `<Sheet>` directo con header artesanal en código nuevo.
- Tiempo de armar un drawer nuevo baja (medible en review: el del
  golden path debe quedar ~30 líneas de JSX vs los actuales ~100).

## Riesgos / preguntas abiertas

- [ ] **¿Reusar `<DetailHeader>` de ADR-009 o componente nuevo?**
      `<DetailHeader>` tiene `back` (router push), drawer no.
      Probable: componentes hermanos con base común, no extender.
- [ ] **Footer sticky con acciones** — coordinar con `forms-pattern`
      (acciones de save/cancel en form viven aquí).
- [ ] **Mobile**: drawer se vuelve modal full-screen. Coordinar con
      `responsive-policy`.
- [ ] **Confirmación de cierre con cambios** — integrar con
      `useDirtyConfirm` de `forms-pattern`. Si éste no salió aún,
      mantener TODO en el componente.

## Sprints / hitos

_(se llena cuando arranque ejecución, vía Claude Code)_

## Decisiones registradas

_(append-only, fechadas — escrito por Claude Code)_

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_
