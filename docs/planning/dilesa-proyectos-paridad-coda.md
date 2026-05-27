# Iniciativa — Proyectos DILESA · Paridad con Coda

**Slug:** `dilesa-proyectos-paridad-coda`
**Empresas:** DILESA
**Schemas afectados:** `dilesa.proyectos` (4 columnas en Sprint A + ~6 más pendientes en Sprint C), `dilesa.v_proyecto_avances` (vista derivando avances de `unidades`; Sprint C amplía agregados)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-05-26
**Última actualización:** 2026-05-27 (Sprint B mergeado/PR abierto — tabla principal pinta los avances + objetivo trimestral del detalle. Spike Sprint C abre catálogo de ~15 columnas Coda faltantes por categoría para que Beto decida alcance v2.)

## Problema

Beto observó dos huecos al comparar la tabla `*Proyectos`
(`grid-SlvkPAfZNE`, 8 rows × 60 columnas) de Coda DILESA con
`dilesa.proyectos`:

1. **Estados divergentes**. 3 desarrollos están al 100% de construcción
   y ≥99% de ventas según Coda pero siguen marcados como
   `estado='ejecutando'` en BSOP:
   - Loma Verde (LV): const 100%, vts 100%.
   - Loma Verde 2 (LV2): const 100%, vts 100%.
   - Lomas del Valle (LDV): const 100%, vts 99.12%.
2. **Campos raw faltantes**. De los 14 campos capturables (no fórmula)
   en Coda, BSOP tiene 10; faltan 4:
   - `Plano Oficial` (attachments) → `plano_oficial_url`.
   - `Image` (image) → `image_url` (portada del proyecto).
   - `Acreditación Escritura` (text) → `acreditacion_escritura`.
   - `Objetivo Trimestral` (number) → `objetivo_trimestral`.

Adicionalmente, 46 columnas en Coda son **fórmulas derivadas**
(avances %, conteos de casas por estado, parque disponible,
cumplimiento, ticket promedio, ventas totales). BSOP tiene los
datos crudos en `dilesa.unidades` + `construccion` + `ventas` pero
no los expone derivados; el operador no puede responder "¿en qué
avance va el proyecto?" sin abrir Coda.

## Outcome esperado

1. **Estados al día** — los 3 desarrollos terminados pasan a
   `estado='completado'` en BSOP. Definimos la regla operativa para
   transiciones futuras y la documentamos.
2. **4 campos raw expuestos** — `dilesa.proyectos` gana 4 columnas
   nuevas que se pueden capturar desde el drawer de detalle del
   proyecto. UI: sección "Documentos y configuración" en el drawer.
3. **Vista de avances derivados** — `dilesa.v_proyecto_avances`
   computa los 7 indicadores clave de Coda (avance urb/const/vts %,
   conteos de unidades por estado, ticket promedio, ventas totales,
   parque disponible) directamente sobre las tablas BSOP. UI: sección
   "Avances" en el drawer de proyecto con barras de progreso.
4. **Estado sugerido vs estado actual** — la vista expone también el
   `estado_sugerido` (basado en avance de construcción ≥ 100% Y
   avance de ventas ≥ 95% → `completado`; ejecutando si entra en
   ese rango pero no se cumplen ambos). La UI muestra un badge
   "estado sugerido: X" cuando difiere del estado en DB, para que el
   operador lo actualice manualmente. v1 no fuerza el UPDATE — eso
   queda para un sprint B opcional con trigger/cron.

## Decisión registrada — regla de transición a `completado` (estricta)

Un proyecto pasa a `estado='completado'` solo cuando **TODAS** sus
unidades cumplen:

- `construidas = total` (todas en `terminada`/`asignada`/`vendida`/
  `escriturada`/`entregada`), Y
- `vendidas = total` (todas en `vendida`/`escriturada`/`entregada`/
  `asignada`).

**Regla original (descartada)**: `≥ 95%` ambos. Beto pidió "aunque
quede una vivienda por vender hay que marcarlo como ejecutando" —
regla relajada permitía marcar terminado con 1-10 unidades sin
vender, no refleja la realidad operativa.

Estado de los 8 desarrollos hoy (post-revert): los 3 que habían
pasado a `completado` (LV/LV2/LDV) vuelven a `ejecutando` porque en
BSOP les quedan 3/6/10 unidades respectivamente. Cuando todas se
vendan, el `estado_sugerido` será `completado` y el operador lo
aplicará manualmente.

## Modelo conceptual

