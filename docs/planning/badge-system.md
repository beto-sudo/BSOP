# Iniciativa — Badge system (tokens semánticos)

**Slug:** `badge-system`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** done
**Dueño:** Beto
**Creada:** 2026-04-27
**Última actualización:** 2026-04-29

## Problema

Cada módulo armó sus propios badges con sus propios colores:

- `EstadoBadge` (tasks) — pendiente / en_progreso / completado /
  cancelado.
- `PrioridadBadge` y `PrioridadTextBadge` (tasks) — alta / media /
  baja / crítica.
- `TipoBadge`, `TipoOperacionBadge`, `VencBadge` (documentos).
- `EtapaBadgeLarge` (DILESA terrenos).
- `Badge variant="..."` (shadcn base, usado directamente en cortes,
  ventas, productos).
- `<Chip>` ad-hoc en algunos lados.

Síntomas:

- Mismo concepto semántico ("ok / aviso / error / info / neutral")
  expresado con colores distintos según quién lo escribió.
- Variants de `<Badge>` shadcn (`default`, `secondary`, `destructive`,
  `outline`) no cubren los 5+ estados que necesitamos en realidad.
- Mapping `estado → variant` se repite en cada módulo
  (`statusVariant(corte.estado)`, `estadoVariant(task.estado)`, etc.).
- El ADR-006 (`<EmptyState>`), ADR-008 (action-feedback) y ADR-010
  (`<DataTable>` con `column.type='badge'`) ya tocaron badges pero
  delegaron la decisión de color al caller. Compilada esa deuda en
  varios PRs, vale resolverla con un sistema central.

## Outcome esperado

- Tokens semánticos: `success | warning | error | info | neutral |
pending | active`. Cada uno con color de fondo, texto y borde
  consistentes.
- Componente `<Badge tone="success" size="md">Activo</Badge>` o
  similar, parametrizado.
- Mapping helpers tipados: `mapEstadoToTone(estado)` para los estados
  comunes (corte, task, etapa, documento). Un helper por dominio,
  no copy-paste de switch en cada sitio.
- Wrappers específicos (`<EstadoBadge>`, `<PrioridadBadge>`, etc.)
  internamente usan `<Badge tone>` + el helper de mapping. API externa
  se preserva.
- ADR documentando los tonos y cuándo usar cada uno.

## Alcance v1 (cerrado 2026-04-29 — ver ADR-017)

- [x] Definir 6 tonos canónicos: `neutral`, `info`, `success`, `warning`, `danger`, `accent`.
- [x] `<Badge>` extendido con prop `tone` + export `BadgeTone` type.
      Variants legacy (`default`, `secondary`, etc.) preservadas para usos
      no-semánticos (counts, links). `tone` gana cuando se pasan ambos.
- [x] `lib/status-tokens.ts` refactor: cada config expone `tone: BadgeTone`
      al lado del legacy `cls`. 6 configs migrados (junta, prioridad
      DILESA, anteproyecto, terreno etapa, prototipo etapa, proyecto fase).
- [x] `components/tasks/tasks-shared.tsx`: `ESTADO_CONFIG`,
      `PRIORIDAD_CONFIG`, `UPDATE_TIPO_CONFIG` con `tone` agregado.
      `EstadoBadge` y `PrioridadBadge` migrados a `<Badge tone>`.
- [x] ADR-017 con 6 reglas (B1-B6).
- [x] Migración del resto de callsites (Sprint 2 — 11 archivos, 17 callsites).
- [x] Eliminar `cls` de TODOS los configs (Sprint 3) — `lib/status-tokens.ts` y `components/tasks/tasks-shared.tsx` solo `{label, tone}`.

## Decisiones tomadas al cerrar alcance

- **6 tones (no 7)**: agrupar `pending`+`active` bajo `info` y `success`
  según contexto. Sin granularity loss porque el `label` siempre se
  muestra. 7+ invita a debate "¿uso `pending` o `info`?".
- **Sin `<BadgeIcon>` en v1**: los íconos custom en badges son raros
  (1 caso real: `PrioridadTextBadge` con dot). No vale agregar API; si
  surge, se itera.
- **Sin helpers `mapEstadoToTone(estado)`**: el config ya provee
  `cfg.tone`. Helper sería redundante.
- **`tone` como naming** (vs `intent`/`kind`/`status`): consistente con
  shadcn/Radix/MUI design system convention.
- **Sin `size` prop**: el `<Badge>` actual tiene un solo size; si surge
  necesidad de "hero badges" (ej. `EtapaBadgeLarge`), se evalúa aparte.

## Fuera de alcance

- Animaciones de transición entre tonos (cambio de estado).
- Dark mode toggle — el repo es dark-only hoy (verificar; si no,
  tema aparte).
- Iconos custom por badge — usar lucide-react existente.

## Métricas de éxito

- Cero usos directos de `<Badge variant="destructive">` o equivalente
  en módulos — todos pasan por `tone` o helper de mapping.
- Cero `switch (estado) { case 'completado': return 'green' }` ad-hoc
  en código de módulo.
- Visual audit: pasar por las 25 tablas migradas y confirmar que los
  badges del mismo tono se ven idénticos en todas.

## Sprints / hitos

