# ADR-017 — Badge tones (semántica de status badges)

- **Status**: Accepted
- **Date**: 2026-04-29
- **Authors**: Beto, Claude Code (iniciativa `badge-system`)
- **Related**: [ADR-006](./006_module_states.md), [ADR-008](./008_action_feedback.md), [ADR-010](./010_data_table.md)

---

## Contexto

Las status badges del repo (`EstadoBadge`, `PrioridadBadge`,
`AnteproyectoEstadoBadge`, etc.) duplican la misma paleta de Tailwind
una y otra vez:

```tsx
'bg-blue-500/15 text-blue-400 border-blue-500/20';
'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
'bg-amber-500/15 text-amber-400 border-amber-500/20';
'bg-red-500/15 text-red-400 border-red-500/20';
```

11 archivos las llevan literales. Cada nuevo módulo que necesita un
status badge inventa su propia variación: `green` vs `emerald`, `orange`
vs `amber`, `purple` vs `violet`, `cyan` vs `sky`. Cuando llega el
momento de cambiar el "azul de info" a un tono más oscuro o agregar
hover states, hay que tocar N lugares.

`lib/status-tokens.ts` ya centraliza los configs de status (junta,
prioridad, etapa, etc.) — pero cada uno expone un `cls` literal que el
caller pega en un `<span>`. La abstracción "esto es un estado de tipo
success/warning/danger" no existe; cada slug elige sus colores ad-hoc.

shadcn `<Badge>` ya está en el repo con variants `default`, `secondary`,
`destructive`, `outline`, `ghost`, `link`. Cubre uses no-semánticos
(counts, links) pero no tiene tones de status para el patrón dominante.

## Decisión

Agregar **6 tones semánticos** al `<Badge>` shadcn, cada uno con paleta
fija (background tinted al 15%, texto y borde matching):

```tsx
<Badge tone="success">Aprobado</Badge>
<Badge tone="warning">Pausado</Badge>
<Badge tone="danger">Cancelado</Badge>
<Badge tone="info">En curso</Badge>
<Badge tone="accent">Convertido</Badge>
<Badge tone="neutral">Borrador</Badge>
```

`lib/status-tokens.ts` mapea cada slug de status a su `tone` semántico.
Callers leen `cfg.tone` y lo pasan al `<Badge>`:

```tsx
const cfg = JUNTA_ESTADO_CONFIG[junta.estado];
return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
```

### Las 6 reglas (B1–B6)

#### B1 — 6 tones semánticos canónicos

```ts
type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';
```

- **`neutral`** — informational, sin opinión. Ej: "Borrador", "En análisis", "Cancelado/Cerrado".
- **`info`** — in-progress, observacional. Ej: "En curso", "En trámite", "Programada".
- **`success`** — positive completion. Ej: "Completado", "Aprobado", "Adquirido".
- **`warning`** — needs attention. Ej: "Pausado", "Pendiente", "Due diligence".
- **`danger`** — error, blocked, descartado. Ej: "Bloqueado", "No viable", "Cancelada".
- **`accent`** — special / featured. Ej: "Urgente", "En negociación", "Construcción".

> **Por qué 6 (no más, no menos)**: cubrir todo el repo con menos pierde
> matiz visual entre estados; con más, el equipo invoca colores ad-hoc
> ("¿uso `info` o `progress`?"). 6 es suficiente para distinguir los
> 8-10 estados que un módulo típicamente expone, mapeando varios
> slugs al mismo tone si comparten significado.

#### B2 — Cada slug del repo mapea a un tone exactamente

`lib/status-tokens.ts` ya tiene los configs centralizados; ahora cada
entry expone `tone: BadgeTone` además del legacy `cls`. Aliases de color
(green/emerald, orange/amber, sky/blue/cyan) colapsan al mismo tone.

```ts
PRIORIDAD_CONFIG = {
  alta: { label: 'Alta', tone: 'danger', cls: '...' },
  media: { label: 'Media', tone: 'warning', cls: '...' },
  baja: { label: 'Baja', tone: 'success', cls: '...' },
};
```

> **Por qué**: status-tokens.ts ya es la single source of truth de los
> configs; agregar `tone` ahí evita que cada caller tenga que decidir
> "¿este estado es success o info?" — la decisión se toma una vez.

#### B3 — `<Badge tone>` reemplaza `<span className="bg-X/15 text-X border-X/20">` en TODO el repo

Los `<span>` inline con la paleta literal son deuda. Cualquier badge nuevo
usa `<Badge tone>`. Los existentes se migran cuando se toquen — no hay
sweep masivo, pero PRs nuevos no se aprueban con el patrón viejo.

`badge.tsx` ahora exporta `BadgeTone` para callers que necesiten tipar
sus configs.

> **Por qué**: el sweep masivo (11 archivos × 4-9 estados cada uno) es
> churn sin valor inmediato. Migración incremental al tocar el código
> es lo que hizo `<DataTable>` (ADR-010 DT8) y funcionó.

#### B4 — `cls` legacy queda como derivado, no canónico