### Schema delta (Sprint A)

```sql
ALTER TABLE dilesa.proyectos
  ADD COLUMN plano_oficial_url text,
  ADD COLUMN image_url text,
  ADD COLUMN acreditacion_escritura text,
  ADD COLUMN objetivo_trimestral integer;

UPDATE dilesa.proyectos SET estado='completado', updated_at=NOW()
WHERE empresa_id = '<DILESA>'
  AND clave_interna IN ('LV', 'LV2', 'LDV')
  AND deleted_at IS NULL
  AND estado = 'ejecutando';
```

### Vista de avances (Sprint A)

```sql
CREATE VIEW dilesa.v_proyecto_avances WITH (security_invoker = on) AS
WITH u AS (
  SELECT proyecto_id,
         COUNT(*) FILTER (WHERE estado IS NOT NULL)              AS total,
         COUNT(*) FILTER (WHERE estado IN ('terminada','asignada','vendida','escriturada','entregada')) AS construidas,
         COUNT(*) FILTER (WHERE estado IN ('vendida','escriturada','entregada','asignada'))             AS vendidas,
         COUNT(*) FILTER (WHERE estado <> 'planeada')            AS con_avance_urb,
         COUNT(*) FILTER (WHERE estado = 'terminada')            AS terminadas,
         COUNT(*) FILTER (WHERE estado = 'en_construccion')      AS en_construccion,
         COUNT(*) FILTER (WHERE estado = 'escriturada')          AS escrituradas,
         AVG(precio) FILTER (WHERE estado IN ('vendida','escriturada','entregada')) AS ticket_promedio,
         SUM(precio) FILTER (WHERE estado IN ('vendida','escriturada','entregada')) AS ventas_totales
  FROM dilesa.unidades
  WHERE deleted_at IS NULL
  GROUP BY proyecto_id
)
SELECT
  p.id AS proyecto_id,
  p.empresa_id,
  COALESCE(u.total, 0)                                          AS lotes_total,
  COALESCE(u.construidas, 0)                                    AS lotes_construidos,
  COALESCE(u.vendidas, 0)                                       AS lotes_vendidos,
  COALESCE(u.con_avance_urb, 0)                                 AS lotes_urbanizados,
  COALESCE(u.terminadas, 0)                                     AS casas_terminadas,
  COALESCE(u.en_construccion, 0)                                AS casas_en_construccion,
  COALESCE(u.escrituradas, 0)                                   AS casas_escrituradas,
  CASE WHEN u.total > 0 THEN ROUND(100.0 * u.con_avance_urb / u.total, 2) ELSE NULL END AS avance_urb_pct,
  CASE WHEN u.total > 0 THEN ROUND(100.0 * u.construidas    / u.total, 2) ELSE NULL END AS avance_const_pct,
  CASE WHEN u.total > 0 THEN ROUND(100.0 * u.vendidas       / u.total, 2) ELSE NULL END AS avance_vts_pct,
  GREATEST(0, COALESCE(u.total, 0) - COALESCE(u.vendidas, 0))   AS parque_disponible,
  u.ticket_promedio,
  COALESCE(u.ventas_totales, 0)                                 AS ventas_totales,
  -- Estado sugerido por la regla canónica
  CASE
    WHEN u.total IS NULL OR u.total = 0 THEN p.estado
    WHEN (100.0 * u.construidas / u.total) >= 100
     AND (100.0 * u.vendidas    / u.total) >= 95
    THEN 'completado'
    ELSE 'ejecutando'
  END AS estado_sugerido,
  p.estado AS estado_actual
FROM dilesa.proyectos p
LEFT JOIN u ON u.proyecto_id = p.id
WHERE p.deleted_at IS NULL;
```

### UI

- **Drawer del proyecto**: 2 secciones nuevas.
  - "Documentos y configuración" — 4 campos editables (`plano_oficial_url`
    como URL, `image_url` como URL, `acreditacion_escritura` text,
    `objetivo_trimestral` number).
  - "Avances" — barras de progreso para urb/const/vts + conteos
    (terminadas, en construcción, escrituradas) + ticket promedio +
    ventas totales + badge "estado sugerido" cuando difiere del actual.
- Server action `updateProyectoFields(proyectoId, patch)` para los 4
  campos (limitado a admin / dir construcción según RLS existente).

## Sprints

### Sprint A — Schema delta + UPDATE estados + vista + UI (este PR)

1. Migración SQL: ALTER `proyectos` con 4 columnas + UPDATE de los 3
   estados + CREATE VIEW `v_proyecto_avances`.
