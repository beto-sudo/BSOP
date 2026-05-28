# Iniciativa — Checklist de proyectos DILESA con captura inline

**Slug:** `dilesa-proyectos-checklist-inline`
**Empresas:** DILESA
**Schemas afectados:** ninguno (cero ALTER). Reusa `dilesa.proyecto_tareas` + `proyecto_tareas_dependencias` + `proyecto_presupuesto_partidas` + `proyecto_documentos` + `proyecto_hitos` + `plantilla_proyecto_tareas` ya existentes.
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-05-28
**Última actualización:** 2026-05-28 (promoción + arranque Sprint 1)

## Problema

El motor de plantillas + tareas + partidas presupuestales + documentos
de proyecto está completo en el schema (Sprint 3 de
`dilesa-proyectos-anteproyectos`), pero la UI no lo expone:

1. **El checklist está escondido tras un botón.** El operador entra al
   detalle de un anteproyecto y ve "Sin tareas instanciadas todavía"
   con un botón "Poblar plantilla canónica" — tiene que clickearlo
   manualmente o las 16 tareas canónicas nunca aparecen.
2. **Una vez pobladas, las tareas son read-only.** No hay dropdown
   para cambiar estado, ni input para `resultado_monto`, ni slot para
   `resultado_documento_url`. Las columnas existen en
   `proyecto_tareas` pero ningún componente las captura.
3. **Las partidas presupuestales viven en un texto que dice "próximo
   entregable".** El operador no puede crear, editar ni autorizar
   partidas desde el UI.
4. **El detalle del desarrollo no muestra el checklist.** Aunque la
   RPC `fn_proyecto_promote_anteproyecto` copia tareas y partidas
   autorizadas al desarrollo, `<ProyectoDetalle>` (la página
   `/dilesa/proyectos/[id]`) nunca renderiza esas tareas — solo
   muestra Avances de unidades, ficha y unidades. La continuidad se
   pierde al promover.
5. **`proyecto_documentos` y `proyecto_hitos` no aparecen en el UI.**
   Tablas reales, sin componente que las consuma.

Estado real verificado 2026-05-28: 13 proyectos vivos (5
anteproyectos + 8 desarrollos), **todos con `tareas=0`,
`partidas=0`, `docs=0`**. El catálogo `plantilla_proyecto_tareas`
tiene 35 tareas activas listas pero ningún proyecto las consume.

## Outcome esperado

Un solo paradigma — **checklist con captura inline** — que vive por
default en el detalle de cualquier proyecto, sea anteproyecto o
desarrollo. Cada fila de tarea es un punto de captura:

- Cambiar estado (pendiente · en curso · completada · cancelada · bloqueada).
- Subir documento (vía `<FileAttachments>` ADR-022 → `proyecto_documentos` + `resultado_documento_url`).
- Capturar monto (si la tarea es cotización → se vincula a `proyecto_presupuesto_partidas` con `tarea_origen_id`).
- Notas inline.
- Dependencias visibles ("bloqueada por: X").

Sin botones para revelar lo básico. El checklist está expuesto desde
el primer render. La automatización máxima:

- Al crear un proyecto (anteproyecto o desarrollo), las tareas se
  instancian automáticamente vía server action.
- Al capturar monto en una tarea de cotización, se crea/actualiza la
  partida preliminar vinculada.
- Cuando una dependencia se completa, sus dependientes pasan de
  `bloqueada` a `pendiente`.
- Cuando todas las obligatorias están completas, banner sticky
  "Listo para promover" gateado por la tarea "Comité de Inversión".

## Decisiones cerradas (D1-D4)

### D1 — Auto-populate por server action ✅

Cuando se crea un proyecto desde UI, una server action lo inserta y
llama `populatePlantilla` en la misma transacción lógica.
Idempotente (la lógica actual de populatePlantilla revisa que no
existan tareas con `plantilla_tarea_id` set).

Trade-off vs trigger SQL: trigger sería automático aunque alguien
hiciera INSERT por SQL directo, pero es invisible y difícil de
testear; la server action queda explícita en el código y se cubre
con tests. Si el importer crea proyectos via bulk insert, hay que
llamar la action en bucle como parte del script.

### D2 — Backfill de los 13 proyectos actuales ✅

Script one-shot `scripts/backfill_dilesa_tareas_anteproyectos.ts` (y
versión espejo para desarrollos en Sprint 3) que llama
`populatePlantilla` para cada proyecto sin tareas. Las tareas se
crean en `estado='pendiente'`. Beto rellena estado/montos/docs
manualmente después conforme captura el histórico operativo.

Riesgo: los desarrollos llevan años corriendo, mostrar 19 tareas en
`pendiente` por proyecto se ve mal. Mitigación en Sprint 3: banner
explícito + opción "marcar todas las obligatorias como completadas
histórico" para acelerar el catch-up.

### D3 — Adjuntos via `<FileAttachments>` (ADR-022) ✅

Los documentos suben a Supabase Storage vía el componente canónico
`<FileAttachments>`. Cada upload registra un row en
`proyecto_documentos` con `proyecto_id` + (opcional) referencia a la
tarea origen. El campo `proyecto_tareas.resultado_documento_url`
guarda la URL pública del primer adjunto principal de la tarea
(quick access); el resto vive en `proyecto_documentos`.

Si la tarea exige formato específico (`formato_archivo_snapshot`),
el slot lo respeta.

### D4 — Orden: anteproyecto primero, espejar a desarrollo después ✅

