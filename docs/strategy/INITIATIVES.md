# Iniciativas — BSOP

> Índice activo de iniciativas del repo BSOP. Para detalle de cada una,
> abre `docs/planning/<slug>.md`. Mantenido por Cowork (cuando se crea o
> cambia el alcance) y por Claude Code (cuando ejecuta y cierra hitos).
>
> **Última actualización:** 2026-04-27 (`proveedores-csf-ai` arranca — alcance aprobado, ADR-007 cierra modelo DB con tabla anexa `erp.personas_datos_fiscales` + columna `tipo_persona` en `erp.personas`. Estado promovido a `planned`, próximo hito = Sprint 1.)

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

| Iniciativa                  | Slug                       | Empresas             | Schemas                     | Estado      | Próximo hito                                                                                                        | Última actualización |
| --------------------------- | -------------------------- | -------------------- | --------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Accessibility Baseline (UI) | `a11y-baseline`            | todas                | n/a (UI)                    | proposed    | Cerrar alcance v1 al arrancar (post-`responsive-policy`)                                                            | 2026-04-26           |
| Access Denied UX (UI)       | `access-denied-ux`         | todas                | n/a (UI)                    | proposed    | Cerrar alcance v1 al arrancar (post-`a11y-baseline`)                                                                | 2026-04-26           |
| Analytics (BI externo)      | `analytics`                | todas                | analytics, erp, dilesa, rdb | blocked     | Sprint 0 — desbloquear export del bootstrap (Metabase + Caddy + Postgres) desde Cowork al repo Analytics            | 2026-04-25           |
| Module Page (UI ADR-004)    | `module-page`              | todas                | n/a (UI)                    | in_progress | Fase 2 — migrar segunda página al componente `<ModulePage>`                                                         | 2026-04-25           |
| Module-page sub-módulos     | `module-page-submodules`   | RDB (primero), todas | n/a (UI)                    | in_progress | PR de refactor RDB Inventario abierto → smoke manual + merge (Beto)                                                 | 2026-04-26           |
| Proveedores · CSF AI        | `proveedores-csf-ai`       | todas                | erp                         | planned     | Sprint 1 — migración DB (`personas_datos_fiscales` + `tipo_persona`) + endpoint `POST /api/proveedores/extract-csf` | 2026-04-27           |
| Waitry ingesta + dedup      | `rdb-waitry-ingesta-dedup` | RDB                  | rdb (waitry\_\*), erp       | in_progress | Fase 2.B — fix de `compute_content_hash` (incluir `tableId`) + backfill + re-detección, fuera de horario operativo  | 2026-04-26           |
| Responsive Policy (UI)      | `responsive-policy`        | todas                | n/a (UI)                    | proposed    | Cerrar alcance v1 al arrancar (post-`data-table`)                                                                   | 2026-04-26           |

## Roadmap UI (orden de ejecución secuencial)

> Las 8 iniciativas con sufijo "(UI)" arriba son una cola secuencial.
> Cada una arranca cuando la anterior cierra (en `done` o, mínimo,
> última fase mergeada). El alcance v1 detallado se cierra al arrancar
> cada turno — los docs en `docs/planning/<slug>.md` tienen un esqueleto
> con Problema + Outcome + Alcance tentativo para que CC tenga contexto.

1. `module-states` — empty + loading + error compartidos. **Arranca primero.**
2. `filters-url-sync` — URL sync + clear all + contador.
3. `action-feedback` — toast + confirm destructive.
4. `detail-page` — anatomy de páginas `[id]` no-tabulares.
5. `data-table` — `<DataTable>` compartido (sort, paginación, density, sticky).
6. `responsive-policy` — mobile-first vs desktop-only por módulo.
7. `a11y-baseline` — WCAG 2.1 AA mínimo.
8. `access-denied-ux` — `<RequireAccess>` UX.

## Done (referencia histórica)

| Iniciativa                           | Slug                  | Cerrada    | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | --------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Action Feedback (UI)                 | `action-feedback`     | 2026-04-26 | PR #216 mergeado. Hook `useActionFeedback` (`hooks/`) + ADR-008 con 5 reglas (T1-T5) + migración de 3 holdouts de `window.confirm` en DILESA detail pages.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Cortes / Conciliación / OCR Vouchers | `cortes-conciliacion` | 2026-04-25 | Fases 1-6 mergeadas (PRs #176, #189, #191, #193, #194, #197, #199, #200). OCR client-side con Tesseract.js, marbete impreso, chip 📎 en movimientos, conciliación end-to-end.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Data Table compartido (UI)           | `data-table`          | 2026-04-27 | PRs #218 (paso 0), #219 (lib/format/), #220 (foundation + ADR-010 + Cortes), #221 (Ventas), #222 (Inventario stack + Productos), #223 (Compras), #224 (DILESA terrenos), #225 (RH), #226 (closeout sesión 1). Fase 2 (#228 Documentos, #229 Tasks, #230 Juntas x3, #231 DILESA proyectos/prototipos/anteproyectos, #232 Productos analisis + excepciones). Total 14 PRs, ~25 tablas migradas a `<DataTable>` + tanstack core, lib/format/ centralizado, ADR-010 con DT1-DT8. 4 excepciones permanentes documentadas en código (JSDoc): Settings/Acceso (state-machine UI) y 3 archivos Playtomic (totals row + sort externo). |
| Detail Page anatomy (UI)             | `detail-page`         | 2026-04-26 | PR #217 mergeado. `<DetailPage>` + `<DetailHeader>` + `<DetailContent>` en `components/detail-page/` + ADR-009 con 5 reglas (D1-D5) + migración de DILESA terrenos/prototipos `[id]` como golden.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| DILESA UI Terrenos                   | `dilesa-ui-terrenos`  | 2026-04-26 | Iniciativa **descartada**. Branch `feat/dilesa-ui-terrenos` (commit `9769b96` del 2026-04-23) contenía scaffold inicial superado por trabajo posterior mergeado a main vía otros PRs (anteproyectos/prototipos/proyectos crecieron 3-10x). Branch local + remota borradas en PR del 2026-04-26.                                                                                                                                                                                                                                                                                                                               |
| Filters URL-sync (UI)                | `filters-url-sync`    | 2026-04-26 | PR #215 mergeado. Hook `useUrlFilters` + `<ActiveFiltersChip>` en `components/module-page/` + ADR-007 + adopción en Ventas e Inventario.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Module States (UI)                   | `module-states`       | 2026-04-26 | PR #214 mergeado. `<EmptyState>` + `<TableSkeleton>` + `<ErrorBanner>` compartidos en `components/module-page/` + ADR-006 + adopción en Ventas e Inventario.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| RDB Inventario Levantamientos        | `rdb-inventario`      | 2026-04-25 | Sub-PRs B1 (#195), B2 (#196), B3 (#198) mergeados. UI completo de levantamientos físicos: alta, captura mobile, diferencias, firma electrónica, auto-aplicación, e2e tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Cómo se actualiza este archivo

- **Cowork** edita la sección `## Activas` cuando:
  - Beto promueve una idea nueva a iniciativa → agrega fila con estado `proposed`.
  - Beto modifica alcance, dueño o próximo hito → ajusta la fila.
- **Claude Code** edita cuando:
  - Ejecuta un hito → actualiza `Estado` y `Próximo hito` y `Última actualización`.
  - Una iniciativa queda completa → la mueve a `## Done` con fecha y outcome.
- **Beto** aprueba transiciones de estado en cualquier dirección.
