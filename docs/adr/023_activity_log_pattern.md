# ADR-023 — Activity log pattern (`ActivityEvent` contract)

- **Status**: Accepted
- **Date**: 2026-04-29
- **Authors**: Beto, Claude Code (iniciativa `activity-log-pattern`)
- **Related**: [ADR-008](./008_action_feedback.md), [ADR-009](./009_detail_page.md), [ADR-017](./017_badge_system.md)

---

## Contexto

Trazabilidad ("quién cambió qué cuándo") empieza a aparecer en múltiples lugares:

- **Cortes** — detail page muestra historial de eventos del corte (apertura, recepción de vouchers, conciliación, cierre).
- **Tasks** — `erp.task_updates` con avances, cambios de estado, cambios de responsable. Renderizado en `components/tasks/tasks-updates.tsx` (`<UpdatesList>` + `<UpdateComposer>`).
- **OC · Recepciones** — trigger en DB que audita recepciones, cancelaciones, cierres.
- **Inventario · Movimientos** — `erp.movimientos_inventario` ya tiene timeline de eventos por producto (kardex en `<StockDetailDrawer>`).
- **Futuro**: terrenos DILESA con cambio de etapa, proveedores con actualización CSF, levantamientos con auto-aplicación.

Cada implementación tiene su shape distinto:

- `task_updates` — columns: `tipo`, `contenido`, `valor_anterior`, `valor_nuevo`, `creado_por`, `created_at`.
- `movimientos_inventario` — columns: `tipo_movimiento`, `cantidad`, `costo_unitario`, `referencia_tipo`, `notas`, `created_at`.
- Cortes audit — vive en `audit_log` con `meta` jsonb.

Si esperamos a la 3a o 4a implementación, el drift entre shapes hace que cada timeline UI tenga que construirse desde cero.

## Decisión

Sprint 1 fija el **contrato `ActivityEvent`** — la shape que el componente `<ActivityLog>` (Sprint 2) consumirá. Los backends siguen como están; cada caller escribe un **adapter** que mapea sus rows a `ActivityEvent[]`. El componente UI nunca conoce el backend, solo el contrato.

```ts
import type { ActivityEvent } from '@/components/activity-log';

function taskUpdatesToEvents(rows: TaskUpdateRow[]): ActivityEvent[] {
  return rows.map((r) => ({
    id: r.id,
    at: r.created_at,
    type: r.tipo === 'cambio_estado' ? 'status_changed' : (r.tipo as ActivityEventType),
    actor: r.usuario ? { id: r.creado_por, nombre: r.usuario.nombre } : null,
    detail: r.contenido,
    changes:
      r.valor_anterior != null && r.valor_nuevo != null
        ? [{ field: r.tipo, before: r.valor_anterior, after: r.valor_nuevo }]
        : undefined,
  }));
}
```

### Las 5 reglas (AL1–AL5)

#### AL1 — `ActivityEvent` es la shape canónica; adapters por backend

`ActivityEvent` (en `components/activity-log/types.ts`) define los campos mínimos:

```ts
type ActivityEvent = {
  id: string;
  at: string; // ISO timestamp
  type: ActivityEventType;
  actor: ActivityActor | null;
  summary?: string;
  detail?: string | null;
  changes?: ActivityFieldChange[];
};
```

Cada caller (cortes, tasks, OC, inventario, etc.) escribe una función `xToEvents(rows): ActivityEvent[]` que mapea su backend específico. El componente `<ActivityLog>` (Sprint 2) consumirá `ActivityEvent[]` directo — agnóstico del backend.

> **Por qué**: backends ya difieren. Forzar uniformidad en DB requeriría migrations masivas (tabla `audit_log` consolidada) que cruzan iniciativas. Adaptar en TypeScript es 10 líneas por backend y mantiene la independencia.

#### AL2 — `type` canónico + extensiones por dominio

Tipos canónicos (cubren el 80%):

```ts
'created' | 'updated' | 'status_changed' | 'archived' | 'restored' | 'deleted' | 'comment';
```

Eventos específicos del dominio se pasan como string literal abierto (`(string & {})` permite extensión sin castear): `'voucher_confirmed'`, `'oc_recibida'`, `'levantamiento_aplicado'`. El renderer cae a `tone: 'neutral'` para tipos desconocidos (defensivo contra drift como FA en ADR-022).

`DEFAULT_ACTIVITY_TONES` mapea los 7 canónicos a `BadgeTone` + label. Adapters pueden mergear su propio mapping para tipos custom.

> **Por qué**: 7 canónicos son los que aparecen en cualquier audit log del repo. Mantener el type abierto evita que cada dominio tenga que listar todos sus tipos en el ADR.

