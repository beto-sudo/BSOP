# Iniciativa — Import empleados CONTPAQi (DILESA y RDB)

**Slug:** `import-empleados-contpaqi`
**Empresas:** DILESA, RDB
**Schemas afectados:** `erp` (nueva tabla `empleados_pago` y `empleados_import_log`, columnas nuevas en `empleados`); `core` (columna `empresas.rpi_imss`)
**Estado:** done
**Dueño:** Claude Code (ejecuta) / Beto (decide y mergea)
**Creada:** 2026-04-30
**Cerrada:** 2026-05-01
**Última actualización:** 2026-05-01 (Sprint 6 closeout — los 8 sprints completos: schema delta, catálogos, dry-run, apply (187 acciones), paridad UI, drawer detail expandido, editor extendido, closeout)

## Problema

CONTPAQi Nóminas es la fuente de verdad operativa para los datos de
empleados de DILESA y RDB. El snapshot del 30-abr-2026 trae 181 personas:
161 en DILESA (52 activos, 106 bajas, 3 reingresos) y 20 en RDB (5
activos, 15 bajas). Total: 60 activos y 121 históricos.

BSOP tiene `erp.empleados` poblada parcialmente con los registros mínimos
cargados a mano para finiquitos, juntas, asistencias y los 18
accionistas/operadores cargados en abril 2026 (ver iniciativa
`empleados-multi-puesto`). Faltan en BSOP:

- Datos personales completos (RFC, CURP, NSS, fecha de nacimiento, sexo,
  estado civil, dirección, teléfono, email).
- Datos de IMSS (UMF, registro patronal, régimen, zona de salario, tipo
  de prestación, sindicalizado).
- Datos bancarios (banco, número de cuenta, CLABE).
- Compensación vigente (sueldo diario, SDI).
- Histórico completo de bajas con causa.

Hoy, cuando hay que generar un finiquito, capturar una nueva alta o
cruzar asistencias, los datos hay que pedirlos a CONTPAQi o capturarlos a
mano. Es fricción innecesaria y fuente de errores (ej. RFC sin homoclave
correcta).

Además hay un cluster especial: **22 empleados aparecen en el Excel
DILESA con `Departamento = 'Rincon del Bosque'`**. Históricamente
vivieron bajo nómina DILESA pero pertenecen al deportivo. La separación
operativa DILESA/RDB ya empezó (primera ola migrada 2026-04-27 con JP
Hernández, 62 juntas RDB y los accionistas espejo, ver memoria
`project_separacion_dilesa_rdb`); esta iniciativa cierra el resto.

## Outcome esperado

- 181 empleados CONTPAQi (60 activos y 121 históricos) reflejados en
  `erp.personas`, `erp.empleados` y `erp.empleados_compensacion`, con
  campos personales, IMSS y bancarios completos.
- Nueva tabla `erp.empleados_pago` con banco, número de cuenta y CLABE
  vigente más histórico (1:N, mismo patrón que `empleados_compensacion`).
- 22 empleados RDB-en-DILESA ruteados correctamente: alta y baja en
  empresa DILESA más alta nueva en empresa RDB.
- Bajas detectadas en bloque tras dry-run aprobado por Beto, **excluyendo
  accionistas, comité y consejo** (que viven en `empleados_puestos`
  aunque no estén en CONTPAQi).
- Audit trail completo en `erp.empleados_import_log` (snapshot, diff
  jsonb por campo).
- Catálogos `erp.puestos` y `erp.departamentos` poblados con los valores
  faltantes en Title Case.

## Alcance v1

### Sprint 1 — Schema delta

- Nueva tabla `erp.empleados_pago` con columnas: `id`, `empresa_id`,
  `empleado_id`, `banco_codigo`, `banco_nombre`, `numero_cuenta`,
  `clabe`, `sucursal`, `vigente bool`, `fecha_inicio`, `fecha_fin` y
  audit columns.
- Columnas nuevas en `erp.empleados`: `umf`, `zona_salario`,
  `regimen_imss`, `tipo_prestacion`, `sindicalizado`,
  `metodo_pago_sat` (todas `text`).
- Columna nueva en `core.empresas`: `rpi_imss text` (Registro Patronal
  IMSS).
