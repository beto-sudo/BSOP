# Iniciativa — Proyectos DILESA: Anteproyectos como sub-tab + plantilla de trabajo + conversión

**Slug:** `dilesa-proyectos-anteproyectos`
**Empresas:** DILESA
**Schemas afectados:** `dilesa` (5 tablas nuevas: `plantilla_anteproyecto_tareas` + `plantilla_anteproyecto_tareas_dependencias` + `anteproyecto_tareas` + `anteproyecto_tareas_dependencias` + `proyectos_presupuestos`; tabla `anteproyecto_presupuestos_preliminares` también nueva → 6 tablas nuevas en total; usa `anteproyectos` + `v_anteproyectos_analisis` existentes; sub-slugs en `core.modulos`)
**Estado:** planned
**Dueño:** Beto
**Creada:** 2026-05-26
**Última actualización:** 2026-05-26 (refinamiento del modelo de plantilla tras leer la tabla canónica de Coda `table-7XBvWbyLzx` con 31 pasos + 12 dimensiones + 27 dependencias explícitas; agrega `aplicacion`/`tipo`/`subtipo`/`duracion_dias_habiles`/`entidad_responsable`/`obligatoriedad`/`se_entrega_a`/`requiere_archivo`+`formato_archivo` al catálogo + tabla de dependencias N:M + estado `bloqueada`; seed canónico = 31 Coda + 1 gate "Comité de Inversión" + 3 cotizaciones de obra = **35 tareas**)

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

Además, el **trabajo del anteproyecto hoy vive en Coda** (tabla
`Plantilla Trámites Estudios y Documentos` — 31 pasos canónicos con
12 dimensiones y 27 dependencias explícitas). No está expuesto en
BSOP, y al promover a proyecto el trabajo se pierde o se duplica.

Estado de la implementación hoy:

- `dilesa.anteproyectos` (tabla) + `dilesa.v_anteproyectos_analisis`
  (vista de análisis financiero con aprovechamiento, márgenes,
  referencias a prototipos) ya existen — sprint `dilesa-1a`,
  migración [`20260423100800_dilesa_v_anteproyectos_analisis.sql`](../../supabase/migrations/20260423100800_dilesa_v_anteproyectos_analisis.sql).
- Los campos `proyecto_id` / `convertido_a_proyecto_en` /
  `convertido_a_proyecto_por` ya están en el schema — el modelo de
  conversión **ya está cableado en DB**.
- **NO hay UI de Anteproyectos** — la tabla puede estar vacía o casi.
- **NO hay catálogo de tareas preestablecidas** por anteproyecto en
  BSOP — vive solo en Coda.
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
3. **Plantilla canónica de trabajo** — catálogo de **35 tareas**
   (31 importadas de Coda + 1 gate de decisión "Comité de Inversión"
   + 3 cotizaciones de obra) con taxonomía rica (tipo/subtipo/entidad/
   obligatoriedad/duración/dependencias). Al crear un anteproyecto, las
   tareas se instancian automáticamente respetando `aplicacion =
   'anteproyecto'`. Las fechas objetivo se calculan auto-mágicamente
   desde la fecha de arranque + grafo de dependencias + duración en
   días hábiles.
4. **Presupuestos preliminares con home** — modelo nuevo (partidas +
   monto + fuente + flag `autorizado`) que puede ligarse a la tarea
   originadora.
5. **Conversión anteproyecto → proyecto que preserva el trabajo** —
   acción "promover" (gated por la tarea "Comité de Inversión" en
   estado `completada` y `decision_actual = 'viable'`) que crea el
   proyecto, **rehoga** las tareas ejecutadas (mantienen FK al
   anteproyecto + ganan FK al proyecto), instancia las tareas de
   `aplicacion = 'proyecto'` restantes, y snapshot-copia los
   presupuestos preliminares autorizados al modelo de control de
   ejecución. Trazabilidad completa hacia atrás (postmortem) y
   continuidad operativa hacia adelante (seguimiento).

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

### Catálogo de tareas + dependencias (Sprint 3)

Modelado tras leer la tabla canónica de Coda `table-7XBvWbyLzx`
(`Plantilla Trámites Estudios y Documentos`):

