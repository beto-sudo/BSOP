# Iniciativa — Módulo RUV DILESA

**Slug:** `dilesa-ruv`
**Empresas:** DILESA
**Schemas afectados:** `dilesa` (3 tablas nuevas: `ruv_frentes`, `ruv_documentos_catalogo`, `ruv_frente_documentos` + columna `construccion.frente_id` + vista `v_ruv_frente_avance`), `core.modulos` (slug nuevo + backfill de permisos)
**Estado:** done
**Próximo hito:** — (desarrollo completo; el cutoff operativo —cerrar acceso a Coda + informar al equipo de que BSOP es el sistema de RUV— lo ejecuta Beto). Follow-ups sueltos: Urgencias RUV (v1.1, reporte en canvas)
**Dueño:** Beto
**Creada:** 2026-05-26
**Última actualización:** 2026-06-09 (CIERRE: comparativo Coda↔BSOP **100%** en las 4 dimensiones — frentes 78=78, catálogo 27=27, **CUVs 1140=1140**, lotes→frente 1381 sin discrepancias. Fix de cutoff: el CUV se movió a `dilesa.unidades.cuv` (cubre lotes sin obra; cerró la brecha de 166 CUVs que solo vivían en `construccion.cuv`). Dropeada `construccion.frente_id` vestigial (autorizado). Nala dada de alta como Asistente de Proyectos. Listo para cerrar Coda)

## Problema

RUV (Registro Único de Vivienda — sistema INFONAVIT) se opera hoy
**en Coda** en 3 tablas grandes:

| Tabla en Coda  | Rows aprox | Propósito                          |
| -------------- | ---------: | ---------------------------------- |
| CUV (RUV)      |      1,132 | Clave Única de Vivienda por unidad |
| Documentos RUV |        169 | Trámites INFONAVIT por vivienda    |
| Urgencias RUV  |        256 | Urgencias / pendientes de atención |

(Referencia: [`docs/coda-migration/MODULE_MAP.md`](../coda-migration/MODULE_MAP.md))

Problemas operativos del estado actual:

1. **Lock-in en Coda.** El resto de DILESA Inmobiliario ya migró a
   BSOP (Portafolio, Construcción, Ventas, Estimaciones). RUV es la
   última isla — los datos de trámite están desconectados del flujo
   de la vivienda en BSOP.
2. **Sin control programático.** Las urgencias y documentos RUV no
   se enlazan automáticamente con la vivienda en `dilesa.unidades`.
   La operadora tiene que cruzar info manualmente entre Coda y BSOP.
3. **Una sola operadora.** El módulo lo lleva una persona, lo que
   convierte a Coda en SPOF operacional — si esa persona no está
   disponible, nadie más sabe dónde está cada trámite.
4. **No hay drill-down desde proyecto.** Beto operativamente
   necesita preguntar "¿qué RUV pendiente tiene este proyecto?" y
   hoy implica abrir Coda manualmente.

## Outcome esperado

1. **Módulo independiente en sidebar** — `/dilesa/ruv` con su propio
   slug RBAC `dilesa.ruv`. No es sub-tab de Proyectos (decisión
   explícita: RUV es trámite por vivienda, no por proyecto; el
   acceso es contextual a la operadora del módulo).
2. **Schema completo en `dilesa`** — 3 tablas como mínimo (CUVs,
   documentos RUV, urgencias RUV) con FK a `dilesa.unidades` cuando
   aplique. Más tablas si el deep-dive de Coda revela cosas que el
   módulo necesita y no están en el inventario actual (ej. DTUs,
   pagos seguro de calidad, según `INVENTORY.md`).
3. **Import completo desde Coda** — los 1,557 registros migrados
   (1132 CUV, 169 documentos, 256 urgencias), con trazabilidad al
   ID original de Coda para poder cruzar referencias.
4. **UI completa** — listado de CUVs + drawer de detalle con sub-
   secciones para Documentos y Urgencias. KPIs reactivos a filtros
   (cap 5 ADR-034).
5. **Drill-down opcional desde proyecto** (post-v1) — tab "RUV de
   este proyecto" en el detalle del proyecto que filtra por
   `proyecto_id` resuelto vía `dilesa.unidades.proyecto_id`. Decisión
   al cierre de Sprint 3 si entra a v1 o queda para v1.1.