- Nueva tabla `erp.empleados_import_log` con columnas: `id`,
  `empresa_id`, `empleado_id`, `persona_id`, `snapshot_fecha`, `origen`,
  `accion`, `diff jsonb`, `created_at`.
- Verificar y, si aplica, relajar el constraint UNIQUE en
  `erp.empleados.(empresa_id, persona_id)` a parcial
  `WHERE activo = true` para soportar reingresos y el caso
  RDB-en-DILESA.
- RLS canónica `core.fn_has_empresa OR core.fn_is_admin` y reload de
  PostgREST con `NOTIFY pgrst, 'reload schema'`.
- Regenerar `supabase/SCHEMA_REF.md` y `types/supabase.ts`.

### Sprint 2 — Catálogos

- Detectar puestos y departamentos faltantes (35+ puestos y 11
  departamentos en DILESA Excel; pocos en RDB).
- Normalizar a Title Case (`HOSTESS` queda `Hostess`, `OFICIAL ALBAÑIL`
  queda `Oficial Albañil`).
- Insertar lo faltante en `erp.puestos` y `erp.departamentos`,
  respetando el patrón de `empresa_id` ya existente.
- Reportar mappings finales a Beto.

### Sprint 3 — Script de import dry-run

- `scripts/migrations/import-contpaqi/run.ts` que:
  - Lee Excel DILESA y RDB.
  - Normaliza fechas (sentinel `30/12/1899` queda `NULL`, parser
    dedicado `dd/mm/yyyy`).
  - Match por **CURP, después RFC, después fuzzy** sobre
    `apellidos+nombre+fecha_nac`.
  - Para los 22 RDB-en-DILESA con `Departamento = 'Rincon del Bosque'`
    activos (`A` o `R`) que NO están duplicados en RDB: ruta dual (alta
    y baja en DILESA con fecha pivote 30-abr-2026, alta en RDB con
    `fecha_ingreso = 1-may-2026`).
  - Para los `B` con ese depto: solo histórico DILESA (no abrir RDB).
  - **Excluye de candidatos a baja** a empleados con puestos
    no-operativos (Accionista, Comité Ejecutivo, Consejo de
    Administración) en `empleados_puestos`.
- Output: reporte markdown con conteos de `INSERT`, `UPDATE`, `BAJA
candidata`, conflictos detectados y dudas catalogadas.
- **No toca DB.**

### Sprint 4 — Apply y bajas

- Tras OK de Beto al reporte, correr `--apply`.
- Aplicar bajas en bloque con
  `motivo_baja = 'No presente en snapshot CONTPAQi 2026-04-30'`.
- Reporte final con conteos y links a empleados afectados.

### Sprint 5 — UI Personal (paridad + drawer + editor)

Sub-divido en 3 PRs tras ronda de preguntas con Beto:

- **5A** — Paridad pages + tabs `Empleados` / `Accionistas` / `Todos` +
  columnas estándar (incluye email empresa→personal fallback y
  antigüedad) + filtros (Estado, Departamento, Antigüedad por rangos).
  Eliminadas las flags por-empresa que causaban drift entre DILESA y
  RDB.
- **5B** — Page detail expandido con secciones nuevas read-only:
  Identidad, Datos personales (sexo, estado civil, nacionalidad, lugar
  nacimiento, domicilio), IMSS y régimen fiscal, Compensación vigente,
  Cuenta bancaria, Puestos asignados, Contacto emergencia, Audit log
  (`empleados_import_log`).
- **5C** — Editor extendido: helpers `<EditField>` y `<EditCombo>`,
  `handleSave` extendido con UPDATEs a `personas` y `empleados` y
  upsert vigente (cierra fila + crea nueva) en `empleados_compensacion`
  y `empleados_pago`. RFC/CURP se mantienen read-only — cambios
  sensibles deben ir por wizard de alta.

### Sprint 6 — Closeout

- Bitácora, decisiones registradas, mover a `done` en `INITIATIVES.md`.
- Barrer reminder de `Claude: BSOP`.

## Fuera de alcance

- **ANSA y COAGAN**: la iniciativa cubre solo DILESA y RDB. Las otras
  dos empresas se importarán en una iniciativa separada cuando haya
  Excel disponible.
- **Sync recurrente con CONTPAQi**: este import es one-off. Si en el
  futuro queremos sync periódico, será otra iniciativa.
