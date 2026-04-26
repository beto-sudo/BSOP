# Iniciativa — Detail Page anatomy (`[id]`)

**Slug:** `detail-page`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-04-26
**Última actualización:** 2026-04-26

> **Bloqueada hasta cierre de `action-feedback`.** Alcance v1 detallado
> se cierra cuando arranque su turno.

## Problema

ADR-004 fija anatomía para páginas tabulares de módulo (`<ModulePage>`),
pero explícitamente excluye no-tabulares. Las páginas de detalle
(`/<modulo>/[id]`, ej. `/dilesa/terrenos/[id]`, `/rdb/cortes/[id]`,
una venta abierta) están sin convención: cada módulo decide su propio
header, distribución de meta, ubicación de tabs internos, drawer vs
página completa.

Síntomas anticipables:

- Drawers de detalle (Ventas) y páginas de detalle (probable
  Terrenos en `dilesa-ui-terrenos`) coexisten sin regla de cuándo
  usar cada uno.
- Header de detalle inconsistente: a veces breadcrumb, a veces back
  button, a veces título grande, a veces compacto con meta inline.
- Tabs internos de detalle varían: pills vs underline (R4 de ADR-004
  dice underline para módulos, ¿aplica a detalles?).

## Outcome esperado

- Anatomía canónica para páginas de detalle: header (back + título +
  meta + acciones), tabs internos opcionales, content.
- Decisión clara: ¿drawer o página? Criterio simple por tamaño/complejidad.
- Componente `<DetailPage>` compartido (paralelo a `<ModulePage>`).
- ADR documentando el patrón.

## Alcance v1 (tentativo — refinar al arrancar)

- [ ] Auditoría de páginas de detalle existentes (Cortes, Movimientos,
      Levantamientos, próximamente Terrenos).
- [ ] Componente `<DetailPage>` con slots: header, meta strip, tabs,
      content, actions.
- [ ] Regla drawer vs página: criterio por densidad de info y
      profundidad de navegación.
- [ ] Migrar 1-2 detalles existentes como prueba.
- [ ] ADR documentando.

## Fuera de alcance

- Vistas tipo timeline / activity log para entidades. Eso es feature
  de producto, no anatomy.
- Edición inline en el header (rename click-to-edit). Patrón aparte.

## Métricas de éxito

- Páginas de detalle usan `<DetailPage>` o tienen ADR de excepción.
- Decisión drawer-vs-page documentada en review checklist.

## Riesgos / preguntas abiertas

- [ ] Reusar `<ModuleTabs>` (underline) en detail tabs — ¿genera
      ambigüedad con tabs del módulo padre? (Ojo con ADR-005.)
- [ ] Mobile: detalles full-screen vs drawer modal. Coordinar con
      `responsive-policy`.
- [ ] ¿`<DetailPage>` necesita su propio routing layout (similar a
      ADR-005) cuando hay tabs internos con sub-rutas?

## Sprints / hitos

_(se llena cuando arranque ejecución, vía Claude Code)_

## Decisiones registradas

_(append-only, fechadas — escrito por Claude Code)_

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_
