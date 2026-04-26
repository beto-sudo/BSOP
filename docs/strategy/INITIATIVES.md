# Iniciativas — BSOP

> Índice activo de iniciativas del repo BSOP. Para detalle de cada una,
> abre `docs/planning/<slug>.md`. Mantenido por Cowork (cuando se crea o
> cambia el alcance) y por Claude Code (cuando ejecuta y cierra hitos).
>
> **Última actualización:** 2026-04-26 (`module-states` planned → in_progress: 3 componentes compartidos creados + adopción en Ventas/Inventario + ADR-006)

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

| Iniciativa                  | Slug                       | Empresas             | Schemas                     | Estado      | Próximo hito                                                                                                       | Última actualización |
| --------------------------- | -------------------------- | -------------------- | --------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ | -------------------- |
| Accessibility Baseline (UI) | `a11y-baseline`            | todas                | n/a (UI)                    | proposed    | Cerrar alcance v1 al arrancar (post-`responsive-policy`)                                                           | 2026-04-26           |
| Access Denied UX (UI)       | `access-denied-ux`         | todas                | n/a (UI)                    | proposed    | Cerrar alcance v1 al arrancar (post-`a11y-baseline`)                                                               | 2026-04-26           |
| Action Feedback (UI)        | `action-feedback`          | todas                | n/a (UI)                    | proposed    | Cerrar alcance v1 al arrancar (post-`filters-url-sync`)                                                            | 2026-04-26           |
| Analytics (BI externo)      | `analytics`                | todas                | analytics, erp, dilesa, rdb | blocked     | Sprint 0 — desbloquear export del bootstrap (Metabase + Caddy + Postgres) desde Cowork al repo Analytics           | 2026-04-25           |
| Data Table compartido (UI)  | `data-table`               | todas                | n/a (UI)                    | proposed    | Cerrar alcance v1 al arrancar (post-`detail-page`)                                                                 | 2026-04-26           |
| Detail Page anatomy (UI)    | `detail-page`              | todas                | n/a (UI)                    | proposed    | Cerrar alcance v1 al arrancar (post-`action-feedback`)                                                             | 2026-04-26           |
| DILESA UI Terrenos          | `dilesa-ui-terrenos`       | DILESA               | dilesa                      | in_progress | Cerrar `feat/dilesa-ui-terrenos` y abrir PR                                                                        | 2026-04-??           |
| Filters URL-sync (UI)       | `filters-url-sync`         | todas                | n/a (UI)                    | proposed    | Cerrar alcance v1 al arrancar (post-`module-states`)                                                               | 2026-04-26           |
| Module Page (UI ADR-004)    | `module-page`              | todas                | n/a (UI)                    | in_progress | Fase 2 — migrar segunda página al componente `<ModulePage>`                                                        | 2026-04-25           |
| Module-page sub-módulos     | `module-page-submodules`   | RDB (primero), todas | n/a (UI)                    | in_progress | PR de refactor RDB Inventario abierto → smoke manual + merge (Beto)                                                | 2026-04-26           |
| Module States (UI)          | `module-states`            | todas                | n/a (UI)                    | in_progress | PR `feat/ui-module-states` abierto — Beto revisa, smoke en Ventas/Inventario y mergea                              | 2026-04-26           |
| Waitry ingesta + dedup      | `rdb-waitry-ingesta-dedup` | RDB                  | rdb (waitry\_\*), erp       | in_progress | Fase 2.B — fix de `compute_content_hash` (incluir `tableId`) + backfill + re-detección, fuera de horario operativo | 2026-04-26           |
| Responsive Policy (UI)      | `responsive-policy`        | todas                | n/a (UI)                    | proposed    | Cerrar alcance v1 al arrancar (post-`data-table`)                                                                  | 2026-04-26           |

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

| Iniciativa                           | Slug                  | Cerrada    | Outcome                                                                                                                                                                       |
| ------------------------------------ | --------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cortes / Conciliación / OCR Vouchers | `cortes-conciliacion` | 2026-04-25 | Fases 1-6 mergeadas (PRs #176, #189, #191, #193, #194, #197, #199, #200). OCR client-side con Tesseract.js, marbete impreso, chip 📎 en movimientos, conciliación end-to-end. |
| RDB Inventario Levantamientos        | `rdb-inventario`      | 2026-04-25 | Sub-PRs B1 (#195), B2 (#196), B3 (#198) mergeados. UI completo de levantamientos físicos: alta, captura mobile, diferencias, firma electrónica, auto-aplicación, e2e tests.   |

## Cómo se actualiza este archivo

- **Cowork** edita la sección `## Activas` cuando:
  - Beto promueve una idea nueva a iniciativa → agrega fila con estado `proposed`.
  - Beto modifica alcance, dueño o próximo hito → ajusta la fila.
- **Claude Code** edita cuando:
  - Ejecuta un hito → actualiza `Estado` y `Próximo hito` y `Última actualización`.
  - Una iniciativa queda completa → la mueve a `## Done` con fecha y outcome.
- **Beto** aprueba transiciones de estado en cualquier dirección.
