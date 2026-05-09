# Iniciativa — Architecture Master Doc

**Slug:** `architecture-master`
**Empresas:** todas
**Schemas afectados:** n/a (docs)
**Estado:** done
**Dueño:** Beto
**Creada:** 2026-05-09
**Cerrada:** 2026-05-09
**Última actualización:** 2026-05-09

> Refresh del doc master de arquitectura BSOP OS. El `docs/architecture/ARCHITECTURE.md` original (2026-04-18, 60 líneas) quedó desactualizado: hablaba de `/src/app` cuando hoy usamos App Router en root, no menciona los 25 ADRs creados desde entonces, ni patrones operativos (RBAC sync, módulos compartidos cross-empresa, RLS canónica, Helper de errores Supabase, etc.). Por eso nadie lo referencia. Esta iniciativa lo reescribe como **mapa-índice estable** + 3 diagramas mermaid (capas / schemas / auth) + índice navegable de ADRs.

## Problema

La arquitectura de BSOP existe — pero **vive fragmentada**:

- `docs/architecture/ARCHITECTURE.md` (1 doc stale, 60 líneas, drift gordo).
- 25 ADRs en `docs/adr/` (autoritativos por tema, hay que abrirlos uno por uno).
- 8 ADRs en `supabase/adr/` (DB-puros).
- `CLAUDE.md` global + del repo (reglas operativas).
- 40+ planning docs en `docs/planning/` (contexto histórico).
- Memorias auto (patrones aprendidos sesión a sesión).

Resultado: ninguna sesión nueva puede orientarse de cero sin abrir 30+ archivos. Beto observó: "no veo que hagamos referencia nunca a lo que vimos en el inicio".

## Outcome (V1)

Un doc canónico — `docs/architecture/ARCHITECTURE.md` — que sirva como **mapa de la realidad actual del repo**:

1. TL;DR + mapa de capas (con diagrama mermaid).
2. Database layer (schemas + RLS + workflow de migraciones, con diagrama mermaid).
3. Application layer (App Router + convenciones de carpetas, multi-empresa por segmento).
4. Auth + RBAC end-to-end (con diagrama mermaid).
5. Índice navegable de ADRs por tema (UI patterns, data, infra).
6. Reglas duras (no negociables: pre-push checks, mocks de DB prohibidos, etc.).
7. Memoria operativa del repo (planning, ADRs, CLAUDE.md).
8. Topics open / no decididos todavía (Vercel Services, Edge vs Node, Workflow DevKit, backups externos, BI, CxP).

**Métrica de éxito:** sesión nueva puede orientarse en <5 min leyendo solo este doc + sus pointers, sin tener que abrir 30 archivos.

## Alcance v1

**Sí incluye:**

- Reescritura completa de `docs/architecture/ARCHITECTURE.md` (~400-500 líneas).
- 3 diagramas mermaid (capas / schemas / auth).
- Índice navegable de los 33 ADRs (25 + 8 DB-puros).
- Regla blanda de mantenimiento en `CLAUDE.md` del repo: al crear ADR nuevo, añadir 1 línea al índice.

**No incluye:**

- ADR-030 "Architecture-as-Index" formal — si en 2-3 meses el doc se desincroniza, ahí lo formalizamos.
- Diagramas formales fuera de mermaid (no necesarios).
- Decisiones nuevas (Edge vs Node, Vercel Services, WDK) — solo flagearlas como topics open.
- ER diagrams de tablas concretas (`SCHEMA_REF.md` ya es la verdad).
- Glosario completo o tutorial onboarding (V2 si emerge).

## Riesgos

- **Drift idéntico al original:** si nadie lo mantiene, vuelve a stale. Mitigación: el doc no duplica los ADRs — los **referencia**. Cada ADR mantiene su verdad; ARCHITECTURE.md solo mapea "dónde está cada cosa". Cambios estructurales son discretos (capa nueva, schema nuevo, ADR nuevo) — no por cada PR.
- **Ámbito creciente:** la tentación es documentar todo. V1 se mantiene en mapa-índice; detalle vive en ADRs.

## Decisiones registradas

- **2026-05-09** — V1 = single PR, modo cierre el mismo día. Sin ADR-030 formal todavía. Mecanismo de mantenimiento como regla blanda en `CLAUDE.md` del repo (no proceso pesado).
- **2026-05-09** — 3 diagramas mermaid (capas/schemas/auth), no 1 mega-diagrama. Razón: cada uno cubre una capa cognitiva distinta y puede mantenerse independientemente.
- **2026-05-09** — Índice de ADRs navegable por tema (UI / data / DB / RBAC), no cronológico. Razón: navegación por intención (¿dónde está el patrón de drawers?) no por timestamp.
- **2026-05-09** — Audiencia: yo (CC) primaria + humano básico secundario. Tono terso técnico, en español para coincidir con CLAUDE.md.

## Sprints / hitos

- **Sprint 1 (este PR)** — Reescribir `docs/architecture/ARCHITECTURE.md` + 3 mermaid + índice ADRs + regla blanda en `CLAUDE.md` repo + mover fila a `## Done`.

## Bitácora

- **2026-05-09** — Iniciativa promovida y cerrada el mismo día (single-PR V1). Reescritura de `docs/architecture/ARCHITECTURE.md` con outline de 8 secciones: TL;DR, mapa de capas (mermaid), DB layer (mermaid schemas), application layer, auth+RBAC (mermaid sequence), índice de 33 ADRs, reglas duras, topics open. Regla blanda agregada a `CLAUDE.md` del repo: al crear ADR nuevo o cambiar el stack, sincronizar el doc master. Sin ADR-030 — el costo de la regla blanda es trivial; si emerge drift en 2-3 meses, ahí se formaliza.

## Follow-ups (no urgentes)

- **Conflicto de numeración ADR**: ADR-005, 006, 007 existen en ambos `docs/adr/` y `supabase/adr/`. Al revisarlo encontramos que ADR-001-004 viven en `supabase/adr/` (DB-puro: `dilesa_schema`, `health_ingest_soft_drop`, `v_cortes_totales_fecha_pushdown`, `module_page_layout_convention`) y ADR-005-029 viven en `docs/adr/` (decisiones de stack/UI/RBAC). Pero `supabase/adr/` también renumeró ADR-005-008 internamente para waitry y `personas_datos_fiscales`, generando IDs colisionantes. Resultado: ADR-005 es ambiguo según el directorio. Posible cleanup: prefijar los DB-puros con `SDB-NNN` o renumerar a IDs únicos cross-repo. No urgente — los lectores resuelven la ambigüedad por contexto del directorio. Documentado en el índice del doc master.
- **`npm run initiatives:gen`** — si el patrón de drift en `INITIATIVES.md` se intensifica, escalar a auto-generación desde headers de planning docs (ya documentado en `CLAUDE.md` repo "CI / PRs"). No es responsabilidad de esta iniciativa.

## Referencias

- `docs/architecture/ARCHITECTURE.md` — el doc master mismo.
- `CLAUDE.md` (repo) — protocolo de sesión + CI + Reglas UI/DB.
- `docs/adr/` y `supabase/adr/` — 33 ADRs autoritativos.
- `docs/strategy/INITIATIVES.md` — índice activo de iniciativas.
- ADR-012 — Claude Code dueño de planeación + ejecución.
