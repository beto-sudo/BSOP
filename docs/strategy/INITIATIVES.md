# Iniciativas — BSOP

> Índice activo de iniciativas del repo BSOP. Para detalle de cada una,
> abre `docs/planning/<slug>.md`. Mantenido por Cowork (cuando se crea o
> cambia el alcance) y por Claude Code (cuando ejecuta y cierra hitos).
>
> **Última actualización:** 2026-04-26

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

| Iniciativa               | Slug                 | Empresas | Schemas                     | Estado      | Próximo hito                                                                                             | Última actualización |
| ------------------------ | -------------------- | -------- | --------------------------- | ----------- | -------------------------------------------------------------------------------------------------------- | -------------------- |
| Analytics (BI externo)   | `analytics`          | todas    | analytics, erp, dilesa, rdb | blocked     | Sprint 0 — desbloquear export del bootstrap (Metabase + Caddy + Postgres) desde Cowork al repo Analytics | 2026-04-25           |
| DILESA UI Terrenos       | `dilesa-ui-terrenos` | DILESA   | dilesa                      | in_progress | Cerrar `feat/dilesa-ui-terrenos` y abrir PR                                                              | 2026-04-??           |
| Module Page (UI ADR-004) | `module-page`        | todas    | n/a (UI)                    | in_progress | Fase 2 — migrar segunda página al componente `<ModulePage>`                                              | 2026-04-25           |

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