- **Editor en BSOP de los nuevos campos** (UMF, zona, banco, etc.): la
  UI los lee y muestra pero no agregamos formularios para editarlos en
  v1 (post-import).
- **Histórico de compensaciones**: solo migramos la compensación vigente
  del Excel (sueldo diario y SDI). Cambios históricos de sueldo no se
  migran.
- **Beneficiarios IMSS / dependientes**: el Excel no los trae.
- **Foto, archivos de identidad o IDs escaneados**: no en este import.
- **Parsing fino de domicilio** (`personas_datos_fiscales`): por ahora
  el campo `Dirección` del Excel va plano a `personas.domicilio`.

## Métricas de éxito

- **181 personas-empresa** registradas en `erp.empleados`. La suma
  cubre el cluster RDB-en-DILESA con doble fila para los 22 activos.
- **`erp.empleados_compensacion` con `vigente = true`** para los 60
  activos.
- **`erp.empleados_pago` con `vigente = true`** para los activos que
  traían banco y cuenta en el Excel (alrededor de 95%).
- **`erp.empleados_import_log` con N filas** igual a la cantidad de
  inserts más updates aplicados.
- **Cero bajas aplicadas a accionistas, comité y consejo**. Verificable
  con la siguiente query:

```sql
SELECT COUNT(*)
FROM erp.empleados e
WHERE e.id IN (
  SELECT empleado_id
  FROM erp.empleados_puestos
  WHERE puesto_id IN (/* ids de Accionista, Comité, Consejo */)
)
  AND e.activo = false
  AND e.fecha_baja >= '2026-04-30';
```

El resultado debe ser cero.

- **Catálogos completos**: cero `Departamento` o `Puesto` en el Excel
  sin match en `erp.departamentos` o `erp.puestos`.

## Riesgos / preguntas abiertas

- [ ] **Constraint UNIQUE en `erp.empleados.(empresa_id, persona_id)`**:
      verificar en Sprint 1. Si es UNIQUE total, relajar a parcial
      `WHERE activo = true`.
- [ ] **Fecha pivote 30-abr-2026** para los 22 activos RDB-en-DILESA:
      default propuesto. Beto puede vetar antes de Sprint 3 si prefiere
      otra fecha.
- [ ] **Detección de duplicados RDB ya migrados**: los 22 incluyen
      algunos ya migrados manualmente en abril 2026. El script debe
      detectarlos por CURP en empresa RDB y NO duplicar.
- [ ] **Catálogo `erp.puestos` y `erp.departamentos`**: hoy tienen los
      puestos cargados para RDB y DILESA (Accionista, Comité, Consejo,
      Gerente Deportivo, etc., ver `empleados-multi-puesto`). Sprint 2
      agrega los operativos faltantes (Operador de Maquinaria, Mesero,
      Hostess, Albañil, etc.). Decisión de scope (`empresa_id` o
      shared) se cierra en Sprint 2 por consistencia con lo existente.
- [ ] **Datos sucios en bajas históricas**: 121 bajas pueden traer
      campos vacíos o inconsistentes. Migrar tal cual es la decisión.
      El audit log captura el estado exacto del Excel.
- [ ] **NSS o CURP duplicado**: si por error de captura en CONTPAQi dos
      filas comparten NSS o CURP, el match por CURP/RFC los separa. El
      script reporta y frena para revisión manual de Beto.

## Decisiones registradas

### 2026-04-30 — Decisiones de promoción

- **Empresas tocadas**: DILESA y RDB. No ANSA, no COAGAN. Para esos
  habrá iniciativa nueva cuando haya Excel disponible.
- **22 RDB-en-DILESA**: ruta dual (alta y baja en DILESA, alta nueva en
  RDB) para todos los `A`/`R` con `Departamento = 'Rincon del Bosque'`
  que NO están ya duplicados en RDB. Los `B` con ese depto se quedan
  solo en histórico DILESA.
- **Filas múltiples por persona en `empleados`**: una persona puede
  pertenecer a 2 empresas a la vez **siempre que esté de baja en una**
  (regla operativa explícita de Beto).
- **Bajas históricas**: migrar todas (106 DILESA y 15 RDB).
- **Catálogos**: Title Case y auto-crear lo faltante.
- **Banco / cuenta / CLABE**: tabla nueva `erp.empleados_pago` (1:N,
  patrón `empleados_compensacion` con `vigente=true`).
