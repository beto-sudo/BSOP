# ADR-010 — Jerarquía padre/hijo, vínculos Proyecto↔Activo y prorrateo de CapEx

**Fecha:** 2026-05-21
**Estado:** propuesto
**Iniciativa(s):** `dilesa-portafolio-activos`
**Depende de:** ADR-009 (taxonomía: Activo / Proyecto / Producto / Unidad).

---

## Contexto

ADR-009 define las cuatro entidades raíz del schema `dilesa` v2 pero no
cómo se relacionan entre sí ni jerárquicamente. El caso piloto **Lomas
del Bosque** (uso mixto, 104,959 m², ver `docs/planning/dilesa-portafolio-activos.md`)
exige tres relaciones que el pipeline lineal de v1 no tenía:

1. **Un proyecto madre con sub-proyectos.** "Desarrollo Lomas del Bosque"
   hace la urbanización general; debajo cuelgan 4 streams de valor (lotes
   residenciales, casas, plazas, complejo duplex) que se descomponen en
   7 sub-proyectos con modelo financiero propio.
2. **Un activo padre con activos hijos.** Una plaza comercial es un
   `activo` con N locales que también son `activos` — vendibles/rentables
   individualmente, o el conjunto entero.
3. **CapEx compartido.** La urbanización general (~35% del polígono:
   vialidades, canales, áreas verdes) la paga el proyecto madre, pero el
   margen real de cada sub-proyecto necesita una parte prorrateada de ese
   costo.

Este ADR resuelve las tres + el vínculo Proyecto↔Activo y cierra la
pregunta abierta **D2** (regla de prorrateo).

## Decisión

### 1. Jerarquía de Proyectos — self-FK

`dilesa.proyectos.proyecto_padre_id uuid NULL REFERENCES dilesa.proyectos(id)`.

Un proyecto sin padre es raíz (proyecto madre o proyecto suelto). Un
sub-proyecto apunta a su madre. Profundidad esperada: 2 niveles (madre →
sub-proyectos); el modelo no la limita pero tampoco la optimiza para más.

Además:

- `proyecto_predecesor_id uuid NULL REFERENCES dilesa.proyectos(id)` — el
  anteproyecto ganador del que nació un proyecto de `desarrollo`. Permite
  reconstruir el árbol de decisión (los anteproyectos hermanos comparten
  `proyecto_padre_id` o el activo de origen; el ganador queda referenciado
  por su sucesor).

### 2. Jerarquía de Activos — self-FK

`dilesa.activos.activo_padre_id uuid NULL REFERENCES dilesa.activos(id)`.

Una plaza es un `activo` padre; sus locales son `activos` con
`activo_padre_id` → la plaza. Permite: vender el conjunto (se mueve el
padre con sus hijos), rentar hijo por hijo, y reportar ocupación/flujo
agregado del padre. Mismo patrón para el complejo duplex y sus unidades.

### 3. Vínculo Proyecto ↔ Activo — tabla de unión

`dilesa.proyecto_activos (proyecto_id, activo_id, rol, ...)` con
`rol text CHECK (rol IN ('input','output'))`:

- **input** — activos sobre los que el proyecto interviene (ej. el
  terreno raíz de un desarrollo; un terreno + una plaza vecina en una
  reconversión).
- **output** — activos que el proyecto genera al ejecutarse (los lotes,
  locales, viviendas que entran al portafolio).

M:N en ambos sentidos: un proyecto toca N activos; un activo acumula N
proyectos a lo largo de su vida (su historial de intervenciones).

### 4. Binding Unidad ↔ Producto ↔ Sub-proyecto

`dilesa.unidades` lleva:

- `proyecto_id` — el sub-proyecto que la comercializa/desarrolla.
- `producto_id uuid NULL` — el Producto (unidad-tipo) asignado;
  **nullable y reclasificable** mientras la Unidad no esté comprometida.
- `activo_id uuid NULL` — el `activo` que esta Unidad llega a ser cuando
  se libera al portafolio (cierra el ciclo del punto 6).

La **definición operativa de "binding comprometido"** (¿en qué momento
deja de ser reclasificable — apartado, venta, escritura?) es la pregunta
abierta **D3**; se cierra antes del Sprint 4 (UI de captura) y no afecta
la estructura de tablas de este ADR.

### 5. Ciclo: el proyecto genera activos

Cuando un proyecto de `desarrollo` se ejecuta, sus Unidades se "liberan":
cada una materializa un `dilesa.activos` nuevo (tipo `lote`, `local`,
`casa`, `departamento`…), enlazado por `unidades.activo_id` y registrado
en `proyecto_activos` con `rol='output'`. El portafolio crece con lo que
el desarrollo produce. La mecánica de la materialización (trigger vs
app-logic) se decide en el Sprint que construya esa transición — este ADR
solo fija que el vínculo existe (`unidades.activo_id`).

