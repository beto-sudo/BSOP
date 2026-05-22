# Mapeo Coda → schema dilesa v2 — importación

> Documento de trabajo del Sprint 3 de `dilesa-portafolio-activos`.
> Mapea las tablas del Coda DILESA (`ZNxWl_DI2D`) al schema v2.
> Beto valida este mapeo + los ajustes de schema **antes** de importar.
>
> Estado: **validado por Beto — Fases 1 y 2 importadas a producción.**
> Fecha: 2026-05-22.

## Cómo leer esto

Por cada entidad: tabla `columna de Coda → destino en v2 → nota`. Destinos
posibles:

- **`activos.X`** / **`activo_terreno.X`** / **`proyectos.X`** — mapeo directo.
- **derivado** — columna calculada en Coda (fórmula); NO se importa, se
  recalcula en v2 cuando se necesite.
- **relación** — se modela como vínculo (`proyecto_activos`), no como columna.
- **🆕 schema** — el campo NO existe en v2; requiere extender el schema.

Los presupuestos/costos vienen incompletos de Coda (Beto: "los estábamos
armando, paramos por el cambio a BSOP") — los huecos quedan NULL.

---

## 1. Terrenos → `dilesa.activos` (tipo `terreno`) + `dilesa.activo_terreno`

**25 filas en Coda.** El terreno vive un ciclo de evaluación → negociación →
descarte o adquisición → reserva o desarrollo. Casi todo el detalle de
adquisición va al satélite `activo_terreno` (decisión: opción A).

### Al master `dilesa.activos`

| Columna Coda                                          | Destino v2                     | Nota                                        |
| ----------------------------------------------------- | ------------------------------ | ------------------------------------------- |
| Nombre del Terreno                                    | `activos.nombre`               |                                             |
| Clave Interna Terreno                                 | `activos.clave_interna`        |                                             |
| Area del Terreno M²                                   | `activos.area_m2`              |                                             |
| Municipio                                             | `activos.municipio`            |                                             |
| Dirección / Referencia                                | `activos.direccion_referencia` |                                             |
| Valor Interno Estimado                                | `activos.valor_estimado`       |                                             |
| Numero de Escritura                                   | `activos.numero_escritura`     |                                             |
| Fecha Captura                                         | `activos.created_at`           | aproximado                                  |
| Notas                                                 | `activos.notas`                | canvas → texto plano                        |
| Imagen ZCU + Archivo KMZ + PDF Escritura + Documentos | `activos.documentos` (jsonb)   | se consolidan los 4 en el array de adjuntos |
| Etapa del Terreno                                     | `activos.estado`               | mapeo de valores ↓                          |
| —                                                     | `activos.tipo` = `'terreno'`   | constante                                   |

**Mapeo Etapa del Terreno (Coda) → `activos.estado`:**

| Etapa Coda                                                                                  | `activos.estado`                                            |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Detectado, En Revisión, En Análisis, En Negociación, En Due Diligence, Aprobado para Compra | `prospecto`                                                 |
| Adquirido                                                                                   | `adquirido`                                                 |
| Pausado                                                                                     | `prospecto` (la etapa fina queda en `activo_terreno.etapa`) |
| Descartado                                                                                  | **🆕 `descartado`** — ver ajuste de schema #2               |

### Al satélite `dilesa.activo_terreno` (extendido — opción A)

Campos que **ya tiene** el satélite y reciben dato: `areas_afectacion_m2`
← Areas de Afectación M². El resto del satélite actual (`uso_suelo`,
`zonificacion`, `factibilidad_*`) queda NULL — Coda no los tiene; se
capturan después.

Campos **🆕 a agregar** al satélite (extensión de adquisición/gestión):

| Columna Coda             | Campo nuevo en `activo_terreno` | Tipo                                       |
| ------------------------ | ------------------------------- | ------------------------------------------ |
| Tipo de Terreno          | `tipo_terreno`                  | text                                       |
| Objetivo del Terreno     | `objetivo`                      | text                                       |
| Zona / Sector            | `zona_sector`                   | text                                       |
| Nombre Propietario       | `propietario_nombre`            | text                                       |
| Telefono Propietario     | `propietario_telefono`          | text                                       |
| Nombre Corredor          | `corredor_nombre`               | text                                       |
| Telefono Corredor        | `corredor_telefono`             | text                                       |
| Precio Solicitado x M²   | `precio_solicitado_m2`          | numeric(14,2)                              |
| Precio x M² Ofertado     | `precio_ofertado_m2`            | numeric(14,2)                              |
| Valor Objetivo de Compra | `valor_objetivo_compra`         | numeric(16,2)                              |
| Origen del Terreno       | `origen`                        | text                                       |
| Estatus de Propiedad     | `estatus_propiedad`             | text                                       |
| Etapa del Terreno        | `etapa`                         | text (valor fino, sin perder granularidad) |
| Decisión Actual          | `decision_actual`               | text                                       |
| Prioridad                | `prioridad`                     | text (CHECK alta/media/baja)               |
| Responsable              | `responsable`                   | text (Coda lo tiene como texto libre)      |
| Fecha Última Revisión    | `fecha_ultima_revision`         | date                                       |
| Siguiente Acción         | `siguiente_accion`              | text                                       |

### No se importan (Terrenos)

- **Derivado:** Areas Aprovechables, Valor Predio, Valor Total Oferta,
  Precio x M2 Aprovechable, % Diferencia Solicitado vs Oferta — fórmulas;
  se recalculan en vista si la UI las necesita.
- **Relación:** Anteproyectos (lookup) — el vínculo terreno↔anteproyecto
  se crea en `proyecto_activos` (rol `input`) al importar anteproyectos.

---

## 2. Anteproyectos → `dilesa.proyectos` (tipo `anteproyecto`)

**5 filas en Coda.** La tabla tiene 44 columnas, pero ~27 son **fórmulas
de cálculo financiero** (Valor/Costo Referencia ×8, Valor/Costo Proyecto
×8, Utilidad, Margen, Aprovechamiento, etc.) — derivadas, NO se importan.
El modelo financiero v2 es proyectado-vs-comprometido en vistas.

### Inputs reales → v2

| Columna Coda                                                                     | Destino v2                       | Nota                                       |
| -------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------ |
| ID Anteproyecto                                                                  | `proyectos.nombre`               |                                            |
| Terreno                                                                          | `proyecto_activos` (rol `input`) | vínculo al activo terreno                  |
| Estado del Anteproyecto                                                          | `proyectos.estado`               | mapeo de valores                           |
| Fecha Inicio Anteproyecto                                                        | `proyectos.fecha_inicio`         |                                            |
| Notas                                                                            | `proyectos.notas`                |                                            |
| Plano Proyecto Lotificación                                                      | `proyectos.documentos` (jsonb)   |                                            |
| Tipo de Proyecto                                                                 | **🆕 schema**                    | clasificación del anteproyecto — ver gap ↓ |
| Area Vendible, Areas Verdes, Cantidad de Lotes, Infraestructura de Cabecera      | **🆕 schema**                    | "alcance" del anteproyecto — ver gap ↓     |
| Prototipos Referencia para Análisis                                              | `productos`                      | catálogo del proyecto (Fase posterior)     |
| Prioridad, Decisión Actual, Responsable, Siguiente Acción, Fecha Última Revisión | `proyectos.notas` o 🆕           | campos de gestión — ver gap ↓              |

**Gap de Anteproyectos:** `proyectos` v2 es delgado (nombre, tipo, estado,
plantilla, presupuesto, fechas). No tiene dónde poner el **alcance del
anteproyecto** (área vendible, cantidad de lotes, áreas verdes,
infraestructura de cabecera) ni los campos de gestión/seguimiento. Es el
mismo patrón que Terrenos. **Decisión pendiente** (ver § Ajustes).

---

## 3. Proyectos → `dilesa.proyectos` (tipo `desarrollo`)

**8 filas en Coda.** ~60 columnas, la gran mayoría **derivadas o de
estado operativo** que en v2 NO son columnas del proyecto — se calculan
agregando `dilesa.unidades` (cada lote/casa con su estado).

### Inputs reales → v2

| Columna Coda                                      | Destino v2                                            | Nota                     |
| ------------------------------------------------- | ----------------------------------------------------- | ------------------------ |
| ID Proyecto                                       | `proyectos.nombre`                                    |                          |
| Clasificación Inmobiliaria                        | `proyectos` (tipo / 🆕)                               |                          |
| Abreviación                                       | 🆕 `proyectos.clave_interna` (sugerido)               |                          |
| Area M²                                           | 🆕 schema                                             | alcance del proyecto     |
| Fecha Licencia Fraccionamiento                    | 🆕 schema                                             |                          |
| Costo de Urbanización, Costo Terreno, Costo de MO | `proyectos.presupuesto_estimado` (suma) o 🆕 desglose | presupuestos incompletos |
| Plano Oficial, Archivos ZCU, Imagen ZCU           | `proyectos.documentos` (jsonb)                        |                          |
| Terreno de origen (vía anteproyecto)              | `proyecto_activos` (rol `input`)                      |                          |

### No se importan (Proyectos) — derivados / se modelan vía `unidades`

Total de Lotes, Lotes Comerciales/Residenciales, Casas
Terminadas/Construcción/Vendidas/Muestra, Avance Urbanización/Construcción/
Ventas %, Parque Disponible, Inventario Disponible/Formalizado, Ventas
Totales, Ticket Promedio, Cumplimiento, En Proceso de Escrituración, etc.
→ todo eso es **estado agregado** que en v2 sale de contar `unidades` y
sus estados. No son columnas del proyecto.

**Gap de Proyectos:** igual que anteproyectos — falta el "alcance"
(área, fecha licencia, desglose de costos). Mismo tratamiento.

---

## 4. Inventario → `dilesa.unidades` (+ `dilesa.productos` vía § 5)

**1,590 filas en Coda.** No hay tablas separadas de "Lotes" y "Casas": la
tabla `Inventario` es el grano. Cada fila es un **lote**; si tiene casa
construida, la casa son columnas más en la misma fila (M² de Construcción,
Prototipo, fechas de obra). Composición: 1,220 interés social, 320
residencial medio, 22 áreas verdes de donación municipal, 15 residencial,
12 comercial, 1 equipamiento. 1,105 vendidas, 1,072 entregadas — es el
historial operativo real de 6 fraccionamientos.

### Decisión: cada fila → una `unidades`, sin crear `activos`

(Validada por Beto 2026-05-22.) Cada fila de Inventario → 1 fila en
`dilesa.unidades`, ligada a su proyecto y su prototipo. **No se crean
filas en `dilesa.activos`.** Razón:

- El portafolio de `activos` es lo que DILESA tiene/gestiona — hoy, los
  25 terrenos. 1,105 de las 1,590 unidades ya se vendieron: son casas que
  ya no son de DILESA. Crearlas como activo solo para marcarlas
  `desincorporado` duplica cada unidad y llena el portafolio de ruido.
- La trazabilidad que importa —qué se vendió, qué prototipo, cuándo se
  escrituró— vive completa en `unidades`: la unidad ES el registro de la
  pieza, `producto_id` dice el prototipo, `estado` dice si se vendió/
  escrituró. El comprador ("a quién") es Fase 4 (ventas), e igual con o
  sin fila en `activos`.
- `unidades.activo_id` queda NULL. El schema lo diseñó así: "se llena
  cuando la unidad se libera al portafolio" — acción deliberada y futura
  (ej. una casa muestra que DILESA conserve, un lote retirado de venta
  para reserva), no un hecho masivo del historial.

La regla operativa de Beto —"se desincorpora cuando se escritura"— se
modela como un valor de `unidades.estado` (`escriturada`), no como un
`activos.estado`: la escrituración es el estado terminal del ciclo de
vida de la unidad.

### Mapeo Inventario → `unidades`

| Columna Coda                      | Destino v2               | Nota                        |
| --------------------------------- | ------------------------ | --------------------------- |
| ID Inventario (Manzana+Lote)      | `unidades.identificador` | ej. `M19-L8`                |
| Proyecto                          | `unidades.proyecto_id`   | lookup al proyecto (Fase 2) |
| Prototipo                         | `unidades.producto_id`   | → producto del catálogo § 5 |
| Superficie Lote M²                | `unidades.area_m2`       |                             |
| Precio de Venta                   | `unidades.precio`        | precio de venta/lista       |
| Fase de Proyecto + Estatus Ventas | `unidades.estado`        | mapeo de valores ↓          |

`unidades` v2 es delgada (identificador, estado, área, precio, notas);
los campos físicos del lote/casa no caben — requieren extender el schema
(ver Ajustes § Fase 3). Campos **🆕 a agregar** a `unidades`:

| Columna Coda       | Campo nuevo `unidades` | Tipo                                                                              |
| ------------------ | ---------------------- | --------------------------------------------------------------------------------- |
| Manzana            | `manzana`              | text                                                                              |
| Lote               | `numero_lote`          | text                                                                              |
| Calle              | `calle`                | text                                                                              |
| Número Oficial     | `numero_oficial`       | text                                                                              |
| Tipo de Lote       | `tipo_lote`            | text (Interés Social / Residencial Medio / Comercial / Área Verde / Equipamiento) |
| Esquina            | `es_esquina`           | boolean                                                                           |
| Frente Verde       | `tiene_frente_verde`   | boolean                                                                           |
| M² de Construcción | `m2_construccion`      | numeric — > 0 si hay casa construida                                              |

### Mapeo de `unidades.estado`

Ciclo de vida de la unidad, cruce de "Fase de Proyecto" (avance de obra) y
"Estatus Ventas". El detalle de ventas (Estatus Ventas) gana cuando está
presente; si no, manda la fase de obra.

| Coda                                                            | `unidades.estado`              |
| --------------------------------------------------------------- | ------------------------------ |
| Fase = Planeación                                               | `planeada`                     |
| Fase = Lotes                                                    | `lote_urbanizado`              |
| Fase = Construcción                                             | `en_construccion`              |
| Fase = Terminada / Paquete RUV / Extracción / Seguro, sin venta | `terminada`                    |
| Estatus Ventas = Asignada                                       | `asignada`                     |
| Fase = Vendida, sin estatus fino de ventas                      | `vendida`                      |
| Estatus Ventas = Escriturada                                    | `escriturada` (desincorporada) |
| Estatus Ventas = Entregada                                      | `entregada`                    |

Orden del ciclo (validado con Beto 2026-05-22):
`planeada → lote_urbanizado → en_construccion → terminada → asignada →
vendida → escriturada → entregada`. La **escrituración ocurre antes de la
entrega** — es el paso 11 del pipeline de ventas (§ 6) y la
desincorporación: la unidad deja de ser de DILESA. "Entregada" es el
milestone físico posterior.

### No se importan (Inventario) en Fase 3

- **Detalle de ventas** — Estatus Ventas fino, Fecha Escritura/Asignada/
  Entregada, Vendedor, ID Cliente, Valor Comercial/Excedente/Frente Verde/
  Esquina. Es Fase 4 (ventas): el "a quién" y el contrato. Fase 3 solo
  deja el `estado` correcto (la unidad sabe que se vendió); Fase 4 ata
  comprador, contrato y montos.
- **Pipeline RUV/DTU** — Fecha DTU, Fecha Paquete RUV, Fecha Extracción,
  Fecha Seguro Calidad, Frente RUV, Avance %, Estatus de Construcción
  fino. Workflow del Coda v1 (registro ante el RUV); estado operativo
  ajeno al modelo v2. Se omite.
- **Derivado** — Antigüedad, Días de Construcción, Meses para Terminar,
  Valor Venta Futuro — fórmulas.
- **Botones de Coda** — *Agrega a Frente RUV, *Registra DTU, etc.

---

## 5. Prototipos → `dilesa.productos`

`dilesa.productos` es el catálogo de unidad-tipo **por proyecto**
(`proyecto_id` NOT NULL). En Coda el catálogo de modelos es global
(`Prototipos-Viejo`: código, Clasificación Inmobiliaria, Nombre) y cada
fila de Inventario referencia un `Prototipo`.

**Estrategia:** derivar los productos de los pares **(proyecto, prototipo)
distintos** que aparecen en Inventario. Cada par → una fila en `productos`:

| Origen                     | Destino v2              | Nota                             |
| -------------------------- | ----------------------- | -------------------------------- |
| Prototipo (código)         | `productos.nombre`      |                                  |
| Clasificación Inmobiliaria | `productos.atributos`   | jsonb `{"clasificacion": "..."}` |
| Proyecto de la fila        | `productos.proyecto_id` |                                  |

Un mismo prototipo usado en varios proyectos genera una fila de
`productos` por proyecto — coherente con el modelo (catálogo del
proyecto, no global). Los atributos finos (recámaras, baños, m²) no
están en `Prototipos-Viejo` — quedan para captura posterior.

---

## 6. Ventas → schema de comercialización (Fase 4)

**Fuente:** la tabla `Clientes` de Coda (`grid-mMIXWCSfyr`) — **1,429 filas**,
cada una la compra de una unidad por un cliente, 175 columnas. Complementan
`Depositos Clientes` (`grid-Foeo80pE3s`, pagos) y `Fase de Venta`
(`grid-a4b0evIc3U`, definición de las 17 fases del pipeline).

El schema v2 no tiene comercialización. Fase 4 agrega 4 tablas a `dilesa` y
**reusa `erp.personas`** para el comprador (validado con Beto — `erp.personas`
está documentada "base para empleados, proveedores y clientes" y ya tiene
los campos del comprador).

### Tablas nuevas

- **`erp.personas`** (reuso, `tipo='cliente'`) — el comprador como persona.
- **`dilesa.ventas`** — la transacción: liga `persona_id` (→ `erp.personas`,
  FK cross-schema) y `unidad_id` (→ `dilesa.unidades`); montos, crédito,
  comisiones, fase actual, KYC/PLD de la operación.
- **`dilesa.venta_fases`** — log del pipeline: una fila por fase alcanzada
  (`venta_id`, `fase`, `posicion`, `fecha`, `registrado_por`, `notas`).
  Reemplaza las 17 columnas planas de Coda y es el timeline del pipeline.
- **`dilesa.venta_fase_catalogo`** — las 17 fases definidas (nombre,
  posición, rol). Seed.
- **`dilesa.venta_pagos`** — los depósitos del cliente (1:N).

### 6.1 Clientes → `erp.personas` (el comprador, `tipo='cliente'`)

| Columna Coda                                    | Destino                                  | Nota                                           |
| ----------------------------------------------- | ---------------------------------------- | ---------------------------------------------- |
| Nombre                                          | `personas.nombre`                        |                                                |
| Apellido Paterno / Materno                      | `personas.apellido_paterno` / `_materno` |                                                |
| email                                           | `personas.email`                         |                                                |
| Telefono                                        | `personas.telefono`                      |                                                |
| CURP                                            | `personas.curp`                          | clave de deduplicación                         |
| RFC                                             | `personas.rfc`                           | clave de deduplicación (fallback)              |
| NSS                                             | `personas.nss`                           |                                                |
| Fecha de Nacimiento                             | `personas.fecha_nacimiento`              |                                                |
| Nacionalidad                                    | `personas.nacionalidad`                  |                                                |
| Personalidad                                    | `personas.tipo_persona`                  | física / moral                                 |
| Compra Soltero/Casado                           | `personas.estado_civil`                  |                                                |
| Calle/Numero/Colonia/CP/Ciudad/Estado Domicilio | `personas.domicilio`                     | concatenado a texto (v1); estructurado después |
| —                                               | `personas.tipo = 'cliente'`              | constante                                      |

**Dedup:** upsert por `(empresa_id, CURP)` — si la persona ya existe (otra
compra, o ya es proveedor) se reusa; si no, se crea.

### 6.2 Clientes → `dilesa.ventas` (la transacción)

| Columna Coda                                                      | Destino `ventas`                                                  | Nota                             |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------- |
| Inventario (lookup)                                               | `unidad_id`                                                       | resuelve a `dilesa.unidades`     |
| (la persona ↑)                                                    | `persona_id`                                                      | → `erp.personas` (cross-schema)  |
| Fase de Venta                                                     | `fase_actual`                                                     |                                  |
| Posición Fase de Venta                                            | `fase_posicion`                                                   | 1-17                             |
| Tipo de Credito                                                   | `tipo_credito`                                                    | Infonavit / Hipotecario / …      |
| Valor Comercial                                                   | `valor_comercial`                                                 |                                  |
| Valor de Escrituración                                            | `valor_escrituracion`                                             |                                  |
| Precio De Asignación                                              | `precio_asignacion`                                               |                                  |
| Monto de Credito Titular / Co-Titular                             | `monto_credito_titular` / `_cotitular`                            |                                  |
| Numero del Crédito Titular/Co-Titular e Institución               | `credito_titular_ref` / `_cotitular_ref`                          |                                  |
| Enganche Requerido                                                | `enganche_requerido`                                              |                                  |
| Descuento Otorgado Total                                          | `descuento_total`                                                 |                                  |
| Comision Vendedor / Gerencia de Ventas                            | `comision_vendedor` / `comision_gerencia`                         |                                  |
| Anticipo Comision por Asignacion                                  | `anticipo_comision`                                               |                                  |
| Vendedor (person)                                                 | `vendedor`                                                        | texto; link a empleados, después |
| Notario / Casa Valuadora                                          | `notario` / `casa_valuadora`                                      | texto                            |
| Monto Avalúo / Gastos Escrituración                               | `monto_avaluo` / `gastos_escrituracion`                           |                                  |
| #Escritura / Fecha de Escritura                                   | `numero_escritura` / `fecha_escritura`                            |                                  |
| Persona Políticamente Expuesta                                    | `es_pep`                                                          | KYC/PLD de la operación          |
| Actividad Ocupacion o Profesion                                   | `ocupacion`                                                       | KYC/PLD                          |
| Numero de Credencial INE                                          | `ine_numero`                                                      | KYC/PLD                          |
| Forma de Pago / Uso de Efectivo / Conocimiento Dueño Beneficiario | `forma_pago` / `uso_efectivo` / `conocimiento_dueno_beneficiario` | cuestionario PLD                 |
| Motivo por el cual se libera inventario                           | `motivo_desasignacion`                                            | si fue desasignada               |
| (de F📅Desasigna)                                                 | `estado`                                                          | `activa` / `desasignada`         |

> **KYC/PLD en `ventas`, no en `personas`:** PEP, ocupación, INE, forma de
> pago, uso de efectivo se capturan **por operación** (cuestionario PLD del
> trámite), no son atributos atemporales de la persona. Evita además
> extender la tabla compartida `erp.personas`.

### 6.3 Las 17 fechas del pipeline → `dilesa.venta_fases`

Las 17 columnas `F📅<fase>` de Coda → una fila en `venta_fases` por cada
fase con fecha (`venta_id`, `fase`, `posicion`, `fecha`). Reemplaza las
columnas planas — eran limitación de Coda. El catálogo
`venta_fase_catalogo` (seed) define las 17 fases:

| #   | Fase                       | Rol (Coda)          |
| --- | -------------------------- | ------------------- |
| 1   | Solicitud de Asignación    | Todos               |
| 2   | Asignada                   | Gerencia General    |
| 3   | Formalizada                | Gerencia General    |
| 4   | Solicitud de Avalúo        | Gerencia de Ventas  |
| 5   | Avalúo Cerrado             | Gerencia de Ventas  |
| 6   | Inscrita                   | Gerencia de Ventas  |
| 7   | Solicitud de Dictaminación | Gerencia de Ventas  |
| 8   | Dictaminada                | Gerencia de Ventas  |
| 9   | Validación Patronal        | Vendedores          |
| 10  | Firmas Programadas         | Gerencia General    |
| 11  | Escriturada                | Comité              |
| 12  | Detonada                   | Administración      |
| 13  | Facturada                  | Administración      |
| 14  | Preparada para Entrega     | Atención a Clientes |
| 15  | Entregada                  | Atención a Clientes |
| 16  | Comisión Pagada            | Comité              |
| 17  | Operación Terminada        | Administración      |

`registrado_por` (quién avanzó la fase) queda NULL en lo importado — Coda
no expone su log de actividad por API. Se llena hacia adelante cuando BSOP
captura. Ver § 6.6.

### 6.4 Depósitos → `dilesa.venta_pagos`

Tabla `Depositos Clientes` de Coda (`grid-Foeo80pE3s`), ligada al cliente:

| Columna Coda     | Destino `venta_pagos`              |
| ---------------- | ---------------------------------- |
| Cliente (lookup) | `venta_id` (resuelve vía la venta) |
| Fecha Deposito   | `fecha`                            |
| Monto Deposito   | `monto`                            |
| Tipo de Deposito | `tipo`                             |

### 6.5 No se importan en Fase 4 (Ventas)

- **Expediente digital** — ~18 columnas de PDF adjuntos. **No es "no se
  importa"**: se migra como **Fase 4.5** dedicada — ver § 6.7.
- **Derivados** — las 16 columnas `D⏱<fase>` (duración), Tiempo en Fase,
  Cronología, Datos de Operación, Año-Mes Escritura, Saldo Cliente,
  Depositos Recibidos, Venta Futuro, Valor Real Venta — fórmulas; se
  recalculan en vista.
- **Posventa** — Encuesta Satisfacción, Revisión Pre-Entrega — fase
  posterior.
- **Estado del inventario** — Estatus Inventario, Avance, DTU, fechas de
  obra: ya viven en `dilesa.unidades` (Fase 3).
- **Botones y metadata de Coda** — \*Desasigna, \*Autoriza Comisión,
  Created by, Row ID, etc.

### 6.6 Activity log (timeline de actividad)

Beto pidió un timeline de quién/cuándo/qué. **BSOP ya lo tiene** (ADR-023):
`core.audit_log` (auditoría genérica) + el componente `<ActivityLog>`. El
timeline del pipeline sale de `venta_fases`; el log fino de cambios de
campo, de `core.audit_log`, que se llena en los puntos de captura cuando
se construya la UI de ventas. El log interno de Coda no es exportable por
API — el historial granular viejo no migra.

### 6.7 Expediente digital → `erp.adjuntos` (Fase 4.5)

Cada cliente de Coda trae ~18 columnas de PDF (CURP, actas, INE, CSF,
contrato, avalúo, recibos, carta notarial, checklists, pagaré…). Es el
expediente legal/PLD de la venta — necesario para soporte. **No requiere
schema nuevo**: `erp.adjuntos` es la tabla de adjuntos polimórficos
(`entidad_tipo`, `entidad_id`, `rol`, `url`, `tipo_mime`, `tamano_bytes`).
Cada PDF → una fila con `entidad_tipo='venta'`, `entidad_id` = la venta,
`rol` = tipo de documento.

La migración es un **job dedicado (Fase 4.5)**, separado del import de
datos de Fase 4: los PDFs viven en el storage de Coda y hay que
descargarlos y re-alojarlos en Supabase Storage (decenas de miles de
archivos). Corre **después** de Fase 4 (necesita los `venta_id`). Hacia
adelante, la UI de ventas sube los expedientes nuevos directo a
`erp.adjuntos`.

---

## Ajustes de schema necesarios antes de importar

### Para Fases 1–2 (aplicadas)

1. **Extender `dilesa.activo_terreno`** con los 18 campos de adquisición/
   gestión de la § 1 (decisión A, ya aprobada por Beto).
2. **Agregar `descartado`** al `CHECK` de `dilesa.activos.estado` — un
   terreno (o cualquier activo) evaluado y descartado es un estado
   terminal legítimo; hoy el enum no lo tiene.
3. **Alcance de proyecto/anteproyecto** — `dilesa.proyectos` necesita
   dónde poner área vendible, cantidad de lotes, áreas verdes, fecha de
   licencia, desglose de costos. **Pregunta para Beto:** ¿lo resolvemos
   con (a) columnas nuevas en `proyectos`, o (b) un `jsonb alcance` /
   `jsonb metricas`? Recomiendo columnas para los 4-5 campos estables
   (área, fecha licencia, cantidad de lotes proyectada) y dejar el resto
   fuera — los conteos vivos salen de `unidades`.
4. **Campos de gestión** (responsable, decisión actual, siguiente acción,
   prioridad) — aparecen en Terrenos, Anteproyectos y Proyectos. ¿Vale
   un patrón común? Para v0: en Terrenos van al satélite (ya decidido);
   en proyectos se puede usar `proyecto_tareas` para "siguiente acción"
   en vez de una columna. A decidir.

> Nota: la migración de ajustes `20260522123710` omitió
> `proyectos.clave_interna`; se agregó después en `20260522131315`.

### Para Fase 3 (Inventario → unidades)

5. **Extender `dilesa.unidades`** con los 8 campos físicos del lote/casa
   de la § 4 (manzana, numero_lote, calle, numero_oficial, tipo_lote,
   es_esquina, tiene_frente_verde, m2_construccion).
6. **`CHECK` de `unidades.estado`** con el ciclo de vida de la § 4
   (planeada, lote_urbanizado, en_construccion, terminada, asignada,
   vendida, escriturada, entregada). Hoy `estado` es text libre con
   default `planeada`.
7. **Arreglar `activos.clave_interna`** — el schema base v2 le puso
   `UNIQUE NULLS NOT DISTINCT`. Con la decisión de la § 4 (Fase 3 no
   crea activos) este bug ya no bloquea la importación, pero sigue
   siendo un landmine: cualquier activo futuro sin clave (una casa
   muestra capturada en UI) choca al segundo NULL. Se arregla de paso
   a `UNIQUE` normal (NULLs distintos), igual que `proyectos.clave_interna`.

### Para Fase 4 (Ventas)

8. **Crear 4 tablas nuevas en `dilesa`** (detalle en § 6): `ventas`,
   `venta_fases`, `venta_fase_catalogo`, `venta_pagos` — con RLS, trigger
   `updated_at`, índices. `ventas.persona_id` es FK **cross-schema** a
   `erp.personas`.
9. **Seed de `venta_fase_catalogo`** con las 17 fases (§ 6.3).
10. **`erp.personas` no se extiende** — ya tiene los campos del comprador
    (nombre, contacto, RFC, CURP, NSS, fecha_nacimiento, domicilio,
    nacionalidad, estado_civil). Los compradores entran con `tipo='cliente'`.

## Orden de importación

1. ✅ **Terrenos** (Fase 1, PR #489) → `activos` + `activo_terreno`.
2. ✅ **Anteproyectos + Proyectos** (Fase 2, PR #490) → `proyectos` +
   `proyecto_activos`.
3. ✅ **Inventario** (Fase 3, PR #491) → `unidades` + `productos`. No crea
   `activos` (ver § 4).
4. **Ventas** (Fase 4) → `erp.personas` (cliente, `tipo='cliente'`) +
   `dilesa.ventas` + `venta_fases` + `venta_fase_catalogo` + `venta_pagos`.
   Aporta el "a quién" y el pipeline de 17 fases. Detalle completo en § 6.
5. **Expediente digital** (Fase 4.5) → `erp.adjuntos`. Job de migración de
   archivos (descarga de Coda + re-alojo en Supabase Storage). Corre
   después de Fase 4 — necesita los `venta_id`. Ver § 6.7.

Cada fase es un script reproducible en `scripts/`; se valida un lote
antes del siguiente.
