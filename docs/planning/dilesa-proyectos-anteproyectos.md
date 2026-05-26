# Iniciativa — Proyectos DILESA: Anteproyectos como sub-tab + plantilla de trabajo + conversión

**Slug:** `dilesa-proyectos-anteproyectos`
**Empresas:** DILESA
**Schemas afectados:** `dilesa` (4 tablas nuevas: `plantilla_anteproyecto_tareas`, `anteproyecto_tareas`, `anteproyecto_presupuestos_preliminares`, `proyectos_presupuestos`; usa `anteproyectos` + `v_anteproyectos_analisis` existentes; sub-slugs en `core.modulos`)
**Estado:** planned
**Dueño:** Beto
**Creada:** 2026-05-26
**Última actualización:** 2026-05-26 (alcance v1 cerrado tras D1+D2; Beto pidió agregar **plantilla preestablecida** de tareas/trámites/cotizaciones por anteproyecto que al promover queda **ligada al proyecto**; sigue 4 sprints + closeout)

## Problema

El módulo `/dilesa/proyectos` es flat hoy: una sola tabla
([`app/dilesa/proyectos/page.tsx`](../../app/dilesa/proyectos/page.tsx))
que mezcla todo lo que el schema considera "proyecto", sin separar
visualmente las fases del ciclo de vida:

1. **Anteproyectos** son evaluaciones de viabilidad: ¿cuántos lotes
   salen del terreno?, ¿qué prototipos meto?, ¿qué utilidad proyectada
   tengo?, ¿qué trámites debo arrancar?, ¿qué cotizaciones tempranas
   tengo? — el resultado es una decisión de **arrancar o descartar**.
2. **Proyectos activos** son los que ya pasaron la decisión y están
   en ejecución o terminados. Aquí lo que importa es el control de
   ejecución contra el presupuesto (heredado del anteproyecto) y el
   avance físico/comercial.

Mezclarlos en la misma tabla:

- Hace ruido visual — un proyecto en evaluación no es comparable con
  uno en construcción.
- Diluye los KPIs operativos del módulo (no es lo mismo "utilidad
  proyectada en evaluación" que "utilidad realizada en ejecución").
- Esconde el flujo natural anteproyecto → proyecto que el operador
  vive a diario.

Además, el **trabajo del anteproyecto hoy vive en la cabeza del
operador**. No hay checklist canónica de "qué tienes que llenar antes
de declarar un anteproyecto como viable" — los trámites (licencias,
factibilidades), cotizaciones (urbanización, materiales) y
determinaciones de costo (terreno, infraestructura) se hacen sin un
patrón replicable. Cuando se promueve a proyecto, ese trabajo se
pierde o se duplica.

Estado de la implementación hoy:

- `dilesa.anteproyectos` (tabla) + `dilesa.v_anteproyectos_analisis`
  (vista de análisis financiero con aprovechamiento, márgenes,
  referencias a prototipos) ya existen — sprint `dilesa-1a`,
  migración [`20260423100800_dilesa_v_anteproyectos_analisis.sql`](../../supabase/migrations/20260423100800_dilesa_v_anteproyectos_analisis.sql).
- Los campos `proyecto_id` / `convertido_a_proyecto_en` /
  `convertido_a_proyecto_por` ya están en el schema — el modelo de
  conversión **ya está cableado en DB**.
- **NO hay UI de Anteproyectos** — la tabla puede estar vacía o casi.
- **NO hay catálogo de tareas preestablecidas** por anteproyecto.
- **NO hay modelo de presupuestos preliminares** — Beto los obtiene
  hoy pero no tienen home en BSOP.
- **NO hay mecanismo de promoción** que arrastre el trabajo del
  anteproyecto al proyecto.

## Outcome esperado

1. **Proyectos con 2 sub-tabs** siguiendo el patrón canónico ADR-005
   / ADR-030: `Activos` (lo que existe hoy, sin tocar lógica) y
   `Anteproyectos` (UI nueva).
2. **UI completa de Anteproyectos** — listado + drawer/page de detalle
   con análisis financiero conectado a `v_anteproyectos_analisis`,
   formulario de captura, filtros (estado, etapa, decisión, prioridad).