#### AL3 — `actor` es nullable; `'Sistema'` como fallback

Eventos automáticos (triggers DB, jobs cron) tienen `actor: null`. El renderer muestra "Sistema" como fallback. Esto separa la fuente humana de la automática sin requerir que cada backend tenga un usuario "system" sintético.

> **Por qué**: cortes ya tiene eventos automáticos (auto-conciliación). Inventario también (recepción auto via OC trigger). Forzar un usuario sintético es ruido + storage extra.

#### AL4 — `changes` para diffs estructurados; `detail` para texto libre

- **`changes`** — array de `{ field, before, after, label? }`. Renderizable como "Estado: Pendiente → Completado". Backend lo arma desde `valor_anterior`/`valor_nuevo` (tasks) o desde el `meta` jsonb (cortes).
- **`detail`** — texto libre del usuario (comentario, descripción de avance). NO se renderiza como diff.
- **`summary`** — copy pre-renderizada por el adapter cuando el caso es complicado ("Recibió 3 unidades del producto X via OC #123"). Optional; el componente puede inferirlo si está vacío.

> **Por qué**: separar diffs estructurados de texto libre permite render distinto (diff con colores, texto con type body). Mezclarlos como un solo string pierde la estructura.

#### AL5 — Componente Sprint 2 debe soportar `<DetailPage>` y `<DetailDrawer>`

`<ActivityLog>` se monta dentro de un `<DetailPage>` (sección dentro de la página) o `<DetailDrawer>` (sub-panel). Ambos casos comparten la misma altura/scroll behavior (el wrapper es scrolleable). El componente NO tiene su propio scroll wrapper.

Loading, empty, error states: heredados de ADR-006 (`<TableSkeleton>`-like, `<EmptyState>`-like).

> **Por qué**: el componente debe ser un "section" component, no un "page" component. ADR-009 / ADR-018 ya proveen el container.

## Implementación

- **Sprint 1** (este PR): contrato. `components/activity-log/types.ts` con `ActivityEvent` + `DEFAULT_ACTIVITY_TONES`. ADR-023.
- **Sprint 2** (postponed): componente `<ActivityLog>` que renderea `ActivityEvent[]`. Helper `useActivityEvents(adapter, deps)` que cachea + revalida. Migrar `<UpdatesList>` de tasks como golden.
- **Sprint 3** (postponed): adopción en cortes + 1 nuevo (terrenos DILESA o levantamientos).

## Consecuencias

### Positivas

- **Contrato tipado** desacopla backend de UI. Cada dominio mantiene su shape; el componente es uniforme.
- **Migración incremental**: cada backend se adapta cuando se quiere mostrar su timeline en el componente compartido.
- **Tone tokens reusados** (ADR-017) — eventos heredan paleta canónica.
- **Code review tiene check claro**: ¿el caller escribe un adapter `xToEvents`? ¿no construye HTML directo del backend?

### Negativas

- **Sin componente en v1**: el sprint cierra el contrato sin entregar UI. Acceptable porque el contrato es la pieza más estable; el componente UI puede iterarse.
- **Adapters por dominio** son trabajo per-caller (10-20 líneas cada uno). Mitigation: el contrato es minimal (≤7 campos).

### Cosas que NO cambian

- Backends actuales (`task_updates`, `movimientos_inventario`, `audit_log`) — sin migrations.
- `<UpdatesList>` y `<UpdateComposer>` (tasks) — siguen funcionando; Sprint 2 los migra al componente compartido.
- Cortes detail page — sigue con su timeline custom; Sprint 3 lo migra.

## Fuera de alcance v1

- **Componente `<ActivityLog>`** — Sprint 2.
- **Filtros** (por usuario, tipo, rango). Postergable.
- **Comments / threading** sobre eventos — feature distinta (`tasks-updates-sheet` cubre el caso comment + composer hoy).
- **Diff visual side-by-side** para `changes` — útil pero no v1.
- **Real-time updates** (websocket / polling).
- **Composer de eventos** (input para agregar comentario) — Sprint 4 o feature distinta.
- **Permisos por evento** (algunos eventos sensibles esconden detail) — extensión post-v1.

## Referencias

- Tipos: [components/activity-log/types.ts](../../components/activity-log/types.ts)
- Iniciativa: [docs/planning/activity-log-pattern.md](../planning/activity-log-pattern.md)
- ADR-008 — feedback (toast vs banner vs confirm).
- ADR-017 — `BadgeTone` (`DEFAULT_ACTIVITY_TONES` lo reusa).