## Modelo conceptual

> ⚠️ **Superseded por el [Anexo Sprint 0](#anexo-sprint-0--shape-real-de-coda-2026-06-08)
> (2026-06-08).** El schema tentativo de abajo asumía `cuvs` como entidad rica +
> `documentos_ruv` como trámites + `urgencias_ruv`. El deep-dive reveló un modelo
> distinto (Frente RUV céntrico). Se conserva esta sección como registro del
> razonamiento previo; el schema vigente es el del anexo.

### Schema base (Sprint 1)

Naming tentativo — se confirma al hacer el deep-dive (Sprint 0):

```
dilesa.cuvs
  id, empresa_id (FK), unidad_id (FK a dilesa.unidades),
  numero_cuv (text, único), fecha_alta, estado (enum),
  notas, coda_id (text, trazabilidad), created_at, updated_at, deleted_at

dilesa.documentos_ruv
  id, cuv_id (FK), tipo (enum: 'dtu', 'seguro_calidad', 'paquete_ruv', ...),
  fecha_inicio, fecha_completado, estado (enum: 'pendiente', 'en_tramite',
  'completado', 'rechazado'), monto, comprobante_url, notas, coda_id,
  created_at, updated_at, deleted_at

dilesa.urgencias_ruv
  id, cuv_id (FK), tipo (enum), prioridad (enum), fecha_detectada,
  fecha_resuelta, responsable_persona_id (FK opcional), descripcion,
  resolucion, estado (enum: 'abierta', 'en_progreso', 'cerrada'),
  coda_id, created_at, updated_at, deleted_at
```

Todas con RLS canónica
`core.fn_has_empresa(empresa_id) OR core.fn_is_admin()`.

### Sidebar entry + RBAC (Sprint 1)

- `NAV_ITEMS` ([`components/app-shell/nav-config.ts`](../../components/app-shell/nav-config.ts)):
  agregar entry `{ label: 'RUV', href: '/dilesa/ruv' }` en la sección
  que corresponda (probablemente bajo DILESA Inmobiliario, junto a
  Proyectos, según ADR-014).
- `ROUTE_TO_MODULE`: `'/dilesa/ruv'` → `dilesa.ruv`.
- `EXPECTED_DB_MODULE_SLUGS`: agregar `dilesa.ruv`.
- Migración SQL: INSERT en `core.modulos` + backfill defensivo de
  permisos clonando desde un módulo similar (ej. `dilesa.construccion`).

### Import desde Coda (Sprint 2)

Script `scripts/import_dilesa_ruv.ts` siguiendo el patrón de los
importadores ya hechos:

- `lib/coda-api.ts` para leer las 3 tablas de Coda.
- `scripts/lib/dilesa-migrate-shared.ts` para helpers comunes
  (resolución de unidades por código, normalización de fechas, etc.).
- Idempotente — usar `coda_id` como clave para evitar duplicados.
- Resolución de FK a `dilesa.unidades` por código de unidad / clave
  interna. Logging de los que no resuelven (esperable que haya algunos
  huérfanos legacy).

### UI (Sprint 3)

- `<RuvModule>` componente nuevo en `components/dilesa/ruv-module.tsx`.
- Listado de CUVs con filtros (estado, proyecto vía
  `unidad.proyecto_id`, fecha de alta), date range filter.
- Detail drawer/page con 3 secciones:
  - Datos generales del CUV
  - Tab "Documentos RUV" (lista + estado por documento)
  - Tab "Urgencias" (lista + estado por urgencia)
- KPIs (cap 5): `# CUVs totales` · `# en trámite` · `# urgentes
abiertas` · `# urgentes resueltas (período)` · `documentos
pendientes`.
- `<RequireAccess modulo="dilesa.ruv">`.
- Tests siguiendo el patrón `kpis-modulos`.

### Drill-down desde proyecto (Sprint 4 — opcional v1)

Sub-tab "RUV" dentro del detalle del proyecto que filtra los CUVs
por `unidad.proyecto_id = <proyecto>`. Requiere:

- Sub-slug RBAC `dilesa.proyectos.ruv` (clonado del padre).
- Render condicional: solo si la operadora también es admin o tiene
  el sub-slug; si no, tab no aparece (filter automático
  `<RoutedModuleTabs>`).

## Decisiones (D1 abierta · D2 cerrada)

### D1 — Schema preciso ✅ Cerrada (2026-06-08)

Deep-dive ✅ ejecutado (ver [Anexo Sprint 0](#anexo-sprint-0--shape-real-de-coda-2026-06-08)).
Resuelto todo: shape real de las tablas, mapeo a `dilesa.unidades`/`proyectos`,
campos calculados → vistas, adjuntos descartados, Urgencias fuera de v1.

**Mapeo CUV↔vivienda resuelto** (dato de Beto): la liga vive en la tabla
**Inventario** de Coda (`grid--AHYMPQI7Z`, col `CUV`/`c-16p9m_gEo5`), que es la
misma que ya está migrada a `dilesa.unidades` — y el detalle por vivienda (CUV +
hitos DTU/seguro/extracción/paquete + frente como texto) **ya vive en
`dilesa.construccion`**. ⟹ No se migra CUV ni hitos. Schema final mínimo: solo
`ruv_frentes` + `ruv_documentos_catalogo` + `ruv_frente_documentos` + columna
`construccion.frente_id` + 1 vista (ver anexo). **Listo para pasar a `planned`**
pendiente del OK de Beto al schema final.

### D2 — Scope RBAC ✅ Cerrada

**Decisión** (2026-05-26): el módulo `dilesa.ruv` se libera a 4 roles:

1. **Operadora actual** del módulo (responsable directo, escritura).
2. **Gerente de Proyectos** (lectura + escritura — supervisa el flujo).
3. **Dirección** (lectura + escritura — visibilidad operativa).
4. **Admin (Beto)** — bypass por `core.fn_is_admin()`.

Roles **excluidos por defecto**: comercial, ventas, contraloría, RH.
El backfill defensivo de permisos clona desde un módulo con perfil
operativo similar (probablemente `dilesa.construccion`) y luego ajusta
fino para excluir los roles no deseados.

Implicación para Sprint 1: la migración INSERT-permissions debe ser
explícita por rol — no clonar a ciegas todos los roles existentes.
Patrón canónico de "Liberación de módulo nuevo" se sigue, pero con
filtro adicional al backfill.

## Sprints (4 + Sprint 0)

### Sprint 0 — Deep-dive de Coda (bloqueante para Sprint 1)

- Exportar las 3 tablas de Coda con todas sus columnas.
- Documentar el shape real + relaciones + valores de enum observados.
- Confirmar D1 (schema preciso) y D2 (scope RBAC) con Beto.
- Output: anexo en este planning doc con tablas/columnas/enums.
- NO toca código — solo análisis.

### Sprint 1 — Schema base + sidebar + RBAC

- Migración SQL: 3 tablas + RLS + índices + comentarios.
- INSERT en `core.modulos` + backfill defensivo de permisos.
- `NAV_ITEMS` + `ROUTE_TO_MODULE` + `EXPECTED_DB_MODULE_SLUGS`.
- Page `app/dilesa/ruv/page.tsx` con skeleton + `<RequireAccess>`.
- Regenerar `SCHEMA_REF.md` + `types/supabase.ts`.
- 1 PR.

### Sprint 2 — Import desde Coda

- `scripts/import_dilesa_ruv.ts` con dry-run + apply transaccional.
- Logging de huérfanos (CUVs sin unidad resuelta).
- Smoke en preview con muestra de ~100 rows, luego full import en
  prod tras OK de Beto.
- 1 PR (script + log de import en bitácora).

### Sprint 3 — UI

- `<RuvModule>` + drawer + KPIs + tests.
- Tabla de CUVs + sub-secciones Documentos + Urgencias.
- 1 PR.

### Sprint 4 — Drill-down desde proyecto (opcional / cierre)

- Decisión al cierre de Sprint 3: ¿v1 incluye drill-down o se
  difiere a v1.1?
- Si entra: sub-slug `dilesa.proyectos.ruv` + tab nueva en
  detalle del proyecto.
- Closeout: planning doc + INITIATIVES.md + barrido de Reminders.

## Anexo Sprint 0 — Shape real de Coda (2026-06-08)

Deep-dive ejecutado con `scripts/explore-dilesa-ruv-coda.ts` contra el doc
Coda DILESA (`ZNxWl_DI2D`). Beto apuntó a las tablas:
`Frente RUV` (`grid-blmDCCczmb`), `CUV` (`grid-Z75H_uv0ZJ`),
`Documentos Necesarios` (`grid-QmS5nK8G4f`). Urgencias RUV no es tabla: es un
reporte en `canvas-Nu4e4FeF_d` (varias tablas) → se arma después.

### Lo que realmente hay (vs lo que el inventario decía)

| Tabla Coda                | Rows reales | Rol real                                                        | Lo que el inventario asumía |
| ------------------------- | ----------: | --------------------------------------------------------------- | --------------------------- |
| **Frente RUV**            |          93 | **Entidad central**: la "oferta" de viviendas ante INFONAVIT    | (no contemplada)            |
| **Documentos Necesarios** |          27 | **Catálogo** de tipos de documento requeridos para registro     | "169 trámites por vivienda" |
| **CUV**                   |        1143 | **Listado plano** de Claves Únicas de Vivienda (solo el número) | "1132 entidad rica"         |
| Urgencias RUV             |         n/a | Reporte en canvas, no tabla base                                | "256 rows"                  |

El conteo "1,557 rows" del inventario top-level estaba mal interpretado.

### Frente RUV (93 rows, 18 columnas) — la oferta INFONAVIT

Campos **base** (capturados, se migran):

- `Frente RUV` (text) — nombre, ej "LOMAS DE LOS ENCINOS 35"
- `ID Oferta` (number) — folio INFONAVIT de la oferta, ej `50294004`
- `ID Orden` (number) — folio de orden, ej `50294004001` (= ID Oferta + "001")
- `Fecha Inicio`, `Fecha Fin` (date)
- `Fraccionamiento` (lookup, 5 valores) — **mapea 1:1 a `dilesa.proyectos`**
- `Viviendas en Oferta` (number)
- `Inventario en Oferta` (text multi-valor: `M20-L1-,M20-L2-,…`) — **resuelve a
  `dilesa.unidades` por `manzana`+`numero_lote` dentro del proyecto**

Campos **calculados** (fórmula en Coda → en BSOP son **vistas derivadas**, NO
columnas): `Documentos Cargados`, `Documentos Pendientes`,
`#Documentos Pendientes`, `Vivienda En Construcción`, `Vivienda Terminada`,
`Vivienda por Arrancar`, `DTU's Liberados`, `Avance de Construccion` (%),
`Avance de DTU's` (%). Todos se derivan del estado de las unidades ligadas al
frente (`dilesa.unidades.estado` + `producto_id`).

Adjunto `Plano Frente RUV` (image): **0% lleno** → no hay archivos legacy.

### Descubrimiento clave: el RUV se enchufa a datos que YA tenemos en BSOP

- **Fraccionamiento → proyecto.** Los 5 valores (Loma Verde, Loma Verde 2,
  Lomas de los Encinos, Lomas del Sol, Lomas del Valle) existen idénticos en
  `dilesa.proyectos` (prefijos de identificador: LV, LV2, LDLE, LDS, LDV).
- **Inventario en Oferta → unidades.** Verificado: frente "Lomas de los Encinos
  35" lista `M20-L1-…M20-L18-`; en `dilesa.unidades` (proyecto Lomas de los
  Encinos) existen `manzana='20'`, `numero_lote='1'..'18'`, identificadores
  `M20-L1-LDLE…M20-L18-LDLE`, todos `estado='terminada'`, `es_casa=false` →
  coincide con las 18 "viviendas por arrancar" del frente (lotes urbanizados sin
  casa). El match es por `(proyecto, manzana, numero_lote)`.
- **Implicación:** el avance de construcción/DTU del RUV no se migra; se
  **calcula** sobre las unidades ligadas. El módulo RUV es una capa de trámite
  encima del inventario existente.

### Documentos Necesarios (27 rows) — catálogo, no trámites

Los 27 tipos de documento del paquete RUV (Pago Registro Paquete, Póliza de
Seguro, Plano Topográfico, … Acabados). Columnas `Frente RUV Cargado` /
`Frente RUV Pendiente` son la relación inversa M:N frente↔documento, **derivada y
mayormente vacía** (`Documentos Cargados` está 8% lleno en Frente RUV). `Descripción`
vacía; `*Documento` es un botón de Coda (ignorar). → Se migra como **catálogo**;
el estado cargado/pendiente por frente se **recaptura** en BSOP (no vale la pena
traer la relación parcial/derivada).

### CUV — liga resuelta (la tabla plana es redundante)

La tabla `CUV` (`grid-Z75H_uv0ZJ`, 1143 filas) es solo un listado de números, sin
liga → **se ignora**. La liga real (dato de Beto) vive en la tabla **Inventario**
(`grid--AHYMPQI7Z`, columna `CUV` = `c-16p9m_gEo5`), que es la **misma tabla que
ya migramos a `dilesa.unidades`** (vía `ID Lote` → `identificador`). Inventario
trae por vivienda: `CUV`, `Frente RUV`, `ID Lote`, y los hitos del trámite
(Fecha DTU, Seguro Calidad, Extracción, Paquete RUV). Ojo: algunos `CUV` en
Inventario son refs rotas de Coda (`#r971`) → filtrar por `^\d{16}$`.

**Y lo mejor: ese detalle por vivienda YA ESTÁ en BSOP.** El módulo Construcción
ya migró Inventario a `dilesa.construccion` (1372 filas, 1:1 con vivienda, FK
`unidad_id` + trazabilidad `coda_row_id`), con columnas:
`cuv`, `frente_ruv` (texto), `fecha_dtu`, `fecha_seguro_calidad`,
`fecha_extraccion`, `fecha_paquete_ruv`. Cobertura actual: 974 CUVs válidos,
1219 con fecha DTU, 1036 con frente (61 frentes distintos de los 93).

⟹ **El CUV y los hitos del trámite no se migran — ya existen.** Lo único que no
está en BSOP es la **oferta (Frente RUV)** como entidad y el **catálogo de
documentos**. El módulo RUV es, en esencia, una capa de lectura/gestión encima de
`dilesa.construccion` + `dilesa.unidades`.

> **Reconciliación pendiente (Sprint 2, no bloquea diseño):** 1143 CUVs en
> Inventario vs 974 en `dilesa.construccion`. La brecha (~169) son viviendas con
> CUV en Coda sin fila de construcción en BSOP (o sync de construcción atrasado).
> Auditar al importar; no detiene el módulo.

### Schema final (vigente) — reemplaza el "Modelo conceptual" tentativo

Mínimo, porque el detalle por vivienda (CUV + hitos) ya existe en
`dilesa.construccion`. Solo se crea lo que falta: la **oferta** y el **catálogo
de documentos**.

```
dilesa.ruv_frentes            (~93)   — NUEVA. La oferta INFONAVIT (entidad central)
  id, empresa_id, proyecto_id (FK dilesa.proyectos), nombre (unique por empresa),
  id_oferta (bigint), id_orden (bigint), fecha_inicio (date), fecha_fin (date),
  viviendas_oferta (int), coda_id, created_at, updated_at, deleted_at

dilesa.ruv_documentos_catalogo (27)   — NUEVA. Catálogo de tipos de documento
  id, nombre (unique), orden (int), descripcion, activo (bool)

dilesa.ruv_frente_documentos  (M:N)   — NUEVA. Estado de cada doc por frente
  id, frente_id (FK), documento_catalogo_id (FK),
  estado (enum: cargado | pendiente), fecha_carga, archivo_url (Storage futuro), notas

-- Liga vivienda→oferta: reusar lo que ya existe, no crear tabla nueva
dilesa.construccion.frente_id (uuid FK → ruv_frentes)   — NUEVA COLUMNA
  -- backfill matcheando construccion.frente_ruv (texto) → ruv_frentes.nombre
  -- el CUV y los hitos (fecha_dtu/seguro_calidad/extraccion/paquete_ruv) ya están aquí
```

`dilesa.ruv_cuvs` y `dilesa.ruv_frente_unidades` del borrador anterior **se
descartan**: el CUV con su liga (`unidad_id`) y los hitos ya viven en
`dilesa.construccion`; la pertenencia vivienda→frente se resuelve por
`construccion.frente_id`.

Vista derivada `dilesa.v_ruv_frente_avance` — por frente, agregando
`construccion` ⋈ `unidades`: # viviendas, CUVs emitidos, DTUs liberados,
% avance de construcción, documentos pendientes (desde `ruv_frente_documentos`).
Sustituye los campos-fórmula de Coda.

### Deltas al plan de sprints (alcance MUY reducido)

- **Sprint 1**: 3 tablas nuevas + 1 columna (`construccion.frente_id`) + 1 vista
  - sidebar/RBAC. (No 5 tablas; el grueso ya existe.) RBAC sin cambios (D2).
- **Sprint 2 (import)**: solo 2 fuentes — los **93 frentes** + el **catálogo de
  27 docs** — y el **backfill de `construccion.frente_id`** por nombre. El CUV y
  los hitos NO se importan (ya están). Auditar la brecha 1143↔974 CUV.
- **La tabla CUV plana de Coda (`grid-Z75H_uv0ZJ`) se ignora** (redundante).
- **Riesgo #4 (adjuntos) → descartado** (0% cargados en Coda).
- **Riesgo #1 (complejidad oculta) → materializado y resuelto a favor**: el
  modelo cambió, pero se apoya casi entero en datos ya migrados
  (`dilesa.construccion` + `dilesa.unidades` + `dilesa.proyectos`).

## Riesgos

1. **Sprint 0 puede revelar complejidad oculta.** Coda permite
   columnas calculadas y relaciones que no se ven en el inventario
   top-level. Si el shape real es 5+ tablas en vez de 3, replantear
   alcance v1 con Beto antes de Sprint 1.
2. **Huérfanos en el import.** Probable que algunos CUVs legacy no
   resuelvan a `dilesa.unidades` por desfase entre claves Coda y
   BSOP. Política tentativa: importar a la tabla con `unidad_id
NULL` + flag de revisión manual, **no** bloquear el import.
3. **SPOF operacional.** Si la operadora actual no está disponible
   durante la migración, el deep-dive de Coda (Sprint 0) puede
   atascarse. Mitigación: Beto valida directamente el shape contra
   los datos.
4. **Adjuntos en Coda.** Si los documentos RUV tienen archivos
   adjuntos en Coda, migrarlos requiere lógica adicional (similar
   al patrón `file-attachments` ADR-022 + buildAdjuntoPath). Sprint
   0 lo confirma.
5. **Conflicts en `INITIATIVES.md`.** Sprint 1 toca sidebar + RBAC
   (hotspots). Rebase preventivo antes de cada push.

## Bitácora

- **2026-05-26 (promoción)** — Promovida a `proposed`. RUV se mantiene
  como módulo independiente (no sub-tab de Proyectos) por instrucción
  de Beto: lo opera una sola persona dedicada, módulo propio refleja
  mejor el flujo. Sprint 0 (deep-dive de Coda) queda como bloqueante
  para pasar a `planned`. PR
  [#544](https://github.com/beto-sudo/BSOP/pull/544) mergeado.
- **2026-05-26 (D2 cerrada)** — Scope RBAC definido por Beto:
  operadora actual + gerente de proyectos + dirección + admin (Beto).
  Comercial, ventas, contraloría, RH excluidos. Beto ofreció apuntar
  a las tablas específicas en Coda cuando el deep-dive arranque — se
  aprovecha al inicio del Sprint 0. D1 sigue bloqueante (deep-dive
  pendiente).
- **2026-06-08 (Sprint 0 ejecutado)** — Deep-dive de Coda hecho con
  `scripts/explore-dilesa-ruv-coda.ts`. Hallazgos en el
  [Anexo Sprint 0](#anexo-sprint-0--shape-real-de-coda-2026-06-08): el
  modelo real es **Frente RUV céntrico** (93 ofertas), Documentos Necesarios
  es un catálogo de 27 tipos, CUV es un listado plano de 1143 claves. El
  Inventario en Oferta y los 5 fraccionamientos **resuelven 1:1 a
  `dilesa.unidades`/`dilesa.proyectos`** → avances derivables por vista.
  Adjuntos descartados (0% en Coda). Estado se mantiene `proposed`.
- **2026-06-08 (D1 cerrada)** — Beto indicó que la liga CUV↔vivienda vive en la
  tabla Inventario de Coda (`grid--AHYMPQI7Z`, col `c-16p9m_gEo5`). Verificado:
  esa tabla ya está migrada a `dilesa.unidades`, y el detalle RUV por vivienda
  (CUV + hitos DTU/seguro/extracción/paquete + frente texto) **ya existe en
  `dilesa.construccion`** (1372 filas, FK `unidad_id`; 974 CUVs válidos, 1219
  con DTU). Schema final reducido a 3 tablas nuevas + 1 columna + 1 vista. La
  tabla CUV plana de Coda se descarta. Sprints 1-2 con alcance mucho menor.
  Sonda: `scripts/probe-dilesa-ruv-cuv-liga.ts`. Listo para `planned` pendiente
  del OK de Beto.
- **2026-06-08 (Sprint 1 construido)** — Beto autorizó arrancar. Migración
  `20260608214309_dilesa_ruv_modulo.sql`: 3 tablas (`ruv_frentes`,
  `ruv_documentos_catalogo`, `ruv_frente_documentos`) con RLS canónica +
  `construccion.frente_id` (FK) + vista `v_ruv_frente_avance` + módulo
  `dilesa.ruv` (sección operaciones) + **rol nuevo "Asistente de Proyectos"**
  (la operadora, dato de Beto) + permisos D2 (Dirección + Gerente de Proyectos +
  Asistente de Proyectos; admin por bypass). Código: `nav-config` (entry RUV en
  Inmobiliario), `ROUTE_TO_MODULE`, `EXPECTED_DB_MODULE_SLUGS`, page skeleton
  `app/dilesa/ruv/page.tsx` con `<RequireAccess modulo="dilesa.ruv">`. CI local
  verde. La migración crea rol+permisos → **la aplica Beto** (no autónomo). Tras
  aplicar: regenerar types/SCHEMA_REF + arrancar Sprint 2 (import). PR
  [#760](https://github.com/beto-sudo/BSOP/pull/760) (CI verde; incluye un regen
  de `SCHEMA_REF.md` por drift heredado de #754/#755).
- **2026-06-08 (Sprint 1 aplicado + mergeado)** — Beto autorizó aplicar. Migración
  aplicada a prod vía MCP `apply_migration` (verificado: 3 tablas, 12 RLS, rol +
  3 permisos). types/SCHEMA_REF regenerados. PR #760 mergeado a main (`63497b9`);
  de paso se resolvió el merge con #759 (Fase 10) regenerando los auto-generados
  contra prod.
- **2026-06-08 (Sprint 2 import)** — `scripts/import_dilesa_ruv.ts` (idempotente,
  dry-run + apply) corrido contra prod: **78 frentes** (de 93 filas de Coda; 15
  vacías omitidas; 77 con `proyecto_id` resuelto por Fraccionamiento, 1 sin
  match), **27 docs** del catálogo, y **backfill de `construccion.frente_id`** por
  nombre normalizado (trim+collapse+upper): **1036 viviendas matcheadas, 0 sin
  match**. La vista `v_ruv_frente_avance` ya da avance real (ej. LOMA VERDE 11:
  86 viviendas, 86 CUVs, 100% paquete RUV). CUV + hitos NO se importaron (ya
  estaban en `dilesa.construccion`). Urgencias sigue fuera de v1 (reporte canvas).
- **2026-06-08 (Sprint 3 UI)** — Componentes nuevos: `components/dilesa/ruv-module.tsx`
  (listado de frentes + 5 KPIs reactivos —frentes, viviendas en oferta, CUVs,
  avance paquete RUV %, frentes sin viviendas— + filtros búsqueda/proyecto),
  `ruv-frente-detail-drawer.tsx` (datos de la oferta + avance del trámite +
  checklist de los 27 documentos del paquete con estado cargado/pendiente) y
  `ruv-utils.ts`. Page `app/dilesa/ruv/page.tsx` reemplaza el skeleton por
  `<RuvModule>`. **Read-only en v1** (sin alta/edición ni marcado de documentos).
  Lee `v_ruv_frente_avance` + `ruv_frentes` + `ruv_documentos_catalogo` +
  `ruv_frente_documentos`. CI local verde. PR **sin auto-merge**: Beto revisa el
  preview y define el proceso de alta de frentes → Sprint 4.
- **2026-06-08 (Sprint 4 — alta + carga documental)** — Beto definió el alta:
  nombre + selección de lotes disponibles (sin frente) → con eso se arma; el
  checklist nace en pendiente; se suben documentos. Cambio de modelo: la liga
  lote→frente se mueve a **`dilesa.unidades.frente_id`** (el alta elige lotes sin
  construcción, donde `construccion.frente_id` no aplica). Migración
  `20260609005051`: `unidades.frente_id` + índice, backfill desde construccion,
  vista `v_ruv_frente_avance` reescrita (unidades⋈construccion, agrega `lotes`),
  init del checklist para frentes existentes. `construccion.frente_id` queda
  **vestigial** (no se dropeó — el classifier lo bloqueó por destructivo sin OK
  explícito de Beto; pendiente su confirmación). Backfill `unidades.frente_id`
  desde Coda Inventario: **1381 lotes** (vs 1036 antes — incluye lotes sin obra),
  0 sin match; 616 lotes disponibles para nuevos frentes. Server actions
  `crearFrente` (inserta + liga lotes solo si siguen disponibles + inicializa 27
  docs) y `marcarDocumento`. UI: `RuvFrenteCrearDrawer` (form + multi-select de
  lotes) + detail drawer editable (subir archivo a bucket `adjuntos` vía
  `buildAdjuntoPath`, marcar cargado/pendiente). `AdjuntoEntidad += 'frentes'`.
  CI local verde. PR **sin auto-merge** para que Beto pruebe el alta.
- **2026-06-08 (Sprint 4 — filtro del dropdown de proyecto)** — Por feedback de
  Beto, el selector de proyecto del alta solo muestra proyectos elegibles:
  construcción no terminada (`estado <> 'completado'`) y con lotes aún por
  registrar (`unidades.frente_id IS NULL`). Vista nueva
  `dilesa.v_ruv_proyectos_disponibles` (migración `20260609020132`) con el conteo
  de lotes disponibles, mostrado en cada opción. Hoy: 4 proyectos (Ampliación
  Lomas de los Encinos 358, Lomas de las Delicias 165, Lomas de los Encinos 93,
  Lomas del Sol 24).
- **2026-06-09 (CIERRE — cutoff de Coda)** — Comparativo de reconciliación
  Coda↔BSOP con `scripts/reconcile_dilesa_ruv_coda.ts`: **100% en las 4
  dimensiones** (frentes 78=78 sin diffs, catálogo 27=27, CUVs 1140=1140,
  lotes→frente 1381 sin discrepancias). El primer corrida reveló 166 CUVs de Coda
  ausentes en BSOP (el CUV solo vivía en `construccion.cuv`, que no cubre lotes
  sin obra) → fix: migración `20260609150032` agrega `dilesa.unidades.cuv` +
  backfill desde Coda Inventario (167 escritos) + vista actualizada para contar
  `unidades.cuv`. Dropeada `construccion.frente_id` vestigial (migración
  `20260609151439`, autorizado por Beto). Beto dio de alta a **Nala** como
  Asistente de Proyectos. Iniciativa `done`; el cierre de acceso a Coda + aviso
  al equipo lo ejecuta Beto. Urgencias RUV queda como follow-up v1.1.

## Decisiones registradas

- **2026-05-26 — RUV como módulo independiente, NO sub-tab de
  Proyectos.** Razón: lo opera una sola persona dedicada que entra
  al módulo a hacer trámites, no a navegar proyectos. Drill-down
  desde proyecto se considera para v1.1 como afordancia de
  navegación, no como home del módulo.
- **2026-05-26 — D2: scope RBAC = 4 roles + admin.** Operadora del
  módulo + Gerente de Proyectos + Dirección + Beto. Roles excluidos
  por defecto: comercial, ventas, contraloría, RH. El backfill
  defensivo del Sprint 1 debe ser explícito por rol, no clonar
  a ciegas.
- **2026-06-09 — La liga lote→frente y el CUV viven en `dilesa.unidades`,
  no en `dilesa.construccion`.** Un frente se arma con lotes que aún no tienen
  obra, y el CUV se emite por vivienda con o sin construcción. `construccion`
  solo existe cuando hay obra, así que `unidades` (el lote, siempre presente) es
  el hogar canónico de `frente_id` y `cuv`. La vista `v_ruv_frente_avance` deriva
  el avance uniendo `unidades` ⋈ `construccion`. `construccion.frente_id` se
  dropeó; `construccion.cuv` queda (lo gestiona el módulo Construcción) pero ya
  no es la fuente del CUV para RUV.
