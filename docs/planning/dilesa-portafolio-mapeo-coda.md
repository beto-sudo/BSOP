# Mapeo Coda → schema dilesa v2 — importación

> Documento de trabajo del Sprint 3 de `dilesa-portafolio-activos`.
> Mapea las tablas del Coda DILESA (`ZNxWl_DI2D`) al schema v2.
> Beto valida este mapeo + los ajustes de schema **antes** de importar.
>
> Estado: **propuesta — pendiente de validación de Beto.**
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

## Ajustes de schema necesarios antes de importar

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

## Orden de importación (confirmado con Beto)

1. **Terrenos** → `activos` + `activo_terreno`. Sin dependencias.
2. **Anteproyectos + Proyectos** → `proyectos` + `proyecto_activos`.
3. **Lotes + Casas** → `activos` (tipo lote/casa) + satélites + `unidades`.
4. **Ventas** → requiere extender el schema con tablas de comercialización
   (no existen en v2). Se planea al llegar.

Cada fase es un script reproducible en `scripts/`; se valida un lote
antes del siguiente.