3. **Plantilla de trabajo preestablecida** — catálogo global por
   empresa con las tareas canónicas que un anteproyecto debe completar
   (trámites, cotizaciones, determinaciones de costo). Al crear un
   anteproyecto, las tareas se instancian automáticamente. Cada tarea
   tiene estado, responsable, fecha objetivo, monto resultado y
   documento/comprobante adjunto.
4. **Presupuestos preliminares con home** — modelo nuevo (partidas +
   monto + fuente + flag `autorizado`) que puede ligarse a la tarea
   originadora (la cotización del proveedor X produjo el monto de la
   partida Y).
5. **Conversión anteproyecto → proyecto que preserva el trabajo** —
   acción "promover" que crea el proyecto, **rehoga** las tareas
   ejecutadas (mantienen FK al anteproyecto + ganan FK al proyecto)
   y snapshot-copia los presupuestos preliminares autorizados al
   modelo de control de ejecución. Trazabilidad completa hacia atrás
   (postmortem) y continuidad operativa hacia adelante (seguimiento).

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

### Plantilla de trabajo + tareas instanciadas (Sprint 3)

Patrón canónico catálogo + instancia (mismo shape conceptual que
`dilesa.plantilla_tareas` en construcción):

```sql
-- CATÁLOGO (global por empresa, opcionalmente filtrado por tipo_proyecto)
dilesa.plantilla_anteproyecto_tareas
  id, empresa_id (FK), nombre, descripcion,
  categoria (enum: 'tramite' | 'cotizacion' | 'determinacion_costo'
                 | 'analisis' | 'otro'),
  tipo_proyecto_id (FK opcional — null = aplica a todos los tipos),
  orden_default (int), activa (bool DEFAULT true),
  created_at, updated_at, deleted_at

-- INSTANCIAS (1:N por anteproyecto, snapshot del nombre al crear)
dilesa.anteproyecto_tareas
  id, anteproyecto_id (FK), plantilla_tarea_id (FK opcional — null = ad-hoc),
  nombre_snapshot (text), categoria (enum), descripcion (text),
  estado (enum: 'pendiente' | 'en_progreso' | 'completada'
              | 'no_aplica' | 'autorizada'),
  fecha_objetivo, fecha_completada,
  responsable_persona_id (FK opcional a erp.personas),
  resultado_monto (numeric — para cotizaciones/determinaciones),
  resultado_documento_url (text — comprobante/adjunto),
  notas (text),
  -- AL PROMOVER: las tareas que se hayan trabajado mantienen FK al
  -- anteproyecto Y ganan FK al proyecto. Las pendientes/no_aplica
  -- se quedan solo en el anteproyecto.
  proyecto_id (FK opcional — null hasta promover),
  created_at, updated_at, deleted_at
```

Al **crear un anteproyecto**, un trigger o server action instancia
las tareas de la plantilla activa filtrada por `tipo_proyecto_id =
<tipo del anteproyecto>` o `IS NULL`. El operador puede añadir
tareas ad-hoc (`plantilla_tarea_id IS NULL`) y modificar el estado
de las pre-instanciadas.

### Presupuestos preliminares (Sprint 3)

```sql
dilesa.anteproyecto_presupuestos_preliminares
  id, anteproyecto_id (FK),
  tarea_origen_id (FK opcional a anteproyecto_tareas
                   — para ligar la partida con la cotización
                   que produjo el monto),
  partida (text), descripcion (text),
  monto_estimado (numeric), unidad (text), cantidad (numeric),
  fuente (enum: 'cotizacion' | 'referencia' | 'proveedor' | 'estimado_interno'),
  proveedor_persona_id (FK opcional a erp.personas),
  -- workflow de autorización antes de la promoción
  autorizado (bool DEFAULT false),
  autorizado_at, autorizado_por (FK opcional a auth.users),
  notas (text), created_at, updated_at, deleted_at
```

RLS canónica `core.fn_has_empresa(empresa_id) OR core.fn_is_admin()`.
`empresa_id` heredado vía JOIN al anteproyecto en política RLS.