- **Aplicación de bajas**: en bloque tras dry-run aprobado.
- **Recurrencia**: one-off. Script en `scripts/migrations/`.
- **`numero_empleado`**: respeta el código CONTPAQi (`001`, `002`,
  etc.). Cuando algún día abandonemos CONTPAQi se podrá usar el UUID
  interno.
- **Fuente confirmada**: CONTPAQi Nóminas.
- **Detección de bajas, exclusión crítica**: empleados con puestos
  no-operativos (Accionista, Comité Ejecutivo, Consejo de
  Administración) NO se marcan como baja aunque no estén en CONTPAQi.
  Esos puestos viven en `erp.empleados_puestos` y la persona puede
  estar activa sin nómina.
- **Estado inicial**: directo a `planned` (alcance v1 cerrado en chat
  de promoción).

### 2026-04-30 — Mapeo Excel CONTPAQi a schema (82 columnas)

| Excel                                | Destino                                                      | Notas                            |
| ------------------------------------ | ------------------------------------------------------------ | -------------------------------- |
| Código                               | `empleados.numero_empleado`                                  | Único por empresa, text          |
| Apellido P/M, Nombre                 | `personas.apellido_paterno/materno/nombre`                   | —                                |
| Sexo (M/F)                           | `personas.sexo`                                              | —                                |
| Estado Civil (S/C/U/V)               | `personas.estado_civil`                                      | —                                |
| Fecha de nacimiento                  | `personas.fecha_nacimiento` y `empleados.fecha_nacimiento`   | Espejo                           |
| Ciudad nac. y Entidad fed. nac.      | `personas.lugar_nacimiento`                                  | Concat                           |
| RFC, CURP, NSS                       | `personas.rfc/curp/nss` y `empleados.nss`                    | NSS espejo                       |
| Email, Teléfono                      | `personas.email/telefono`                                    | —                                |
| Dirección, Población, CP, Ent. fed.  | `personas.domicilio` (texto plano)                           | Parsing fino futuro              |
| Fecha de alta / baja                 | `empleados.fecha_ingreso` / `empleados.fecha_baja`           | Sentinel `30/12/1899` queda NULL |
| Estatus (A/B/R)                      | `empleados.activo`                                           | A,R queda true; B queda false    |
| Causa de la última baja              | `empleados.motivo_baja`                                      | Solo en `B`                      |
| Fecha de reingreso                   | Lógica de reingreso (fila nueva, no edit)                    | Sentinel `30/12/1899` queda NULL |
| Tipo de contrato (`01`)              | `empleados.tipo_contrato` y `compensacion.tipo_contrato`     | Código SAT                       |
| Tipo de periodo (Semanal)            | `compensacion.frecuencia_pago`                               | —                                |
| Departamento                         | `empleados.departamento_id` (FK catálogo)                    | Title Case y auto-crear          |
| Puesto                               | `empleados.puesto_id` (FK) y `empleados_puestos` (principal) | Title Case y auto-crear          |
| Turno de trabajo (Matutino)          | `empleados.horario`                                          | —                                |
| Salario diario                       | `compensacion.sueldo_diario`                                 | —                                |
| SBC parte fija                       | `compensacion.sdi`                                           | —                                |
| UMF                                  | `empleados.umf` (columna nueva)                              | —                                |
| Zona de salario                      | `empleados.zona_salario` (columna nueva)                     | A/B/C                            |
| Tipo de régimen (`02`)               | `empleados.regimen_imss` (columna nueva)                     | Código SAT                       |
| Tipo de prestación (De_Ley)          | `empleados.tipo_prestacion` (columna nueva)                  | —                                |
| Sindicalizado (C)                    | `empleados.sindicalizado` (columna nueva)                    | C es Confianza                   |
| Método de pago (`28`)                | `empleados.metodo_pago_sat` (columna nueva)                  | Código SAT                       |
| Banco (`012` BBVA)                   | `empleados_pago.banco_codigo` y `banco_nombre`               | Tabla nueva                      |
| Numero de cuenta                     | `empleados_pago.numero_cuenta`                               | Tabla nueva                      |
| Sucursal                             | `empleados_pago.sucursal`                                    | Tabla nueva                      |
| CLABE                                | `empleados_pago.clabe`                                       | Vacía en Excel; columna nullable |
| Registro patronal del IMSS           | `core.empresas.rpi_imss`                                     | Atributo de empresa              |
| Avisos pendientes y campos extra     | NO migrar                                                    | Flags transitorios CONTPAQi      |
| Teletrabajador, Equipo, Insumo, etc. | NO migrar                                                    | No usados                        |

