# Iniciativa — Filtros por fecha + columnas adicionales en tablas DILESA

**Slug:** `dilesa-tablas-filtros-columnas`
**Empresas:** DILESA
**Schemas afectados:** ninguno (solo cambios de UI sobre los módulos existentes)
**Estado:** done
**Dueño:** Beto
**Creada:** 2026-05-26
**Última actualización:** 2026-05-26 (cerrada — Sprint 1 + Sprint 2 mergeados)

## Problema

Beto observó dos huecos en las 8 tablas con listado en DILESA:

1. **Faltan filtros de fecha.** Los módulos tienen búsqueda de texto y
   dropdowns (contratista, proyecto, estado), pero no permiten acotar
   por rango de fechas. Operativamente esto vuelve incómodo responder
   "¿qué pasó este mes?" o "¿qué cerró en el último trimestre?". Las
   tablas crecen monotónicamente y sin filtro temporal se vuelven más
   pesadas con el tiempo.

2. **Hay columnas ocultas con información relevante.** Los queries del
   módulo ya traen del schema más campos de los que se renderizan. En
   varios módulos hay fechas, costos y campos de referencia que
   ayudarían al operador sin requerir abrir el detalle de cada fila.

## Outcome esperado

- Cada módulo con tabla DILESA donde tenga sentido permite filtrar por
  rango de fechas (desde / hasta) sobre el campo principal del dominio.
- Las columnas que Beto identificó como útiles quedan visibles en la
  tabla. Las tablas anchas (obras, proyectos) usan scroll horizontal
  por construcción (las pages ya son `desktop-only`).

## Alcance v1 cerrado

### Filtros de fecha — rango libre (desde / hasta)

| Módulo       | URL                                                  | Campo principal   | Filtros adicionales                      |
| ------------ | ---------------------------------------------------- | ----------------- | ---------------------------------------- |
| Estimaciones | `/dilesa/construccion/estimaciones`                  | `fecha_cierre`    | + 2do filtro por `pagada_at` (cash flow) |
| Obras        | `/dilesa/construccion`                               | `fecha_arranque`  | —                                        |
| Contratos    | `/dilesa/construccion/contratos`                     | `fecha_contrato`  | —                                        |
| Ventas       | `/dilesa/ventas`                                     | `fecha_escritura` | —                                        |
| Proyectos    | `/dilesa/proyectos`                                  | `fecha_inicio`    | —                                        |
| Inventario   | `/dilesa/inventario` (y `/dilesa/ventas/inventario`) | `created_at`      | —                                        |

Skipped por no tener fecha propia natural: Contratistas, Prototipos, Portafolio.

### Columnas adicionales a exponer

| Módulo       | Cols hoy | Cols nuevas                                                                                                                                         | Total |
| ------------ | -------: | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----: |
| Estimaciones |        7 | +`fecha_pago_programado`, +`pagada_at`                                                                                                              |     9 |
| Obras        |        8 | +`fecha_terminada`, +`supervisor`, +`fecha_seguro_calidad`, +`fecha_paquete_ruv`, +`fecha_dtu`                                                      |    13 |
| Proyectos    |        7 | +`clave_interna`, +`area_vendible_m2`, +`fecha_licencia`, +`costo_terreno`, +`costo_urbanizacion`, +`costo_construccion`, +`costo_comercializacion` |    14 |
| Ventas       |        9 | +`tipo_credito`                                                                                                                                     |    10 |

`numero_escritura` NO se expone (decisión explícita de Beto — sigue
disponible en el detalle).

### Tablas que no cambian columnas

Contratos, Contratistas, Prototipos, Portafolio, Inventario, Ventas-inventario.
Ya están completas — no había columnas relevantes ocultas o
explícitamente excluidas.

## Modelo conceptual

