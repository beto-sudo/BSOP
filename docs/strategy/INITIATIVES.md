# Iniciativas — BSOP

> Índice activo de iniciativas del repo BSOP. Para detalle de cada una,
> abre `docs/planning/<slug>.md`. Mantenido por Cowork (cuando se crea o
> cambia el alcance) y por Claude Code (cuando ejecuta y cierra hitos).
>
> **Última actualización:** 2026-04-27 (UI roadmap expand: housekeeping de `module-page` + `module-page-submodules` → done; agregadas 6 nuevas iniciativas UI en cola — `forms-pattern`, `badge-system`, `drawer-anatomy`, `print-pattern`, `file-attachments`, `activity-log-pattern`; cola UI re-ordenada con visión completa. Sprint 1.A de `proveedores-csf-ai` mergeado en [#235](https://github.com/beto-sudo/BSOP/pull/235), estado promovido a `in_progress`.)

## Convenciones

- **Slug:** `kebab-case`. Si la iniciativa toca una sola empresa, prefijá
  con `<empresa>-` (`ansa-`, `dilesa-`, `rdb-`, `coagan-`). Cross-empresa
  o convención general: sin prefijo.
- **Estado:**
  - `proposed` — idea promovida, falta cerrar alcance.
  - `planned` — alcance v1 cerrado, listo para ejecutar.
  - `in_progress` — hay PRs abiertos o trabajo en curso.
  - `blocked` — algo externo impide avanzar (ver doc de planning).
  - `done` — última fase mergeada, mantener como referencia.
- **Próximo hito:** acción concreta y accionable, no aspiracional.
- **Última actualización:** la fecha del último cambio real, no de hoy
  por hoy.

## Activas

| Iniciativa                  | Slug                       | Empresas | Schemas                     | Estado      | Próximo hito                                                                                                       | Última actualización |
| --------------------------- | -------------------------- | -------- | --------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ | -------------------- |
| Accessibility Baseline (UI) | `a11y-baseline`            | todas    | n/a (UI)                    | proposed    | Cerrar alcance v1 al arrancar (cola UI — orden en §Roadmap UI)                                                     | 2026-04-27           |
| Access Denied UX (UI)       | `access-denied-ux`         | todas    | n/a (UI)                    | proposed    | Cerrar alcance v1 al arrancar (cola UI — orden en §Roadmap UI)                                                     | 2026-04-27           |
| Activity Log pattern (UI)   | `activity-log-pattern`     | todas    | n/a (UI; consume audit_log) | proposed    | Cerrar alcance v1 al arrancar (cola UI — orden en §Roadmap UI)                                                     | 2026-04-27           |
| Analytics (BI externo)      | `analytics`                | todas    | analytics, erp, dilesa, rdb | blocked     | Sprint 0 — desbloquear export del bootstrap (Metabase + Caddy + Postgres) desde Cowork al repo Analytics           | 2026-04-25           |
| Badge system (UI)           | `badge-system`             | todas    | n/a (UI)                    | proposed    | Cerrar alcance v1 al arrancar (cola UI — orden en §Roadmap UI)                                                     | 2026-04-27           |
| Drawer anatomy (UI)         | `drawer-anatomy`           | todas    | n/a (UI)                    | proposed    | Cerrar alcance v1 al arrancar (cola UI — orden en §Roadmap UI)                                                     | 2026-04-27           |
| File attachments (UI)       | `file-attachments`         | todas    | n/a (UI)                    | proposed    | Cerrar alcance v1 al arrancar (cola UI — orden en §Roadmap UI)                                                     | 2026-04-27           |
| Forms pattern (UI)          | `forms-pattern`            | todas    | n/a (UI)                    | proposed    | Cerrar alcance v1 al arrancar — **siguiente en cola UI tras `data-table`**                                         | 2026-04-27           |
| Print pattern (UI)          | `print-pattern`            | todas    | n/a (UI)                    | proposed    | Cerrar alcance v1 al arrancar (cola UI — orden en §Roadmap UI)                                                     | 2026-04-27           |
| Proveedores · CSF AI        | `proveedores-csf-ai`       | todas    | erp                         | in_progress | Sprint 1.B — endpoint `POST /api/proveedores/extract-csf` reutilizando `lib/documentos/extraction-core` + tests    | 2026-04-27           |
| Responsive Policy (UI)      | `responsive-policy`        | todas    | n/a (UI)                    | proposed    | Cerrar alcance v1 al arrancar (cola UI — orden en §Roadmap UI)                                                     | 2026-04-27           |
| Waitry ingesta + dedup      | `rdb-waitry-ingesta-dedup` | RDB      | rdb (waitry\_\*), erp       | in_progress | Fase 2.B — fix de `compute_content_hash` (incluir `tableId`) + backfill + re-detección, fuera de horario operativo | 2026-04-26           |

## Roadmap UI (orden de ejecución secuencial)

> El roadmap UI son iniciativas con sufijo "(UI)" arriba. La cola es
> secuencial: cada una arranca cuando la anterior cierra (en `done` o,
> mínimo, última fase mergeada). El alcance v1 detallado se cierra al
> arrancar cada turno — los docs en `docs/planning/<slug>.md` tienen
> esqueleto con Problema + Outcome + Alcance tentativo para que CC
> tenga contexto.
>
> **Re-ordenamiento 2026-04-27:** después de cerrar 5 iniciativas con
> aprendizaje real del repo, se incorporan 6 nuevas y se reordena la
> cola con visión completa. `forms-pattern` sube al frente porque
> `proveedores-csf-ai` (planned, Sprint 1) probablemente trae
> formulario nuevo — si sale antes de migrarse al pattern, es churn.

### Done en este roadmap (referencia, ver §Done)

1. ~~`module-states`~~ — PR #214 mergeado.
2. ~~`filters-url-sync`~~ — PR #215 mergeado.
3. ~~`action-feedback`~~ — PR #216 mergeado.
4. ~~`detail-page`~~ — PR #217 mergeado.
5. ~~`data-table`~~ — PRs #218–#232 mergeados (~25 tablas + ADR-010 + lib/format/).

### Pendientes (orden propuesto, post-2026-04-27)

6. `forms-pattern` — `<Form>` + react-hook-form + zod. **Arranca primero** por dependencia con `proveedores-csf-ai`.
7. `badge-system` — tokens semánticos para badges; deuda dispersa.
8. `drawer-anatomy` — `<DetailDrawer>` paralelo a `<DetailPage>` (ADR-009).
9. `responsive-policy` — mobile-first vs desktop-only por módulo.
10. `a11y-baseline` — WCAG 2.1 AA mínimo. Después de forms + badges para que el audit cubra los componentes ya estandarizados.
11. `print-pattern` — `<PrintLayout>` + headers/footers + page breaks consistentes.
12. `file-attachments` — `<FileAttachments>` + signed URLs + drag-drop.
13. `activity-log-pattern` — `<ActivityLog>` para "quién cambió qué cuándo" reusable.
14. `access-denied-ux` — `<RequireAccess>` UX consistente.

## Done (referencia histórica)

| Iniciativa                           | Slug                     | Cerrada    | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Action Feedback (UI)                 | `action-feedback`        | 2026-04-26 | PR #216 mergeado. Hook `useActionFeedback` (`hooks/`) + ADR-008 con 5 reglas (T1-T5) + migración de 3 holdouts de `window.confirm` en DILESA detail pages.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Cortes / Conciliación / OCR Vouchers | `cortes-conciliacion`    | 2026-04-25 | Fases 1-6 mergeadas (PRs #176, #189, #191, #193, #194, #197, #199, #200). OCR client-side con Tesseract.js, marbete impreso, chip 📎 en movimientos, conciliación end-to-end.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Data Table compartido (UI)           | `data-table`             | 2026-04-27 | PRs #218 (paso 0), #219 (lib/format/), #220 (foundation + ADR-010 + Cortes), #221 (Ventas), #222 (Inventario stack + Productos), #223 (Compras), #224 (DILESA terrenos), #225 (RH), #226 (closeout sesión 1). Fase 2 (#228 Documentos, #229 Tasks, #230 Juntas x3, #231 DILESA proyectos/prototipos/anteproyectos, #232 Productos analisis + excepciones). Total 14 PRs, ~25 tablas migradas a `<DataTable>` + tanstack core, lib/format/ centralizado, ADR-010 con DT1-DT8. 4 excepciones permanentes documentadas en código (JSDoc): Settings/Acceso (state-machine UI) y 3 archivos Playtomic (totals row + sort externo). |
| Detail Page anatomy (UI)             | `detail-page`            | 2026-04-26 | PR #217 mergeado. `<DetailPage>` + `<DetailHeader>` + `<DetailContent>` en `components/detail-page/` + ADR-009 con 5 reglas (D1-D5) + migración de DILESA terrenos/prototipos `[id]` como golden.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| DILESA UI Terrenos                   | `dilesa-ui-terrenos`     | 2026-04-26 | Iniciativa **descartada**. Branch `feat/dilesa-ui-terrenos` (commit `9769b96` del 2026-04-23) contenía scaffold inicial superado por trabajo posterior mergeado a main vía otros PRs (anteproyectos/prototipos/proyectos crecieron 3-10x). Branch local + remota borradas en PR del 2026-04-26.                                                                                                                                                                                                                                                                                                                               |
| Filters URL-sync (UI)                | `filters-url-sync`       | 2026-04-26 | PR #215 mergeado. Hook `useUrlFilters` + `<ActiveFiltersChip>` en `components/module-page/` + ADR-007 + adopción en Ventas e Inventario.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Module Page (UI ADR-004)             | `module-page`            | 2026-04-27 | Cerrada por adopción incremental. ADR-004 fija la anatomía y queda como referencia. El wrapper `<ModulePage>` vive en `app/rdb/inventario/{layout,page,movimientos/page}.tsx`; otras pages adoptan los slots individuales según necesiten. La deuda visual originalmente prevista en Fase 2 se resolvió componente-por-componente vía iniciativas hijas: `module-states` (PR #214), `filters-url-sync` (PR #215), `action-feedback` (PR #216), `detail-page` (PR #217), `data-table` (PRs #218–#232). Total ~25 tablas + 4 detail pages alineadas con la anatomía sin migrar pages enteras al wrapper.                        |
| Module States (UI)                   | `module-states`          | 2026-04-26 | PR #214 mergeado. `<EmptyState>` + `<TableSkeleton>` + `<ErrorBanner>` compartidos en `components/module-page/` + ADR-006 + adopción en Ventas e Inventario.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Module-page sub-módulos              | `module-page-submodules` | 2026-04-26 | PR `feat/module-page-submodules-rdb-inventario` mergeado. Layout `app/rdb/inventario/layout.tsx` con 3 routed tabs (Stock / Movimientos / Levantamientos), ADR-005 documentando el patrón, `components/inventario/inventario-tabs.tsx` borrado. Verificado en código 2026-04-27: layout.tsx + movimientos/page.tsx existen, inventario-tabs.tsx ausente.                                                                                                                                                                                                                                                                      |
| RDB Inventario Levantamientos        | `rdb-inventario`         | 2026-04-25 | Sub-PRs B1 (#195), B2 (#196), B3 (#198) mergeados. UI completo de levantamientos físicos: alta, captura mobile, diferencias, firma electrónica, auto-aplicación, e2e tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Cómo se actualiza este archivo

- **Cowork** edita la sección `## Activas` cuando:
  - Beto promueve una idea nueva a iniciativa → agrega fila con estado `proposed`.
  - Beto modifica alcance, dueño o próximo hito → ajusta la fila.
- **Claude Code** edita cuando:
  - Ejecuta un hito → actualiza `Estado` y `Próximo hito` y `Última actualización`.
  - Una iniciativa queda completa → la mueve a `## Done` con fecha y outcome.
- **Beto** aprueba transiciones de estado en cualquier dirección.