## Sprints / hitos

| #   | Scope                                                                                                                       | Estado          | PR        |
| --- | --------------------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 1   | Schema delta: tabla `empleados_pago` y `empleados_import_log`, columnas nuevas en `empleados` y `core.empresas.rpi_imss`    | done 2026-05-01 | #381      |
| 2   | Catálogos: detectar y crear puestos/departamentos faltantes en Title Case (25 inserts)                                      | done 2026-05-01 | #382      |
| 3   | Script dry-run `scripts/import-contpaqi/dry-run.py` con reporte markdown                                                    | done 2026-05-01 | #383      |
| 4   | Apply y bajas en bloque (187 acciones aplicadas en transacción atómica)                                                     | done 2026-05-01 | #384      |
| 5A  | Paridad UI Personal — tabs Empleados/Accionistas/Todos, columnas estándar, filtros antigüedad, eliminadas flags por-empresa | done 2026-05-01 | #385      |
| 5B  | Page detail expandido — secciones nuevas read-only (Identidad, Datos personales, IMSS, Compensación, Banco, Puestos, Audit) | done 2026-05-01 | #386      |
| 5C  | Editor extendido — `<EditField>` / `<EditCombo>`, handleSave con upsert vigente en compensación y pago                      | done 2026-05-01 | #387      |
| 6   | Closeout (bitácora, decisiones, mover a done)                                                                               | done 2026-05-01 | _este PR_ |

## Bitácora

### 2026-04-30

- Promoción a `planned`. Idea cruda: cargar empleados de DILESA y RDB
  desde Excel CONTPAQi. Análisis del Excel reveló 82 columnas, 161
  empleados DILESA (52A/106B/3R), 20 empleados RDB (5A/15B), sentinel
  `30/12/1899` para fechas null, cluster de 22 RDB-en-DILESA con
  `Departamento = 'Rincon del Bosque'` y ausencia de campos para
  banco, CLABE, UMF, zona y régimen IMSS en el schema actual. 8
  preguntas cerradas con Beto en chat. Recordatorio explícito de Beto:
  accionistas, comité y consejo NO se marcan como baja aunque no estén
  en CONTPAQi (regla de exclusión agregada al algoritmo). Doc creado,
  fila agregada en `INITIATIVES.md`, reminder de revisión final del
  dry-run pendiente en `Claude: BSOP`.

### 2026-05-01

