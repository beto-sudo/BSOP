# ADR-001 — Schema Dilesa + Maquinaria

**Fecha:** 2026-04-23
**Estado:** propuesto (pendiente aprobación de Beto)
**Autor:** planeado en Cowork, será ejecutado vía Claude Code por sprints
**Referencias:**

- `/mnt/DILESA/knowledge/flujo-maestro-dilesa.md` — flujo de negocio detallado
- `/mnt/DILESA/knowledge/mapa-sistemas-dilesa.md` — 93 tablas base Coda mapeadas
- `supabase/GOVERNANCE.md` — reglas de migraciones y schemas

---

## Contexto

Dilesa es una desarrolladora inmobiliaria que hoy opera sobre Coda (doc `ZNxWl_DI2D`) con 93 tablas base y 191 vistas, equivalente a 286 objetos totales. Existen tres tipos de módulo:

1. **Genérico ERP** (RRHH, tasks, juntas, documentos, notarías) — ya migrado a `erp.*` con `empresa_id = f5942ed4-7a6b-4c39-af18-67b9fbf7f479`.
2. **Dominio inmobiliario Dilesa** — backbone Terrenos→Proyectos→Viviendas + comercial + RUV + construcción. **No migrado.**
3. **Maquinaria pesada** — departamento interno de Dilesa que además ofrece servicios a terceros. **No migrado.**

Beto no va a soltar Coda hasta tener todo migrado — la migración es por módulos, pero el cutover a BSOP es global: una vez que un módulo está listo en BSOP, se revoca acceso en Coda a ese módulo para forzar adopción.

## Decisión

### Schemas nuevos