### Modelo de control de ejecución del proyecto (Sprint 4)

Decisión D1 = **Opción B (separación con snapshot)**. Tabla nueva
para el control real del proyecto:

```sql
dilesa.proyectos_presupuestos
  id, proyecto_id (FK),
  -- TRAZABILIDAD: si el monto viene de un preliminar autorizado,
  -- preserva el ID original para postmortem
  preliminar_origen_id (FK opcional a anteproyecto_presupuestos_preliminares),
  partida (text), descripcion (text),
  monto_aprobado (numeric — snapshot del monto_estimado autorizado
                           al momento de promover),
  monto_ejercido (numeric DEFAULT 0 — se va llenando con la ejecución
                                     real, vía estimaciones/contratos),
  unidad (text), cantidad (numeric),
  estado (enum: 'planeada' | 'en_ejercicio' | 'cerrada'),
  proveedor_persona_id (FK opcional),
  notas (text), created_at, updated_at, deleted_at
```

### Conversión anteproyecto → proyecto (Sprint 4)

RPC `dilesa.fn_anteproyecto_promote(anteproyecto_id uuid)` en una
transacción:

1. **INSERT en `dilesa.proyectos`** con datos heredados del anteproyecto
   (clave_interna, terreno_id, tipo_proyecto_id, responsable_id, etc.).
2. **UPDATE en `dilesa.anteproyecto_tareas`** SET `proyecto_id = <nuevo>`
   WHERE `anteproyecto_id = <ante>` AND `estado IN ('en_progreso',
'completada', 'autorizada')`. Las tareas pendientes / no_aplica se
   quedan solo en el anteproyecto (histórico).
3. **INSERT en `dilesa.proyectos_presupuestos`** por cada
   `anteproyecto_presupuestos_preliminares` con `autorizado = true`:
   `monto_aprobado = monto_estimado`, `monto_ejercido = 0`,
   `estado = 'planeada'`, `preliminar_origen_id = <id del preliminar>`.
   Los no-autorizados quedan vivos en el anteproyecto (no se llevan).
4. **UPDATE en `dilesa.anteproyectos`** SET `proyecto_id`,
   `convertido_a_proyecto_en = NOW()`, `convertido_a_proyecto_por =
auth.uid()`.
5. **Bitácora** del evento si se integra con `activity-log-pattern`
   (ADR-023).

Idempotente: si el anteproyecto ya tiene `proyecto_id`, la acción
falla con mensaje claro ("ya convertido al proyecto X el 2026-Y-Z").

Después de promover, **las tareas autorizadas/completadas viven con
doble FK** — el proyecto puede listarlas y actualizarlas (cambiar
estado, agregar comprobante, etc.) y el anteproyecto las sigue
mostrando como contexto histórico.

## Decisiones cerradas (D1-D2)

### D1 — Modelado del presupuesto que se arrastra ✅ Opción B + plantilla

**Decisión** (2026-05-26): Opción B (separación con snapshot), **más**
el concepto de plantilla preestablecida de tareas que Beto pidió. El
flujo combinado:

- Los presupuestos preliminares viven en
  `anteproyecto_presupuestos_preliminares` (inmutable como histórico
  del análisis de viabilidad).
- Tienen flag `autorizado` con su workflow (capturado en el
  anteproyecto, autorizado por Beto/director antes de promover).
- Al promover, se hace SNAPSHOT-INSERT en `proyectos_presupuestos`
  (modelo de control con `monto_aprobado` + `monto_ejercido` +
  estado) preservando `preliminar_origen_id` para trazabilidad.
- Las **tareas del anteproyecto** (cotizaciones, trámites,
  determinaciones de costo) que se hayan trabajado se rehogan al
  proyecto vía doble FK — quedan ligadas para seguimiento.

**Razón:** la trazabilidad histórica del análisis de viabilidad es
exactamente el caso de uso del anteproyecto — sin ella el módulo
pierde valor para postmortems. Y al ligar el **trabajo operativo**
(no solo los montos), el proyecto preserva todo el contexto del
anteproyecto sin duplicar nada.