Primitive nuevo: `components/filters/date-range-filter.tsx`. Componente
controlado con 2 inputs `type="date"` (desde, hasta) en flex row,
estética consistente con los `<select>` existentes (`h-9 rounded-md
border`). Acepta `value={{from, to}}` + `onChange()`. Helper
`isInDateRange(value, range)` que normaliza a `YYYY-MM-DD`.

Cada módulo:

- 1-2 `useState` para el rango (algunos como Estimaciones llevan 2).
- Añade el componente a la barra de filtros.
- Extiende el `useMemo` de filtrado existente con la comparación de
  rango.

Cero cambios en SQL/RPC — todo es client-side sobre los datasets que
los módulos ya cargan.

## Sprints

### Sprint 1 — Filtros de fecha

- Crear `<DateRangeFilter>` + helper `isInDateRange()`.
- Aplicar a los 6 módulos (estimaciones lleva 2 filtros).
- 1 PR.

### Sprint 2 — Columnas adicionales

- Editar el array de `columns` en los 4 módulos.
- Estimaciones: 2 cols nuevas. Obras: 5. Proyectos: 7. Ventas: 1.
- Para obras y proyectos la tabla queda con 13-14 cols → scroll
  horizontal. Si después se siente mucho, hacemos Sprint 2.5 con
  "columnas avanzadas" colapsables.
- 1 PR.

### Closeout

- Planning doc → done + bitácora.
- INITIATIVES.md → fila de Activas a Done.
- 1 PR aparte (docs only).

## Decisiones registradas

- **2026-05-26** (alcance): solo DILESA. RDB / otras empresas quedan
  para iniciativa hermana si el patrón es útil.
- **2026-05-26** (UX): rango libre (desde / hasta con date pickers),
  no presets. Más simple de implementar; presets se pueden sumar
  después si Beto los pide.
- **2026-05-26** (proceso de columnas): audit guiado — CC pasa lista,
  Beto decide. Decisión por Beto en chat 2026-05-26 sobre el reporte
  del audit. `numero_escritura` excluido explícitamente.
- **2026-05-26** (ancho de tablas): obras y proyectos quedan 13-14
  cols. Aceptado scroll horizontal porque ya son `desktop-only`. Si
  molesta en uso, abrir Sprint 2.5 con columnas colapsables.

## Bitácora

- **2026-05-26** — Promovida tras audit + Q&A con Beto. Planning doc
  - fila en INITIATIVES.md.
- **2026-05-26** — Sprint 1 mergeado (PR #540): primitive
  `<DateRangeFilter>` + helper `isInDateRange()` + 7 tests +
  aplicación a los 6 módulos (estimaciones lleva 2 filtros). Cero
  queries nuevas a DB.
- **2026-05-26** — Sprint 2 mergeado (PR #541): columnas adicionales
  en 4 módulos. Estimaciones 7→9, Obras 8→13, Proyectos 7→14,
  Ventas 9→10. SELECT de obras extendido con 3 hitos RUV/DTU/calidad;
  lookup de personas en obras ya no filtra por tipo para resolver
  supervisores en el mismo round-trip.
- **2026-05-26** — Iniciativa cerrada. Sprint 2.5 (columnas
  colapsables) queda como salida si la densidad molesta en uso.

## Riesgos / open topics

- **R1**: Obras y proyectos con 13-14 columnas. Si en uso real se
  siente abrumador, queda Sprint 2.5 como salida.
- **R2**: Si en el futuro algún módulo necesita filtro server-side
  (paginación), el primitive es controlled y se adapta sin reescribir.
- **R3**: Default del filtro vacío (sin rango). No se carga nada con
  defaults agresivos para no sorprender al operador (que vería menos
  rows que antes). El operador elige cuándo acotar.

## Métricas de éxito

1. Beto puede contestar "¿qué pasó este mes/trimestre?" sin descargar
   a Excel.
2. El operador no necesita abrir cada fila para ver fechas / costos
   relevantes — están en la tabla.
3. Cero queries nuevas a la DB (verificación: el sync nocturno no
   muestra columnas adicionales en la tabla `Conteos` del email).