| Schema       | Rol                                    | Justificación                                                                                                                                                                                              |
| ------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dilesa`     | Dominio inmobiliario de Dilesa         | Dedicated per GOVERNANCE rule: proyecto nuevo = schema nuevo                                                                                                                                               |
| `maquinaria` | Equipos, rentas, combustible, acarreos | Departamento de Dilesa pero con complejidad y audiencia (clientes externos) distintos al core inmobiliario. Aislar facilita gobernanza y eventual spin-off si se vuelve una línea de negocio independiente |

### Reuso de `erp.*`

Dilesa sigue siendo una `core.empresas` — toda tabla con `empresa_id` en `erp.*` la usa filtrando por su ID. No se duplica nada que ya viva en ERP genérico:

| Dominio                                                                   | Tabla ERP que usa Dilesa                                  | Nota                                                                                                                                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personas (empleados, proveedores, clientes vivienda, clientes maquinaria) | `erp.personas`                                            | Identidad unificada. El "expediente" inmobiliario del cliente vive en `dilesa.clientes_expediente`. Clientes de maquinaria son `erp.personas` con tipo='cliente_maquinaria' |
| Empleados                                                                 | `erp.empleados`                                           | Ya migrado                                                                                                                                                                  |
| Juntas                                                                    | `erp.juntas`                                              | Ya migrado                                                                                                                                                                  |
| Tareas generales                                                          | `erp.tasks`                                               | Ya migrado; las tareas de construcción van a `dilesa.tareas_construccion`                                                                                                   |
| Escrituras (documentos generales)                                         | `erp.documentos`                                          | Ya migrado                                                                                                                                                                  |
| Notarías                                                                  | `erp.proveedores` + `erp.personas` (categoria='notaria')  | Ya migrado                                                                                                                                                                  |
| Departamentos / Puestos                                                   | `erp.departamentos` + `erp.puestos`                       | Ya migrado                                                                                                                                                                  |
| Cuentas bancarias / Saldos                                                | `erp.cuentas_bancarias` + `erp.movimientos_bancarios`     | Ya existe el esqueleto vacío. Se carga con datos de Dilesa en sprint correspondiente                                                                                        |
| Cotizaciones                                                              | `erp.cotizaciones` _(nueva)_                              | Tabla Coda `Cotizaciones` → ERP genérico porque aplica a cualquier empresa                                                                                                  |
| IVA / UMA                                                                 | `erp.iva_tasas` + `erp.uma_valores` _(nuevas, catálogos)_ | Parámetros fiscales genéricos por año                                                                                                                                       |

### Adiciones a ERP genérico (sprint dilesa-bancos + sprint compliance)

Las siguientes tablas se crean en `erp.*` porque aplican a cualquier empresa, no solo Dilesa. La data inicial viene de Coda-Dilesa, pero el schema debe poder recibir data de BSOP o Autos del Norte el día de mañana.

#### Backbone financiero (`erp.*`)

- `erp.cotizaciones` — presupuestos emitidos o recibidos
- `erp.iva_tasas` — tasas de IVA por año
- `erp.uma_valores` — UMA por año (referencia fiscal)
- `erp.cuentas_bancarias` + `erp.movimientos_bancarios` — ya existen, solo se cargan datos

#### Compliance / PLD / identificación de clientes (`erp.compliance_*`)

Requeridos por Hacienda (SAT) y Ley Federal para la Prevención e Identificación de Operaciones con Recursos de Procedencia Ilícita (PLD). Genéricos por empresa:

- `erp.compliance_tipo_riesgo` — catálogo (bajo, medio, alto)
- `erp.compliance_evaluacion_riesgo` — evaluación de riesgo por cliente/operación
- `erp.compliance_beneficiario_final` — KYB (Know Your Business) / dueño beneficiario
- `erp.compliance_persona_expuesta` — PEP (Persona Políticamente Expuesta) flag por persona
- `erp.compliance_operaciones_reportables` — umbrales y reportes a autoridades

Estas tablas se integran a `erp.personas` con FK `persona_id`. RLS por `empresa_id` estándar.

### División de Clientes (175 columnas en Coda)

| Destino                      | Contenido                                                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `erp.personas`               | Identidad: nombre, RFC, CURP, contacto, domicilio. Tipo='cliente_dilesa'                                                                                                          |
| `dilesa.clientes_expediente` | Vínculo 1:1 con `erp.personas.id`. Expediente inmobiliario: crédito INFONAVIT/bancario, ingresos, fase actual, unidad asignada, documentación específica, observaciones de ventas |

Beneficio: la búsqueda de personas en BSOP (ya existente) sigue funcionando. Las columnas dilesa-específicas no contaminan `erp.personas`.

### Reubicación de `erp.dilesa_accionistas`

Mover a `dilesa.accionistas`. El prefijo `dilesa_` en `erp.` fue ad-hoc; consistente con la regla de schema-por-dominio corresponde moverlo.

---

## Layout de tablas propuesto

### Schema `dilesa`

#### Backbone inmobiliario (11 tablas)

- `dilesa.terrenos` — activos raíz, atributos físicos/legales pre-desarrollo
- `dilesa.anteproyectos` — **puente tierra → decisión de desarrollo**. Aquí se arma el preproyecto con presupuestos y análisis financiero para decidir si se convierte a proyecto. Campos principales (basado en deep dive Coda, 38 columnas):
  - Inputs: `terreno_id` (FK a `dilesa.terrenos`), `tipo_proyecto_id`, `area_vendible_m2`, `areas_verdes_m2`, `cantidad_lotes`, `infraestructura_cabecera_inversion`, `plano_lotificacion_url`
  - Estado (select): `en_analisis | en_tramite | no_viable | convertido_a_proyecto`
  - Cálculos (GENERATED o vista): `lote_promedio_m2`, `aprovechamiento_pct`, `precio_m2_aprovechable`, `porcentaje_areas_verdes`, `ingresos_totales_ref`, `costo_total_ref`, `utilidad_ref`, `margen_pct_ref`
- `dilesa.anteproyectos_prototipos_referencia` — **M:N con `dilesa.prototipos`**. Cada anteproyecto tiene N prototipos que sirven de referencia al análisis financiero (el promedio de sus valores comerciales/costos alimenta los cálculos del anteproyecto). Reemplaza al lookup de Coda "Prototipos Referencia para Análisis"
- `dilesa.proyectos` — desarrollo formalizado (hub central). Se materializa vía botón "Convertir a Proyecto" en anteproyecto (trigger o endpoint que inserta aquí + actualiza `anteproyectos.estado = 'convertido_a_proyecto'`)
- `dilesa.prototipos` — catálogo maestro de productos habitacionales
- `dilesa.fraccionamiento_prototipo` — relación M:N proyecto↔prototipo (qué prototipos se comercializan en cada proyecto)
- `dilesa.lotes` — unidades físicas dentro de un proyecto
- `dilesa.urbanizacion_lote` — avance de urbanización por lote
- `dilesa.construccion_lote` — avance constructivo por unidad
- `dilesa.inventario_vivienda` — unidad comercial-operativa (lote + prototipo + construcción)
- `dilesa.promociones_ventas` — campañas

#### Comercial (8 tablas)

- `dilesa.accionistas` — heredado de `erp.dilesa_accionistas`
- `dilesa.clientes_expediente` — 1:1 con erp.personas, info inmobiliaria del cliente
- `dilesa.fases_cliente` — pipeline genérico (prospecto → interesado → negociación → apartado → contrato → escrituración → entregado → posventa)
- `dilesa.fase_venta` — estado de cada venta en el pipeline
- `dilesa.depositos_clientes` — pagos recibidos (enganche, mensualidades)
- `dilesa.esquema_comisiones` — reglas de comisión
- `dilesa.objetivos_ventas` — cuotas por vendedor/período
- `dilesa.ventas` — registro consolidado de la venta (vincula cliente + inventario_vivienda + depositos + escrituración)

#### Construcción operativa (8 tablas)

- `dilesa.contratistas` — referencia a `erp.personas` + info específica de construcción
- `dilesa.contratos_construccion` — contratos por lote/contratista
- `dilesa.recepciones_contratista` — entregas formales de obra
- `dilesa.plantilla_tareas_construccion` — templates por modelo de vivienda
- `dilesa.tareas_construccion` — instancias asignadas a cada construcción_lote
- `dilesa.bitacora_obra` — registro diario de campo
- `dilesa.checklist_supervision` — inspecciones de calidad
- `dilesa.checklist_maestro` — catálogos de puntos a verificar

#### RUV / regulatorio (7 tablas)

- `dilesa.frente_ruv` — proyectos registrados ante RUV
- `dilesa.documentos_ruv_requeridos` — checklist por tipo de trámite
- `dilesa.documentos_ruv_archivados` — evidencias subidas
- `dilesa.cuv` — Clave Única de Vivienda asignada por unidad
- `dilesa.dtu_proceso` — DTU (Documento Técnico Unificado)
- `dilesa.pruebas_vivienda` — pruebas finales pre-entrega
- `dilesa.encuesta_posventa` — resultados satisfacción cliente

#### Catálogos Dilesa (8 tablas)

- `dilesa.clasificacion_inmobiliaria`
- `dilesa.tipo_proyecto`
- `dilesa.etapas_construccion`
- `dilesa.tipo_trabajo`
- `dilesa.fases_urbanizacion`
- `dilesa.fases_inventario`
- `dilesa.tipo_credito` (INFONAVIT, bancario, cofinavit, etc.)
- `dilesa.tipo_deposito` (enganche, mensualidad, gastos)
- `dilesa.forma_pago`

**Total `dilesa.*` propuesto: ~41 tablas** (subset del universo 93 de Coda — muchas Coda son views o tablas temp que no migran).

### Schema `maquinaria`

- `maquinaria.equipos` — inventario de maquinaria pesada propia
- `maquinaria.proyectos_maquinaria` — rentas/obras. Puede tener FK a `dilesa.proyectos` (uso interno) o a `persona_id` de `erp.personas` (renta externa), con constraint XOR
- `maquinaria.horas_maquina` — control de uso por equipo/proyecto
- `maquinaria.precios_hora` — tarifas por equipo
- `maquinaria.cargas_combustible` — consumos
- `maquinaria.tipo_combustible` — catálogo
- `maquinaria.precio_km` — tarifas de acarreo
- `maquinaria.acarreos` — transporte de material

**Total `maquinaria.*` propuesto: 8 tablas.** Los clientes de maquinaria viven en `erp.personas` con `tipo='cliente_maquinaria'` — no se crea tabla específica para evitar duplicar identidades.

---

## Convenciones (aplicables a todas las tablas nuevas)

### Obligatorias

1. **RLS enabled** en toda tabla con datos operativos. Policies scope por `empresa_id` usando helpers `core.fn_has_empresa(empresa_id)` y `core.fn_is_admin()`.
2. **`empresa_id uuid NOT NULL REFERENCES core.empresas(id)`** como primera FK en tablas operativas. Para tablas de catálogo puede ser nullable (global) o empresa-scoped según dominio.
3. **`created_at`, `updated_at`** con trigger `core.fn_set_updated_at()`.
4. **`deleted_at timestamptz`** para soft-delete (patrón consistente con `erp.departamentos_puestos`). Policies filtran `WHERE deleted_at IS NULL` por default.
5. **`coda_row_id text`** (nullable, único por tabla dentro de empresa) para trazabilidad de migración Coda→BSOP. Permite re-runs idempotentes de scripts. Se deprecará (columna + backfill null) después del cutover completo.
6. **Migraciones idempotentes** per GOVERNANCE §1 — `to_regclass()` guards cuando referencien objetos externos.

### Naming

- `snake_case` siempre. Plural para entidades (`terrenos`, `contratos_construccion`), singular para 1:1 o config (`clientes_expediente`).
- Índices: `dilesa_<tabla>_<cols>_idx` / `maquinaria_<tabla>_<cols>_idx`.
- Policies: `<tabla>_<scope>_<cmd>` (ej. `terrenos_empresa_select`).

### UI convention (heredada de flujo-maestro §6)

Cada módulo importante en la app BSOP expone:

- Página pública `[Entidad]` con tabs: **Alta / Consulta / Resumen / Timeline / Chart**
- Vista master con columnas obligatorias de gestión: Etapa, Decisión Actual, Prioridad, Responsable, Fecha Última Revisión, Siguiente Acción
- Orden de columnas: A. Identidad → B. Ubicación → C. Contacto → D. Económica → E. Gestión → F. Cálculos → G. Continuidad → H. Documentos

### Patrones Coda → BSOP (mecanismo equivalente)

| Coda                                                            | BSOP                                                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Botón con RunActions(ModifyRows) en misma tabla                 | Trigger `BEFORE UPDATE` o endpoint API                                                                                          |
| Botón con AddRow cross-table (ej. Baja Empleado → Ex-Empleados) | Soft-delete (`deleted_at`) + vista de "históricos" que filtra por `deleted_at IS NOT NULL`                                      |
| Vista `*Tabla Cambios` (OpenRow histórico)                      | Tabla de auditoría opcional con trigger AFTER UPDATE, o `updated_by` + tabla `*_updates` donde aplique (ver `erp.task_updates`) |
| Filtros por usuario (`Filtro Usuario` / `currentUser()`)        | RLS por `(SELECT auth.uid())`                                                                                                   |
| Fórmulas de cálculo en columna                                  | Generated columns (`GENERATED ALWAYS AS ... STORED`) o vistas derivadas                                                         |
| Pack actions (Gmail, etc.)                                      | Edge functions                                                                                                                  |

---

## Orden de migración — Sprints

Beto no suelta Coda hasta que todo esté en BSOP. Esto significa que el orden optimiza **velocidad de implementación + dependencias**, no "qué usuarios migro primero". Cada sprint cierra cuando:

1. Schema + tablas creadas con migraciones reproducibles
2. Script `scripts/migrate_dilesa_<modulo>.ts` corrido con éxito (idempotente, usa `coda_row_id`)
3. UI mínima en BSOP expone el módulo con tabs convencionales
4. Beto revoca acceso en Coda a ese módulo → usuarios migran forzados

### Sprint **dilesa-0** — Foundation

- Crear schemas `dilesa` y `maquinaria` con GRANTs estándar
- Mover `erp.dilesa_accionistas` → `dilesa.accionistas` con compat shim
- Crear catálogos de `dilesa.*` (clasificacion*inmobiliaria, tipo_proyecto, fases*\*, tipo_credito, etc.) — sin datos todavía
- Actualizar `package.json db:types` y `schema:ref` para incluir `dilesa` y `maquinaria`
- Validar `supabase db reset` corre limpio + drift-check sin ALERTs

### Sprint **dilesa-1** — Backbone bloque 1 (Terrenos, Proyectos, Prototipos)

- `dilesa.terrenos`, `dilesa.anteproyectos`, `dilesa.proyectos`, `dilesa.prototipos`, `dilesa.fraccionamiento_prototipo`
- Scripts: `migrate_dilesa_terrenos.ts`, `migrate_dilesa_proyectos.ts`, `migrate_dilesa_prototipos.ts`
- UI Alta/Consulta/Resumen para cada uno

### Sprint **dilesa-2** — Backbone bloque 2 (Lotes + Urbanización + Construcción por lote)

- `dilesa.lotes`, `dilesa.urbanizacion_lote`, `dilesa.construccion_lote`
- Scripts de migración correspondientes
- UI

### Sprint **dilesa-3** — Construcción detalle

- `dilesa.contratistas`, `dilesa.contratos_construccion`, `dilesa.recepciones_contratista`
- `dilesa.plantilla_tareas_construccion`, `dilesa.tareas_construccion`
- `dilesa.bitacora_obra`, `dilesa.checklist_maestro`, `dilesa.checklist_supervision`
- Scripts + UI

### Sprint **dilesa-4** — Inventario

- `dilesa.inventario_vivienda`, `dilesa.promociones_ventas`
- Transición lógica: cuando un `construccion_lote` alcanza estatus X → se materializa registro en `inventario_vivienda` (via trigger o app logic)
- Script + UI

### Sprint **dilesa-5** — Comercial

- `dilesa.clientes_expediente` (split de Clientes 175-col)
- `dilesa.fases_cliente`, `dilesa.fase_venta`, `dilesa.ventas`
- `dilesa.depositos_clientes`, `dilesa.esquema_comisiones`, `dilesa.objetivos_ventas`
- Script de migración mapea columnas de Coda.Clientes a `erp.personas` + `dilesa.clientes_expediente`
- UI pipeline de ventas

### Sprint **dilesa-6** — RUV y regulatorio

- `dilesa.frente_ruv`, `dilesa.documentos_ruv_*`, `dilesa.cuv`, `dilesa.dtu_proceso`, `dilesa.pruebas_vivienda`, `dilesa.encuesta_posventa`
- Scripts + UI

### Sprint **erp-bancos** — Financiero genérico (puede intercalarse con dilesa-3/4 si urge)

- Completar `erp.cuentas_bancarias` + `erp.movimientos_bancarios` con datos Dilesa
- Crear `erp.cotizaciones`, `erp.iva_tasas`, `erp.uma_valores`
- Script de migración desde Coda (tablas Saldos Bancos, Cotizaciones, IVA, UMA)

### Sprint **erp-compliance** — PLD e identificación (antes de cerrar comercial para bloquear reportes fiscales)

- `erp.compliance_tipo_riesgo`, `erp.compliance_evaluacion_riesgo`, `erp.compliance_beneficiario_final`, `erp.compliance_persona_expuesta`, `erp.compliance_operaciones_reportables`
- Integración con `erp.personas` (flag PEP, beneficiario final)
- Script de migración (tablas Coda: Riesgo, Evaluación de Riesgo, Conocimiento Dueño Beneficiario, Persona Políticamente Expuesta)
- **Ubicación en el orden:** recomendado antes de `dilesa-cutover`, porque es requisito legal activo; puede correrse en paralelo con `dilesa-5` si hay bandwidth

### Sprint **usuarios-dilesa** — Mapeo de accesos Coda → BSOP

- Tabla Coda `Usuario` (`grid-Yztfn-wD5K`) tiene histórico de todos los accesos (activos + inactivos).
- Acción:
  - Activos → crear `auth.users` (invitación por email) + `core.usuarios` + `core.usuarios_empresas` con rol apropiado
  - Inactivos → crear `core.usuarios` con flag `activo=false`. Sirven como referencia para FKs históricas (`creado_por`, `modificado_por` en registros migrados)
- Script: `scripts/migrate_dilesa_usuarios.ts` con DRY_RUN para preview antes de mandar invitaciones
- Alinear con `Filtro Usuario` (permisos granulares) → mapear a `core.permisos_rol` / `core.permisos_usuario_excepcion`

### Sprint **maquinaria-1** — Maquinaria completa (al final por acuerdo con Beto)

- Las 8 tablas del schema (clientes en `erp.personas`)
- Script + UI

### Sprint **dilesa-cutover** — Decomisión Coda

- Row count validation Coda vs BSOP por cada tabla crítica
- Export final del doc Coda como backup
- Revoke final de permisos Coda
- Documentar en `GOVERNANCE.md §2` que el doc es read-only / archivado

---

## Consecuencias

### Positivas

- `dilesa.*` aísla la complejidad del dominio inmobiliario sin ensuciar ERP
- `maquinaria.*` aparte permite que un día se pueda mover a su propio proyecto Supabase si la línea de negocio crece
- Reuso de `erp.personas` y `erp.documentos` evita duplicación y permite vistas unificadas cross-empresa
- El patrón de sprints acotados + cutover por módulo permite a Beto forzar adopción sin big-bang

### Riesgos

- **175 columnas en Coda.Clientes**: si el split a `clientes_expediente` deja alguna pieza afuera, Ventas va a reclamar. Mitigación: el script de migración debe reportar qué columnas NO se mapearon y Beto decide.
- **Dependencia circular `construccion_lote ↔ inventario_vivienda`**: el registro de inventario nace cuando la construcción alcanza cierto estatus, pero después el inventario "controla" al lote comercialmente. Mitigación: FK unidireccional + trigger / app logic para la transición.
- **Botones con lógica compleja**: 57 botones en Coda (según audit de Autos del Norte; Dilesa probablemente tenga más). Cada uno a evaluar si es trigger, edge function o app logic. Mitigación: inventario de botones críticos en cada sprint antes de migrar datos.

### Trade-offs aceptados

- **Mantener `coda_row_id` durante la migración** aunque sea "sucio" — se dropea post-cutover con una migración de cleanup.
- **Soft-delete en lugar de tabla `Ex-*` separada** — simplifica pero implica views adicionales para recuperar el patrón "Ex-Empleados" donde haga falta.

---

## Decisiones tomadas (respuestas a preguntas iniciales)

1. **No hay segundo doc Dilesa.** El `dilesa2-mcp-tables.json` en cache es artefacto del tooling, ignorable. Doc autoritativo: `ZNxWl_DI2D`.
2. **Usuarios:** tabla Coda tiene histórico completo. Activos → invitar a BSOP (`auth.users` + `core.usuarios` + `core.usuarios_empresas`). Inactivos → crear como `core.usuarios` con `activo=false` para preservar FKs históricas (quién creó/modificó cada registro en la data migrada). Sprint `usuarios-dilesa` documentado arriba.
3. **Bancos, Cotizaciones, IVA, UMA → ERP genérico.** Sprint `erp-bancos`.
4. **Compliance → ERP genérico (`erp.compliance_*`).** Requisitos SAT + PLD aplican a cualquier empresa, no solo Dilesa. Sprint `erp-compliance`.
5. **Maquinaria clientes → `erp.personas`** con `tipo='cliente_maquinaria'`. No se crea tabla específica.

## Preguntas abiertas (menor prioridad, no bloquean sprints)

Ninguna bloqueante. Las que pueden refinarse durante la ejecución:

- **Formato exacto de cálculos financieros en `dilesa.anteproyectos`** — ¿columnas `GENERATED ALWAYS AS ... STORED` o vista `dilesa.v_anteproyectos_analisis`? Recomendación: vista (el promedio sobre prototipos referencia cambia si editan prototipos, y una vista se recalcula dinámica). Decidir al ejecutar sprint dilesa-1.
- **Transición `anteproyecto → proyecto`** — ¿trigger DB, edge function o app endpoint? Recomendación: endpoint app con validación + INSERT + UPDATE de estado, para poder auditar y mostrar confirmación al usuario. Decidir al ejecutar sprint dilesa-1.
- **Tabla `Juntas` en Dilesa vs la ya migrada en BSOP** — ya hay `erp.juntas`. Pero las Juntas de Dilesa suelen ser de consejo / accionistas con tratamiento distinto a juntas operativas. Ver si necesita subtipo en `erp.juntas.tipo` o sub-tabla `dilesa.juntas_consejo`. Decidir al revisar data real.

---

## Referencias técnicas

- Scripts Coda existentes: `scripts/archive/migrate_dilesa_*.ts` — seguir el mismo patrón para nuevos módulos.
- Coda API helpers: los 5 scripts existentes tienen `codaGet<T>()` reutilizable. Extraer a `lib/coda-api.ts` en sprint dilesa-0 para no duplicar.
- Paste import Coda → adjuntos: `lib/coda-paste-import.ts` — útil para migrar contenido rich-text de descripciones de proyecto con imágenes.
- DILESA_EMPRESA_ID: `f5942ed4-7a6b-4c39-af18-67b9fbf7f479`.
- Doc Coda Dilesa: `ZNxWl_DI2D`.
- **Pendiente inmediato de seguridad**: rotar la API key de Coda expuesta en `/mnt/DILESA/knowledge/mapa-sistemas-dilesa.md` línea 4.

---

## Cambios a este ADR

Editar vía PR con cambio de estado: `propuesto → aceptado → implementado (sprint X)`. Cualquier cambio de scope debe actualizar §Orden de migración + §Consecuencias.