```sql
-- CATÁLOGO global por empresa (puede filtrarse por tipo_proyecto)
dilesa.plantilla_anteproyecto_tareas
  id, empresa_id (FK),
  nombre (text), descripcion (text),
  -- Separación del ciclo de vida (validada contra Coda: campo Aplicación)
  aplicacion (enum: 'anteproyecto' | 'proyecto' | 'ambas'),
  -- Taxonomía de 2 niveles (libre, no enum estricto — el catálogo crece)
  tipo (text — Legal/Estudio/Plano/Factibilidad/Trámite/Licencia/
               Proyecto/Certificación/Registro/Permiso/Constancia/
               Acta/Cotización/Decisión),
  subtipo (text — Propiedad/Técnico/Urbanismo/Financiero/Servicios/
                 Ambiental/Topografía/Legal/Construcción/Comercial),
  -- Auto-cálculo de fechas objetivo
  duracion_dias_habiles (int),
  orden_default (int),
  -- Quién ejecuta — externo (gobierno/proveedor) o interno
  entidad_responsable (text — Municipio/SIMAS/CFE/Notaría/Laboratorio/
                              Interno/Contratistas Urbanización/...),
  -- 3 valores, no bool (Coda usa Si/No/Opcional)
  obligatoriedad (enum: 'obligatoria' | 'opcional' | 'condicional'),
  -- Destinatario del entregable
  se_entrega_a (text),
  -- Validación de adjunto
  requiere_archivo (bool),
  formato_archivo (text — 'PDF' | 'PDF / DWG' | 'DWG / PDF' | null),
  tipo_proyecto_id (FK opcional — null = aplica a todos los tipos),
  activa (bool DEFAULT true),
  created_at, updated_at, deleted_at

-- DEPENDENCIAS entre pasos del catálogo (N:M autoreferencia)
dilesa.plantilla_anteproyecto_tareas_dependencias
  id,
  plantilla_tarea_id (FK — la tarea que depende),
  depende_de_plantilla_tarea_id (FK — la que debe terminar antes),
  UNIQUE (plantilla_tarea_id, depende_de_plantilla_tarea_id),
  CHECK (plantilla_tarea_id <> depende_de_plantilla_tarea_id)
  -- CHECK adicional para detectar ciclos: se valida en función SQL
  -- al insertar/actualizar, no por constraint declarativa
```

### Instancias por anteproyecto/proyecto (Sprint 3)

```sql
-- INSTANCIAS de tareas por anteproyecto/proyecto
dilesa.anteproyecto_tareas
  id,
  -- una tarea puede vivir en anteproyecto, proyecto, o ambos
  anteproyecto_id (FK opcional),
  proyecto_id (FK opcional),
  CHECK (anteproyecto_id IS NOT NULL OR proyecto_id IS NOT NULL),

  plantilla_tarea_id (FK opcional — null = ad-hoc),

  -- SNAPSHOT del catálogo al momento de instanciar (preserva historia
  -- si el catálogo cambia después)
  nombre_snapshot (text),
  tipo_snapshot (text),
  subtipo_snapshot (text),
  entidad_responsable_snapshot (text),
  aplicacion_snapshot (enum),
  obligatoriedad_snapshot (enum),
  se_entrega_a_snapshot (text),
  requiere_archivo_snapshot (bool),
  formato_archivo_snapshot (text),
  duracion_dias_habiles_snapshot (int),

  -- Fechas: objetivo (calculadas) + reales (capturadas)
  fecha_objetivo_inicio (date),
  fecha_objetivo_fin (date),
  fecha_iniciada (date),
  fecha_completada (date),

  -- Responsable interno opcional (además de la entidad externa)
  responsable_interno_persona_id (FK opcional a erp.personas),

  -- Estado expandido — incluye 'bloqueada' (dependencia no completada)
  estado (enum: 'pendiente' | 'bloqueada' | 'en_progreso' |
              | 'completada' | 'no_aplica'),
  bloqueada_descripcion (text — explica el bloqueo cuando aplique),

  -- Resultado
  resultado_monto (numeric — para cotizaciones/trámites con costo),
  resultado_documento_url (text — comprobante/adjunto),
  notas (text),

  created_at, updated_at, deleted_at

-- DEPENDENCIAS resueltas por instancia (clonadas del catálogo
-- al instanciar, ajustables si el operador agrega tareas ad-hoc)
dilesa.anteproyecto_tareas_dependencias
  id,
  tarea_id (FK a anteproyecto_tareas),
  depende_de_tarea_id (FK a anteproyecto_tareas),
  UNIQUE (tarea_id, depende_de_tarea_id),
  CHECK (tarea_id <> depende_de_tarea_id)
```