### 6. Prorrateo de CapEx compartido (cierra D2)

El proyecto madre lleva una **regla declarativa**:

`dilesa.proyectos.regla_prorrateo text CHECK (regla_prorrateo IN
('m2_beneficiados','por_unidad','por_valor_comercial','manual'))`.

- Para `m2_beneficiados | por_unidad | por_valor_comercial`, el CapEx
  prorrateado a cada sub-proyecto es **derivado** — se calcula en una
  vista a partir de la regla y la base correspondiente (m² del
  sub-proyecto, conteo de unidades, valor comercial proyectado). No se
  captura ni se persiste: si cambia la base, el prorrateo se recalcula.
- `manual` es el escape hatch: una tabla `dilesa.proyecto_prorrateo
(proyecto_madre_id, sub_proyecto_id, porcentaje)` con la asignación
  explícita, para los casos donde ninguna regla automática aplica.

Default: `m2_beneficiados`. El CapEx compartido vive en el presupuesto del
proyecto madre; los sub-proyectos llevan solo su CapEx específico — el
prorrateado se suma en la vista de margen, nunca se duplica en captura.

## Opciones consideradas

### Modelado de la jerarquía

| Opción                              | Pros                                                                                         | Contras                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **A. Self-FK `padre_id`** (elegido) | Trivial; suficiente para 2 niveles; queries recursivas con `WITH RECURSIVE` si hiciera falta | Consultar el árbol completo requiere recursión                      |
| B. Closure table                    | Consultas de subárbol O(1)                                                                   | Tabla extra + triggers de mantenimiento; overkill para 2 niveles    |
| C. `ltree`                          | Path queries nativas                                                                         | Dependencia de extensión; mantener el path al mover nodos es frágil |

**Decisión: A.** Las jerarquías de DILESA son anchas pero poco profundas
(un madre, N hijos directos). Self-FK es lo correcto; closure table y
`ltree` resuelven una profundidad que este dominio no tiene.

### Prorrateo

| Opción                                             | Pros                                                                                           | Contras                                                                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Regla declarativa + cálculo derivado** (elegido) | Una columna en el madre; el prorrateo nunca se desincroniza de la base; `manual` cubre lo raro | El cálculo vive en una vista que hay que mantener                                                                    |
| Tabla de asignación siempre explícita              | Control total fila por fila                                                                    | Captura tediosa; se desincroniza cuando cambian m² o unidades; es justo el trabajo manual que el sistema debe evitar |

**Decisión: regla declarativa.** Capturar el prorrateo a mano para 7
sub-proyectos cada vez que cambia un número es exactamente la fricción
que esta iniciativa busca eliminar. La regla declarativa + vista lo hace
solo; `manual` queda para la excepción.

## Consecuencias

### Positivas

- Lomas del Bosque se modela sin contorsiones: 1 proyecto madre + 7
  sub-proyectos, plazas como activos-padre con locales-hijos.
- El historial de intervenciones de un activo es consultable
  (`proyecto_activos`): "¿qué se le ha hecho a este terreno?".
- El margen real por sub-proyecto sale solo, con el CapEx compartido
  prorrateado y sin doble captura.

### Riesgos / a monitorear

- **Self-FK sin límite de profundidad.** Si alguien anida sub-proyectos
  de sub-proyectos, las vistas de agregación se complican. Mitigación:
  un `CHECK`/trigger que limite a 2 niveles si en la práctica nadie
  necesita más — se decide al ver uso real, no ahora.
- **La vista de prorrateo.** Es el punto con más lógica del schema v2;
  necesita tests. Se valida con los números reales de Lomas del Bosque
  en el Sprint 3.
- **`proyecto_activos` puede crecer mucho** (un fraccionamiento de 250
  lotes = 250 filas `output`). Es esperado; se indexa por `proyecto_id`
  y por `activo_id`.

### Trade-offs aceptados

- Recursión para el árbol completo de proyectos, a cambio de un modelo
  trivial — aceptable porque la profundidad real es 2.
- El prorrateo derivado vive en una vista (más lógica que mantener) a
  cambio de que nunca se desincronice de la base.

## Cambios a este ADR

Editar vía PR con cambio de estado: `propuesto → aceptado → implementado
(Sprint 2)`. La definición de "binding comprometido" (D3) se incorpora
cuando se cierre, antes del Sprint 4.