2. Aplicar via `supabase db push` después de OK de Beto.
3. Regenerar `SCHEMA_REF.md` + `types/supabase.ts`.
4. UI en `<ProyectoDetailDrawer>`: 2 secciones nuevas + server action
   para editar los 4 campos.
5. Tests unitarios para la lógica de "estado sugerido vs actual".
6. 1 PR.

### Sprint B — Exponer Avances en tabla principal (2026-05-27, este PR)

`<ProyectosModule>` (tabla `/dilesa/proyectos`) heredaba el set viejo
de 14 columnas (`nombre/clave/tipo/estado/fechas/lotes/área/4 costos`).
Beto observó que los bloques nuevos del Sprint A (avances %, ventas
totales, objetivo trimestral) viven solo en el detalle — al recorrer
el portafolio no se ven.

Cambios:

- `ProyectosModule` fetchea `dilesa.proyectos` + `v_proyecto_avances`
  en paralelo (`Promise.all` con dos queries del mismo client) y
  mergea por `proyecto_id` in-memory. Si la vista falla (RLS,
  PostgREST), los avances quedan `null` y la tabla degrada con `—`.
- Tipo nuevo `ProyectoListRow = ProyectoDetalle & { avances: Pick<…> | null }`
  exportado para el test.
- 5 columnas nuevas: **Urb. %**, **Const. %**, **Vts. %**,
  **Parque** (disponible), **Ventas** (totales, compact MXN),
  **Obj. trim.** Total tabla: 14 → 19 columnas (página
  desktop-only ya, scroll horizontal aceptable per ADR-019/ADR-010).
- KPIs intactos (cap 5 ADR-034 — sin sustituciones); este PR no
  reordena la curaduría D13.
- Sort robust con `null` (TanStack lo manda al fondo natural). No
  introducimos sentinel `-1` para no confundir con avance real 0%.

Sin DDL. Cero migración. Tests `deriveKpis` actualizados al nuevo
tipo `ProyectoListRow` (helper `p()` suma `avances: null`); los 10
tests pasan sin cambio funcional.

### Sprint C (spike abierto) — Paridad real con Coda · ~15 columnas faltantes

Comparativa fresca 2026-05-27 vs `grid-SlvkPAfZNE` (60 columnas Coda
× 8 proyectos): de las 60, 16 hoy están en `dilesa.proyectos` o en
`v_proyecto_avances`. Quedan ~30 derivadas que no migramos
(intencional Sprint A) y ~15 capturables/derivables que sí podrían
agregar valor en BSOP. Catalogación a continuación; **Beto decide qué
entra y qué se difiere** antes de tocar schema.

#### (a) Derivables expandiendo `v_proyecto_avances` — cero ALTER

Cómputos sobre `dilesa.unidades` y/o `dilesa.ventas`:

| Coda                              | Cómputo propuesto                                                                | Notas                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Casas Vendidas                    | `COUNT(*) FILTER (estado='vendida')`                                             | Distinto de `escriturada`/`entregada`.                                                        |
| Casas Muestra/Demo                | `COUNT(*) FILTER (tipo_lote='muestra')` ó flag dedicado                          | Verificar si hoy hay convención. Si no, agregar enum o flag.                                  |
| Inventario Disponible Terminado   | `COUNT(*) FILTER (estado='terminada')` sin asignar                               | Hoy `casas_terminadas` ya está; falta el filtro "sin asignar".                                |
| Inventario Formalizado            | `COUNT(*) FILTER (estado IN ('vendida','escriturada','entregada'))`              | Definir si "formalizado" = vendida en adelante o solo escriturada+entregada.                  |
| Inventario Disponible para Venta  | `COUNT(*) FILTER (estado='terminada' AND no_asignada)`                           | Subconjunto del anterior.                                                                     |
| En Proceso de Escrituración       | Ya en vista (`casas_escrituradas`) ó estado intermedio "vendida sin escriturar". | Reconciliar definición operativa.                                                             |
| Lotes Comerciales / Residenciales | `COUNT(*) FILTER (tipo_lote='comercial')` / `'residencial'`                      | `unidades.tipo_lote` ya existe.                                                               |
| Tamaño Lote Promedio              | `AVG(area_m2)` en `unidades`                                                     | Trivial.                                                                                      |
| Densidad de Vivienda              | `lotes_residenciales / (area_residencial_m2 / 10000)`                            | Requiere `area_residencial_m2` capturado (ver categoría b).                                   |
| Parque Disponible Inicial/Final   | `parque_disponible` con corte temporal                                           | Necesita parámetro fecha o usar trimestre actual. Replantear como vista parametrizable o RPC. |
| Escrituración del periodo         | `COUNT(*) FILTER (escriturado_at BETWEEN inicio_trim AND fin_trim)`              | Requiere `unidades.escriturado_at` (campo a verificar; si no existe va a (b)).                |
| Cumplimiento %                    | `escrituracion_periodo / objetivo_trimestral`                                    | Calculable una vez tengamos "escrituración del periodo".                                      |
| En Proceso Por Detonar ($)        | Pendiente investigación                                                          | "Detonar" suena a comisión/incentivo o a próximo desembolso. Beto define.                     |

