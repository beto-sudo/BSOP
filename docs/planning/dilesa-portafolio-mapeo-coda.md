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

## 6. Ventas → Fase 4 (referencia — no se importa en Fase 3)

El proceso de ventas de DILESA está documentado en Coda (`grid-a4b0evIc3U`)
como un **pipeline de 17 fases ordenadas**, cada una con su rol
responsable, acciones, documentos obligatorios y correos automatizados:

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

Fase 4 implementará este pipeline. Requiere extender el schema v2 con
estructura de comercialización (clientes, ventas, fases de venta con sus
documentos y correos) — no existe en v2. El `unidades.estado` de Fase 3
es la proyección gruesa de este pipeline (terminada → asignada → vendida
→ escriturada → entregada); el seguimiento fino de 17 fases por cliente
es de Fase 4.

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

## Orden de importación

1. ✅ **Terrenos** (Fase 1, PR #489) → `activos` + `activo_terreno`.
2. ✅ **Anteproyectos + Proyectos** (Fase 2, PR #490) → `proyectos` +
   `proyecto_activos`.
3. **Inventario** (Fase 3) → `unidades` + `productos`. No crea `activos`
   (ver § 4).
4. **Ventas** (Fase 4) → requiere extender el schema con tablas de
   comercialización (clientes, ventas/contratos) — no existen en v2.
   Aporta el "a quién" y el detalle de contrato/pago/comisión.
   Pipeline de 17 fases documentado en § 6.

Cada fase es un script reproducible en `scripts/`; se valida un lote
antes del siguiente.