| #   | Sprint                                     | Estado | PR   |
| --- | ------------------------------------------ | ------ | ---- |
| 1   | Foundation + ADR-017 + golden tasks        | done   | #305 |
| 2   | Migrar callsites de `cls` a `<Badge tone>` | done   | TBD  |
| 3   | Eliminar `cls` de configs + cierre         | done   | TBD  |

## Decisiones registradas

### 2026-04-29 · ADR-017 — Badge tones (Sprint 1)

Codificado en [ADR-017](../adr/017_badge_system.md). Las 6 reglas:

- **B1** — 6 tones canónicos: `neutral`/`info`/`success`/`warning`/`danger`/`accent`.
- **B2** — Cada slug del repo mapea a un tone exactamente (en `status-tokens.ts`).
- **B3** — `<Badge tone>` reemplaza `<span className="bg-X/15 text-X border-X/20">` en TODO el repo.
- **B4** — `cls` legacy queda como derivado, no canónico (deprecación incremental tipo ADR-010 DT8).
- **B5** — Variants legacy (`default`, `secondary`, etc.) coexisten con `tone`; `tone` gana cuando se pasan ambos.
- **B6** — `<Badge tone="neutral">` para fallback de slugs desconocidos (defensivo contra drift DB↔UI).

## Bitácora

### 2026-04-29 — Sprint 1 mergeado

Foundation:

- `components/ui/badge.tsx` extendido con 6 tones (`neutral`/`info`/`success`/`warning`/`danger`/`accent`) + export `BadgeTone`.
- `lib/status-tokens.ts` refactor — cada config (junta, prioridad DILESA, anteproyecto, terreno etapa, prototipo etapa, proyecto fase) expone `tone: BadgeTone` al lado del legacy `cls`.
- `components/tasks/tasks-shared.tsx` — `ESTADO_CONFIG`, `PRIORIDAD_CONFIG`, `UPDATE_TIPO_CONFIG` con `tone`. `EstadoBadge` + `PrioridadBadge` golden migration a `<Badge tone>`.
- ADR-017 con 6 reglas (B1-B6).

Sprint 2 migrará los ≈11 callsites que aún rendean `<span className={cfg.cls}>`. Sprint 3 elimina `cls` cuando todos migren.

PR: #305.

### 2026-04-29 — Sprint 2 + 3 mergeados (cierre de iniciativa)

Sprint 2 (migración de callsites — 11 archivos, 17 callsites):

- `app/dilesa/prototipos/page.tsx` — `EtapaBadge`.
- `app/dilesa/prototipos/[id]/page.tsx` — `EtapaBadgeLarge`.
- `app/dilesa/proyectos/page.tsx` — `FaseBadge`.
- `app/dilesa/proyectos/[id]/page.tsx` — `FaseBadgeLarge`.
- `app/dilesa/terrenos/page.tsx` — `EtapaBadge`.
- `app/dilesa/terrenos/[id]/page.tsx` — `EtapaBadgeLarge`.
- `app/dilesa/anteproyectos/page.tsx` — `EstadoBadge`.
- `app/dilesa/anteproyectos/[id]/page.tsx` — `EstadoBadgeLarge`.
- `app/inicio/juntas/page.tsx` — `EstadoBadge`.
- `app/inicio/juntas/[id]/page.tsx` — 3 callsites (estado de tarea en updates timeline + chip de tipo de update + estado en `renderTask`). Eliminados `ESTADO_JUNTA` + `ESTADO_TASK` + `tipoCfg` locales (ahora usa `JUNTA_ESTADO_CONFIG`/`ESTADO_CONFIG`/`UPDATE_TIPO_CONFIG` canónicos via import alias).
- `components/juntas/junta-detail-module.tsx` — mismos 3 callsites + mismas eliminaciones de configs locales (espejo del page de inicio).
- `components/juntas/admin-juntas-list-module.tsx` — `EstadoBadge`.
- `components/tasks/tasks-updates.tsx` — chip de tipo de update en `UpdatesList`.
- `components/tasks/tasks-shared.tsx` — `PrioridadTextBadge` migrado a `<Badge tone>` envolviendo el dot custom (caso especial preserved).

Sprint 3 (cleanup configs):

- `lib/status-tokens.ts` — `cls: string` eliminado de los 6 configs (`JUNTA_ESTADO_CONFIG`, `PRIORIDAD_CONFIG`, `ANTEPROYECTO_ESTADO_CONFIG`, `TERRENO_ETAPA_CONFIG`, `PROTOTIPO_ETAPA_CONFIG`, `PROYECTO_FASE_CONFIG`). Solo queda `{label, tone}` (+ `dot` en `PRIORIDAD_CONFIG` para `PrioridadDot` text-only).
- `components/tasks/tasks-shared.tsx` — `cls` eliminado de `ESTADO_CONFIG`, `PRIORIDAD_CONFIG`, `UPDATE_TIPO_CONFIG`.

Beneficio colateral: 3 configs duplicados (`ESTADO_JUNTA`/`ESTADO_TASK`/`tipoCfg` locales en juntas detail) consolidados a los canónicos. Cero callsites refieren `cfg.cls` o `\.cls` post-migración. CI local verde (typecheck + format:check + lint 0 errors + 364 tests pass).

PR: TBD.
