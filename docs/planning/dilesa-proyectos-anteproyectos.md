# Iniciativa — Proyectos DILESA: Anteproyectos como sub-tab + presupuestos preliminares

**Slug:** `dilesa-proyectos-anteproyectos`
**Empresas:** DILESA
**Schemas afectados:** `dilesa` (extender — completar UI sobre `anteproyectos` + `v_anteproyectos_analisis` existentes; tabla nueva para presupuestos preliminares; sub-slugs en `core.modulos`)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-05-26
**Última actualización:** 2026-05-26 (promovida)

## Problema

El módulo `/dilesa/proyectos` es flat hoy: una sola tabla
([`app/dilesa/proyectos/page.tsx`](../../app/dilesa/proyectos/page.tsx))
que mezcla todo lo que el schema considera "proyecto", sin separar
visualmente las fases del ciclo de vida:

1. **Anteproyectos** son evaluaciones de viabilidad: ¿cuántos lotes
   salen del terreno?, ¿qué prototipos meto?, ¿qué utilidad proyectada
   tengo?, ¿qué presupuestos preliminares de costos tengo (cotizaciones
   tempranas de urbanización, materiales, etc.)? — el resultado es una
   decisión de **arrancar o descartar**.
2. **Proyectos activos** son los que ya pasaron la decisión y están
   en ejecución o terminados. Aquí lo que importa es el control de
   ejecución contra el presupuesto (que viene heredado del anteproyecto)
   y el avance físico/comercial.

Mezclarlos en la misma tabla:

- Hace ruido visual — un proyecto en evaluación no es comparable con
  uno en construcción.
