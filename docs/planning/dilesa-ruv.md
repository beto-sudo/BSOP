# Iniciativa — Módulo RUV DILESA

**Slug:** `dilesa-ruv`
**Empresas:** DILESA
**Schemas afectados:** `dilesa` (3+ tablas nuevas), `core.modulos`
(slug nuevo + backfill de permisos)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-05-26
**Última actualización:** 2026-05-26 (D2 scope RBAC cerrado: operadora actual + gerente de proyectos + dirección + Beto admin; D1 sigue bloqueante con Sprint 0 deep-dive de Coda; estado se mantiene `proposed`)

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

### D1 — Schema preciso (resuelve Sprint 0 deep-dive de Coda) 🔒 Abierta

Antes del Sprint 1, hacer el deep-dive de las 3 tablas en Coda:

- Exportar los 1,557 registros + columnas reales (no solo el
  inventario top-level).
- Identificar columnas calculadas / relaciones / fórmulas que el
  módulo de Coda haga implícitamente.
- Verificar si hay tablas auxiliares (DTUs, pagos seguro de calidad,
  paquetes RUV) que `INVENTORY.md` menciona pero no aparecen en el
  módulo principal.
- Verificar si hay enlaces a documentos / archivos adjuntos en
  Coda (probable que sí — patrón habitual en sistemas de trámite).
- Definir si los adjuntos viajan en este Sprint o se difieren.

Output esperado: shape definitivo del schema + lista de
columnas/enum-values + plan de adjuntos.

Beto ofreció apuntar a las tablas específicas en Coda cuando el deep-dive
arranque — se aprovecha al inicio del Sprint 0 para no perder tiempo
buscando.

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