#### (b) ALTER simple en `dilesa.proyectos` — captura nueva

Campos que no se derivan; el operador los registra como parte del
proyecto. Todos columna escalar; idempotente con
`ADD COLUMN IF NOT EXISTS`.

| Coda                                       | Columna propuesta            | Tipo                                                                 |
| ------------------------------------------ | ---------------------------- | -------------------------------------------------------------------- |
| Clasificación Inmobiliaria                 | `clasificacion_inmobiliaria` | `text` (enum suave) — "Interés Social", "Medio", "Residencial", etc. |
| Área Comercial m²                          | `area_comercial_m2`          | `numeric`                                                            |
| Área Residencial m²                        | `area_residencial_m2`        | `numeric`                                                            |
| Área Vialidades · Banquetas · Equipamiento | `area_vialidades_m2`         | `numeric`                                                            |
| Precio M² Excedente                        | `precio_m2_excedente`        | `numeric` (MXN)                                                      |
| Costo de MO                                | `costo_mo`                   | `numeric` (MXN)                                                      |

#### (c) Requieren tabla relacionada o aclaración con Beto

| Coda                                  | Pregunta abierta                                                                                                                                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bitácora de Obra                      | En Coda es lookup → tabla aparte. ¿Qué guarda? ¿Es la misma que el módulo Construcción de BSOP, o algo distinto?                                                                                                                   |
| Archivos ZCU                          | "ZCU" = ¿Zonificación / Certificación de Uso? Acrónimo no estándar. ¿Mapeo a `proyecto_documentos` con `tipo='zcu'`?                                                                                                               |
| Control de Documentos                 | Lista de checklist (Coda guarda texto con múltiples docs separados por coma). Probable mover a `proyecto_documentos` ya existente, marcando el checklist canónico por proyecto. Pregunta: ¿hay una lista maestra o varía por tipo? |
| Pendiente Pago Seguro                 | Coda lo marca como number. ¿Es contador de unidades sin pago de seguro entregado, o monto $?                                                                                                                                       |
| Terminadas sin DTU / Con DTU sin Ext. | "DTU" = ¿Documento de Terminación de Urbanización? Confirmar significado y dónde se captura.                                                                                                                                       |

#### Recomendación de Sprint C v1 (propuesta)

- **Incluir**: las 6 columnas de la categoría (b) — ALTER puro, bajo
  riesgo, queman cero comprensión nueva — y las 7 derivaciones más
  obvias de la categoría (a) que NO requieren columnas nuevas
  (vendidas/muestra/formalizado/disponible-venta/lotes-com-res/lote-promedio).
- **Diferir** a un Sprint D si Beto lo pide: parque inicial/final +
  escrituración del periodo + cumplimiento (requieren modelo
  temporal o RPC); categoría (c) entera (acrónimos + bitácora).
- **Backfill** desde Coda usando el importer existente
  (`scripts/import_dilesa_proyectos.ts`) — extender mapeo, correr
  con `DRY_RUN=1` antes de live.

## Riesgos

1. **`AVG(precio)` puede ser distorsionado** por unidades con precio
   NULL. Filtro `WHERE estado IN ('vendida','escriturada','entregada')`
   limita el cálculo a unidades con precio realista.
2. **`tipo='anteproyecto'`** entra en la vista pero sin unidades —
   los avances quedan NULL, OK.
3. **Backfill de los 4 campos nuevos** queda manual. Si Beto quiere
   importar los planos/images de Coda hay que hacer otro script,
   fuera de alcance v1.
4. **Cambio de `estado='completado'` triggerea** que las unidades
   sin vender (1 en LDV) sigan visibles en el inventario aunque el
   proyecto esté completado. OK — el inventario filtra por estado de
   unidad, no de proyecto.

