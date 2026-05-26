# Iniciativa — KPIs en módulos operativos

**Slug:** `kpis-modulos`
**Empresas:** DILESA (v1) — patrón abierto a RDB/ANSA/COAGAN post-validación
**Schemas afectados:** ninguno (derivación client-side desde el mismo
dataset que la tabla; cero DDL nuevo)
**Estado:** planned
**Dueño:** Beto
**Creada:** 2026-05-25
**Última actualización:** 2026-05-25 (planning doc + promovida)

## Problema

Los módulos operativos de DILESA (Proyectos, Construcción, Ventas)
tienen tablas extensas con info densa, pero **no hay vista panorama**.
Para entender cómo va el módulo hay que:

- Abrir cada fila para mirar detalle, o
- Exportar a Excel y agregar a mano, o
- Mirar la tabla y contar a ojo ("¿cuántas ventas cerradas tengo este
  mes?", "¿cuál es mi pipeline en dinero?", "¿qué fase está más
  estancada?").

Pain points concretos:

1. **Ventas (1,425 registros + 17 fases)** — sin KPIs, la única forma
   de ver "$ del pipeline" o "días promedio estancado" es tabla manual.
2. **Tablas con info parcial** — algunas columnas importantes viven en
   la DB pero no se exponen en la tabla actual (auditar y exponer).
3. **Filtros sin contexto agregado** — cuando aplico filtro de "ventas
   de Lomas del Bosque", la tabla se filtra pero no sé el panorama
   filtrado (cuántas son, cuánto suman, en qué fase están).

Hoy el único módulo con KPIs reactivos es Playtomic — y es un patrón
que funciona: las cards arriba se recalculan junto con la tabla cuando
cambian los filtros, sin queries extra.

## Outcome esperado

1. **Strip de hasta 5 KPIs** sobre cada superficie operativa de DILESA,
   reactivos a los filtros de esa superficie (cuando cambia el filtro,
   recalculan en el mismo render que la tabla).
2. **Auditoría de columnas de tabla** por superficie en el mismo PR
   que el strip — si hay info importante oculta en la DB, exponerla
   (columna nueva, badge, o agregar al drawer si no cabe).
3. **ADR-034 "Module-level KPI strips"** con reglas KPI1-KPI7 para que
   el patrón se aplique consistente en futuros módulos/empresas.
4. **Patrón listo para piggyback** en RDB/ANSA — la primitiva
   `<ModuleKpiStrip>` ya existe y queda codificada en ADR; iniciativa
   hermana puede aplicarlo sin reinventar.

## Modelo conceptual

```
PRIMITIVAS (existentes)
  <ModuleKpiStrip stats={...} cols={4} />   ← components/module-page/
      cap soft de 5 por ADR-004 R3
      stat = { key, label, value, icon?, valueClassName? }

  useUrlFilters() / useSearchParams()       ← existente, multi-módulo

  KpiSection de Playtomic                    ← precedente vivo,
                                                misma idea ad-hoc

PATRÓN (nuevo, codificado en ADR-034)
  Hub o página
    ├── <ModuleKpiStrip stats={kpis}/>      ← derivado client-side
    ├── filtros (URL-synced)
    └── <DataTable rows={filteredRows}/>

  kpis = useMemo(() => deriveKpis(filteredRows), [filteredRows])
       (mismo dataset que alimenta la tabla → cero queries extra,
        cero drift posible entre tabla y KPIs)
```

**Reglas ADR-034 (KPI1-KPI7, escritas en Sprint 0, ver `docs/adr/034_module_kpi_strips.md`):**

- **KPI1** — Cap duro de 5 KPIs por strip. Si necesitas 6, replantea
  cuáles son las top 5 (ADR-004 R3). Si necesitas >5 dimensiones
  diferentes, son módulos distintos.
- **KPI2** — Derivación client-side desde el mismo dataset que la tabla.
  Cero queries adicionales en mount. Cero RPCs nuevos solo para KPIs.
- **KPI3** — KPIs son reactivos a los filtros activos. Cuando el filtro
  cambia, recalculan en el mismo render que la tabla.
- **KPI4** — Cada KPI debe disparar una decisión. "Total rows" sin
  contexto no cuenta. Si no puedes responder "¿qué haces si este número
  cambia?", probablemente no merece ser KPI.
- **KPI5** — `value` siempre `tabular-nums`. Sin datos: `—`. Con datos
  de espera (loading): skeleton. Cero "0" cuando es "sin datos
  todavía".
- **KPI6** — Formato canónico: monedas con `formatCurrency`, porcentajes
  con `formatPercent`, conteos enteros, fechas con `formatDateShort`.
  Coherente con lo que ya hace `lib/format/`.
- **KPI7** — Strip va arriba de los filtros (no entre filtros y tabla).
  Orden vertical canónico: KPIs → filtros → tabla. Consistente con
  Playtomic.

**Superficies en alcance v1 (DILESA Operativo, 11 posibles):**

| Módulo       | Superficies                                                          | Notas                                                                                             |
| ------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Proyectos    | 1 (página flat)                                                      | Datos cargados (Coda import). Golden migration limpia.                                            |
| Ventas       | 5 tabs: Ventas · Inventario · Fases · Clientes · Vendedores          | 1,425 ventas + 1,300 clientes. Punto de partida.                                                  |
| Construcción | 5 tabs: Obras · Contratos · Contratistas · Prototipos · Estimaciones | Datos escasos (Sprint 1 de `dilesa-construccion` apenas). **Diferir tabs sin datos suficientes.** |

**Lo que NO entra v1:**

- Charts/sparklines/trends. Solo cards numéricas.
- Filtros nuevos para abrir nuevas dimensiones (cada strip vive sobre
  los filtros existentes de su superficie).
- RDB/ANSA/COAGAN (follow-up con iniciativa hermana cuando el patrón
  esté validado).
- Estimaciones y otras superficies que aún no tienen datos productivos
  reales (codear el strip vacío es ruido — esperar al primer ciclo).

## Sprints

### Sprint 0 — ADR-034 + curaduría de KPIs por tab de Ventas

- **Hecho 2026-05-25**: `docs/adr/034_module_kpi_strips.md` con
  KPI1-KPI7 fijadas (cap duro de 5, derivación client-side,
  reactividad a filtros, decisión-driven, formato `—` vs `0`, formato
  canónico `lib/format/`, orden vertical canónico).
- Cerrar con Beto la lista final de KPIs por las 5 tabs de Ventas
  (proponer mi guess inicial, Beto corrige):
  - **Ventas (lista):** # ventas · $ pipeline · % cerradas · días
    promedio en fase actual · top vendedor
  - **Inventario:** disponibles · apartadas · vendidas · % ocupación ·
    $ inventario disponible
  - **Fases:** fase con más ventas activas · fase más demorada · #
    estancadas (>N días) · tiempo promedio pipeline completo · (5° por
    cerrar)
  - **Clientes:** total · % con expediente completo · # con venta
    activa · compra promedio · # repetidores
  - **Vendedores:** # activos · ventas en periodo · $ cerrado en
    periodo · promedio/vendedor · top vendedor
- Definir helpers compartidos `lib/kpis/` si emerge necesidad (por
  ejemplo `derivePipelineKpis(rows)`).

#### KPIs aprobados — Ventas (Sprint 0 parte B, 2026-05-25)

Beto aprobó la lista de los 5 KPIs × 5 tabs como está, con anotación
"por lo pronto nos vamos con estos y después pulimos" — los KPIs
débiles (marcados con ⚠) se ajustan en Sprint 1 si emerge fricción al
implementar.

##### Tab "Ventas" (lista, sub-slug `dilesa.ventas.lista`)

| #   | KPI                   | Cálculo                                           |
| --- | --------------------- | ------------------------------------------------- |
| 1   | Ventas                | `rows.length`                                     |
| 2   | Pipeline $            | `SUM(rows.precio)`                                |
| 3   | % cerradas            | `count(estado='cerrada') / total × 100`           |
| 4   | Días promedio en fase | promedio `today − fecha_entrada_fase_actual`      |
| 5   | Top vendedor          | `argmax(vendedor, count)` o por $ — decidir en S1 |

##### Tab "Inventario" (sub-slug `dilesa.ventas.inventario`)

| #   | KPI                     | Cálculo                                                                                                      |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | Disponibles             | `count(estado='disponible')`                                                                                 |
| 2   | Apartadas ⚠             | `count(estado='apartada')` — confirmar que estado existe en el modelo actual; si no, ajustar nombre o quitar |
| 3   | Vendidas                | `count(estado='vendida')`                                                                                    |
| 4   | % ocupación             | `(apartadas + vendidas) / total × 100`                                                                       |
| 5   | $ inventario disponible | `SUM(precio WHERE estado='disponible')`                                                                      |

##### Tab "Fases" (sub-slug `dilesa.ventas.fases`)

| #   | KPI                      | Cálculo                                                                      |
| --- | ------------------------ | ---------------------------------------------------------------------------- |
| 1   | Fase más poblada         | `argmax(fase, count_ventas_en_fase)`                                         |
| 2   | Fase más demorada        | `argmax(fase, promedio_dias_en_fase)`                                        |
| 3   | # estancadas (>30 días)  | `count(rows WHERE dias_en_fase > 30)`                                        |
| 4   | Tiempo promedio pipeline | promedio `fecha_cierre − fecha_inicio` (cerradas)                            |
| 5   | Tasa de avance ⚠         | % que avanzaron ≥1 fase en últimos 30 días — débil, candidato a ajuste en S1 |

##### Tab "Clientes" (sub-slug `dilesa.ventas.clientes`)

| #   | KPI                         | Cálculo                                                                                                                     |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Total clientes              | `rows.length`                                                                                                               |
| 2   | % con expediente completo ⚠ | requiere definir qué docs son "requeridos" — si no está definido al implementar, dejar este KPI fuera y agregar 5° distinto |
| 3   | # con venta activa          | `count(rows WHERE tiene_venta_no_cerrada)`                                                                                  |
| 4   | Compra promedio $           | `SUM(precio) / count(clientes_con_compra)`                                                                                  |
| 5   | # repetidores               | `count(clientes WHERE ventas_count > 1)`                                                                                    |

##### Tab "Vendedores" (sub-slug `dilesa.ventas.vendedores`)

| #   | KPI                      | Cálculo                                     |
| --- | ------------------------ | ------------------------------------------- |
| 1   | # activos                | `count(vendedores con ≥1 venta en periodo)` |
| 2   | Ventas en periodo        | `SUM(count_ventas) cross vendedores`        |
| 3   | $ cerrado en periodo     | `SUM(precio WHERE estado='cerrada')`        |
| 4   | Promedio ventas/vendedor | `total_ventas / activos`                    |
| 5   | Top vendedor             | `argmax(vendedor, $ cerrado)`               |

**Notas de implementación de Sprint 1:**

- Si "Apartadas" no existe como estado real en el modelo, ajustar
  nombre del KPI a lo que sí existe (ej. "En proceso") o eliminar y
  promover otro KPI desde la lista candidata.
- "% con expediente completo" requiere que `expediente_completo`
  esté definido como regla en código o DB. Si no, dejar fuera y
  agregar un 5° KPI alternativo (candidato: "$ cliente promedio
  histórico" o "% con datos fiscales").
- "Tasa de avance" (Fases KPI5) puede pasar a "% que avanzaron al
  menos una fase en 30 días" o reemplazarse por algo más directo
  cuando se implemente.
- "Top vendedor" aparece en Ventas KPI5 y Vendedores KPI5 — ambos
  válidos porque cada tab tiene su propio filtro/contexto; si Beto al
  ver en prod siente redundancia, reemplazar el de Ventas por algo
  específico de la fila (ej. "Proyecto más vendido en el periodo").

### Sprint 1 — Ventas (golden migration del patrón)

- 5 PRs (1 por tab) o 1 PR con 5 commits, según facilidad de revisión.
  Preferencia: **5 PRs chicos** porque cada tab tiene su lógica de
  derivación distinta y revisar 1 PR por superficie es más limpio.
- Por tab:
  1. Auditar columnas de la tabla actual contra la DB. Si hay
     información importante oculta, exponerla (columna, badge en cell
     existente, o sección nueva en drawer).
  2. Derivar KPIs client-side desde el mismo array que alimenta la
     tabla.
  3. Insertar `<ModuleKpiStrip>` arriba de los filtros.
  4. Smoke test: cambiar filtros y validar que KPIs y tabla cambian
     coherente (cero drift visual).
- Documentar en CLAUDE.md del repo el patrón canónico una vez que
  Ventas esté en prod (sección nueva "Reglas UI > KPIs en módulos").

### Sprint 2 — Proyectos (1 página flat)

- Auditoría de columnas + strip de 5 KPIs.
- 1 PR. Sirve como confirmación de que el patrón aplica a páginas sin
  tabs.
- KPIs propuestos (cerrar con Beto):
  - # proyectos activos
  - $ total invertido
  - # unidades totales en el portafolio
  - % completado promedio (si aplica métrica de avance)
  - Próximo hito por proyecto (más relevante)

### Sprint 3 — Construcción (parcial — solo tabs con datos)

- Bloqueado parcialmente por `dilesa-construccion` Sprint 1 (sin datos
  reales todavía).
- En cuanto haya datos productivos, codear strips en este orden:
  1. **Obras** — # obras activas · % avance promedio · días sin
     palomeo · contratista más activo · $ valor MO pendiente
  2. **Contratistas** — # activos · $ pendiente de pago acumulado ·
     # tareas terminadas última semana · top contratista · saldo
     retención acumulada
  3. **Contratos** — # vigentes · $ total contratado · % consumido
     promedio · contratos sin tareas en últimos N días · próximo
     vencimiento
  4. **Prototipos** — # activos · costo promedio MO · tareas plantilla
     promedio · prototipo más usado · (5° por cerrar)
  5. **Estimaciones** — esperar primer ciclo operativo
     (`dilesa-estimaciones`) antes de codear; KPIs naturales: $
     pendiente de pago · # en borrador · # aprobadas pendientes pago ·
     días promedio borrador→pagada · top contratista periodo.
- Sub-tabs sin datos suficientes quedan diferidas explícitamente en
  bitácora; se retoman cuando masa crítica de datos.

### Sprint 4 — Closeout

- Si el patrón quedó codificado limpio en Ventas y Proyectos,
  documentar en `docs/architecture/ARCHITECTURE.md` §5 (Reglas UI)
  con link al ADR-031.
- Refresh de planning doc + INITIATIVES.md.
- Iniciativa hermana propuesta (`rdb-kpis-modulos`) si Beto la quiere
  para RDB.

## Decisiones registradas

- **2026-05-25** (D1): arrancar por Ventas. (Why: tiene los datos
  productivos cargados — 1,425 ventas + 1,300 clientes. Máximo
  aprendizaje real del patrón antes de replicar.)
- **2026-05-25** (D2): KPIs por tab/sub-página, no por hub padre. (Why:
  cada tab tiene su universo de datos y sus filtros propios; un strip
  cross-tab arriba del strip de tabs sería confuso y no reaccionaría a
  los filtros locales.)
- **2026-05-25** (D3): auditoría de columnas de tabla en el mismo PR
  que el strip de KPIs. (Why: Beto pidió textual "tener los datos a
  simple vista" — los KPIs son la mitad superior, la tabla bien
  expuesta es la mitad inferior; separarlos en iniciativas distintas
  fragmenta el outcome.)
- **2026-05-25** (D4): patrón global desde el inicio con ADR-034. (Why:
  si dejamos las reglas para "después de validar", terminamos con 6
  strips inconsistentes en empresas distintas y reescribimos al
  consolidar. Mejor codificar reglas duras desde Sprint 0 y ajustarlas
  con incidentes reales si surgen.) Numeración: 031-033 ya tomados
  (`rdb_waitry_dedup_heuristic`, `dilesa_construccion_modelo`,
  `dilesa_estimaciones_modelo`); este ADR es 034.
- **2026-05-25** (D5): derivación client-side desde el mismo dataset
  que la tabla, no vistas DB nuevas. (Why: cero queries extras, cero
  drift posible entre KPI y tabla, patrón Playtomic ya validado en
  prod.)
- **2026-05-25** (D6): usar `<ModuleKpiStrip>` canónico (cap duro de 5)
  en lugar del patrón Playtomic `<KpiCard>` libre. (Why: el cap suave
  de 5 es disciplina sana — fuerza priorizar. Si una superficie
  necesita 6+, es señal de que hay un módulo escondido que merece ser
  superficie separada.)
- **2026-05-25** (D7): KPI3 "% cerradas" → "% Escrituradas" en Ventas
  tab 1. Implementando Sprint 1 descubrí que `dilesa.ventas.estado`
  solo tiene `activa | desasignada`; no existe estado "cerrada".
  "Cerrada" en bienes raíces significa "escriturada" → `numero_escritura
IS NOT NULL` es la señal canónica de venta completada. Wording
  "% Escrituradas" es más preciso para el negocio que "% cerradas".
  (Why: la auditoría empírica del schema reveló que mi curaduría
  asumía un estado que no existe.)
- **2026-05-25** (D8): KPI4 "Días promedio en fase actual" → "Avance
  promedio" en Ventas tab 1. No existe `fecha_entrada_fase_actual`
  en el modelo; cargarlo requeriría query extra al `dilesa.venta_fases`
  que rompería KPI2 (derivación 100% client-side desde el dataset
  de la tabla). Reemplazado por `mean(fase_posicion) / max(fase_posicion)`
  expresado como `formatPercent` — proxy directo del avance global
  en el pipeline de 17 fases. (Why: si una venta avanza, su
  `fase_posicion` sube. El promedio del dataset filtrado es exactamente
  "qué tan avanzadas están las ventas que estoy viendo".)
- **2026-05-26** (D9): Inventario tab 2 — la curaduría original
  ("Disponibles · Apartadas · Vendidas · % ocupación · $ inventario
  disponible") asumía un universo completo. Auditoría reveló: (1) no
  existe estado "apartada" en `dilesa.unidades` (estados reales:
  `planeada`, `lote_urbanizado`, `en_construccion`, `terminada`,
  `vendida`), (2) el módulo Inventario es vista comercial — solo trae
  `en_construccion` + `terminada` (vendibles ahora), no el universo.
  KPIs sobre vendidas/no-vendibles requerirían query extra que rompería
  KPI2. KPIs ajustados a panorama de "qué está disponible para vender
  ahora": Disponibles, En construcción, Terminadas, Valor disponible,
  Días promedio en inventario. Este último es un KPI excelente que
  emergió: `mean(diasInventario)` dispara decisión ("¿se están
  estancando?"). (Why: respetar KPI2 al 100% y mostrar lo que importa
  del universo de la tabla, no forzar KPIs sobre datos ausentes.)
- **2026-05-26** (D10): Fases tab 3 — la curaduría original tenía 3 de
  5 KPIs dependientes de campos inexistentes en `dilesa.ventas`: "Fase
  más demorada" + "# estancadas (>30 días en fase)" + "Tiempo promedio
  pipeline" + "Tasa de avance" (marcada ⚠) — todos requieren
  `fecha_entrada_fase_actual` o `fecha_cierre`, ninguno existe (solo
  hay `created_at` de la venta). Pivote: usar `days_since(created_at)`
  como proxy del tiempo en pipeline (no es "en fase" pero sí "viva en
  el sistema"). KPIs ajustados: Activas, Fase más poblada
  (`argmax(fase, count)` formato "Nombre (N)"), Días promedio en
  pipeline, Estancadas >180d, Avance promedio (mismo cálculo que tab
  Ventas). Helper movido a `lib/dilesa/kpis/fases.ts` porque Fases es
  page directo (no module exportable). (Why: respetar KPI2 al 100%,
  usar el campo disponible más informativo. 180d es threshold de
  estancamiento razonable para inmobiliario donde el ciclo típico es
  6-12 meses.)
- **2026-05-26** (D11): Helpers de KPI viven en
  `lib/<empresa>/kpis/<tab>.ts` cuando el módulo es page directo
  (no module exportable). Cuando es un `<Module>` exportable, la
  derivación queda dentro del module file mismo. (Why: minimizar
  fricción de imports, mantener la derivación cerca del consumer real
  excepto cuando se necesita para testing.)
- **2026-05-26** (D12): Clientes tab 4 — el KPI "% con expediente
  completo" estaba marcado ⚠ en curaduría sin definición clara de
  qué docs componen el expediente. Reinterpretado como "% contactables"
  (`email != null OR telefono != null`) que es la única señal de
  "completitud" derivable hoy y dispara una decisión clara ("¿a quién
  no puedo contactar?"). Si en el futuro DILESA define un set de
  documentos requeridos (RFC, CURP, INE, comprobante de domicilio,
  etc.), este KPI se puede actualizar para reflejar esa definición.
  (Why: KPI accionable HOY beats KPI conceptualmente correcto pero
  no derivable.)

## Bitácora

- **2026-05-25** — Promovida a iniciativa formal tras Q&A con Beto
  (4 decisiones cerradas: Ventas primero, KPIs por tab, auditoría de
  tabla en mismo PR, patrón global con ADR-034). Planning doc creado
  - fila en INITIATIVES.md.
- **2026-05-25** — Sprint 0 parte A: ADR-034 escrito con KPI1-KPI7
  (cap duro de 5, derivación client-side, reactividad a filtros,
  decisión-driven, `—` vs `0`, formato canónico, orden vertical).
- **2026-05-25** — Sprint 0 parte B: curaduría aprobada por Beto sin
  cambios — 5 KPIs × 5 tabs ("por lo pronto nos vamos con estos y
  después pulimos"). 3 KPIs marcados ⚠ para ajustar en Sprint 1 si
  emerge fricción al implementar (Apartadas, % expediente completo,
  Tasa de avance). Tabla completa en sección "KPIs aprobados —
  Ventas" arriba. Sprint 0 cerrado y mergeado en PR #529.
- **2026-05-25** — Sprint 1 tab 1 ("Ventas"): strip de 5 KPIs reactivo
  a los filtros (proyecto, fase, estado, búsqueda) + auditoría de
  columnas reveló que `fecha_escritura` y `numero_escritura` eran info
  importante oculta — se agrega columna "Escritura" a la tabla.
  Test file con 12 unit tests (`components/dilesa/ventas-module.test.ts`)
  cubre derivación, formato, edge cases (sin rows, vendedor null,
  precio null) y reactividad a filtros. Pivote crítico vs curaduría
  original — ver decisión D7 y D8. PR #531 mergeado.
- **2026-05-26** — Sprint 1 tab 2 ("Inventario"): strip de 5 KPIs +
  auditoría agrega columna `m2_construccion` (estaba en DB no en
  lista). Pivote D9 vs curaduría: no existe estado "apartada" en el
  schema, y el módulo solo trae unidades vendibles (`en_construccion` +
  `terminada`, no el universo). KPIs ajustados a "qué está disponible
  para vender ahora": Disponibles, En construcción, Terminadas, Valor
  disponible ($), Días promedio en inventario. Respeta KPI2 al 100%
  sin queries extras. Test file con 8 unit tests. PR #532 mergeado.
- **2026-05-26** — Sprint 1 tab 3 ("Fases"): strip de 5 KPIs sobre el
  pipeline global. Pivote D10 mayor — 3 KPIs de la curaduría dependían
  de campos inexistentes; reemplazados por proxies derivables del
  `created_at`. Helper movido a `lib/dilesa/kpis/fases.ts` (D11,
  patrón para pages directos). 9 unit tests con `now` inyectable para
  estabilidad. Fases no tiene tabla — la auditoría no aplica.
  PR #533 mergeado.
- **2026-05-26** — Sprint 1 tab 4 ("Clientes"): strip de 5 KPIs sobre
  la agregación de ventas por persona. Pivote D12 reinterpreta el KPI
  "% con expediente completo" (marcado ⚠ en curaduría sin definición
  clara) como "% contactables" — único proxy derivable client-side:
  `count(email != null OR telefono != null) / total`. Resto 4 KPIs
  siguen curaduría: Total clientes, # con venta activa, # repetidores
  (numVentas > 1), Compra promedio. Helper en `lib/dilesa/kpis/clientes.ts`.
  8 unit tests. Auditoría no agrega columnas — la tabla ya muestra
  contacto embebido bajo el nombre. **Próximo: Sprint 1 tab 5
  ("Vendedores")**.

## Riesgos / open topics

- **R1** — Curaduría débil = KPIs ruido. **Mitigación:** Sprint 0
  cierra la lista contigo antes de codear cada tab. Cada PR de tab
  re-valida los 5 KPIs propuestos con captura de pantalla del strip
  pre-merge.
- **R2** — Construcción casi sin datos productivos → strips vacíos
  feos. **Mitigación:** diferir tabs sin datos explícitamente en
  Sprint 3. Documentar en bitácora qué tabs quedaron pendientes y
  cuándo retomarlas.
- **R3** — Auditoría de columnas puede explotar el alcance de cada
  PR. **Mitigación:** topar la auditoría a "info ya en la DB que no
  se expone". Cambios de modelo o columnas calculadas nuevas viven en
  iniciativa separada, no se cuelan aquí.
- **R4** — KPIs que requieren cálculos pesados (ej. "días promedio en
  fase actual" sobre 1,425 ventas) pueden volverse lentos en client.
  **Mitigación:** medir con DevTools en Sprint 1. Si pasa de ~50ms el
  derive, mover al server (RSC) o memoizar con clave estable.
- **R5** — `<ModuleKpiStrip>` cap de 5 puede pelearse con superficies
  donde 6 KPIs son legítimos. **Mitigación:** ADR-031 KPI1 documenta
  que el cap es duro; si surge un caso justificado, se abre debate
  para ajustar el ADR — no se hace excepción silenciosa.
- **R6** — Playtomic usa 6 KPIs hoy (`KpiSection`). ¿Lo refactorizamos
  a `<ModuleKpiStrip>` para que sea consistente? **Por cerrar:**
  decidir en Sprint 4 si Playtomic se incluye en el barrido o queda
  como excepción documentada en ADR.

## Métricas de éxito

1. **Decisión más rápida**: Beto reporta que abre menos veces el detalle
   de una venta solo para revisar dato agregado (porque el KPI ya lo
   muestra arriba).
2. **Filtro útil**: aplicar un filtro en Ventas (ej. "ventas de proyecto
   X") cambia los 5 KPIs y el cambio es informativo, no solo cosmético.
3. **ADR-031 vivo**: en 2-3 meses, nueva superficie operativa codeada
   en RDB/ANSA aplica el patrón sin reinventar y sin necesitar
   "consultoría" de la primitiva.
4. **Cero drift entre KPI y tabla**: ningún incidente donde un KPI
   muestre dato distinto al que se calcula sumando la tabla a mano.