Al **crear un anteproyecto**:

1. Se instancian las tareas del catálogo donde `aplicacion IN
   ('anteproyecto', 'ambas')` y `(tipo_proyecto_id = <tipo> OR IS NULL)`.
2. Se clonan las dependencias del catálogo al modelo de instancias.
3. Se calculan `fecha_objetivo_inicio` + `fecha_objetivo_fin` para
   cada tarea respetando el grafo de dependencias y usando calendario
   de días hábiles MX (excluir sábados, domingos y festivos
   nacionales — helper nuevo `lib/dilesa/calendario-habil.ts`).

El operador puede agregar tareas ad-hoc (`plantilla_tarea_id IS
NULL`), reordenar, marcar `no_aplica`, y editar `duracion_dias_habiles`
de la instancia (no del catálogo).

### Presupuestos preliminares (Sprint 3)

```sql
dilesa.anteproyecto_presupuestos_preliminares
  id, anteproyecto_id (FK),
  -- Si la partida viene de una tarea de cotización (Coda no las
  -- separa; nosotros sí), preserva el link para trazabilidad
  tarea_origen_id (FK opcional a anteproyecto_tareas),
  partida (text), descripcion (text),
  monto_estimado (numeric), unidad (text), cantidad (numeric),
  fuente (enum: 'cotizacion' | 'referencia' | 'proveedor' | 'estimado_interno'),
  proveedor_persona_id (FK opcional a erp.personas),
  -- Workflow de autorización antes de la promoción
  autorizado (bool DEFAULT false),
  autorizado_at, autorizado_por (FK opcional a auth.users),
  notas (text), created_at, updated_at, deleted_at
```

RLS canónica `core.fn_has_empresa(empresa_id) OR core.fn_is_admin()`.
`empresa_id` heredado vía JOIN al anteproyecto en política RLS.

### Modelo de control de ejecución del proyecto (Sprint 4)

Decisión D1 = **Opción B (separación con snapshot)**:

```sql
dilesa.proyectos_presupuestos
  id, proyecto_id (FK),
  -- Trazabilidad: link al preliminar autorizado de origen
  preliminar_origen_id (FK opcional a anteproyecto_presupuestos_preliminares),
  partida (text), descripcion (text),
  -- Snapshot del monto_estimado autorizado al momento de promover
  monto_aprobado (numeric),
  -- Se va llenando con la ejecución real
  monto_ejercido (numeric DEFAULT 0),
  unidad (text), cantidad (numeric),
  estado (enum: 'planeada' | 'en_ejercicio' | 'cerrada'),
  proveedor_persona_id (FK opcional),
  notas (text), created_at, updated_at, deleted_at
```

### Conversión anteproyecto → proyecto (Sprint 4)

RPC `dilesa.fn_anteproyecto_promote(anteproyecto_id uuid)` en una
transacción:

1. **Validar gate**: la tarea "Aprobación de Comité de Inversión" del
   anteproyecto debe estar en `estado = 'completada'`. Si no, falla
   con mensaje claro.
2. **INSERT en `dilesa.proyectos`** con datos heredados (clave_interna,
   terreno_id, tipo_proyecto_id, responsable_id, etc.).
3. **UPDATE en `dilesa.anteproyecto_tareas`** SET `proyecto_id = <nuevo>`
   WHERE `anteproyecto_id = <ante>` AND `aplicacion_snapshot IN
   ('proyecto', 'ambas')` AND `estado IN ('en_progreso', 'completada',
   'no_aplica')`. Las pendientes/bloqueadas se quedan solo en el
   anteproyecto. Las de `aplicacion = 'anteproyecto'` no se llevan
   (terminan su ciclo).
4. **INSERT en `dilesa.anteproyecto_tareas`** las tareas faltantes
   del catálogo con `aplicacion IN ('proyecto', 'ambas')` que NO se
   instanciaron al crear el anteproyecto (tareas exclusivas del
   proyecto). Con `proyecto_id` directo, `anteproyecto_id = NULL`.