## Bitácora

- **2026-05-27 (Sprint B + spike C)** — Beto observó al revisar el
  portafolio que los avances + objetivo trimestral del Sprint A solo
  vivían en el detalle del proyecto, no en la tabla principal.
  Sprint B (este PR) extiende `<ProyectosModule>` con fetch en
  paralelo a `v_proyecto_avances` + 5 columnas (Urb./Const./Vts. %,
  Parque disponible, Ventas totales, Objetivo trim.). 14 → 19
  columnas. Tipo `ProyectoListRow` exportado. Cero DDL. 10 tests
  `deriveKpis` updateados al nuevo tipo. Estado iniciativa
  re-abierto a `in_progress` por extensión natural del alcance: el
  closeout de Sprint A había declarado "Sprint B opcional difiere"
  pero ese B era de automatización (trigger); este B es de UI tabla
  y prepara terreno para Sprint C de paridad real con Coda. Spike C
  cataloga ~15 columnas no-migradas en 3 categorías (derivable
  expandiendo view / ALTER simple / requiere aclaración con Beto)
  con recomendación de incluir 6 ALTER + 7 derivaciones triviales en
  v1 y diferir el resto.

- **2026-05-26 (revert + regla estricta)** — Beto pidió cambiar la
  regla: "aunque quede una vivienda por vender hay que marcarlo como
  ejecutando". Migración `20260527000200_dilesa_v_proyecto_avances_estricto`
  aplicada: revierte UPDATE de LV/LV2/LDV (vuelven a `ejecutando`) y
  reemplaza la regla `≥ 95%` por estricta `= 100%`. Los 8 desarrollos
  ahora todos `ejecutando` y `estado_sugerido='ejecutando'`. Cuando
  todas las unidades de un proyecto pasen a `vendida`/`escriturada`/
  `entregada`, el `estado_sugerido` será `completado`.
- **2026-05-26 (promoción + Sprint A DONE)** — Iniciativa creada
  tras comparar `*Proyectos` de Coda (`grid-SlvkPAfZNE`, 8 rows × 60
  cols) con `dilesa.proyectos`. Migración `20260527000100`
  aplicada en prod: 4 columnas nuevas (`plano_oficial_url`,
  `image_url`, `acreditacion_escritura`, `objetivo_trimestral`),
  UPDATE de 3 estados (LV/LV2/LDV → completado), vista
  `dilesa.v_proyecto_avances` con 14 columnas derivadas. UI:
  sección "Avances" con barras de progreso (urb/const/vts) +
  conteos + ticket promedio + ventas totales + badge estado
  sugerido cuando difiere; sección "Documentos y configuración"
  con 4 campos editables + server action `updateProyectoFields` con
  whitelist. Regla de estado sugerido refinada de "const ≥ 100% Y
  vts ≥ 95%" a "ambos ≥ 95%" porque BSOP cuenta unidades en
  estados intermedios (en_construccion + terminada) más granular
  que Coda. Verificación: los 3 desarrollos terminados tienen
  estado_sugerido='completado' coincidente con estado actual.
  Sprint B (automatización vía trigger/cron) se difiere — si Beto
  la pide se abre iniciativa nueva. Iniciativa cierra en `done`.

## Decisiones registradas

- **2026-05-27 — Reapertura de la iniciativa**. El cierre 2026-05-26
  enmarcó al Sprint A como entrega final del alcance v1 y dejó
  "Sprint B automatización" como opcional. Beto pidió 2 trabajos
  nuevos: (1) exponer en la tabla principal los avances que ya
  expone el detalle (Sprint B nuevo, este PR); (2) paridad real con
  Coda (~15 columnas faltantes — Sprint C, spike). El alcance Sprint
  A original se mantiene en producción; los nuevos sprints
  extienden, no reabren decisiones tomadas.

- **2026-05-26 — Regla de transición `ejecutando → completado`
  ESTRICTA**: `construidas = total AND vendidas = total`. Sin
  holgura. Aunque quede 1 unidad por vender, sigue `ejecutando`.
  Razón explícita de Beto.
- **2026-05-26 — Estado sugerido vs estado en DB**. La vista expone
  el sugerido; el operador aplica manualmente en v1. Sprint B
  opcional automatiza vía trigger o cron si Beto quiere.
- **2026-05-26 — Backfill manual de los 4 campos nuevos**. Importar
  Image y Plano Oficial desde Coda requiere script separado — fuera
  de v1.