- Diluye los KPIs operativos del módulo (no es lo mismo "utilidad
  proyectada en evaluación" que "utilidad realizada en ejecución").
- Esconde el flujo natural anteproyecto → proyecto que el operador
  vive a diario.

Estado de la implementación hoy:

- `dilesa.anteproyectos` (tabla) + `dilesa.v_anteproyectos_analisis`
  (vista de análisis financiero con aprovechamiento, márgenes,
  referencias a prototipos) ya existen — sprint `dilesa-1a`,
  migración [`20260423100800_dilesa_v_anteproyectos_analisis.sql`](../../supabase/migrations/20260423100800_dilesa_v_anteproyectos_analisis.sql).
- Los campos `proyecto_id` / `convertido_a_proyecto_en` /
  `convertido_a_proyecto_por` ya están en el schema — el modelo de
  conversión **ya está cableado en DB**.
- **NO hay UI de Anteproyectos** — la tabla puede estar vacía o casi.
- **NO hay modelo de presupuestos preliminares** — Beto los obtiene
  hoy pero no tienen home en BSOP.
- **NO hay mecanismo de promoción** que arrastre el presupuesto del
  anteproyecto al control de ejecución del proyecto.

## Outcome esperado

1. **Proyectos con 2 sub-tabs** siguiendo el patrón canónico ADR-005
   / ADR-030: `Activos` (lo que existe hoy, sin tocar lógica) y
   `Anteproyectos` (UI nueva).
2. **UI completa de Anteproyectos** — listado + drawer/page de detalle
   con análisis financiero conectado a `v_anteproyectos_analisis`,
   formulario de captura, filtros (estado, etapa, decisión, prioridad).
3. **Presupuestos preliminares con home** — modelo nuevo que permite
   capturar cotizaciones tempranas (partidas + monto + fuente:
   cotización/referencia/proveedor) dentro del anteproyecto.
4. **Conversión anteproyecto → proyecto** — acción "promover" que crea
   el proyecto, arrastra los presupuestos preliminares como línea base
   del control de ejecución, setea los campos de trazabilidad
   (`convertido_a_proyecto_en/_por`).

## Modelo conceptual

### Sub-tabs en Proyectos (Sprint 1)

Reestructurar `app/dilesa/proyectos/page.tsx` siguiendo el patrón
canónico de [ADR-005](../adr/005_routed_tabs.md) +
[ADR-030](../adr/030_submodule_permissions.md):

```
app/dilesa/proyectos/
  layout.tsx                  ← define TABS array con `module: '<sub-slug>'`
  page.tsx                    ← redirect/default al primer tab
  activos/page.tsx            ← lo que hoy es page.tsx (sin tocar lógica)
  anteproyectos/page.tsx      ← skeleton en Sprint 1, real en Sprint 2
```

Sub-slugs RBAC nuevos (ADR-030 SS1-SS7):

- `dilesa.proyectos.activos` — clona permisos del padre `dilesa.proyectos`.
- `dilesa.proyectos.anteproyectos` — clona permisos del padre.

Padre `dilesa.proyectos` se mantiene como umbrella (visibilidad sidebar).

### Presupuestos preliminares (Sprint 3)

Tabla nueva en `dilesa` con relación 1:N anteproyecto → partidas
preliminares. Naming tentativo (a definir al cerrar D1):

```
dilesa.anteproyectos_presupuestos_preliminares
  id, anteproyecto_id (FK), partida (text), descripcion (text),
  monto_estimado (numeric), unidad (text), cantidad (numeric),
  fuente (enum: 'cotizacion' | 'referencia' | 'proveedor' | 'estimado_interno'),
  proveedor_persona_id (FK opcional a erp.personas),
  notas (text), created_at, updated_at, deleted_at
```

RLS canónica `core.fn_has_empresa(empresa_id) OR core.fn_is_admin()`.
`empresa_id` heredado vía JOIN al anteproyecto.

### Conversión anteproyecto → proyecto (Sprint 4)

Server action / RPC que en una transacción:

1. INSERT en `dilesa.proyectos` con datos heredados del anteproyecto
   (clave_interna, terreno_id, tipo_proyecto_id, etc.).
2. Copia los presupuestos preliminares al modelo de control de
   ejecución del proyecto (forma exacta depende de D1 — ver
   "Decisiones abiertas").
3. UPDATE en `dilesa.anteproyectos` setea `proyecto_id`,
   `convertido_a_proyecto_en`, `convertido_a_proyecto_por`.
4. Bitácora del evento (si se integra con `activity-log-pattern`).

Idempotente: si el anteproyecto ya tiene `proyecto_id`, la acción
falla con mensaje claro ("ya convertido").

## Decisiones abiertas (D1-D2)

### D1 — Modelado del presupuesto que se arrastra

¿Cómo modelamos la relación entre presupuesto preliminar y presupuesto
de control de ejecución del proyecto?

**Opción A — Continuidad (misma tabla, flag de fase).** Una sola
tabla `dilesa.proyectos_presupuestos` con columna `fase` ∈
{`preliminar`, `ejecucion`}. Al promover, las filas mueven de fase
y se enlazan al proyecto. Pro: simpler model, una sola query.
Contra: pierde la trazabilidad histórica "qué pensábamos al inicio
vs qué pasó realmente".

**Opción B — Separación (entidades distintas).** Preliminares viven
en `dilesa.anteproyectos_presupuestos_preliminares` y se preservan
inmutables como histórico. Al promover, se hace SNAPSHOT-INSERT en
`dilesa.proyectos_presupuestos` (tabla nueva, modelo de control real
con `monto_estimado` + `monto_ejercido` + estado de partida). Pro:
trazabilidad full anteproyecto vs realidad. Contra: 2 tablas similares
en estructura.

**Sesgo de Claude:** opción B. La trazabilidad histórica del análisis
de viabilidad es exactamente el caso de uso del anteproyecto — sin
ella el módulo pierde valor para postmortems.

### D2 — KPIs del anteproyecto

Curaduría de los KPIs reactivos a filtros (cap 5 por ADR-034) en la
tab Anteproyectos. Propuesta default:

1. **# anteproyectos activos** (estado ≠ `descartado` ni `convertido`)
2. **Monto inversión proyectada total** (suma de
   `costo_total_proyecto` de la vista)
3. **Utilidad proyectada total** (suma de `utilidad_proyecto`)
4. **Margen promedio %**
5. **# en decisión pendiente** (filtro por `decision_actual`)

Beto confirma o ajusta esta lista al cerrar v1.

## Sprints (4)

### Sprint 1 — Refactor a sub-tabs

- Crear estructura `app/dilesa/proyectos/{activos,anteproyectos}/page.tsx` y
  `layout.tsx` con `RoutedModuleTabs`.
- Migración SQL: INSERT de los 2 sub-slugs en `core.modulos` + backfill
  defensivo de permisos clonando desde el padre `dilesa.proyectos`
  (ver plantilla en CLAUDE.md "Liberación de módulo nuevo").
- Actualizar `ROUTE_TO_MODULE` y `EXPECTED_DB_MODULE_SLUGS`.
- Mover lógica actual de `proyectos/page.tsx` a `proyectos/activos/page.tsx`
  sin tocar `<ProyectosModule>` (cero churn en componente).
- Tab Anteproyectos = skeleton con `<EmptyState>`.
- Regenerar `SCHEMA_REF.md` + `types/supabase.ts`.
- 1 PR.

### Sprint 2 — UI de Anteproyectos

- `<AnteproyectosModule>` componente nuevo en
  `components/dilesa/anteproyectos-module.tsx`.
- Listado con filtros (estado, etapa, decisión actual, prioridad),
  date range filter (`fecha_inicio` o `fecha_ultima_revision`),
  pattern canónico `<DataTable>` + `<ModuleKpiStrip>`.
- Detail drawer/page con análisis financiero conectado a
  `v_anteproyectos_analisis` — tarjeta con aprovechamiento, costos,
  utilidad, margen.
- Formulario de captura (`<Form>` + zod + RHF, patrón ADR-016).
- KPIs reactivos según D2.
- Tests unitarios siguiendo patrón `kpis-modulos`.
- 1 PR.

### Sprint 3 — Presupuestos preliminares

- Migración SQL: tabla `dilesa.anteproyectos_presupuestos_preliminares`
  - RLS + índices + comentarios. `NOTIFY pgrst, 'reload schema'`.
- UI dentro del drawer/page del anteproyecto: sección "Presupuestos
  preliminares" con tabla editable inline o sub-drawer de captura.
- Cálculo automático de "total preliminar estimado" + comparación
  con `costo_total_proyecto` de la vista de análisis.
- Regenerar `SCHEMA_REF.md` + `types/supabase.ts`.
- 1 PR.

### Sprint 4 — Conversión anteproyecto → proyecto

- RPC/server action `dilesa.fn_anteproyecto_promote(anteproyecto_id)`
  con la lógica transaccional descrita arriba.
- UI: botón "Promover a proyecto" en el detalle del anteproyecto
  (gated por `decision_actual = 'viable'` o equivalente — a definir).
- ConfirmDialog con preview del proyecto que se va a crear.
- Test E2E o unitario de la promoción (anteproyecto antes/después +
  proyecto creado + presupuestos copiados).
- Closeout: actualizar planning doc + INITIATIVES.md + barrido de
  Reminders.
- 1 PR.

## Riesgos

1. **D1 sin cerrar puede bloquear Sprint 3.** El diseño de la tabla
   de presupuestos preliminares depende de si se va con A o B. Cerrar
   D1 con Beto antes de arrancar Sprint 3.
2. **Drift histórico en `dilesa.anteproyectos`.** Si la tabla tiene
   filas legacy de Coda o de pruebas, validar la calidad antes de
   exponerlas en UI. Si está vacía (probable), no hay riesgo.
3. **Performance del análisis financiero.** La vista
   `v_anteproyectos_analisis` hace JOIN a `terrenos` + LEFT JOIN a
   un CTE de prototipos por anteproyecto. Si la tabla crece (>200
   anteproyectos), monitorear `EXPLAIN`.
4. **Conflicts en `INITIATIVES.md`.** Sprint 1 toca sidebar y RBAC
   (hotspots cruzados con otras iniciativas en curso). Rebase
   preventivo antes de cada push.

## Bitácora

- **2026-05-26** — Promovida a `proposed` tras conversación con Beto.
  Estado actual del módulo, gaps y propuesta de alcance documentados.
  Pendiente: cerrar D1 (modelado del presupuesto) + D2 (KPIs) para
  pasar a `planned`.

## Decisiones registradas

_Pendientes — se llenan al cerrar D1 y D2._
