# Iniciativa — Checklist de proyectos DILESA con captura inline

**Slug:** `dilesa-proyectos-checklist-inline`
**Empresas:** DILESA
**Schemas afectados:** `dilesa.proyecto_tarea_pasos` (tabla nueva Sprint 3); reusa `dilesa.proyecto_tareas` + `proyecto_tareas_dependencias` + `proyecto_presupuesto_partidas` + `proyecto_documentos` + `proyecto_hitos` + `plantilla_proyecto_tareas`.
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-05-28
**Última actualización:** 2026-05-29 (Sprint 4A mergeado — 4 tareas eliminadas + autorización integrada en promoción + rol Dirección por empresa)

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

### Sprint 3 — Pasos por tarea (reformulado 2026-05-29)

**Cambio de visión propuesto por Beto:** cada tarea pasa de ser
"una cosa" (1 doc + 1 monto) a tener **4 pasos canónicos** que
modelan el ciclo de vida operativo de la tarea:

| Paso         | Captura                                                 | Avance | Efecto en `proyecto_presupuesto_partidas` |
| ------------ | ------------------------------------------------------- | ------ | ----------------------------------------- |
| `cotizacion` | monto + cotización.pdf + fecha                          | 25%    | partida `preliminar` (`monto_estimado`)   |
| `factura`    | monto + factura.pdf + fecha                             | 25%    | partida `autorizada` (`monto_aprobado`)   |
| `pago`       | monto + comprobante.pdf + fecha                         | 25%    | partida `en_ejercicio` (`monto_ejercido`) |
| `resultado`  | el entregable (escritura, plano, dictamen, certificado) | 25%    | — (cierra el ciclo)                       |

Pasos opcionales con `estado='no_aplica'` se sacan del denominador
del cálculo. El avance de la tarea = `pasos_hechos / pasos_aplicables × 100`.

**Decisiones cerradas D1-D6 (2026-05-29):**

- **D1:** Los 4 pasos aparecen siempre; el operador marca "N/A" los
  que no aplican. Más simple que codificarlos en el catálogo.
- **D2:** Avance tarea = `hechos / aplicables × 100`. Peso igual.
- **D3:** Avance proyecto = promedio ponderado por obligatoriedad:
  obligatoria=1, condicional=0.5, opcional=0. Lo opcional no estorba.
- **D4:** Auto-flujo con partidas: paso cotizacion → preliminar,
  factura → autorizada+monto_aprobado, pago → en_ejercicio +
  monto_ejercido. Cuando los 3 pasos financieros aplicables están
  hechos, partida pasa a `cerrada`. Sprint 2 ya cubre cotización.
- **D5:** Backfill cero-pérdida desde Sprint 1+1.5: cada tarea con
  `resultado_documento_url` poblado → INSERT paso='resultado'
  estado='hecho'. Cada tarea con `resultado_monto` poblado → INSERT
  paso='cotizacion' estado='hecho'. Los atajos en `proyecto_tareas`
  se mantienen como referencia rápida (deprecados para captura nueva).
- **D6:** Mergear primero PR #581 (compactación visual independiente);
  el rediseño con pasos viene encima.

**Schema delta:**

