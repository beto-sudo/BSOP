# Iniciativa — Detail Page anatomy (`[id]`)

**Slug:** `detail-page`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-04-26
**Última actualización:** 2026-04-26 (alcance v1 cerrado al arrancar)

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

- **Fase 1 — wrapper + 2 migraciones golden de DILESA.** ⏳ **En curso (PR abierto).** Salida: `<DetailPage>` + `<DetailHeader>` + `<DetailContent>` en `components/detail-page/` + ADR-009 con 5 reglas (D1-D5) + migración de `app/dilesa/terrenos/[id]/page.tsx` y `app/dilesa/prototipos/[id]/page.tsx`. Próximo hito: Beto smoke + merge.
- **Fase 2 — `<DetailTabs>` + migración de detalles con sub-tabs.** ⏸️ Postergado. `proyectos/[id]` y `anteproyectos/[id]` tienen `?section=…` y requieren extender el wrapper con un slot `<DetailTabs>` (D3 del ADR). Sale por PR separado o adopción incremental cuando se les toque.

## Decisiones registradas

- **2026-04-26 (CC) — Alcance v1 cerrado localmente, no vía Cowork.** Mismo approach que iniciativas anteriores (filters-url-sync, action-feedback). El doc preliminar tenía un esqueleto de alcance; lo decanté tras una auditoría chica de 4-5 detail pages existentes y validé el patrón común de DILESA.
- **2026-04-26 (CC) — Solo migrar 2 detail pages en este PR (terrenos[id] + prototipos[id]).** Los 4 detail pages de DILESA tienen anatomía idéntica de header. Migrar 2 valida el patrón sin sobre-extender el blast radius. `proyectos[id]` y `anteproyectos[id]` quedan para Fase 2 porque tienen sub-tabs `?section=…` que requieren `<DetailTabs>`. `levantamientos[id]` queda como excepción consciente por D5 (state-machine UI).
- **2026-04-26 (CC) — `<DetailHeader.back>` solo acepta `onClick`, no `href`.** Inicialmente diseñé el slot para aceptar `href` con `Button asChild + Link`, pero `<Button>` del repo no soporta `asChild`. La API `{onClick, label}` es consistente con el código actual (todos los detail pages usan `router.push` directo). Si en el futuro vale la pena añadir el variant href, se hace sin breaking change.
- **2026-04-26 (CC) — Cierre de `action-feedback` y descarte de `dilesa-ui-terrenos` se bundlean en este PR.** Mismo patrón que cierres anteriores. Para `dilesa-ui-terrenos`: investigación confirmó que la branch (HEAD `9769b96`) tenía 1 commit único con scaffold inicial del 2026-04-23 que fue completamente superado por trabajo posterior en main (4339 líneas adicionales en los mismos archivos). Branch local + remota borradas en este PR; iniciativa movida a `## Done` con outcome explicativo.
- **2026-04-26 (CC) — `<DetailPage>` no captura banners ni un slot fijo entre header y content.** Los banners contextuales (errores de mutación → toast por T1, éxito de mutación → toast) ya viven en el flow ergonómico de `useActionFeedback`. Si una página de detalle necesita un banner persistente (ej. "este registro está archivado, modo solo-lectura"), lo renderiza como hijo directo entre `<DetailHeader>` y `<DetailContent>` — siguiendo el espíritu de R10 de ADR-004 sin formalizarlo como slot.

## Bitácora

- **2026-04-26 (CC)** — Fase 1 implementada. Branch `feat/ui-detail-page`. Componentes nuevos: `components/detail-page/detail-page.tsx` (wrapper `space-y-5`), `components/detail-page/detail-header.tsx` (slots `back / eyebrow / title / subtitle / meta / actions` con responsive collapse en mobile), `components/detail-page/detail-content.tsx` (pass-through), exportados desde `components/detail-page/index.ts`. Auditoría confirmó anatomía idéntica entre `terrenos/[id]`, `prototipos/[id]`, `proyectos/[id]` y `anteproyectos/[id]` de DILESA. Migraciones: `app/dilesa/terrenos/[id]/page.tsx` y `app/dilesa/prototipos/[id]/page.tsx` reemplazan el header artesanal por `<DetailPage> + <DetailHeader>` (eyebrow="DILESA · Terreno"/"DILESA · Prototipo", subtitle del clave_interna/codigo, meta con `<EtapaBadgeLarge>`, actions con botón Archivar). ADR-009 creado con 5 reglas (D1-D5), incluyendo criterio binario drawer-vs-página (D2) y excepción documentada para state-machine UIs como `levantamientos/[id]` (D5). INITIATIVES.md: `detail-page` proposed → in_progress; `action-feedback` movida a `## Done`; `dilesa-ui-terrenos` movida a `## Done` con outcome "descartada — branch borrada".