### D2 — KPIs del anteproyecto ✅ Confirmados

**Decisión** (2026-05-26): los 5 KPIs propuestos.

1. **# anteproyectos activos** (estado ≠ `descartado` ni `convertido`)
2. **Monto inversión proyectada total** (suma de
   `costo_total_proyecto` de `v_anteproyectos_analisis`)
3. **Utilidad proyectada total** (suma de `utilidad_proyecto`)
4. **Margen promedio %**
5. **# en decisión pendiente** (filtro por `decision_actual`)

Todos reactivos a los filtros de la tab (cap 5 ADR-034, derivación
client-side).

## Sprints (4 + closeout)

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

### Sprint 2 — UI base de Anteproyectos

- `<AnteproyectosModule>` componente nuevo en
  `components/dilesa/anteproyectos-module.tsx`.
- Listado con filtros (estado, etapa, decisión actual, prioridad),
  date range filter (`fecha_inicio` o `fecha_ultima_revision`),
  patrón canónico `<DataTable>` + `<ModuleKpiStrip>`.
- Detail drawer/page con análisis financiero conectado a
  `v_anteproyectos_analisis` — tarjeta con aprovechamiento, costos,
  utilidad, margen.
- Formulario de captura básico (`<Form>` + zod + RHF, patrón ADR-016)
  para los campos directos de `dilesa.anteproyectos`.
- KPIs reactivos según D2.
- Tests unitarios siguiendo patrón `kpis-modulos`.
- 1 PR.

### Sprint 3 — Plantilla de tareas + presupuestos preliminares

- **Migración SQL**: 3 tablas nuevas (`plantilla_anteproyecto_tareas`,
  `anteproyecto_tareas`, `anteproyecto_presupuestos_preliminares`)
  - RLS + índices + comentarios + `NOTIFY pgrst, 'reload schema'`.
- **Seed inicial** de `plantilla_anteproyecto_tareas` con las tareas
  canónicas de DILESA (a coordinar con Beto: lista de trámites,
  cotizaciones y determinaciones que se hacen siempre — probable
  ~15-25 tareas iniciales).
- **Trigger** o server action que instancia tareas automáticamente
  al crear un anteproyecto.
- **UI** en el drawer/page del anteproyecto:
  - Sección "Checklist" con las tareas instanciadas (tabla editable
    inline con estado, responsable, fecha objetivo, monto resultado,
    documento adjunto). Permite agregar tareas ad-hoc.
  - Sección "Presupuestos preliminares" con tabla editable inline.
    Permite ligar partida a tarea originadora (dropdown). Campo
    `autorizado` con workflow (botón "Autorizar" → set `autorizado =
true`, `autorizado_at`, `autorizado_por`).
- Cálculo automático de "total preliminar autorizado" + comparación
  con `costo_total_proyecto` de `v_anteproyectos_analisis`.
- Regenerar `SCHEMA_REF.md` + `types/supabase.ts`.
- 1 PR.

### Sprint 4 — Conversión anteproyecto → proyecto

- **Migración SQL**: tabla `dilesa.proyectos_presupuestos` (modelo de
  control de ejecución) + RLS + índices + comentarios.
- **RPC** `dilesa.fn_anteproyecto_promote(anteproyecto_id uuid)` con
  la lógica transaccional descrita arriba (4 pasos).
- **UI**: botón "Promover a proyecto" en el detalle del anteproyecto
  (gated por `decision_actual = 'viable'` o equivalente — a definir
  con Beto al arrancar). ConfirmDialog con preview del proyecto que
  se va a crear + lista de tareas que se rehogan + monto del
  presupuesto que se snapshot-copia.
- **UI lado proyecto**: el detalle del proyecto debe mostrar las
  tareas heredadas del anteproyecto (sección read-mostly + actualizar
  estado/comprobante) y los presupuestos como línea base (con
  `monto_ejercido` editable o derivado de estimaciones/contratos).
- **Test** unitario o E2E de la promoción (anteproyecto antes/después
  - proyecto creado + tareas con doble FK + presupuestos copiados).