Sprint 1+2 quedan en anteproyecto. Sprint 3 espeja al desarrollo
reutilizando el componente. Sprint 4 cierra documentos+hitos
unificados. Sprint 5 son automatizaciones (cascada bloqueada,
banner promover, asignación auto).

## Modelo conceptual (sin cambios al schema)

```
dilesa.proyectos
  ├── proyecto_tareas (instancias del checklist, plantilla_tarea_id apunta al catálogo)
  │     ├── resultado_monto       — capturable inline
  │     ├── resultado_documento_url — URL principal del adjunto
  │     └── proyecto_tareas_dependencias (N:M → tareas que la bloquean)
  ├── proyecto_presupuesto_partidas
  │     └── tarea_origen_id  → vínculo a la tarea que la generó
  ├── proyecto_documentos     (legajo completo, FileAttachments destination)
  └── proyecto_hitos           (Sprint 4)
```

## Sprints

### Sprint 1 — Captura inline + auto-populate (anteproyecto)

1. **Server action `createAnteproyecto`** que inserta `dilesa.proyectos`
   con `tipo='anteproyecto'` + llama `populatePlantilla` en la misma
   transacción lógica. Solo se llama desde el formulario "Nuevo
   anteproyecto" (a crear si no existe; verificar primero).
2. **Server actions de tarea** (whitelist por campo + validación + RLS):
   - `updateTareaEstado(tareaId, estado)`
   - `updateTareaMonto(tareaId, monto)`
   - `updateTareaDocumento(tareaId, documentoUrl)` (recibe la URL después de que `<FileAttachments>` la sube)
   - `updateTareaNotas(tareaId, notas)`
3. **Backfill SQL** `scripts/backfill_dilesa_tareas_anteproyectos.ts`:
   DRY_RUN primero. Itera los 5 anteproyectos sin tareas y llama
   populatePlantilla con `fecha_inicio` del proyecto (o hoy si NULL).
4. **Componente `<TareasChecklist>`** reusable. Tabla con acciones
   inline. Optimistic UI con rollback. Diseño para reuso en Sprint 3.
5. **Integración en `<AnteproyectoDetalle>`**: reemplaza la sección
   actual "Checklist de tareas" con el componente.
6. **Tests**: unit tests para los 4 server actions (whitelist + validación);
   render test para `<TareasChecklist>` con variantes (sin deps,
   bloqueada, requiere archivo).

### Sprint 2 — Partidas presupuestales auto-vinculadas

1. Cuando se captura `resultado_monto` en tarea de
   `subtipo_snapshot='cotizacion'`, server action
   `upsertPartidaDesdeTarea` crea/actualiza partida preliminar con
   `tarea_origen_id`.
2. Sección `<PartidasPresupuestales>` en el detalle: agrupa partidas
   por estado (preliminar · autorizada · planeada · en ejercicio · cerrada).
3. Server action `autorizarPartida` con role gate.

### Sprint 3 — Espejar checklist en desarrollo + backfill

1. Backfill SQL para los 8 desarrollos vivos.
2. `<ProyectoDetalle>` agrega secciones `<TareasChecklist>` y
   `<PartidasPresupuestales>` filtradas por
   `aplicacion_snapshot IN ('desarrollo','ambas')`.
3. Banner sticky "Marcar histórico" para acelerar marcado en bulk.

### Sprint 4 — Documentos + hitos unificados

1. Sección `<DocumentosProyecto>` que agrega URLs sueltas +
   `resultado_documento_url` de tareas + filas de
   `proyecto_documentos`.
2. Sección `<HitosProyecto>` con `proyecto_hitos` editable + hitos
   auto-derivados.

### Sprint 5 — Automatizaciones

1. Cascada `bloqueada` ↔ `pendiente` según dependencias.
2. Banner sticky "Listo para promover" cuando todas obligatorias
   completas + gate Comité.
3. Auto-asignación de responsable según
   `entidad_responsable_snapshot` mapeado.

## Riesgos

- **R1 (medio):** Backfill de desarrollos llena checklist con 19
  tareas pendientes aunque el proyecto lleva años. Mitigación
  Sprint 3 con banner "marcar histórico".
- **R2 (bajo):** Si Beto crea proyecto via SQL/importer, el
  checklist queda vacío. Mitigación: doc en `import_dilesa_proyectos.ts`
  y comentario en `populatePlantilla` recordando llamarla.
- **R3 (bajo):** `<FileAttachments>` requiere bucket + RLS de
  Storage que permita escritura para operadores DILESA en
  `dilesa/proyectos/<id>/<tarea_id>/`. Verificar en Sprint 1 que el
  patrón existe y funciona (otros módulos ya lo usan).

## Bitácora

- **2026-05-28 (promoción)** — Iniciativa promovida tras análisis profundo
  con Beto comparando UI actual contra visión de "plantilla expuesta
  por default + captura inline + automatización". 4 decisiones cerradas
  (auto-populate por server action, backfill 13 proyectos, FileAttachments
  para adjuntos, orden A anteproyecto-primero). Hallazgo crítico:
  motor completo en schema, 0% utilizado en datos vivos. Sprint 1 arranca
  esta sesión.

## Decisiones registradas

- **2026-05-28 — Cero ALTER en v1**. El schema actual ya cubre el flujo
  completo. Validar antes de proponer columnas nuevas.
- **2026-05-28 — Backfill incluye desarrollos en Sprint 3**. Aunque
  visualmente "se siente vacío" hasta que se marquen históricos.
  Aceptado por Beto: "después veo cómo llenar todos los datos para que
  quede el historial completo".
- **2026-05-28 — Reuso de `<FileAttachments>` ADR-022**. Beto: "que se
  maneje igual como los demás documentos que se suben".