5. **Recalcular dependencias del grafo del proyecto** clonando del
   catálogo + ajustando fechas objetivo desde fecha de promoción.
6. **INSERT en `dilesa.proyectos_presupuestos`** por cada
   `anteproyecto_presupuestos_preliminares` con `autorizado = true`:
   `monto_aprobado = monto_estimado`, `monto_ejercido = 0`,
   `estado = 'planeada'`, `preliminar_origen_id = <id>`.
7. **UPDATE en `dilesa.anteproyectos`** SET `proyecto_id`,
   `convertido_a_proyecto_en = NOW()`, `convertido_a_proyecto_por =
   auth.uid()`.
8. **Bitácora** del evento (si se integra con `activity-log-pattern`).

Idempotente: si el anteproyecto ya tiene `proyecto_id`, la acción
falla con mensaje claro ("ya convertido al proyecto X el Y-Z").

## Control de tiempos, documentos y presupuestos

### Tiempos

- **Catálogo** define `duracion_dias_habiles` por tarea. Coda promedia
  ~12 días por trámite; rango observado: 5–30 días.
- **Instancia** calcula `fecha_objetivo_inicio` y `fecha_objetivo_fin`
  desde la fecha de creación del anteproyecto + grafo de dependencias
  + calendario MX hábil.
- **Recálculo en cascada**: cuando una tarea pasa a `completada` antes
  o después de su `fecha_objetivo_fin`, se actualizan las dependientes
  (ripple). Política tentativa: `fecha_objetivo_inicio` de la dependiente
  = MAX(fecha_completada de las depende-de) + 1 día hábil.
- **UI**: timeline simple por anteproyecto/proyecto (lista cronológica
  con barras de avance). Gantt full queda fuera de v1 — si surge la
  necesidad, lo evaluamos.
- **KPIs sugeridos** (sustituye 1 de los 5 propuestos en D2):
  `% tareas en tiempo` o `días promedio de atraso del anteproyecto`.

### Documentos

- Cada tarea con `requiere_archivo_snapshot = true` valida que
  `resultado_documento_url` esté set antes de marcarse `completada`.
- Uso del patrón canónico `<FileAttachments>` (ADR-022). Path
  canónico: `dilesa/anteproyectos/<id>/tareas/<id>/<archivo>`.
- **Vista derivada "Expediente del anteproyecto"** — lista todos los
  adjuntos del grafo + estado de la tarea originadora. Patrón idéntico
  al expediente de `dilesa-portafolio-activos`.
- Al promover, la misma vista se replica para el proyecto (filter
  por `proyecto_id`).

### Presupuestos

Dos cajones distintos que la plantilla de Coda **no separa**:

1. **Costo de los pasos** (lo que cobran terceros por sus trámites).
   El `resultado_monto` de cada tarea con costo (Notaría, SIMAS, CFE,
   Laboratorio, Tramitador). Suma = "costo de pre-arranque del
   proyecto" — útil como KPI suplementario y para incluir en el
   análisis financiero como gasto pre-operativo.
2. **Cotizaciones de costos directos de la obra** (urbanización,
   construcción, comercialización). Viven en
   `anteproyecto_presupuestos_preliminares`. Se ligan opcionalmente
   a una tarea de cotización (las 3 nuevas que agregamos a la
   plantilla). Al promover, las autorizadas se snapshot-copian a
   `proyectos_presupuestos` con `monto_ejercido = 0` y se van
   llenando con estimaciones/contratos del módulo Construcción.

## Decisiones cerradas (D1-D2-D3-D4)

### D1 — Modelado del presupuesto que se arrastra ✅ Opción B + plantilla

Los preliminares viven inmutables; al promover se snapshot-copian
al modelo de control con `preliminar_origen_id` para trazabilidad.
Las tareas se rehogan con doble FK (anteproyecto + proyecto).

### D2 — KPIs del anteproyecto ✅ Confirmados

5 KPIs reactivos: # activos · inversión proyectada · utilidad
proyectada · margen promedio · # en decisión pendiente.

Decisión secundaria pendiente: si sustituyo uno por `% tareas en
tiempo` cuando el modelo de tareas esté listo (Sprint 3+). A decidir
con Beto cuando haya datos.

### D3 — Gate de conversión: Comité de Inversión ✅ Agregada

Se agrega tarea canónica al final del flujo de anteproyecto:

- **Orden 13** (después de "Aprobación Consejo de Desarrollo Urbano")
- **Aplicación**: `anteproyecto`
- **Tipo**: `Decisión` · **Subtipo**: `Financiero`
- **Duración**: 7 días hábiles
- **Entidad**: `Comité de Inversión / Dirección` (interno)
- **Obligatoriedad**: `obligatoria`
- **Depende de**: todas las tareas obligatorias del anteproyecto que
  deban estar resueltas antes de decidir (modelo de "todas o nada")
- **Requiere archivo**: PDF (acta del comité)

La RPC `fn_anteproyecto_promote` valida que esta tarea esté
`completada` antes de avanzar.

### D4 — Cotizaciones de obra como tareas estándar ✅ Agregadas

3 tareas nuevas, paralelas (no dependientes entre sí), con
`Aplicación: Anteproyecto` y `Tipo: Cotización`:

| Tarea                              | Subtipo      | Entidad                   | Días | Obligatoriedad |
| ---------------------------------- | ------------ | ------------------------- | ---: | -------------- |
| Cotización de Urbanización         | Urbanismo    | Contratistas Urbanización |   15 | obligatoria    |
| Cotización de Construcción         | Construcción | Contratistas Vivienda     |   15 | obligatoria    |
| Cotización de Comercialización     | Comercial    | Marketing / Ventas        |   10 | opcional       |

Las 3 dependen de "Elaboración de Anteproyecto" (orden 3 en Coda) y
alimentan el "Estudio de Factibilidad Económica" (orden 4) — Sprint 3
ajusta el grafo en el seed.

Cada tarea con `resultado_monto` poblado se sugiere como partida
preliminar en `anteproyecto_presupuestos_preliminares` (la UI ofrece
el botón "Convertir en partida preliminar" cuando la tarea está
completada).

## Sprints (4 + closeout)

### Sprint 1 — Refactor a sub-tabs

- Crear estructura `app/dilesa/proyectos/{activos,anteproyectos}/page.tsx` y
  `layout.tsx` con `RoutedModuleTabs`.
- Migración SQL: INSERT de los 2 sub-slugs en `core.modulos` + backfill
  defensivo de permisos clonando desde el padre `dilesa.proyectos`.
- Actualizar `ROUTE_TO_MODULE` y `EXPECTED_DB_MODULE_SLUGS`.
- Mover lógica actual de `proyectos/page.tsx` a `proyectos/activos/page.tsx`
  sin tocar `<ProyectosModule>` (cero churn en componente).
- Tab Anteproyectos = skeleton con `<EmptyState>`.
- Regenerar `SCHEMA_REF.md` + `types/supabase.ts`.
- 1 PR.

### Sprint 2 — UI base de Anteproyectos

- `<AnteproyectosModule>` componente nuevo.
- Listado con filtros (estado, etapa, decisión actual, prioridad) +
  date range filter, pattern canónico `<DataTable>` + `<ModuleKpiStrip>`.
- Detail drawer/page con análisis financiero conectado a
  `v_anteproyectos_analisis`.
- Formulario de captura básico (`<Form>` + zod + RHF, ADR-016).
- KPIs reactivos según D2.
- Tests unitarios siguiendo patrón `kpis-modulos`.
- 1 PR.

### Sprint 3 — Plantilla + tareas + presupuestos preliminares

- **Migración SQL** con las 5 tablas:
  `plantilla_anteproyecto_tareas` + `plantilla_anteproyecto_tareas_dependencias`
  + `anteproyecto_tareas` + `anteproyecto_tareas_dependencias`
  + `anteproyecto_presupuestos_preliminares`
  + RLS + índices + comentarios + `NOTIFY pgrst, 'reload schema'`.
- **Seed canónico** de 35 tareas en `plantilla_anteproyecto_tareas`
  (31 importadas de Coda + 1 gate Comité + 3 cotizaciones de obra) +
  dependencias (27 + ajustes para las 4 nuevas). Ver appendix.
- **Helper `lib/dilesa/calendario-habil.ts`** con festivos MX 2026-2030.
- **Trigger / server action** que instancia tareas + dependencias +
  fechas objetivo al crear un anteproyecto.
