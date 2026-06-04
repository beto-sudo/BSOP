# Iniciativa — Proyectos DILESA: Anteproyectos como sub-tab + plantilla de trabajo + conversión

**Slug:** `dilesa-proyectos-anteproyectos`
**Empresas:** DILESA
**Schemas afectados:** `dilesa` (4 tablas nuevas: `plantilla_proyecto_tareas` catálogo + `plantilla_proyecto_tareas_dependencias` + `proyecto_tareas_dependencias` + `proyecto_presupuesto_partidas`; ALTER `proyecto_tareas` extendiendo columnas taxonómicas; usa `proyectos` + `proyectos_plantillas` + `proyecto_tareas` + `proyecto_hitos` + `proyecto_documentos` + `proyecto_responsables` existentes; sub-slugs en `core.modulos` ya creados en Sprint 1)
**Estado:** done
**Dueño:** Beto
**Creada:** 2026-05-26
**Cerrada:** 2026-05-26
**Última actualización:** 2026-05-26 (Sprint 4 mergeado — iniciativa completa. RPC `dilesa.fn_proyecto_promote_anteproyecto` aplicada a prod + server action wrapping + UI botón "Promover a desarrollo" gated por tarea "Aprobación de Comité de Inversión" completada + ConfirmDialog inline + UI "Vino del anteproyecto X" en el `<ProyectoDetailDrawer>` cuando hay `proyecto_predecesor_id`. Cero churn en data — los 5 anteproyectos y 8 desarrollos siguen igual. Total iniciativa: 5 PRs (544 promoción + 546 decisiones + 550 Sprint 1 + 552 Sprint 2 + 553 Sprint 3 + 551 re-alineación + Sprint 4 este PR). Cobertura: 921 tests verdes.) (Histórico de cambios previos: re-alineación con DB real, descubrí que la tabla `dilesa.anteproyectos` mencionada en el doc previo **NO existe**; fue eliminada en `dilesa-portafolio-activos` PR #482 demolición 2026-05-21. Modelo real es `dilesa.proyectos` con `tipo` discriminator. Iniciativa re-arquitecturada para reusar schema v2 existente. Sprint 1 sigue mergeado y válido — era solo refactor UI/RBAC sin tocar data.)

## Problema

El módulo `/dilesa/proyectos` mezclaba en una sola tabla los proyectos
en evaluación (anteproyectos) con los proyectos en ejecución, sin
separar visualmente las fases del ciclo de vida:

1. **Anteproyectos** son evaluaciones de viabilidad: ¿cuántos lotes
   salen del terreno?, ¿qué prototipos meto?, ¿qué utilidad proyectada
   tengo?, ¿qué trámites debo arrancar?, ¿qué cotizaciones tempranas
   tengo? — el resultado es una decisión de **arrancar o descartar**.
2. **Proyectos activos** son los que ya pasaron la decisión y están
   en ejecución o terminados.

Mezclarlos en la misma tabla hace ruido visual y diluye los KPIs
operativos. Sprint 1 (PR
[#550](https://github.com/beto-sudo/BSOP/pull/550) mergeado) cerró el
primer hueco: refactor a sub-tabs `Activos` y `Anteproyectos` con
sub-slugs RBAC.

Además, el **trabajo del anteproyecto hoy vive en Coda** (tabla canónica
`Plantilla Trámites Estudios y Documentos`, 31 pasos con 12 dimensiones
y 27 dependencias). No está expuesto en BSOP, y al promover a proyecto
el trabajo se pierde o se duplica.

### Modelo de datos descubierto (post-Sprint 1 re-alineación)

El planning original asumía existencia de tabla `dilesa.anteproyectos`
junto con vista `v_anteproyectos_analisis` del sprint `dilesa-1a`. Ese
schema fue eliminado el 2026-05-21 cuando la iniciativa
`dilesa-portafolio-activos` demolió el `dilesa` v1 y construyó el v2
(ADR-009/010). El modelo real desde entonces es:

- **Una sola tabla** `dilesa.proyectos` con discriminador `tipo` (valores
  válidos: anteproyecto, desarrollo, remodelacion, reconversion,
  subdivision, comercializacion, operacion).
- **Estado** del proyecto con valores propuesta, analisis, aprobado,
  ejecutando, completado, archivado.
- **Columnas físicas ya cableadas**: `area_m2`, `area_vendible_m2`,
  `lotes_proyectados`, `costo_terreno`, `costo_urbanizacion`,
  `costo_construccion`, `costo_comercializacion`,
  `presupuesto_estimado`, `clasificacion_inmobiliaria`,
  `precio_m2_excedente`, `tamano_lote_promedio`.
- **Campo de conversión** `proyecto_predecesor_id` ya cableado, apunta
  al anteproyecto origen cuando un desarrollo se crea como continuación.
- **5 anteproyectos reales** hoy (Ampliación Lomas de los Encinos
  completado, Loma Escondida analisis, Lomas de las Delicias completado,
  Lomas del Bosque analisis, Plaza Comercial Los Encinos analisis), y
  **8 desarrollos** en ejecución, 2 con `proyecto_predecesor_id` set
  apuntando a anteproyectos ya convertidos.
- **Tablas relacionadas existentes**: `dilesa.proyectos_plantillas`
  (catálogo por `tipo_proyecto` con `definicion jsonb`),
  `dilesa.proyecto_tareas` (titulo, descripcion, estado, prioridad,
  responsable_id, fecha_limite, fecha_completada, orden),
  `dilesa.proyecto_hitos`, `dilesa.proyecto_documentos`,
  `dilesa.proyecto_responsables`, `dilesa.proyecto_activos`,
  `dilesa.proyecto_prorrateo`.

## Outcome esperado

1. **Proyectos con 2 sub-tabs** [ya en main] siguiendo ADR-005/030.
   `Activos` filtra `dilesa.proyectos WHERE tipo != 'anteproyecto'` y
   `Anteproyectos` filtra `WHERE tipo = 'anteproyecto'`. Sub-slugs RBAC
   aplicados con backfill defensivo (Sprint 1).
2. **UI completa de Anteproyectos** — listado + drawer/page con análisis
   financiero **derivado client-side** desde columnas existentes de
   `dilesa.proyectos`. Formulario de captura. Filtros.
3. **Plantilla canónica de trabajo** — catálogo de **35 tareas** (31
   importadas de Coda, 1 gate "Comité de Inversión", 3 cotizaciones de
   obra). Vive en tabla nueva `dilesa.plantilla_proyecto_tareas`
   (catálogo) con dependencias en N:M. Al crear un anteproyecto las
   tareas se instancian automáticamente en `dilesa.proyecto_tareas`
   (extendida con columnas taxonómicas) respetando `aplicacion =
'anteproyecto'`. Fechas objetivo se calculan auto-mágicamente desde
   fecha de arranque, grafo de dependencias y duración en días hábiles MX.
4. **Presupuestos preliminares con home** — tabla nueva
   `dilesa.proyecto_presupuesto_partidas` con `estado` discriminator
   ('preliminar' / 'autorizada' / 'planeada' / 'en_ejercicio' /
   'cerrada'). Reemplaza la separación `preliminares` + `presupuestos`
   del modelo original — una sola tabla con histórico inline.
5. **Conversión anteproyecto → desarrollo que preserva el trabajo** —
   acción "promover" (gated por la tarea "Comité de Inversión"
   `completada`). **Crea nuevo row** en `dilesa.proyectos` con
   `tipo='desarrollo'` y `proyecto_predecesor_id` apuntando al
   anteproyecto. Copia tareas autorizadas y partidas autorizadas al
   nuevo proyecto. Anteproyecto se mueve a `estado='completado'` y se
   preserva como histórico de viabilidad.

## Modelo conceptual

### Sub-tabs en Proyectos [Sprint 1 — DONE]

PR [#550](https://github.com/beto-sudo/BSOP/pull/550) mergeado.

- `app/dilesa/proyectos/layout.tsx` con `<RoutedModuleTabs>` (Activos /
  Anteproyectos).
- `app/dilesa/proyectos/page.tsx` (tab Activos) sigue renderizando
  `<ProyectosModule>` con slug `dilesa.proyectos.activos`. Sprint 2
  agrega filtro por `tipo`.
- `app/dilesa/proyectos/anteproyectos/page.tsx` skeleton — Sprint 2 lo
  reemplaza con UI real.
- Migración `20260526210000_dilesa_proyectos_subscope_permissions.sql`:
  2 sub-slugs en `core.modulos` + backfill defensivo de permisos.

### UI de Anteproyectos (Sprint 2)

- Componente nuevo `components/dilesa/anteproyectos-module.tsx`.
- Query base: `dilesa.proyectos` filter `tipo='anteproyecto' AND
deleted_at IS NULL`.
- Filtros (estado del CHECK, fechas).
- KPIs reactivos (ADR-034 cap 5): # activos · inversión proyectada
  total · utilidad proyectada total · margen promedio · # en estado
  `analisis`. Derivados client-side desde columnas existentes.
- Detail drawer/page con secciones: identidad · análisis financiero
  derivado · documentos (vía `proyecto_documentos`) · hitos · tareas
  (Sprint 3 las puebla).
- Tab Activos: ajustar `<ProyectosModule>` para filtrar
  `tipo != 'anteproyecto'`.
- Tests siguiendo patrón `kpis-modulos`.

### Plantilla de trabajo + tareas instanciadas (Sprint 3)

Schema nuevo:

```sql
-- CATÁLOGO de tareas canónicas (35 al inicio, extensible)
dilesa.plantilla_proyecto_tareas
  id, empresa_id (FK opcional, NULL = global),
  nombre, descripcion,
  aplicacion (enum 'anteproyecto' | 'desarrollo' | 'ambas'),
  tipo (text), subtipo (text),
  duracion_dias_habiles (int), orden_default (int),
  entidad_responsable (text),
  obligatoriedad (enum 'obligatoria' | 'opcional' | 'condicional'),
  se_entrega_a (text),
  requiere_archivo (bool), formato_archivo (text),
  activa (bool DEFAULT true),
  created_at, updated_at, deleted_at

-- DEPENDENCIAS catálogo (N:M)
dilesa.plantilla_proyecto_tareas_dependencias
  plantilla_tarea_id, depende_de_plantilla_tarea_id

-- DEPENDENCIAS instancias (N:M)
dilesa.proyecto_tareas_dependencias
  tarea_id, depende_de_tarea_id
```

ALTER de `dilesa.proyecto_tareas` (extender, NO reemplazar):

```sql
ALTER TABLE dilesa.proyecto_tareas
  ADD COLUMN plantilla_tarea_id uuid REFERENCES dilesa.plantilla_proyecto_tareas(id),
  ADD COLUMN tipo_snapshot text,
  ADD COLUMN subtipo_snapshot text,
  ADD COLUMN entidad_responsable_snapshot text,
  ADD COLUMN aplicacion_snapshot text,
  ADD COLUMN obligatoriedad_snapshot text,
  ADD COLUMN se_entrega_a_snapshot text,
  ADD COLUMN requiere_archivo_snapshot bool,
  ADD COLUMN formato_archivo_snapshot text,
  ADD COLUMN duracion_dias_habiles_snapshot int,
  ADD COLUMN fecha_objetivo_inicio date,
  ADD COLUMN fecha_objetivo_fin date,
  ADD COLUMN resultado_monto numeric(16,2),
  ADD COLUMN resultado_documento_url text;
```

Datos legacy no pierden info — columnas nuevas quedan NULL en filas
existentes. Estado nuevo `'bloqueada'` se agrega al CHECK con ALTER.

Al **crear un anteproyecto** una server action instancia tareas con
`aplicacion IN ('anteproyecto', 'ambas')`, clona dependencias, calcula
fechas objetivo desde fecha de arranque con calendario hábil MX.

### Presupuestos preliminares + ejecución (Sprint 3)

**Una sola tabla** con `estado` discriminator (no dos espejos):

```sql
dilesa.proyecto_presupuesto_partidas
  id, proyecto_id (FK),
  tarea_origen_id (FK opcional a proyecto_tareas),
  partida (text), descripcion (text),
  unidad (text), cantidad (numeric),
  monto_estimado (numeric),
  monto_aprobado (numeric),
  monto_ejercido (numeric DEFAULT 0),
  fuente (enum 'cotizacion' | 'referencia' | 'proveedor' | 'estimado_interno'),
  proveedor_persona_id (FK opcional),
  estado (enum 'preliminar' | 'autorizada' | 'planeada' | 'en_ejercicio' | 'cerrada'),
  autorizado_at, autorizado_por (FK opcional),
  notas, created_at, updated_at, deleted_at
```

Workflow:

1. Captura inicial: `estado='preliminar'`, `monto_estimado` poblado.
2. Beto/director autoriza: `estado='autorizada'`, `autorizado_at/por`
   set.
3. Al promover el anteproyecto: partidas en `'autorizada'` se **copian**
   al nuevo `dilesa.proyectos` (desarrollo) con `estado='planeada'`,
   `monto_aprobado=monto_estimado`, `monto_ejercido=0`.
4. Durante ejecución: `monto_ejercido` se va sumando desde
   estimaciones/contratos. `estado='en_ejercicio'`.
5. Cierre: `estado='cerrada'`.

Las preliminares no autorizadas quedan vivas en el anteproyecto
predecesor como histórico.

### Conversión anteproyecto → desarrollo (Sprint 4)

RPC `dilesa.fn_proyecto_promote_anteproyecto(anteproyecto_id uuid)`
transaccional:

1. **Validar**: anteproyecto existe, `tipo='anteproyecto'`, no tiene
   otro desarrollo apuntándolo via `proyecto_predecesor_id`, tarea
   canónica "Aprobación de Comité de Inversión" en `completada`.
2. **INSERT** nuevo row en `dilesa.proyectos`:
   - `tipo='desarrollo'`
   - `proyecto_predecesor_id` apunta al anteproyecto
   - Copia campos físicos/financieros
   - `estado='aprobado'`
3. **Copia tareas autorizadas/útiles** desde anteproyecto al nuevo
   proyecto (INSERT en `dilesa.proyecto_tareas` con `proyecto_id` nuevo,
   copiando snapshot y estado). Solo `aplicacion_snapshot IN
('desarrollo', 'ambas')` Y `estado IN ('en_curso', 'completada')`.
   Recalcula `fecha_objetivo_*` desde fecha promoción.
4. **INSERT tareas exclusivas de desarrollo** desde el catálogo
   (`aplicacion IN ('desarrollo', 'ambas')` que no se llevaron).
5. **Copia partidas autorizadas** de `proyecto_presupuesto_partidas` al
   nuevo proyecto con `estado='planeada'`,
   `monto_aprobado=monto_estimado`, `monto_ejercido=0`.
6. **UPDATE anteproyecto**: `estado='completado'` (preserva como
   histórico).
7. **Bitácora** del evento.

Idempotente: SELECT inicial valida no exista desarrollo con
`proyecto_predecesor_id=<anteproyecto>`.

Trazabilidad: cualquier desarrollo se relaciona con anteproyecto origen
vía `proyecto_predecesor_id`. UI desarrollo muestra "Vino del
anteproyecto X"; UI anteproyecto completado muestra "Convertido al
desarrollo Y".

## Decisiones cerradas (D1-D4)

### D1 — Modelado del presupuesto ✅ Una tabla con estado discriminator

Revisión post-realign: el modelo original de Opción B implicaba 2 tablas
espejo. El modelo simplificado logra la misma trazabilidad con una sola
tabla `proyecto_presupuesto_partidas` + `estado` discriminator. La
trazabilidad histórica del anteproyecto se logra con
`proyectos.proyecto_predecesor_id`.

### D2 — KPIs del anteproyecto ✅ Confirmados (5 KPIs)

# activos · inversión proyectada · utilidad proyectada · margen

promedio · # en `analisis`.

### D3 — Gate "Aprobación de Comité de Inversión" ✅ Agregada

Tarea canónica en el seed de Sprint 3 (orden 13 del anteproyecto).
RPC valida `estado='completada'` antes de avanzar.

### D4 — 3 cotizaciones de obra como tareas estándar ✅ Agregadas

Urbanización (15d obligatoria), Construcción (15d obligatoria),
Comercialización (10d opcional).

## Sprints (4)

### Sprint 1 — Refactor a sub-tabs ✅ DONE

PR [#550](https://github.com/beto-sudo/BSOP/pull/550) mergeado
2026-05-26. Refactor `app/dilesa/proyectos/` a sub-tabs + sub-slugs
RBAC + backfill defensivo. Cero churn en `<ProyectosModule>` o data.

### Sprint 2 — UI base de Anteproyectos

- Componente nuevo `<AnteproyectosModule>` filtrando
  `dilesa.proyectos WHERE tipo='anteproyecto' AND deleted_at IS NULL`.
- Listado con filtros + KPIs reactivos + date range filter.
- Detail drawer/page con análisis financiero derivado client-side.
- Tab Activos: ajustar `<ProyectosModule>` para filtrar
  `tipo != 'anteproyecto'`.
- Tests unitarios.
- 1 PR.

### Sprint 3 — Plantilla canónica + tareas + presupuestos preliminares

- Migración SQL: 4 tablas nuevas + ALTER `proyecto_tareas` + RLS +
  índices + comentarios + `NOTIFY pgrst, 'reload schema'`.
- Seed canónico de 35 tareas en `plantilla_proyecto_tareas`.
- Helper `lib/dilesa/calendario-habil.ts` con festivos MX.
- Trigger o server action que instancia tareas + dependencias + fechas
  al crear un anteproyecto.
- UI: sección "Checklist" + sección "Presupuestos preliminares" con
  workflow autorización.
- 1 PR.

### Sprint 4 — Conversión anteproyecto → desarrollo + closeout ✅ DONE

- RPC `dilesa.fn_proyecto_promote_anteproyecto` aplicada (migración
  `20260526230000`). 8 pasos transaccionales: cargar + validar
  idempotencia + validar gate + INSERT desarrollo + rehoga tareas
  desarrollo/ambas en curso o completadas + copia partidas autorizadas
  como planeadas + marca anteproyecto como completado.
- Server action `promoteAnteproyecto` wrappea la RPC con revalidatePath.
- UI en `<AnteproyectoDetailDrawer>` sección "Promoción a desarrollo"
  con estados (yaConvertido / pendienteGate / pendientePlantilla /
  listoPromover). Confirm dialog inline antes de ejecutar.
- UI lado desarrollo: `<ProyectoDetailDrawer>` muestra sección "Origen"
  con "Vino del anteproyecto X" cuando hay `proyecto_predecesor_id`.
- Helper `gateComitePromocion` exportado para tests + reuso.
- 5 tests nuevos sobre el gate. Total 921 tests verdes.
- 1 PR. CI verde. Iniciativa pasa a `done`.

## Riesgos

1. **Calendario hábil MX necesita mantenimiento.** Festivos cambian
   anualmente. Helper carga JSON local.
2. **Grafo de dependencias puede tener ciclos.** Validar con función
   SQL recursiva al insertar. Seed inicial sin ciclos.
3. **Drift entre catálogo y instancias.** Instancias guardan snapshot.
4. **Performance del recálculo de fechas en cascada.** Eager en
   transición de estado, no on-every-edit.
5. **Tab Activos hoy lista todos los tipos.** Sprint 2 debe filtrar
   `tipo != 'anteproyecto'`.
6. **Conflicts en `INITIATIVES.md`.** Rebase preventivo antes de cada
   push.

## Bitácora

- **2026-05-26 (promoción)** — Promovida a `proposed`. PR
  [#544](https://github.com/beto-sudo/BSOP/pull/544) mergeado.
- **2026-05-26 (planned)** — D1 + D2 cerradas. Plantilla preestablecida
  agregada. PR [#546](https://github.com/beto-sudo/BSOP/pull/546)
  mergeado.
- **2026-05-26 (refinamiento Coda)** — Leí tabla canónica Coda
  `table-7XBvWbyLzx` con 31 pasos + 27 dependencias. D3+D4 cerradas.
  PR [#546](https://github.com/beto-sudo/BSOP/pull/546) cubrió el ajuste.
- **2026-05-26 (Sprint 1 DONE)** — PR
  [#550](https://github.com/beto-sudo/BSOP/pull/550) mergeado. Refactor
  a sub-tabs + sub-slugs RBAC. Migración aplicada a prod.
- **2026-05-26 (Sprint 4 DONE / iniciativa cerrada)** — RPC
  `dilesa.fn_proyecto_promote_anteproyecto` aplicada a prod. Server
  action `promoteAnteproyecto` + UI con botón gated y confirm dialog
  inline en el drawer del anteproyecto + UI "Vino del anteproyecto X"
  en el drawer del desarrollo. `proyecto_predecesor_id` agregado al
  type `ProyectoDetalle` y al SELECT de ambos módulos. 5 tests nuevos
  para `gateComitePromocion`. Total iniciativa: 5 PRs efectivos + 1
  re-alineación. 921 tests verdes. Iniciativa pasa formalmente a
  `done`. Trade-off documentado: la RPC NO instancia tareas
  exclusivas de desarrollo automáticamente — el operador puede llamar
  `populatePlantilla` sobre el nuevo proyecto si quiere las del
  catálogo con fechas frescas (evita duplicar la lógica de cascada
  de fechas en SQL).
- **2026-05-26 (re-alineación con DB real)** — Descubrí que la tabla
  `dilesa.anteproyectos` que el doc previo mencionaba **NO existe**.
  Fue eliminada el 2026-05-21 en la demolición del schema v1 de
  `dilesa-portafolio-activos` (PR #482). Modelo correcto:
  `dilesa.proyectos` con `tipo` discriminator. Iniciativa
  re-arquitecturada: 4 tablas nuevas (no 6) + ALTER de `proyecto_tareas`
  - reuso de `proyecto_tareas`/`proyecto_hitos`/`proyecto_documentos`
    existentes. Presupuestos: una sola tabla con estado discriminator (no
    dos espejos). Conversión: nuevo row con `proyecto_predecesor_id`
    (campo ya cableado). Estado pasa formalmente a `in_progress`.
- **2026-06-04 (post-cierre — catálogo extendido)** — Beto pidió sumar
  la factibilidad municipal **"Factibilidad de Zona de Consolidación
  Urbana"** al checklist de anteproyecto. Agregada al catálogo
  `dilesa.plantilla_proyecto_tareas` en orden 8 (justo después de
  "Factibilidad de Uso de Suelo"), tipo Factibilidad / subtipo Urbanismo
  / Municipio / 15 días hábiles / obligatoria / depende de la Escritura.
  Las tareas en orden ≥ 8 se recorrieron +1 (Agua→9 … Consejo→13).
  Backfill a los 5 anteproyectos vivos (instancia en orden 8, pendiente,
  fecha objetivo = ventana de su Uso de Suelo). Migración
  `20260604170000_dilesa_factibilidad_zona_consolidacion_urbana.sql`
  (idempotente + Preview-safe), aplicada a prod vía `apply_migration`.
  El catálogo activo de anteproyecto queda en 13 tareas.

## Decisiones registradas

- **2026-05-26 — D1 (revisión post-realign): Una tabla
  `proyecto_presupuesto_partidas` con estado discriminator**, no dos
  tablas espejo. Trazabilidad histórica vía
  `proyectos.proyecto_predecesor_id`.
- **2026-05-26 — D2: 5 KPIs reactivos confirmados.**
- **2026-05-26 — Workflow de autorización en presupuestos
  preliminares.** Estado del CHECK constraint.
- **2026-05-26 — D3: Gate "Aprobación de Comité de Inversión".**
- **2026-05-26 — D4: 3 cotizaciones de obra como tareas estándar.**
- **2026-05-26 — Snapshot de columnas del catálogo en `proyecto_tareas`
  extendido.** ALTER de tabla existente vs nueva tabla. Preserva el
  reuso de `proyecto_tareas` que ya está bien construida.
- **2026-05-26 — Conversión por copia + `proyecto_predecesor_id`.** En
  vez de UPDATE in-place (que perdería el histórico), se crea nuevo row
  con `tipo='desarrollo'` y `proyecto_predecesor_id` apuntando al
  anteproyecto. Anteproyecto se preserva como histórico inmutable.
- **2026-05-26 — Sprint 4: la RPC NO instancia tareas nuevas de
  desarrollo automáticamente.** Trade-off para no duplicar la cascada
  de fechas hábiles en SQL. El operador puede llamar
  `populatePlantilla` sobre el nuevo proyecto si quiere repoblar con
  fechas frescas desde la fecha de promoción.
- **2026-05-26 — Gate del Comité detectado case-insensitive por
  título.** El `gateComitePromocion` helper busca tareas cuyo título
  matchea "comité de inversión" + "aprobación" (case-insensitive). La
  RPC server-side hace el mismo match exacto contra el nombre canónico
  de la plantilla — el helper UI es solo preventivo para no mostrar
  un botón que va a fallar.

## Appendix — Plantilla canónica de 35 tareas

### Anteproyecto (15 tareas: 12 Coda + 1 gate + 3 cotizaciones)

|      # | Tarea                                                  | Tipo         | Subtipo      | Entidad                          | Días | Obl |
| -----: | ------------------------------------------------------ | ------------ | ------------ | -------------------------------- | ---: | :-: |
|      1 | Escritura/Contrato Compraventa del Terreno             | Legal        | Propiedad    | Notaría / Registro Público       |   15 |  ✓  |
|      2 | Levantamiento Topográfico y Curvas de Nivel            | Estudio      | Técnico      | Topógrafo                        |    5 |  ✓  |
|      3 | Elaboración de Anteproyecto                            | Plano        | Urbanismo    | Interno                          |   10 |  ✓  |
|      4 | Estudio de Factibilidad Económica / Corrida Financiera | Estudio      | Financiero   | Finanzas / Dirección / Consultor |    7 |  ✓  |
|      5 | Mecánica de Suelos                                     | Estudio      | Técnico      | Laboratorio                      |   10 |  ✓  |
|      6 | Estudio Hidrológico                                    | Estudio      | Técnico      | UANL / Consultor                 |   10 |  —  |
|      7 | Factibilidad de Uso de Suelo                           | Factibilidad | Urbanismo    | Municipio                        |   15 |  ✓  |
|      8 | Factibilidad de Agua Potable y Drenaje                 | Factibilidad | Servicios    | SIMAS                            |   15 |  ✓  |
|      9 | Factibilidad de Energía Eléctrica                      | Factibilidad | Servicios    | CFE                              |   15 |  ✓  |
|     10 | Factibilidad de Servicios Complementarios              | Factibilidad | Servicios    | Proveedores                      |   10 |  —  |
|     11 | Cambio de Uso de Suelo                                 | Trámite      | Urbanismo    | Municipio                        |   20 | opc |
|     12 | Aprobación Consejo de Desarrollo Urbano                | Trámite      | Urbanismo    | Municipio                        |   20 |  ✓  |
| ⭐12.1 | Cotización de Urbanización                             | Cotización   | Urbanismo    | Contratistas Urbanización        |   15 |  ✓  |
| ⭐12.2 | Cotización de Construcción de Vivienda                 | Cotización   | Construcción | Contratistas Vivienda            |   15 |  ✓  |
| ⭐12.3 | Cotización de Comercialización                         | Cotización   | Comercial    | Marketing / Ventas               |   10 |  —  |
|   ⭐13 | **Aprobación de Comité de Inversión** (gate)           | Decisión     | Financiero   | Comité de Inversión / Dirección  |    7 |  ✓  |

### Proyecto / Desarrollo (19 tareas, todas de Coda)

|   # | Tarea                                                | Tipo          | Subtipo      | Entidad                | Días | Obl |
| --: | ---------------------------------------------------- | ------------- | ------------ | ---------------------- | ---: | :-: |
|  14 | Estudio de Impacto Ambiental                         | Estudio       | Ambiental    | Tramitador / Consultor |   20 |  ✓  |
|  15 | Manifestación de Impacto Ambiental (MIA)             | Trámite       | Ambiental    | Autoridad Ambiental    |   30 |  ✓  |
|  16 | Licencia de Fraccionamiento                          | Licencia      | Urbanismo    | Municipio              |   20 |  ✓  |
|  17 | Plano Oficial Aprobado                               | Plano         | Urbanismo    | Municipio              |   10 |  ✓  |
|  18 | Proyecto de Rasantes y Plataformas                   | Proyecto      | Topografía   | Topógrafo / Proyectos  |   15 |  ✓  |
|  19 | Proyecto Hidrosanitario Aprobado                     | Proyecto      | Servicios    | SIMAS                  |   15 |  ✓  |
|  20 | Proyecto Eléctrico Aprobado                          | Proyecto      | Servicios    | CFE                    |   15 |  ✓  |
|  21 | Certificación de Números Oficiales                   | Certificación | Urbanismo    | Municipio              |   10 |  ✓  |
|  22 | Certificación de Alineamiento Residencial            | Certificación | Urbanismo    | Municipio              |   10 |  ✓  |
|  23 | Declaración Unilateral de Voluntades / Escrituración | Legal         | Urbanismo    | Notaría                |   20 |  ✓  |
|  24 | Registro ante Catastro                               | Registro      | Legal        | Notaría / Municipio    |   10 |  ✓  |
|  25 | Registro Público de la Propiedad (RPP)               | Registro      | Legal        | Notaría                |   15 |  ✓  |
|  26 | Permiso de Movimiento de Tierras                     | Permiso       | Construcción | Municipio              |   10 |  —  |
|  27 | Permiso de Trazo y Nivelación                        | Permiso       | Construcción | Municipio              |   10 |  —  |
|  28 | Constancia de No Adeudo SIMAS                        | Constancia    | Servicios    | SIMAS                  |    5 |  —  |
|  29 | Constancia de No Adeudo CFE                          | Constancia    | Servicios    | CFE                    |    5 |  —  |
|  30 | Constancia de Protección Civil                       | Certificación | Legal        | Protección Civil       |   10 |  —  |
|  31 | Acta de Terminación de Obra de Urbanización          | Acta          | Construcción | Municipio              |   15 |  ✓  |
|  32 | Entrega-Recepción de Fraccionamiento                 | Acta          | Urbanismo    | Municipio              |   10 |  ✓  |

Dependencias clave: 27 de las 31 tareas tienen al menos una. Lista
completa importada de Coda en el script de seed del Sprint 3.