- **Sprint 1 (#381)** — schema delta aplicado en prod con psql desde la
  branch. Verificadas via Supabase MCP: tablas `empleados_pago` y
  `empleados_import_log` creadas con 4 policies y 5 indexes cada una,
  trigger `updated_at` activo. Columnas nuevas en `empleados`: `umf`,
  `zona_salario`, `regimen_imss`, `tipo_prestacion`, `sindicalizado`,
  `metodo_pago_sat`. `core.empresas.rpi_imss` agregada. Hallazgo: NO
  existe UNIQUE en `empleados.(empresa_id, persona_id)` — solo INDEX
  no-único, no hay que relajar nada para el caso RDB-en-DILESA.
  Regenerados `SCHEMA_REF.md` y `types/supabase.ts`.
- **Sprint 2 (#382)** — catálogos puestos/departamentos. 25 inserts
  totales (18 DILESA: 4 deptos + 14 puestos; 7 RDB: 0 deptos + 7
  puestos). Match flexible case-insensitive y sin tildes contra DB para
  reusar lo existente (17 puestos reusan match con MAYÚSCULAS de DB,
  ej. `JEFE DE CUADRILLA` ↔ `Jefe de Cuadrilla`). Decisiones de
  normalización: Title Case ES, correcciones ortográficas
  (`Mercadoctenia` → `Mercadotecnia`, `Tramites` → `Trámites`,
  `Urbanizacion` → `Urbanización`), `Rincon del Bosque` mapea al
  `Deportivo` ya existente. Primera versión con UUIDs hardcodeados
  hizo fallar Supabase Preview (preview tiene DB vacía sin slugs);
  refactor a lookup por slug arregló el FK violation.
- **Sprint 3 (#383)** — script dry-run Python self-contained
  `scripts/import-contpaqi/dry-run.py` (676 líneas). Lee Excel +
  snapshots DB (en JSON, los de PII gitignored). Match por CURP → RFC
  → fuzzy nombre+fecha_nac → numero_empleado. Reporte completo en
  `docs/planning/import-contpaqi-dry-run-report.md`. Resultados:
  DILESA 24 INSERT + 131 UPDATE + 6 conflict (RFCs ambiguos en DB);
  RDB 19 INSERT + 1 UPDATE; 12 bajas candidatas. DUAL_ROUTE = 0 porque
  los 22 RDB-en-DILESA son TODOS bajas históricas, no abren fila nueva
  en RDB. Audit del cluster confirmado.
- **Sprint 4 (#384)** — script apply + SQL transaccional. Decisiones
  cerradas con Beto sobre los 6 conflicts y 12 bajas: 4 bajas se
  aplican (Godoy, Arriaga, Martinez, Rodríguez Llamas), 6 sospechosos
  (Santos/Chavarría) se agregan a `exclusion_baja.json` como
  familiares no taggeados, 2 quedan flagged con datos rotos. Conflicts
  resueltos con `update_db_id` específico + soft-deletes de duplicados
  (códigos 006 y 085). Apply requirió **3 iteraciones** por CHECK
  constraints: (1) script inicial; (2) fix `frecuencia_pago='Semanal'`
  → `'semanal'` y `tipo_contrato='01'` → `'indefinido'`; (3) fix
  `match_metodo='conflict_resolution'` → `'manual'`. Cada fallo
  rollbackeó limpio. **187 acciones aplicadas** verificadas via MCP:
  43 INSERT, 138 UPDATE (incluye 6 conflicts), 4 BAJA, 2 SKIP. Estado
  prod: 234 empleados DILESA, 33 empleados RDB, 166 pagos vigentes,
  174 compensaciones vigentes.
- **Sprint 5A (#385)** — paridad UI Personal. Tabs Empleados (default)
  / Accionistas / Todos en `<EmpleadosModule>`. Eliminadas flags
  `showNumeroEmpleadoColumn`, `showEstadoColumn`, `showDeptoFilter` que
  causaban drift entre DILESA y RDB — las 3 page wrappers ahora pasan
  los mismos props. Filtros nuevos: Estado independiente
  (Activos/Ex-empleados/Todos), Antigüedad por rangos (<1 año, 1-3,
  3-5, 5-10, >10). Columnas estándar siempre visibles incluyen email
  empresa→personal fallback y antigüedad calculada.
- **Sprint 5B (#386)** — page detail expandido. Secciones nuevas
  read-only: Identidad (RFC, CURP), Datos personales (sexo, estado
  civil, nacionalidad, lugar nacimiento, telefono casa, domicilio),
  IMSS y régimen fiscal (UMF, zona, régimen, prestación, sindicalizado,
  método pago SAT, tipo contrato, horario, lugar trabajo, día pago,
  funciones, periodo prueba), Compensación vigente, Cuenta bancaria,
  Puestos asignados (multi via `empleados_puestos`), Contacto
  emergencia, Audit log (últimas 20 entries de
  `empleados_import_log`).
- **Sprint 5C (#387)** — editor extendido. Helpers `<EditField>` y
  `<EditCombo>` reusables. `handleSave` extendido para hacer UPDATE
  en `empleados`, UPDATE en `personas`, y upsert vigente en
  `empleados_compensacion` y `empleados_pago` (cierra fila vigente con
  `fecha_fin = today`, crea nueva con `fecha_inicio = today`,
  histórico preservado). Combobox para campos con valores SAT/IMSS
  conocidos (régimen, método pago, prestación, sindicalizado, sexo,
  estado civil, frecuencia pago, zona salario). RFC/CURP se mantienen
  read-only — cambios sensibles deben ir por wizard de alta.
- **Sprint 6 (este PR)** — closeout: bitácora final, mover iniciativa
  a `done` en `INITIATIVES.md`, completado el reminder de la decisión
  del dry-run en `Claude: BSOP`.
