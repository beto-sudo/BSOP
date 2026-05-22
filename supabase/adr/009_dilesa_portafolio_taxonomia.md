# ADR-009 — Taxonomía del schema dilesa v2: Activo / Proyecto / Producto / Unidad

**Fecha:** 2026-05-21
**Estado:** propuesto
**Iniciativa(s):** `dilesa-portafolio-activos`
**Reemplaza:** ADR-001 (schema dilesa v1) en lo relativo al backbone
inmobiliario. El schema v1 fue demolido en el Sprint 1 de esta iniciativa
(PR #482).

---

## Contexto

El schema `dilesa` v1 (ADR-001) modeló un pipeline lineal:

> `Terreno → Anteproyecto → Proyecto → Prototipo → Lote → Urbanización +
Construcción → Inventario → Cliente → Venta`

Cada paso era una tabla. El modelo estaba **cosido a fraccionamiento de
vivienda**: `Prototipo` asume un modelo de casa, `Lote` asume residencial,
las fases de urbanización/construcción son las de un fraccionamiento. La
operación real de DILESA no cabe ahí — desarrolla plazas comerciales,
complejos de departamentos en renta, bodegas industriales, y opera
activos rentables (espectaculares) que no son "proyectos". El caso real
Lomas del Bosque (uso mixto: 4 streams de valor en un polígono) no se
puede modelar con el pipeline lineal.

El brainstamp de la iniciativa (ver `docs/planning/dilesa-portafolio-activos.md`)
cerró un modelo nuevo. Este ADR lo formaliza como la taxonomía del schema
v2. El ADR-010 cubre la jerarquía padre/hijo y el prorrateo de CapEx.

## Decisión

El schema `dilesa` v2 tiene **cuatro entidades raíz**:

### 1. `dilesa.activos` — el portafolio

Todo lo que DILESA posee, desarrolla u opera. Discriminador `tipo`:

```
terreno | espectacular | unipolar | casa | local | plaza |
edificio | nave | departamento | lote | infraestructura
```

- **Master `dilesa.activos`** — campos comunes a todo activo: `empresa_id`,
  `tipo`, `nombre`, `estado` (`prospecto | adquirido | operando |
en_intervencion | desincorporado`), ubicación (geo + municipio +
  domicilio), área, situación legal/fiscal, valor, propietario, y la
  jerarquía padre/hijo (ver ADR-010).
- **Satélites `dilesa.activo_<tipo>`** — campos específicos por tipo, 1:1
  con el master vía `activo_id` PK/FK. Ej. `dilesa.activo_terreno`
  (uso de suelo, factibilidades, zonificación), `dilesa.activo_lote`
  (manzana, número, condición esquina/intermedio), `dilesa.activo_local`
  (m² rentable, frente), `dilesa.activo_espectacular` (caras, dimensiones,
  tráfico). Solo se crean satélites para los tipos que tienen campos
  propios reales; un tipo sin atributos específicos vive solo en el master.

### 2. `dilesa.proyectos` — la intervención

Todo trabajo sobre uno o varios activos. Discriminador `tipo`:

```
anteproyecto | desarrollo | remodelacion | reconversion |
subdivision | comercializacion | operacion
```

`anteproyecto` y `desarrollo` ya **no son tablas separadas** (en v1 lo
eran): son tipos del mismo `proyectos`. Un terreno puede tener N
anteproyectos compitiendo; el ganador pasa a `desarrollo`; todos viven en
la misma tabla y se ven en una sola vista de árbol. La jerarquía
madre/sub-proyecto y los vínculos a activos input/output van en ADR-010.

### 3. `dilesa.productos` — catálogo del proyecto

La "unidad-tipo" comercializable o rentable. **Por proyecto, no global**:

- Fraccionamiento → prototipo de vivienda (modelo A, B, C…)
- Plaza comercial → tipo de local (anchor, intermedio, kiosco)
- Bodega industrial → módulo / nave-tipo
- Departamentos → típica (1 rec, 2 rec, PH)

Reemplaza al `dilesa.prototipos` de v1, que era un catálogo global de
modelos de vivienda. `productos` es polimórfico (campos comunes +
`atributos jsonb` por tipo, o satélite si un tipo lo amerita) y vive
colgado de un `proyecto_id`.

### 4. `dilesa.unidades` — la pieza física

La instancia individual vendible o rentable: el lote del fraccionamiento,
el local de la plaza, el departamento del complejo. Reemplaza a
`dilesa.lotes` de v1 con un discriminador en vez del nombre fijo "lote".
Cuando una Unidad se libera comercialmente, **entra al portafolio como un
`dilesa.activos` propio** — el desarrollo escupe activos (detalle del
ciclo en ADR-010).

## Opciones consideradas (modelado de los tipos)

Para `activos` (y análogo para `productos`):

| Opción                                                                                                 | Pros                                                                                                                              | Contras                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Single-table polimórfica** — una tabla con todas las columnas de todos los tipos, la mayoría NULL | Simple, sin JOINs                                                                                                                 | Tabla anchísima (el bloat que ADR-001 ya sufrió: `Inventario` 54 cols, `Prototipos` 61); columnas sin sentido por tipo; sin integridad por tipo |
| **B. Table-per-type** — una tabla independiente por cada tipo de activo                                | Integridad fuerte, tablas angostas                                                                                                | Agregar un tipo nuevo = tabla nueva + N cambios; reportes cross-tipo = UNION de N tablas; FKs downstream se multiplican                         |
| **C. Híbrido master + satélite** (elegido)                                                             | Reportes cross-tipo sobre el master; tipo nuevo = 1 satélite + 1 valor de enum; tablas angostas; FKs downstream apuntan al master | Un JOIN para la ficha completa de un tipo                                                                                                       |

**Decisión: C.** El híbrido es el que aguanta el crecimiento de tipos
(mañana "centro de datos", "torre", "bodega refrigerada") sin explotar, y
mantiene los reportes de portafolio simples sobre el master. El JOIN
extra es barato y predecible.

## Convenciones (heredadas de ADR-001 §Convenciones)

Toda tabla nueva del schema v2 respeta:

1. **RLS enabled**; policies scope por `empresa_id` usando los helpers
   `core.fn_has_empresa()` y `core.fn_is_admin()`.
2. **`empresa_id uuid NOT NULL REFERENCES core.empresas(id)`** en tablas
   operativas (catálogos pueden ser globales).
3. **`created_at` / `updated_at`** con trigger `core.fn_set_updated_at()`.
4. **`deleted_at timestamptz`** para soft-delete; policies filtran
   `WHERE deleted_at IS NULL`.
5. **`snake_case`**; plural para entidades, singular para 1:1/config.
   Índices `dilesa_<tabla>_<cols>_idx`, policies `<tabla>_<scope>_<cmd>`.
6. Discriminador `tipo` como `text` con `CHECK` (no enum nativo — agregar
   un valor a un `CHECK` es una migración trivial; a un enum, no).
7. **Sin `coda_row_id`.** El schema v1 lo usaba para idempotencia de la
   migración Coda→BSOP. La re-migración de v2 (Sprints 3 y 5) parte de
   Coda otra vez; si se necesita trazabilidad se decide en esos sprints,
   no se arrastra por default.

## Consecuencias

### Positivas

- Soporta todos los tipos de proyecto de DILESA, no solo vivienda.
- Un terreno puede tener varios anteproyectos en paralelo con su árbol
  de decisión visible (memoria institucional de los descartes).
- El portafolio es consultable como un todo (todos los activos, todos
  los estados) sobre una sola tabla master.
- Agregar un tipo nuevo es barato: un valor de `CHECK` + un satélite
  opcional.

### Riesgos / a monitorear

- **Sobre-normalización.** Si un satélite termina con 2 columnas, quizá
  esas columnas debieron vivir en el master con un `jsonb`. Criterio:
  satélite solo cuando el tipo tiene ≥4 campos propios o restricciones
  de integridad reales.
- **El JOIN master+satélite en la UI.** Si la ficha de detalle se vuelve
  lenta, se resuelve con una vista por tipo — no es bloqueante.
- **`productos` polimórfico con `jsonb`.** Cómoda para arrancar plantillas
  no-fraccionamiento; si un tipo madura, su `jsonb` se gradúa a satélite.

### Trade-offs aceptados

- Un JOIN extra para la ficha tipo-específica, a cambio de reportes de
  portafolio simples y crecimiento de tipos barato.
- `productos` arranca con `jsonb` por tipo en vez de satélites estrictos
  — se acepta porque solo fraccionamiento tiene el modelo maduro hoy.

## Cambios a este ADR

Editar vía PR con cambio de estado: `propuesto → aceptado → implementado
(Sprint 2)`. Cualquier cambio de taxonomía actualiza §Decisión.
