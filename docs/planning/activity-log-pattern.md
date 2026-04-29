# Iniciativa — Activity log pattern (`<ActivityLog>`)

**Slug:** `activity-log-pattern`
**Empresas:** todas
**Schemas afectados:** n/a (UI; consume backends existentes)
**Estado:** done
**Dueño:** Beto
**Creada:** 2026-04-27
**Última actualización:** 2026-04-30 (cierre)

## Problema

Trazabilidad empieza a aparecer en múltiples lugares (cortes, tasks,
OC, inventario, futuro: terrenos, proveedores, levantamientos). Cada
backend tiene shape distinto y cada UI lo renderiza a su manera. Si
esperamos al 3er o 4to módulo, el drift hace que cada timeline UI
tenga que construirse desde cero.

## Outcome esperado

- Contrato `ActivityEvent` como shape canónica.
- Adapters por backend que mapean a `ActivityEvent[]`.
- Componente `<ActivityLog>` (Sprint 2) que consume `ActivityEvent[]` agnóstico al backend.
- Convención de tipos de evento + tokens de tone.
- ADR documentando el contrato.

## Alcance v1 (cerrado 2026-04-29 — ver ADR-023)

- [x] Contrato `ActivityEvent` en `components/activity-log/types.ts`.
- [x] 7 tipos canónicos (`created` / `updated` / `status_changed` / `archived` / `restored` / `deleted` / `comment`) + extensión libre para domain-specific.
- [x] `DEFAULT_ACTIVITY_TONES` reusa `BadgeTone` (ADR-017).
- [x] ADR-023 con 5 reglas (AL1-AL5).
- [ ] Componente `<ActivityLog>` — Sprint 2.
- [ ] Adapters por backend + golden migration — Sprint 3.

## Decisiones tomadas al cerrar alcance

- **Adapter pattern en TypeScript**, no migrations DB: backends ya difieren;
  forzar uniformidad cruza iniciativas. Cada caller escribe `xToEvents(rows)`.
- **`type` canónico abierto** (string & {}): 7 tipos cubren el 80%; el resto se pasa
  como string literal sin castear. Defensivo contra drift.
- **`actor` nullable** con fallback "Sistema": eventos automáticos (triggers,
  cron) no requieren usuario sintético en DB.
- **`changes` (estructurado) vs `detail` (texto libre)** son campos separados:
  permite render diferente (diff vs body).
- **Sin componente en v1**: el contrato es la pieza estable; el componente
  puede iterarse. Sprint 2 lo entrega.

## Fuera de alcance v1

- **Componente `<ActivityLog>`** — Sprint 2.
- **Filtros** por usuario/tipo/fecha.
- **Comments / threading**.
- **Diff visual side-by-side**.
- **Real-time updates**.
- **Composer de eventos**.
- **Permisos por evento**.

## Métricas de éxito

- Cualquier nuevo módulo con timeline usa `ActivityEvent` adapter, no
  HTML directo del backend.
- Sprint 2: `<ActivityLog>` reutilizado por tasks, cortes, y 1+ módulo nuevo.

## Sprints / hitos

| #   | Sprint                                                             | Estado  | PR   |
| --- | ------------------------------------------------------------------ | ------- | ---- |
| 1   | Contrato `ActivityEvent` + tones + ADR-023                         | done    | #313 |
| 2   | Componente `<ActivityLog>` + golden tasks `<UpdatesList>` + cierre | done    | TBD  |
| 3   | Adopters opt-in (cortes detail timeline, terrenos DILESA, etc.)    | pending | —    |

## Decisiones registradas

### 2026-04-29 · ADR-023 — Activity log contract (Sprint 1)

Codificado en [ADR-023](../adr/023_activity_log_pattern.md). Las 5 reglas:

- **AL1** — `ActivityEvent` es la shape canónica; adapters por backend.
- **AL2** — `type` canónico (7 tipos) + extensiones libres por dominio.
- **AL3** — `actor` es nullable; `'Sistema'` como fallback.
- **AL4** — `changes` para diffs estructurados; `detail` para texto libre.
- **AL5** — Componente Sprint 2 debe soportar `<DetailPage>` y `<DetailDrawer>` como section.

## Bitácora

### 2026-04-30 — Sprint 2 mergeado (cierre)

Componente `<ActivityLog>` extraído consumiendo `ActivityEvent[]` (AL1):

- `components/activity-log/activity-log.tsx` — section component con
  loading/empty states, variants `default`/`compact` (drawer-friendly),
  tones override merged sobre `DEFAULT_ACTIVITY_TONES`, `formatChange`
  callback para resolver labels custom de los `field` de `changes`.
- A11y: `<time dateTime>` con title hover, `aria-label="Actividad"` en la
  lista, `aria-hidden` en iconos decorativos, `<ul>/<li>` semánticos.
- Renderea cada evento con: badge tone + actor name + relative timestamp
  - summary/detail + changes inline (`field: before → after`).

Golden migration: `<UpdatesList>` (tasks) reescrito como wrapper thin
sobre `<ActivityLog>` (~70 líneas → ~25 líneas):

- Adapter `taskUpdatesToEvents` exportado para uso en tests/otros callers.
- `TASK_UPDATE_TONES` derivado de `UPDATE_TIPO_CONFIG` (badge-system tones).
- `formatChange` callback traduce valores raw de `cambio_estado`
  (e.g. `pendiente` → `Pendiente`) usando `ESTADO_CONFIG`.
- API exterior preservada (`updates`/`loading`/`variant` props).

**Outcome final**:

- ADR-023 con 5 reglas (AL1-AL5).
- Contrato `ActivityEvent` + `DEFAULT_ACTIVITY_TONES`.
- Componente `<ActivityLog>` agnóstico al backend.
- 1 caller migrado (tasks `<UpdatesList>` reusa internamente).

Sprint 3 (cortes detail timeline, terrenos DILESA, levantamientos) queda
como adopción opt-in cuando esos módulos quieran timeline visible —
escribir el adapter `xToEvents` por dominio y montar `<ActivityLog>`.

### 2026-04-29 — Sprint 1 mergeado

Foundation:

- `components/activity-log/types.ts` — `ActivityEvent`, `ActivityActor`,
  `ActivityFieldChange`, `ActivityEventType`, `DEFAULT_ACTIVITY_TONES`.
- `components/activity-log/index.ts` — barrel export.
- ADR-023 con 5 reglas (AL1-AL5).

Sin componente UI en v1 — el contrato es la pieza estable, el componente
puede iterarse en Sprint 2 sin breaking changes para callers que ya
construyan adapters siguiendo el contrato.

PR: pendiente.