- **UI** en el drawer/page del anteproyecto:
  - Sección "Checklist" con timeline simple (tareas en orden + estado
    + fecha objetivo/real + responsable + adjunto). Permite agregar
    tareas ad-hoc, marcar `no_aplica`.
  - Sección "Presupuestos preliminares" con tabla editable inline.
    Permite ligar partida a tarea originadora (dropdown). Workflow
    `autorizado` (botón "Autorizar").
  - Botón "Convertir en partida preliminar" en tareas tipo
    `Cotización` con `resultado_monto > 0`.
- Cálculo automático de "total preliminar autorizado" + comparación
  con `costo_total_proyecto` de `v_anteproyectos_analisis`.
- Regenerar `SCHEMA_REF.md` + `types/supabase.ts`.
- 1 PR (grande pero coherente — un eje conceptual completo).

### Sprint 4 — Conversión anteproyecto → proyecto + closeout

- **Migración SQL**: tabla `dilesa.proyectos_presupuestos` + RLS +
  índices.
- **RPC** `dilesa.fn_anteproyecto_promote(anteproyecto_id uuid)` con
  los 8 pasos transaccionales (validar gate Comité → INSERT proyecto
  → rehoga tareas → instancia tareas proyecto-only → recalcular grafo
  → snapshot presupuestos → marcar conversión → bitácora).
- **UI**: botón "Promover a proyecto" (gated por tarea Comité
  completada). ConfirmDialog con preview (proyecto + tareas que se
  rehogan + nuevas tareas proyecto-only + monto del presupuesto que
  se snapshot-copia).
- **UI lado proyecto**: sección "Tareas heredadas del anteproyecto"
  (read-mostly + actualizar estado/comprobante) + sección "Tareas del
  proyecto" (las exclusivas de aplicacion=proyecto) + sección
  "Presupuesto base" (`proyectos_presupuestos` con `monto_ejercido`
  derivado de estimaciones/contratos cuando aplique).
- **Test** unitario o E2E de la promoción.
- Regenerar `SCHEMA_REF.md` + `types/supabase.ts`.
- **Closeout**: actualizar planning doc + INITIATIVES.md + barrido de
  Reminders.
- 1 PR.

## Riesgos

1. **Calendario hábil MX necesita mantenimiento.** Festivos cambian
   anualmente (algunos son lunes movibles). Helper debe permitir
   actualizar la lista sin redeploy (JSON local que se carga al
   bootstrap, o tabla `core.calendario_habil_mx`). Decisión al
   arrancar Sprint 3.
2. **Grafo de dependencias puede tener ciclos.** Validar al insertar
   con función SQL recursiva (CTE) en el catálogo. La migración seed
   no debe contener ciclos (validar con SQL antes de aplicar).
3. **Drift entre catálogo y instancias.** Si el catálogo cambia
   (agregamos/quitamos tareas), las instancias existentes no se
   refactoran automáticamente. Usar snapshot para preservar historia;
   ofrecer botón manual "sincronizar con catálogo" si surge.
4. **Performance del recálculo de fechas en cascada.** Para
   anteproyectos con 30+ tareas y dependencias complejas, el ripple
   puede ser costoso. Implementar como función SQL eager pero solo
   en transición de estado (no on-every-edit).
5. **Conflicts en `INITIATIVES.md`.** Sprint 1 toca sidebar y RBAC.
   Rebase preventivo antes de cada push.
6. **Seed inicial con 35 tareas requiere validación con Beto.** Las
   31 de Coda son fieles a lo que existe; las 4 nuevas (1 gate + 3
   cotizaciones) se incorporan en este planning doc. Si Beto pide
   ajustes finos, se ajusta el seed antes del PR de Sprint 3.

## Bitácora