- Regenerar `SCHEMA_REF.md` + `types/supabase.ts`.
- **Closeout**: actualizar planning doc + INITIATIVES.md + barrido de
  Reminders.
- 1 PR.

## Riesgos

1. **Drift histórico en `dilesa.anteproyectos`.** Si la tabla tiene
   filas legacy de Coda o de pruebas, validar la calidad antes de
   exponerlas en UI. Si está vacía (probable), no hay riesgo.
2. **Performance del análisis financiero.** La vista
   `v_anteproyectos_analisis` hace JOIN a `terrenos` + LEFT JOIN a
   un CTE de prototipos por anteproyecto. Si la tabla crece (>200
   anteproyectos), monitorear `EXPLAIN`.
3. **Conflicts en `INITIATIVES.md`.** Sprint 1 toca sidebar y RBAC
   (hotspots cruzados con otras iniciativas en curso). Rebase
   preventivo antes de cada push.
4. **Seed de plantilla en Sprint 3 requiere input de Beto.** La lista
   de tareas canónicas vive en su cabeza/Coda; antes de Sprint 3
   arrancar pausa para coordinar la lista (puede ser un sub-sprint
   de exploración tipo "deep-dive" pequeño).
5. **Modelo de control `proyectos_presupuestos` puede chocar con
   estimaciones/contratos existentes.** El módulo Construcción ya
   tiene `dilesa.estimaciones` y `dilesa.contratos_construccion` que
   también son "ejecución del proyecto". Sprint 4 debe verificar
   que `proyectos_presupuestos.monto_ejercido` no duplique ni
   contradiga los montos de estimaciones (probablemente
   `monto_ejercido` = SUM de estimaciones aplicadas a esa partida —
   a definir).

## Bitácora

- **2026-05-26 (promoción)** — Promovida a `proposed` tras
  conversación con Beto. Estado actual del módulo, gaps y propuesta
  de alcance documentados. Pendiente: cerrar D1 (modelado del
  presupuesto) + D2 (KPIs) para pasar a `planned`. PR
  [#544](https://github.com/beto-sudo/BSOP/pull/544) mergeado.
- **2026-05-26 (planned)** — D1 + D2 cerradas en chat. Beto agregó
  el concepto de **plantilla preestablecida de tareas** por
  anteproyecto (trámites, cotizaciones, determinaciones de costo)
  que al promover queda **ligada al proyecto** (no se duplica). Doc
  actualizado: schema extendido a 4 tablas nuevas, Sprint 3 ampliado
  a incluir la plantilla, Sprint 4 incluye el modelo de control de
  ejecución del proyecto. Estado pasa a `planned`. Próximo hito:
  Sprint 1 (refactor a sub-tabs).

## Decisiones registradas

- **2026-05-26 — D1: Opción B (separación con snapshot) + plantilla
  de tareas ligada al proyecto post-promoción.** Los presupuestos
  preliminares viven en `anteproyecto_presupuestos_preliminares`
  (inmutable). Las tareas de la plantilla viven en
  `anteproyecto_tareas` y al promover ganan `proyecto_id` (FK doble:
  anteproyecto + proyecto) — el trabajo queda ligado para
  seguimiento sin duplicar. Los presupuestos autorizados se
  snapshot-copian a `proyectos_presupuestos` (modelo de control con
  `monto_ejercido`). Razón: trazabilidad histórica del análisis +
  continuidad operativa del trabajo.
- **2026-05-26 — D2: 5 KPIs del anteproyecto confirmados.**
  Activos · Inversión proyectada · Utilidad proyectada · Margen
  promedio · # en decisión pendiente. Reactivos a filtros, derivados
  client-side (ADR-034).
- **2026-05-26 — Workflow de autorización en presupuestos
  preliminares.** El operador captura → autorizador (Beto/director)
  marca `autorizado = true`. Solo los autorizados se snapshot-copian
  al proyecto al promover. Los no-autorizados quedan vivos en el
  anteproyecto como histórico de "se cotizó pero no se aprobó".