```sql
CREATE TABLE dilesa.proyecto_tarea_pasos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas(id),
  tarea_id uuid NOT NULL REFERENCES dilesa.proyecto_tareas(id) ON DELETE CASCADE,
  paso text NOT NULL CHECK (paso IN ('cotizacion','factura','pago','resultado')),
  monto numeric,                    -- NULL si N/A o no capturado
  documento_url text,               -- URL del proxy (atajo del adjunto principal)
  fecha date,                       -- fecha del paso (cotizado/facturado/pagado/entregado)
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','hecho','no_aplica')),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tarea_id, paso)
);
CREATE INDEX idx_proyecto_tarea_pasos_tarea ON dilesa.proyecto_tarea_pasos(tarea_id)
  WHERE deleted_at IS NULL;

-- RLS canónica DILESA: SELECT/INSERT/UPDATE para miembros de empresa,
--                     DELETE solo admin.

-- Vista de avance derivado:
CREATE VIEW dilesa.v_proyecto_avance AS
WITH paso_tarea AS (
  SELECT
    pt.tarea_id,
    COUNT(*) FILTER (WHERE pt.estado <> 'no_aplica') AS aplicables,
    COUNT(*) FILTER (WHERE pt.estado = 'hecho') AS hechos
  FROM dilesa.proyecto_tarea_pasos pt
  WHERE pt.deleted_at IS NULL
  GROUP BY pt.tarea_id
), avance_tarea AS (
  SELECT
    t.id AS tarea_id,
    t.proyecto_id,
    t.obligatoriedad_snapshot,
    CASE
      WHEN pt.aplicables IS NULL OR pt.aplicables = 0 THEN 0
      ELSE ROUND(100.0 * pt.hechos / pt.aplicables, 2)
    END AS avance_pct,
    CASE t.obligatoriedad_snapshot
      WHEN 'obligatoria' THEN 1.0
      WHEN 'condicional' THEN 0.5
      ELSE 0.0
    END AS peso
  FROM dilesa.proyecto_tareas t
  LEFT JOIN paso_tarea pt ON pt.tarea_id = t.id
  WHERE t.deleted_at IS NULL
)
SELECT
  proyecto_id,
  COUNT(*) FILTER (WHERE peso > 0) AS tareas_aplicables,
  ROUND(
    SUM(avance_pct * peso) / NULLIF(SUM(peso), 0),
    2
  ) AS avance_pct
FROM avance_tarea
GROUP BY proyecto_id;
```

**Backfill:** script idempotente extrae `resultado_documento_url` y
`resultado_monto` de las 80 tareas backfilleadas en Sprint 1 → crea
pasos `resultado` y `cotizacion` respectivos con `estado='hecho'`.

**Storage:** `lib/storage/path.ts` agrega `'proyecto_tarea_pasos'`
al union `AdjuntoEntidad`. Adjuntos individuales por paso vía
`entidad_tipo='proyecto_tarea_paso'`. El campo `documento_url` del
paso es atajo al adjunto principal (igual que `resultado_documento_url`
es atajo al de la tarea hoy).

**Server actions:**

- `upsertPasoMonto(tareaId, paso, monto)`: idempotente, crea row
  con `estado='pendiente'` si no existe.
- `upsertPasoDocumento(tareaId, paso, url)`: idem.
- `marcarPasoEstado(tareaId, paso, estado)`: incluyendo `no_aplica`.
- Cada uno dispara `syncPartidaDesdeTarea` extendido para mapear
  estado de paso → estado de partida (D4).

**UI:**

- Tabla compacta mantiene 1 row por tarea con columnas nuevas:
  **Avance %** + **$ acum.** (suma de los 3 montos financieros
  capturados).
- Expand al click muestra **grid 2×2 de pasos**; cada celda tiene
  input monto + slot `<FileAttachments>` mini + selector estado +
  fecha.
- `<PartidasPresupuestales>` queda igual; el auto-flujo lo alimenta
  desde los pasos en lugar del campo `resultado_monto` antiguo.

### Sprint 4 — Espejar a desarrollo + backfill desarrollos

(Pospuesto desde el plan original Sprint 3 — se ejecuta una vez que
los pasos por tarea estén estables en anteproyecto.)

1. Backfill SQL para los 8 desarrollos vivos (tareas + pasos).
2. `<ProyectoDetalle>` agrega `<TareasChecklist>` +
   `<PartidasPresupuestales>` filtradas por
   `aplicacion_snapshot IN ('desarrollo','ambas')`.
3. Banner sticky "Marcar histórico" para acelerar marcado en bulk.

### Sprint 5 — Documentos + hitos unificados

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

- **2026-05-29 (Sprint 4A — consolidar autorización en promoción)** —
  PR #583 mergeado. 4 tareas redundantes eliminadas del catálogo
  canónico (Cotización Urbanización/Construcción/Comercialización +
  Aprobación Comité de Inversión), 20 instancias vivas + 80 pasos
  soft-deleted, 11 dependencias hard-deleted. RPC
  `fn_proyecto_promote_anteproyecto` actualizada sin gate de tarea
  Comité; gate ahora vive en server action +`gatePromocion()` UI.
  Botón "Promover a desarrollo" → "Autorizar y promover a desarrollo"
  con copy explícito sobre autorización de ejecución. Acceso al botón
  ampliado de `rol='admin'` a admin global O rol "Dirección" en la
  empresa (modelo correcto vía `core.usuarios_empresas` + `core.roles`).
  `EffectiveUser` expone `direccionEmpresaIds: string[]` para que
  consumidores futuros reusen el flag por empresa.