- **2026-05-26 (promoción)** — Promovida a `proposed` tras
  conversación con Beto. PR
  [#544](https://github.com/beto-sudo/BSOP/pull/544) mergeado.
- **2026-05-26 (planned)** — D1 + D2 cerradas. Beto agregó el
  concepto de **plantilla preestablecida** de tareas que al promover
  queda **ligada al proyecto**. Estado pasa a `planned`. PR
  [#546](https://github.com/beto-sudo/BSOP/pull/546) abierto.
- **2026-05-26 (refinamiento Coda)** — Leí la tabla canónica de
  Coda `table-7XBvWbyLzx` (`Plantilla Trámites Estudios y Documentos`,
  31 rows, 12 cols, 27 deps). Modelo de plantilla ajustado a 5 tablas
  con taxonomía rica (`aplicacion`/`tipo`/`subtipo`/`duracion_dias_habiles`/
  `entidad_responsable`/`obligatoriedad`/`se_entrega_a`/`requiere_archivo`+`formato_archivo`)
  + tabla de dependencias N:M + estado `bloqueada`. Beto OK las 3
  preguntas: agregar gate "Comité de Inversión" (D3), agregar 3
  cotizaciones de obra (D4), guardar el refinamiento ahora. Sprint 3
  expandido para incluir la plantilla canónica seed de 35 tareas
  + helper de calendario hábil MX. PR #546 amplía contenido.

## Decisiones registradas

- **2026-05-26 — D1: Opción B (separación con snapshot) + plantilla
  de tareas ligada al proyecto post-promoción.** Trazabilidad
  histórica del análisis + continuidad operativa del trabajo.
- **2026-05-26 — D2: 5 KPIs reactivos confirmados** (activos /
  inversión proy / utilidad proy / margen / decisión pendiente).
- **2026-05-26 — Workflow de autorización en presupuestos
  preliminares.** Solo los autorizados se snapshot-copian al proyecto.
- **2026-05-26 — D3: Gate "Aprobación de Comité de Inversión".**
  Tarea canónica al final del flujo de anteproyecto. La RPC
  `fn_anteproyecto_promote` valida que esté completada antes de
  avanzar. Razón: formaliza la decisión de arranque en el grafo, no
  como flag suelto en `dilesa.anteproyectos.decision_actual`.
- **2026-05-26 — D4: 3 cotizaciones de obra como tareas estándar.**
  Urbanización (15d, obligatoria) · Construcción (15d, obligatoria)
  · Comercialización (10d, opcional). Las 3 dependen de "Elaboración
  de Anteproyecto" y alimentan "Estudio de Factibilidad Económica"
  con sus `resultado_monto`. UI ofrece convertir resultado en
  partida preliminar.
- **2026-05-26 — Snapshot de campos del catálogo en cada instancia.**
  Las tareas instanciadas guardan copia de
  `nombre`/`tipo`/`subtipo`/`entidad`/`obligatoriedad`/etc para
  preservar historia si el catálogo cambia después. Sincronización
  hacia atrás es opcional (botón manual).

## Appendix — Plantilla canónica de 35 tareas

Lista derivada de la tabla `table-7XBvWbyLzx` de Coda + 4 tareas
nuevas (marcadas con ⭐). Se aplica como SEED de
`plantilla_anteproyecto_tareas` + dependencias en la migración del
Sprint 3.

### Anteproyecto (15 tareas: 12 Coda + 1 gate + 3 cotizaciones)

| # | Tarea | Tipo | Subtipo | Entidad | Días | Obl |
| -: | --- | --- | --- | --- | -: | :-: |
| 1 | Escritura/Contrato Compraventa del Terreno | Legal | Propiedad | Notaría / Registro Público | 15 | ✓ |
| 2 | Levantamiento Topográfico y Curvas de Nivel | Estudio | Técnico | Topógrafo | 5 | ✓ |
| 3 | Elaboración de Anteproyecto | Plano | Urbanismo | Interno | 10 | ✓ |
| 4 | Estudio de Factibilidad Económica / Corrida Financiera | Estudio | Financiero | Finanzas / Dirección / Consultor | 7 | ✓ |
| 5 | Mecánica de Suelos | Estudio | Técnico | Laboratorio | 10 | ✓ |
| 6 | Estudio Hidrológico | Estudio | Técnico | UANL / Consultor | 10 | — |
| 7 | Factibilidad de Uso de Suelo | Factibilidad | Urbanismo | Municipio | 15 | ✓ |
| 8 | Factibilidad de Agua Potable y Drenaje | Factibilidad | Servicios | SIMAS | 15 | ✓ |
| 9 | Factibilidad de Energía Eléctrica | Factibilidad | Servicios | CFE | 15 | ✓ |
| 10 | Factibilidad de Servicios Complementarios | Factibilidad | Servicios | Proveedores | 10 | — |
| 11 | Cambio de Uso de Suelo | Trámite | Urbanismo | Municipio | 20 | opc |
| 12 | Aprobación Consejo de Desarrollo Urbano | Trámite | Urbanismo | Municipio | 20 | ✓ |
| ⭐12.1 | Cotización de Urbanización | Cotización | Urbanismo | Contratistas Urbanización | 15 | ✓ |
| ⭐12.2 | Cotización de Construcción de Vivienda | Cotización | Construcción | Contratistas Vivienda | 15 | ✓ |
| ⭐12.3 | Cotización de Comercialización | Cotización | Comercial | Marketing / Ventas | 10 | — |
| ⭐13 | **Aprobación de Comité de Inversión** (gate) | Decisión | Financiero | Comité de Inversión / Dirección | 7 | ✓ |

Dependencias clave del anteproyecto:
- #2 (Topo) depende de #1 (Escritura).
- #3 (Anteproyecto) depende de #2.
- #5 (Suelos) depende de #2.
- #6 (Hidrológico) depende de #5.
- #4 (Factibilidad Econ) depende de #3.
- #7-#10 (Factibilidades) dependen de #1.
- #12.1-#12.3 (Cotizaciones) dependen de #3 y alimentan #4.
- #11 (Cambio uso) condicional según resultado de #7.
- #12 (Consejo Urb) depende de #7.
- #13 (Comité) depende de todas las obligatorias del anteproyecto.

### Proyecto (19 tareas, todas de Coda)

| # | Tarea | Tipo | Subtipo | Entidad | Días | Obl |
| -: | --- | --- | --- | --- | -: | :-: |
| 14 | Estudio de Impacto Ambiental | Estudio | Ambiental | Tramitador / Consultor | 20 | ✓ |
| 15 | Manifestación de Impacto Ambiental (MIA) | Trámite | Ambiental | Autoridad Ambiental | 30 | ✓ |
| 16 | Licencia de Fraccionamiento | Licencia | Urbanismo | Municipio | 20 | ✓ |
| 17 | Plano Oficial Aprobado | Plano | Urbanismo | Municipio | 10 | ✓ |
| 18 | Proyecto de Rasantes y Plataformas | Proyecto | Topografía | Topógrafo / Proyectos | 15 | ✓ |
| 19 | Proyecto Hidrosanitario Aprobado | Proyecto | Servicios | SIMAS | 15 | ✓ |
| 20 | Proyecto Eléctrico Aprobado | Proyecto | Servicios | CFE | 15 | ✓ |
| 21 | Certificación de Números Oficiales | Certificación | Urbanismo | Municipio | 10 | ✓ |
| 22 | Certificación de Alineamiento Residencial | Certificación | Urbanismo | Municipio | 10 | ✓ |
| 23 | Declaración Unilateral de Voluntades / Escrituración | Legal | Urbanismo | Notaría | 20 | ✓ |
| 24 | Registro ante Catastro | Registro | Legal | Notaría / Municipio | 10 | ✓ |
| 25 | Registro Público de la Propiedad (RPP) | Registro | Legal | Notaría | 15 | ✓ |
| 26 | Permiso de Movimiento de Tierras | Permiso | Construcción | Municipio | 10 | — |
| 27 | Permiso de Trazo y Nivelación | Permiso | Construcción | Municipio | 10 | — |
| 28 | Constancia de No Adeudo SIMAS | Constancia | Servicios | SIMAS | 5 | — |
| 29 | Constancia de No Adeudo CFE | Constancia | Servicios | CFE | 5 | — |
| 30 | Constancia de Protección Civil | Certificación | Legal | Protección Civil | 10 | — |
| 31 | Acta de Terminación de Obra de Urbanización | Acta | Construcción | Municipio | 15 | ✓ |
| 32 | Entrega-Recepción de Fraccionamiento | Acta | Urbanismo | Municipio | 10 | ✓ |

Dependencias del proyecto: se importan tal cual de Coda (27 de las
31 originales). Lista completa en el script de seed del Sprint 3.

### Resumen agregado

| Métrica | Anteproyecto | Proyecto | Total |
| --- | -: | -: | -: |
| Tareas | 15 | 19 | 34 (+ 1 gate) |
| Obligatorias | 11 | 13 | 24 |
| Opcionales/condicionales | 3 | 6 | 9 |
| Duración acumulada (sin paralelización) | ~190d | ~245d | — |
| Entidades externas distintas | 9 | 9 | 13 (algunas se comparten) |
