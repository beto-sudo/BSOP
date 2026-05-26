# ADR-034 — Module-level KPI strips (KPI1-KPI7)

- **Status**: Accepted
- **Date**: 2026-05-25
- **Authors**: Beto, Claude Code (iniciativa `kpis-modulos`)
- **Companion to**: [ADR-004](./004_module_page_anatomy.md) (anatomía
  general de la página de módulo; R3 ya menciona el cap de 5 KPIs),
  [ADR-005](./005_module_with_submodules_routed_tabs.md) (tabs
  routed), [ADR-030](./030_submodule_permissions.md) (sub-slugs).

---

## Contexto

Las páginas/tabs operativas de DILESA (Proyectos, Construcción,
Ventas) tienen tablas extensas pero **no exponen panorama**. Para
entender cómo va el módulo hay que abrir filas o exportar a Excel.

`<ModuleKpiStrip>` ya existe en
[components/module-page/module-kpi-strip.tsx](../../components/module-page/module-kpi-strip.tsx)
y el módulo **Playtomic** (en
[components/playtomic/kpi-section.tsx](../../components/playtomic/kpi-section.tsx))
ya tiene un precedente vivo de KPIs reactivos a filtros — cuando el
usuario aplica filtro de fecha/cancha/etc., las cards de arriba y la
tabla se recalculan en el mismo render desde el mismo dataset.

Lo que falta no es la primitiva — es **convención**: dónde va, cuántos
KPIs, cómo se derivan, qué formato, cómo reaccionan al filtro. Sin
esas reglas, cada módulo va a inventar y vamos a terminar con 6 strips
inconsistentes en empresas distintas.

ADR-004 R3 ya menciona el cap de 5 KPIs como decisión de producto, no
de layout. Este ADR lo formaliza junto con 6 reglas más que ese
cap-solo no resuelve.

## Decisión

7 reglas KPI1-KPI7 que cualquier strip de KPIs en una página/tab de
módulo debe cumplir.

### KPI1 — Cap duro de 5 KPIs por strip

`<ModuleKpiStrip>` aplica el cap a nivel componente (loguea warning
en dev si recibe 6+, rendea solo los primeros 5). El cap no es solo
layout — es disciplina de producto. Si una superficie necesita >5
KPIs, son dos posibilidades:

1. Hay un módulo escondido que merece ser superficie separada (otra
   tab o sub-page).
2. Los 5 actuales no son los correctos — replantear cuáles son los
   top 5 que disparan decisión.

No hay "excepción documentada" silenciosa. Si una superficie
genuinamente necesita 6, se actualiza este ADR con la razón.

> **Por qué**: sin un cap, los strips crecen a 8-10 cards hasta que
> ningún usuario los lee. El número mágico de 5 viene de ADR-004 R3 y
> de cómo se ve `grid-cols-2 md:grid-cols-3 lg:grid-cols-5` (línea
> única en desktop, 2 columnas limpias en mobile).

### KPI2 — Derivación client-side desde el dataset de la tabla

Los KPIs derivan del **mismo array de rows** que alimenta la tabla.
Cero queries adicionales en mount. Cero RPCs nuevas solo para KPIs.
Cero vistas DB nuevas solo para KPIs.

```tsx
const filteredRows = useMemo(() => applyFilters(rows, filters), [rows, filters]);
const kpis = useMemo(() => deriveKpis(filteredRows), [filteredRows]);
```

Si una métrica genuinamente requiere agregaciones que no caben en
client (ej. comparativos cross-empresa multi-año), no es un KPI de
strip — es un dashboard separado (módulo Analytics).

> **Por qué**: deriva client-side garantiza que KPIs y tabla NO pueden
> desincronizarse — si el row está en la tabla, cuenta para el KPI. Si
> el filtro lo excluyó, no cuenta. Cero drift posible. Patrón Playtomic
> ya validado.

### KPI3 — Reactivos a los filtros activos

Cuando el filtro cambia, los KPIs se recalculan en el mismo render
que la tabla. Sin debounce, sin loader, sin transición separada.
Visualmente el strip y la tabla cambian juntos.

Si la página no tiene filtros (caso raro), KPIs siguen aplicando —
solo no reaccionan a nada. No es razón para no ponerlos.

> **Por qué**: el valor del strip emerge precisamente al filtrar.
> "Ventas de Lomas del Bosque" → ver cuánto suman, en qué fase están,
> quién las vende. KPIs no-reactivos son solo decoración.

### KPI4 — Cada KPI dispara una decisión

Test del autor (criterio aplicable durante el Sprint 0 de cada
superficie): "¿qué hace Beto/operador si este número cambia?". Si la
respuesta es "nada", el KPI no merece estar.

Anti-patrones explícitos:

- `Total rows` sin contexto adicional. (Solo vale si el delta entre
  periodos es la decisión — pero entonces el KPI real es el delta.)
- KPIs cosméticos que confirman lo obvio ("# de columnas en el
  filtro").
- KPIs derivados de cálculos que el usuario igual va a verificar
  manualmente porque no confía.

Si dos KPIs se mueven juntos siempre (ej. "# ventas" y "$ pipeline"
correlan al 99%), redundancia: dejar uno solo y abrir espacio para
otro.

> **Por qué**: cards numéricas decorativas erosionan la atención del
> usuario sobre las que sí importan. Mejor 3 KPIs útiles que 5
> decorativos.

### KPI5 — Formato canónico de value

- `value` siempre con `tabular-nums` (ya viene del componente).
- Sin datos: `—` (no `0`, no `null`, no `N/A`).
- Loading: skeleton del strip o estado neutro; no mostrar `0` mientras
  carga.
- Cero "0" cuando el valor real es "sin datos todavía" (esto pasa con
  Construcción pre-captura — el strip debe distinguir entre "0 obras
  activas" real y "no hay obras capturadas").

> **Por qué**: `0` y `—` significan cosas distintas. Confundirlos
> erosiona la confianza en el strip.

### KPI6 — Formato de display alineado con `lib/format/`

- **Monedas**: `formatCurrency(value)` → `$1,234.56`. Para strips con
  espacio horizontal limitado, `formatCurrency(value, { compact: true })`
  → `$1.5M`.
- **Porcentajes**: `formatPercent(0–1)` → `27.5%` (1 decimal por
  default). El valor de entrada es proporción 0–1, no 0–100.
- **Conteos**: entero sin separadores hasta 4 dígitos; con
  `toLocaleString('es-MX')` desde 5 dígitos.
- **Fechas** (cuando un KPI es una fecha, ej. "próximo vencimiento"):
  `formatDateShort` → `25 may`. Si pasaron más de 30 días, `formatDate`
  completo.
- **Duraciones**: días enteros, `"3 días"` / `"45 días"`. Nunca horas
  decimales.

Mantiene coherencia con cómo se muestran los mismos tipos de dato en
la tabla y en el drawer.

> **Por qué**: que el `$1,234,567.89` del KPI sea el mismo formato que
> el `$1,234,567.89` de la celda de la tabla. Inconsistencia de formato
> es ruido visual y dispara double-checking innecesario.

### KPI7 — Orden vertical canónico

```
<page>
  ├── <PageHeader />               (título + actions del módulo)
  ├── <ModuleKpiStrip stats={...} /> ← AQUÍ
  ├── <Filters /> / <FilterBar />
  └── <DataTable />
```

KPIs van **arriba** de los filtros, no entre filtros y tabla. Razón:
los KPIs son la "primera mirada" — el usuario los ve, decide si
necesita filtrar más, y solo entonces interactúa con los filtros. Si
el strip está abajo, perdemos el momento de "primera mirada".

Excepción explícita: si la página tiene `<RoutedModuleTabs>` (caso
DILESA/Construcción y DILESA/Ventas), el strip de tabs va antes del
strip de KPIs porque el strip de tabs es navegación cross-superficie,
no info de la superficie actual.

```
<page>
  ├── <RoutedModuleTabs />          (navegación, viene del layout)
  ├── <ModuleKpiStrip />            ← AQUÍ (info de la tab actual)
  ├── <Filters />
  └── <DataTable />
```

> **Por qué**: el orden vertical refleja la jerarquía de atención.
> Tabs (¿dónde estoy?) → KPIs (¿cómo va?) → filtros (¿quiero
> recortar?) → tabla (¿cuáles son?). Cambiar este orden rompe el
> flujo cognitivo del usuario.

## Estructura del componente

`<ModuleKpiStrip>` ya existe y cubre KPI1 (cap), KPI5 (`tabular-nums`),
y los grids responsivos. Lo que no impone es KPI2 (derivación), KPI3
(reactividad), KPI4 (decisión), KPI6 (formato) ni KPI7 (orden) —
esos son decisiones del caller. ADR-034 las codifica.

Forma típica del caller:

```tsx
'use client';

import { ModuleKpiStrip, type ModuleKpi } from '@/components/module-page';
import { formatCurrency, formatPercent } from '@/lib/format';

function deriveKpis(rows: readonly VentaRow[]): readonly ModuleKpi[] {
  const total = rows.length;
  const cerradas = rows.filter((r) => r.estado === 'cerrada').length;
  const pipeline = rows.reduce((acc, r) => acc + (r.precio ?? 0), 0);
  return [
    { key: 'count', label: 'Ventas', value: total },
    {
      key: 'pipeline',
      label: 'Pipeline',
      value: total === 0 ? '—' : formatCurrency(pipeline, { compact: true }),
    },
    {
      key: 'cerradas_pct',
      label: '% cerradas',
      value: formatPercent(total === 0 ? null : cerradas / total),
    },
    // ...hasta 5
  ];
}

export function VentasModule() {
  const filtered = useFilteredRows();
  const kpis = useMemo(() => deriveKpis(filtered), [filtered]);
  return (
    <>
      <ModuleKpiStrip stats={kpis} cols={5} />
      <Filters />
      <DataTable rows={filtered} />
    </>
  );
}
```

Si emergen helpers compartidos (`sum`, `groupBy`, `daysSince`), van a
`lib/kpis/`. Si emergen patrones específicos por dominio (ej.
`derivePipelineKpis` para Ventas), viven en
`components/<empresa>/<module>/kpis.ts` y se importan desde el module.

## Implementación

- **Sprint 0** (este PR): ADR-034 + curaduría final de KPIs por las 5
  tabs de Ventas (anexo en `docs/planning/kpis-modulos.md`).
- **Sprint 1**: golden migration en Ventas (5 PRs, una por tab) +
  auditoría de columnas de cada tabla.
- **Sprint 2**: Proyectos (1 PR, página flat).
- **Sprint 3**: Construcción (parcial — diferir tabs sin datos).
- **Sprint 4**: closeout + decidir si Playtomic se refactoriza al
  patrón canónico o queda como excepción documentada.

## Consecuencias

### Positivas

- **Cero queries extras** por strip (KPI2). El cost de agregar un
  strip a una superficie nueva es ~50 LOC + curaduría.
- **Cero drift KPI ↔ tabla** (KPI2+KPI3). Si los rows cambian, ambos
  cambian.
- **Disciplina de curaduría** (KPI1+KPI4). Forzar elegir 5 evita la
  trampa de "agregamos 12 KPIs y ya".
- **Consistencia visual** (KPI5+KPI6+KPI7). Mismo orden, mismo
  formato, mismo handling de `—` en cualquier superficie.
- **Patrón listo para RDB/ANSA** cuando llegue su turno — la
  primitiva y las reglas ya están codificadas.

### Negativas

- **Cap de 5 puede pelearse con superficies grandes**. Mitigación:
  KPI1 dice que es signal de que algo está mal estructurado, no que
  el cap esté mal. Si emerge caso real, este ADR se actualiza.
- **Derivación client-side limita métricas cross-dataset**. Si en el
  futuro queremos "comparar Ventas vs período anterior", no cabe en
  KPI2 — pero ese es trabajo de Analytics, no del strip.
- **Curaduría es trabajo cabeza-arriba con Beto**. Cada superficie
  nueva requiere Sprint 0 para cerrar los 5 KPIs. Es feature, no bug.

### Cosas que NO cambian

- `<ModuleKpiStrip>` API y comportamiento existente.
- ADR-004 (anatomía general). R3 sigue vigente; este ADR la formaliza.
- Playtomic queda con su `<KpiCard>` propio por ahora — Sprint 4
  decide si migra o queda como excepción.
- Otros módulos sin strip (admin, settings, RH, inventario stock) no
  son obligados a sumar KPIs. Este ADR aplica solo cuando se decide
  añadir un strip.

## Fuera de alcance v1

- **Charts/sparklines** dentro del strip. Solo cards numéricas. Si una
  superficie genuinamente necesita charts, es un dashboard separado.
- **Comparativos vs periodo anterior** (KPI con delta). Posible v2 si
  el caso emerge, pero no en v1.
- **KPIs con drilldown** (click en KPI filtra la tabla a esa
  dimensión). Posible v2 — patrón Playtomic ya lo tiene parcialmente
  (clicks abren detail), pero formalizarlo cross-módulo requiere
  decisiones de UX adicionales.
- **Persistencia de configuración del strip por usuario** (ej. "yo
  quiero ver estos 3 KPIs y no esos 2"). Posible v3 si el patrón se
  vuelve crítico.
- **KPIs cross-empresa o cross-período**. Caso de Analytics, no del
  strip de un módulo.

## Referencias

- Componente: [components/module-page/module-kpi-strip.tsx](../../components/module-page/module-kpi-strip.tsx)
- Precedente vivo: [components/playtomic/kpi-section.tsx](../../components/playtomic/kpi-section.tsx)
- Iniciativa: [docs/planning/kpis-modulos.md](../planning/kpis-modulos.md)
- ADR-004 — anatomía de página de módulo (R3 menciona el cap de 5).
- ADR-005 — tabs routed (KPI7 cubre el caso).
- ADR-030 — sub-slugs (cada tab es superficie independiente).