- **2026-05-29 (Sprint 3 reformulado a "pasos por tarea")** — Beto
  propuso un rediseño del modelo: cada tarea debe tener 4 sub-pasos
  (cotización · factura · pago · resultado), cada uno con su monto +
  documento + estado + fecha. La misma tarea sirve de control
  documental + presupuestal + avance. Cerradas D1-D6 documentadas
  arriba. PR #581 mergeado (compactación visual independiente).
  Sprint 3 original "espejar a desarrollo" pospuesto a Sprint 4.

- **2026-05-29 (hotfix detección cotización + compactación UI)** —
  Bug detectado: helper buscaba "cotizac" en subtipo (Urbanismo/
  Construcción/Comercial) en lugar de tipo ('Cotización'). PR #580
  con fix de 1 línea. Beto reportó que la UI se veía "revuelta sin
  organización"; PR #581 refactor a tabla compacta con expand inline
  (1 fila por tarea, ~32px alto, click expande captura completa).

- **2026-05-28 (Sprint 2)** — Auto-vinculación tarea → partida +
  componente `<PartidasPresupuestales>` agrupado por estado +
  `autorizarPartida` server action. PR #579 mergeado.

- **2026-05-28 (Sprint 1.5)** — Import de 29 PDFs/JPGs desde Coda
  `grid-XLc0Md6iHp` (3 anteproyectos: LDLE/LDLD/LE). PR #577.

- **2026-05-28 (Sprint 1 + hotfixes)** — PR #572 mergeado con captura
  inline + 4 server actions + `<TareasChecklist>` + backfill de 80
  tareas + 105 dependencias en 5 anteproyectos. Hotfixes: PR #573
  guards defensivos + PR #575 root cause `'use server'` no exporta
  const/types (movidos a `tareas-checklist-types.ts`).

- **2026-05-28 (promoción)** — Iniciativa promovida tras análisis profundo
  con Beto comparando UI actual contra visión de "plantilla expuesta
  por default + captura inline + automatización". 4 decisiones cerradas
  (auto-populate por server action, backfill 13 proyectos, FileAttachments
  para adjuntos, orden A anteproyecto-primero). Hallazgo crítico:
  motor completo en schema, 0% utilizado en datos vivos. Sprint 1 arranca
  esta sesión.

## Decisiones registradas

- **2026-05-29 (Sprint 4A) — Rol "Dirección" por empresa, no rol
  global**. El modelo correcto para gates operativos es
  `core.usuarios_empresas.rol_id → core.roles.nombre` por empresa.
  `core.usuarios.rol` (admin/viewer) queda reservado para
  superusuarios cross-empresa. `EffectiveUser.direccionEmpresaIds`
  expone la lista de empresas donde el caller tiene rol "Dirección"
  (match case-insensitive 'direcci%n') para que cualquier gate futuro
  reuse el flag.

- **2026-05-29 (Sprint 4A) — Eliminación de las 3 cotizaciones del
  catálogo**. Los montos de urbanización/construcción/comercialización
  se capturarán directamente en el análisis financiero (Sprint 4B)
  como columnas Referencia vs Proyecto, alineado con la vista Coda.
  Ya no tiene sentido tenerlos como tareas separadas con su propio
  ciclo de pasos.

- **2026-05-28 — Cero ALTER en v1**. El schema actual ya cubre el flujo
  completo. Validar antes de proponer columnas nuevas.
- **2026-05-28 — Backfill incluye desarrollos en Sprint 3**. Aunque
  visualmente "se siente vacío" hasta que se marquen históricos.
  Aceptado por Beto: "después veo cómo llenar todos los datos para que
  quede el historial completo".
- **2026-05-28 — Reuso de `<FileAttachments>` ADR-022**. Beto: "que se
  maneje igual como los demás documentos que se suben".