Durante la transición, los configs exponen ambos `tone` y `cls`. El
campo `cls` queda **deprecado** — los callsites que lo usan se migran
a `tone` cuando se toquen. Cuando todos los callsites estén migrados,
`cls` se elimina del shape (Sprint 2+ de `badge-system`).

> **Por qué**: backwards-compat sin breaking changes. La iniciativa cierra
> cuando el último `cls` desaparece, no cuando se introduce `tone`.

#### B5 — Variants legacy (`default`, `secondary`, etc.) coexisten con `tone`

`<Badge variant="outline">Count</Badge>` sigue funcionando para usos
no-semánticos (count badges, link badges, etc.). Si se pasan ambos
`variant` y `tone`, **`tone` gana** — los styles de variant se descartan
para no pelear con los de tone.

> **Por qué**: el `<Badge>` shadcn cubre más casos que solo status;
> mantener variants permite usos no-semánticos sin contaminar.

#### B6 — `<Badge tone="neutral">` para fallback de slugs desconocidos

Cuando el config no tiene un slug registrado (e.g. estado nuevo en DB
no propagado a la UI), el componente rendea `<Badge tone="neutral">`
con el slug crudo como label. Así nunca crashea ni queda sin estilo.

```tsx
const cfg = ESTADO_CONFIG[estado];
if (!cfg) return <Badge tone="neutral">{estado}</Badge>;
return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
```

> **Por qué**: defensivo contra drift DB↔UI sin romper la página. Si el
> slug no está mapeado, el usuario lo ve raw + neutral; un PR siguiente
> agrega el mapping correcto.

### A11y mínimo

- `<Badge>` es display-only (`<span>`); no necesita aria-role explícito.
- Color contrast: cada tone tiene background `15%` + text `400` que
  cumple WCAG AA contra fondos típicos del app (verificado en `bg-card`
  y `bg-panel`).
- No depender de color solo: el `label` siempre se renderea como texto.
  Filtros de color (daltónicos) leen el label, no el tone.

## Implementación

- **Sprint 1** (este PR): foundation — extender `<Badge>` con 6 tones +
  `BadgeTone` export. Refactor de `lib/status-tokens.ts` agregando
  `tone` a cada config (junta, prioridad DILESA, anteproyecto, terreno
  etapa, prototipo etapa, proyecto fase). Refactor de
  `components/tasks/tasks-shared.tsx` agregando `tone` a `ESTADO_CONFIG`,
  `PRIORIDAD_CONFIG`, `UPDATE_TIPO_CONFIG`. Migrar `EstadoBadge` +
  `PrioridadBadge` de tasks como golden path. ADR-017.
- **Sprint 2+**: migrar callsites que rendean `<span className={cfg.cls}>`
  a `<Badge tone={cfg.tone}>` (≈11 archivos). Eliminar `cls` de los
  configs.
- **Sprint final**: cerrar la iniciativa cuando el último `cls` desaparezca.

## Consecuencias

### Positivas

- **Single source of truth de la paleta**: cambiar el "azul de info" se
  hace en `<Badge>` una vez, no en 11 archivos.
- **Decisión semántica una vez por slug**: en `status-tokens.ts`. El
  caller no decide colores.
- **Type-safe**: `BadgeTone` es enum exportado; configs nuevos lo importan.
- **Code review más simple**: ¿tone correcto? ¿label correcto? Stop.
- **Migración incremental** sin breaking changes (cls legacy preservado).

### Negativas

- **Coexistencia temporal de `tone` + `cls`** en los configs hasta que
  cierre la iniciativa. Los configs son ~80 líneas más largos.
- **6 tones es opinión**: alguien podría argumentar que "cyan/sky" merece
  su propio tone. Por ahora se mapean a `info`. Si surge necesidad real
  (ej. distinguir "informational" vs "in-progress"), se agrega.

### Cosas que NO cambian

- `<Badge>` variants (`default`, `secondary`, etc.) — siguen para usos no-semánticos.
- `lib/status-tokens.ts` shape — solo se agrega `tone`; los slugs y labels existentes no cambian.
- Cómo los configs se consumen — los callsites mantienen `cfg.label`.

## Fuera de alcance v1

- **Tones para callouts grandes** (banners, alerts). Esos viven en `<ErrorBanner>` (ADR-006) y se tratan distinto.
- **Tones con dot indicator** (e.g. `<Badge tone="danger" dot />`). El `<PrioridadTextBadge>` de tasks tiene un dot custom; si se quiere generalizar, sale en una iteración futura.
- **Hover/clickable badges** (badges como links). Las variants legacy ya cubren `link` y `ghost`; tones se mantienen display-only.
- **Iconos integrados** (`<Badge tone="success" icon={Check}>`). Útil pero no necesario para v1.

## Referencias

- Componente: [components/ui/badge.tsx](../../components/ui/badge.tsx)
- Tokens: [lib/status-tokens.ts](../../lib/status-tokens.ts)
- Iniciativa: [docs/planning/badge-system.md](../planning/badge-system.md)
- ADR-010 — modelo de migración incremental (DT8 deprecation pattern).
