# Iniciativa — Portafolio de Activos DILESA

**Slug:** `dilesa-portafolio-activos`
**Empresas:** DILESA (Desarrollo Inmobiliario Los Encinos S.A. de C.V.)
**Schemas afectados:** `dilesa` (rediseño completo del schema, deprecación de
las tablas viejas), `core.empresas` (lectura)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-05-08
**Última actualización:** 2026-05-22 (Sprints 1, 2 y 4 completados;
Sprint 3 en curso — importación desde Coda por fases: Fase 1 (25
terrenos), Fase 2 (5 anteproyectos + 8 proyectos) y Fase 3 (1,590
unidades + 14 productos) cargadas en prod. Próximo: Fase 4 (ventas —
pipeline de 17 fases, requiere extender el schema con tablas de
comercialización). D2 cerrada en ADR-010; D1 y D3 abren la fase de
captura/detalle de la UI.)

## Problema

El schema `dilesa` actual y los módulos UI mergeados (`Terrenos`,
`Anteproyectos`, `Proyectos`, `Prototipos`) replican un pipeline lineal
heredado de Coda:

> `Terreno → Anteproyecto → Proyecto → Prototipo → Lote → Urbanización +
Construcción → Inventario → Cliente → Venta`

Ese pipeline está **cosido a fraccionamiento de vivienda**. La operación real
de DILESA no cabe ahí:

1. **El Coda actual ya tiene un anteproyecto "Mixto" sin margen calculado**
   (Lomas del Bosque). El modelo financiero del anteproyecto en Coda calcula
   `Cantidad Lotes × Costo/Lote × Margen` — un cálculo válido para
   fraccionamiento puro, imposible para uso mixto.
2. **DILESA tiene en pipeline 4 tipos de proyecto distintos**: fraccionamiento
   de vivienda (su core histórico), plazas comerciales (2 en desarrollo),
   complejo de departamentos duplex para renta (1 anteproyecto vivo) y
   bodegas industriales (terrenos comprados, sin desarrollar). Solo
   fraccionamiento tiene proceso aceitado y data histórica útil.
3. **Activos operativos puros no encajan en el pipeline**: espectaculares y
   unipolares generan renta sin desarrollo. Hoy no tienen lugar conceptual
   limpio en el schema.
4. **Los anteproyectos en Coda son lineales a un solo objetivo**: no se puede
   modelar un terreno con varios anteproyectos compitiendo en paralelo
   (residencial alto vs medio vs plaza vs renta) ni preservar memoria
   institucional de los descartes con su razón.
5. **Los lotes individuales pierden trazabilidad** una vez vendidos o
   conservados — el "proyecto" los absorbe.
6. **Los 4 módulos UI mergeados (`Terrenos`, `Anteproyectos`, `Proyectos`,
   `Prototipos`) nunca tuvieron captura productiva**. Fueron una migración
   apurada de tablas desde Coda sin planeación operativa. La
   `analytics.mv_dilesa_pipeline` está vacía precisamente por eso. No hay
   data productiva que preservar ni flujos vivos que cuidar.

Resultado operativo: la migración Coda → BSOP que llevamos arranca con un
schema que no soporta la operación real, y va a llegar al primer caso mixto
(Lomas del Bosque) y romperse. La buena noticia es que como nada se ha
usado productivamente, podemos cortar limpio sin pérdida.

## Outcome esperado

- **Modelo nuevo**: portafolio de **Activos** ↔ **Proyectos** con jerarquía
  padre/hijo en ambos. Soporta todos los tipos de activo y de proyecto
  (fraccionamiento, plaza, complejo de departamentos en renta, bodega
  industrial, espectacular, casa, local, edificio). Detalle en
  [§ Modelo conceptual](#modelo-conceptual-propuesto).
- **Caso piloto Lomas del Bosque cargado completo** en el schema nuevo (10.5
  ha, 156 unidades, 1 proyecto madre + **4 streams de valor que se
  descomponen en 7 sub-proyectos** — porque las 4 plazas comerciales son
  sub-proyectos paralelos individuales, no uno consolidado) como prueba de
  fuego de la abstracción.
- **Schema viejo (`dilesa.terrenos`, `dilesa.anteproyectos`,
  `dilesa.proyectos`, `dilesa.prototipos` y derivadas) borrado en Sprint 1**
  (no al final) — greenfield para construir el modelo nuevo sin convivencia
  paralela. Posible porque nada se usó productivamente: los 4 anteproyectos
  vivos siguen en Coda, no en BSOP.
- **UI mergeada de los 4 módulos viejos eliminada en Sprint 1** junto con el
  schema. Los PRs viejos quedan como referencia en git, no se pierde
  historial. Los 4 anteproyectos vivos en Coda se migran **directamente
  desde Coda al modelo nuevo** sin pasar por un schema intermedio:
  - **Sprint 3** carga Lomas del Bosque (caso piloto que valida la
    abstracción).
  - **Sprint 5** migra los otros 3 (Loma Escondida, Lomas de los Encinos,
    Lomas de las Delicias) y cierra la iniciativa.
- **Plantillas editables, no fijas** por tipo de proyecto: rica para
  fraccionamiento (donde hay know-how histórico), mínimas y editables para
  los demás. Cada plantilla "gradúa" cuando completa su segundo o tercer
  proyecto.

## Modelo conceptual propuesto

```
ACTIVO                         (atómico, en el portafolio)
  · tipo: terreno | espectacular | casa | local | plaza |
          edificio | nave | departamento | lote | infraestructura | …
  · estado: prospecto → adquirido → operando |
            en_intervención | desincorporado
  · ficha base: ubicación geo, área, propietario,
                situación legal/fiscal, valor, plan financiero base
  · ficha tipo-específica (satélite por tipo, no columnas en master)
  · operación actual (contratos/rentas si aplica)
  · jerarquía: padre opcional, N hijos
  · historia de proyectos asociados (a lo largo del tiempo)

PROYECTO                       (intervención sobre uno o varios activos)
  · tipo: anteproyecto | desarrollo | remodelación | reconversión |
          subdivisión | comercialización | operación
  · estado: propuesta → análisis → aprobado →
            ejecutando → completado | archivado
  · activos_input []     (1 o varios, ej. terreno + plaza vecina)
  · activos_output []    (sub-activos generados al ejecutar)
  · proyectos_hermanos[] (anteproyectos compitiendo entre sí)
  · proyecto_predecesor  (si viene de un anteproyecto ganador)
  · proyecto_padre       (si es sub-proyecto de un proyecto madre)
  · presupuesto vs costo real · hitos · tareas · documentos · responsables
  · plantilla_id (define las tareas, sub-hitos y KPIs específicos del tipo)

PRODUCTO                       (catálogo del proyecto, no global)
  · "unidad-tipo" comercializable o rentable
    – Fraccionamiento → Prototipo de vivienda (modelo A, B, C…)
    – Plaza comercial → Tipo de local (anchor, intermedio, kiosco)
    – Bodega industrial → Módulo / Nave-tipo
    – Departamentos    → Típica (1 rec, 2 rec, PH)
  · cuando dos sub-proyectos coinciden en producto idéntico,
    se promueve a catálogo cross-proyecto (más adelante, no al revés)

UNIDAD                         (la pieza física granular vendible/rentable)
  · Fracc → Lote · Plaza → Local · Bodega → Nave/Módulo
  · Edif → Departamento · Espectacular → la cara individual
  · cada UNIDAD entra al portafolio como ACTIVO propio cuando se libera
    comercialmente (cierra el ciclo: el desarrollo escupe activos)
  · binding flexible Unidad ↔ Producto: una misma Unidad puede ofrecerse
    como varios Productos (lote desnudo o lote con casa A o lote con casa B);
    la modalidad se cierra al firmar venta/contrato
  · binding flexible Unidad ↔ Sub-Proyecto: la modalidad de salida puede
    cambiar mientras la Unidad no esté comprometida
```

### Cambios respecto al pipeline viejo

| Concepto viejo                                                               | Concepto nuevo                                                  | Razón                                                                                                        |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `Terrenos`                                                                   | `Activos` (tipo: `terreno`)                                     | El terreno es un caso del concepto Activo, no una entidad raíz aparte.                                       |
| `Anteproyectos` separados de `Proyectos`                                     | `Proyectos` con tipo `anteproyecto`/`desarrollo`/etc.           | Necesitamos ver el árbol completo (4 hermanos → 1 ganador → 1 desarrollo → N sub-activos) en una sola vista. |
| `Prototipos` (catálogo global de modelos de vivienda)                        | `Productos` (catálogo del proyecto, polimórfico por tipo)       | Prototipo asume vivienda. Producto abre a tipos de local, módulos, típicas.                                  |
| `Lotes` (asume residencial)                                                  | `Unidades` (con discriminator por tipo)                         | Lote, local, nave, departamento son la misma cosa lógica con distinto nombre operativo.                      |
| `Inventario` separado                                                        | `Activos` con `estado=operando`                                 | Toda Unidad libre de comprometer es un Activo en el portafolio; el "Inventario" es una vista.                |
| `Urbanización por Lote` + `Construcción por Lote` (etapas hardcoded a fracc) | Plantillas de Proyecto editables por tipo                       | Las fases despalme/trazo/redes/pavimento son del fraccionamiento. Plaza, bodega, depto tienen otras.         |
| Pipeline lineal                                                              | Grafo histórico con jerarquía padre/hijo en proyectos y activos | Un proyecto madre tiene N sub-proyectos; un activo padre (plaza) tiene N hijos (locales).                    |

## Caso piloto: Lomas del Bosque

Validación operativa de la abstracción. Datos reales del plano de
lotificación (agosto 2023, vigente).

**Activo raíz:**

- Terreno "Fracción Escritura 190" — 104,959.62 m² (~10.5 ha) — propietario
  DILESA — Sur-poniente PN, acceso por Lib. V. Carranza y Blvd. Centenario.

**Proyecto madre:**

- "Desarrollo Lomas del Bosque" — tipo `desarrollo_mixto`. Alcance:
  urbanización general (vialidades, banquetas, áreas verdes, canales 1 y 2,
  redes), lotificación, autoridad municipal. CapEx compartido prorrateado
  por m² beneficiados (regla documentada).

**Composición del polígono (output físico del proyecto madre):**

| Concepto                                    | m²          | %        | Unidades                 |
| ------------------------------------------- | ----------- | -------- | ------------------------ |
| Privada 1 (H-4) habitacional                | 12,074      | 11.5%    | 77 lotes                 |
| Privada 2 (H-2) habitacional                | 23,545      | 22.4%    | 74 lotes                 |
| Habitacional duplex                         | 1,142       | 1.1%     | 1 lote (futuro complejo) |
| Comercial 1                                 | 1,099       | 1.0%     | 1 lote (plaza)           |
| Comercial 2                                 | 3,547       | 3.4%     | 1 lote (plaza)           |
| Comercial 3                                 | 1,605       | 1.5%     | 1 lote (plaza)           |
| Comercial 4 (anchor)                        | 26,248      | 25.0%    | 1 lote (plaza)           |
| Áreas verdes (5) + canales (2) + vialidades | ~35,700     | 34.0%    | infraestructura          |
| **Total**                                   | **104,960** | **100%** | **156 vendibles**        |

**Sub-proyectos (4 streams de valor):**

1. **Comercialización Lotes Residenciales H-2 desnudos** (`comercializacion`)
   — subset de los 74 lotes Privada 2; venta de lote urbanizado.
2. **Casas Residencial Medio H-4** (`desarrollo_vivienda`) — los 77 lotes
   Privada 1 con casa construida; productos = prototipos de vivienda;
   output_activos = casas terminadas.
3. **Plaza Comercial 1/2/3/4** (`desarrollo_plaza_comercial`, 4 sub-proyectos
   paralelos) — un lote comercial cada uno; productos = tipos de local;
   output_activos = plaza-padre + N locales-hijos. **Modalidad dual**: cada
   plaza puede ir como construir-y-rentar, construir-y-vender, vender lote
   desnudo, o híbrido (rentar unos locales, vender otros).
4. **Complejo Duplex** (`desarrollo_renta_residencial`) — el lote duplex;
   producto = típica duplex; output_activos = complejo-padre + N unidades
   duplex hijas (rentables individualmente).

**Defaults operativos para el modelo financiero v1**:

- H-2 (74 lotes Privada 2) → lote desnudo urbanizado.
- H-4 (77 lotes Privada 1) → casa construida.
- Comerciales (4 lotes) → ambas opciones (renta y venta) en evaluación.
- Binding Unidad ↔ Sub-proyecto es **híbrido y reclasificable** mientras la
  Unidad no esté comprometida con cliente.

**Lo que el caso valida** (si el modelo aguanta esto, aguanta los demás):

- Jerarquía padre/hijo en proyectos (madre + 4-7 sub-proyectos).
- Jerarquía padre/hijo en activos (plaza-padre con locales-hijos; complejo
  duplex con unidades-hijas).
- Binding flexible Unidad ↔ Producto y Unidad ↔ Sub-proyecto.
- Modelo financiero proyectado (defaults) vs comprometido (binding real).
- CapEx compartido prorrateado del proyecto madre a los sub-proyectos.

## Alcance v1

- [ ] **Sprint 1 — Demolición (DROP schema viejo + borrado UI vieja)**:
  - **Pausa explícita: aprobación verbal de Beto antes del DROP en
    producción** (regla operativa de migraciones DB destructivas).
  - **Pre-condición — snapshot defensivo**: antes del DROP, hacer
    `pg_dump --schema-only --schema=dilesa` + `--data-only --schema=dilesa`
    archivado fuera de Supabase (Synology o `tmp/dilesa-v1-snapshot-<fecha>.sql.gz`).
    Aunque las tablas están vacías de captura productiva, el snapshot deja
    rastro auditable de la estructura previa por si surge alguna pregunta
    legal/fiscal después. Coda sigue siendo SoT para los 4 anteproyectos
    vivos hasta Sprint 5.
  - Migración SQL `<timestamp>_dilesa_v1_drop.sql`:
    - `DROP TABLE` en cascada de `dilesa.terrenos`, `dilesa.anteproyectos`,
      `dilesa.proyectos`, `dilesa.prototipos` y todas sus derivadas
      (incluidas vistas y RPCs específicas del schema viejo).
    - `DROP MATERIALIZED VIEW analytics.mv_dilesa_pipeline` (vacía hoy,
      dependía del schema viejo).
    - Cleanup de `core.modulos`: borrar slugs de los 4 módulos viejos.
    - `NOTIFY pgrst, 'reload schema'` al final.
  - Borrado del UI mergeado:
    - Pages bajo `app/dilesa/` correspondientes a los 4 módulos.
    - Componentes específicos en `components/dilesa/...` (los del schema
      viejo, no los compartidos con otras empresas).
    - Helpers en `lib/dilesa/...` específicos del schema viejo.
    - Entradas correspondientes de `NAV_ITEMS`
      ([components/app-shell/nav-config.ts](../../components/app-shell/nav-config.ts))
      y `ROUTE_TO_MODULE` ([lib/permissions.ts](../../lib/permissions.ts)).
    - `EXPECTED_DB_MODULE_SLUGS` ([lib/permissions.test.ts](../../lib/permissions.test.ts))
      quita los slugs viejos.
  - Verificación: `grep` exhaustivo de referencias a las tablas viejas en
    `app/`, `lib/`, `components/`, `scripts/`, `tests/`. Cero hits antes de
    mergear.
  - Regenerar `SCHEMA_REF.md` y `types/supabase.ts`.
  - **Reversibilidad — leer dos veces**: el `git revert` del PR restaura
    el código (pages, componentes, helpers, migraciones SQL fuente), pero
    **NO restaura las tablas dropeadas en producción** — el DDL es
    destructivo. Si surge necesidad de rollback post-merge, el camino es:
    (a) revert del PR para volver el código, y (b) re-aplicar las
    migraciones SQL originales (que git histórico preserva) o restaurar
    desde el snapshot del Synology. Como las tablas viejas están vacías
    de captura productiva, el rollback recrearía estructura, no data.
- [ ] **Sprint 2 — ADRs + schema base v0 (greenfield)**:
  - ADR `dilesa-taxonomia-portafolio` — Activo / Proyecto / Producto /
    Unidad como entidades raíz, discriminator + satélite por tipo, naming
    rationale.
  - ADR `dilesa-jerarquia-padre-hijo` — Proyectos pueden tener padre
    (sub-proyectos); Activos pueden tener padre (plaza-locales, complejo-
    departamentos). Reglas de propagación de estado, regla de prorrateo
    de CapEx compartido, ciclo: proyecto al ejecutarse genera sub-activos
    que entran al portafolio.
  - Migraciones SQL en `supabase/migrations/`:
    - `dilesa.activos` (master con discriminator + jerarquía padre/hijo)
    - `dilesa.activos_<tipo>` (satélites por tipo: `_terreno`, `_lote`,
      `_local`, `_nave`, `_departamento`, `_espectacular`, `_casa`,
      `_plaza`, `_edificio`, `_infraestructura`)
    - `dilesa.proyectos` (master con discriminator de tipo + jerarquía
      padre/hijo + activos_input/output)
    - `dilesa.proyectos_plantillas` (plantillas editables por tipo)
    - `dilesa.productos` (catálogo del proyecto, polimórfico)
    - `dilesa.unidades` (binding Unidad-Producto-Sub-proyecto, flexible)
    - `dilesa.proyecto_tareas`, `dilesa.proyecto_hitos`,
      `dilesa.proyecto_documentos`, `dilesa.proyecto_responsables`
      (heredan patrones del módulo Tareas existente, agnóstico al tipo)
  - Seed inicial: catálogos de tipos de Activo, tipos de Proyecto,
    plantilla rica de fraccionamiento residencial (basada en el know-how
    del Coda actual), plantillas mínimas para plaza/bodega/departamentos.
  - Regenerar `SCHEMA_REF.md` y `types/supabase.ts`.
- [ ] **Sprint 3 — Caso piloto Lomas del Bosque cargado en el schema
      nuevo**:
  - Carga manual o vía script `scripts/migrations/lomas-del-bosque-seed.ts`
    de las 156 unidades + proyecto madre + 7 sub-proyectos en el schema
    nuevo.
  - Validación operativa: el modelo financiero del proyecto madre y de cada
    sub-proyecto se calcula sin pegamentos.
  - Valida la abstracción **antes** de tocar UI.
- [ ] **Sprint 4 — UI lectura del portafolio (lista + detalle, sin captura
      pesada)**:
  - `/dilesa/portafolio` — lista de Activos con filtros (tipo, estado,
    municipio) + jerarquía padre/hijo (vista folder).
  - `/dilesa/portafolio/[id]` — detalle de Activo con sus proyectos
    asociados (timeline) y sub-activos hijos.
  - `/dilesa/proyectos/[id]` — detalle de Proyecto con sub-proyectos,
    activos_input, activos_output, modelo financiero proyectado vs
    comprometido.
  - **Test del riesgo principal**: registrar el alta de un Activo
    jerárquico (ej. una plaza comercial nueva como Activo padre con 5
    locales hijos, o un complejo duplex con 8 unidades hijas) tarda <2
    minutos en captura. Si chirría la UI, refactor de la jerarquía antes
    de seguir. (NB: esto NO incluye captura de contratos de renta vivos
    — eso es operación continua, fuera de alcance v1.)
- [ ] **Sprint 5 — Migrar los 3 anteproyectos restantes desde Coda + cierre**:
  - Loma Escondida (residencial, 27 lotes), Lomas de los Encinos
    (residencial, 354 lotes), Lomas de las Delicias (residencial, 163
    lotes) — desde Coda directo al schema nuevo (no hay schema intermedio
    porque el viejo se borró en Sprint 1).
  - Confirmar el modelo aguanta sin contorsiones.
  - Cierre de iniciativa.

## Fuera de alcance v1

- **Operación continua de activos rentables** (espectaculares, locales en
  renta, casas rentando, contratos vivos, cobranza mensual). Es el siguiente
  paso natural — `dilesa-operacion-activos` o similar — pero requiere su
  propio análisis y data de catálogos de inquilinos. Se aborda como
  iniciativa derivada cuando el portafolio esté en pie.
- **Modelo financiero detallado** (curvas de CapEx en el tiempo, flujo de
  ingresos por venta vs renta, depreciación, valuación). v1 calcula
  proyectado vs comprometido con presupuestos planos; el modelado fino
  viene después.
- **Plantillas no-fraccionamiento maduras**. Plaza, bodega, departamento
  arrancan con plantillas mínimas + editables. Maduran cuando completes el
  segundo o tercer proyecto del tipo.
- **Permisos por rol DILESA** a nivel sub-proyecto. El schema nuevo
  respeta los patrones de RBAC existentes (`canAccessModulo`, `permisos_rol`),
  pero la matriz fina por sub-proyecto se aterriza después.
- **Integración con módulo financiero/contable** (CxP, CxC, presupuestos
  cross-empresa). Hay un módulo CxP en cola; el binding entre proyecto y
  CxP/CxC se aterriza cuando ambos estén productivos.
- **Re-loteo, fusión, subdivisión, regularización**. El modelo soporta
  estos como tipos de proyecto, pero las plantillas y UI específicas no
  entran en v1.
- **Auditoría legal/fiscal cross-empresa**. DILESA es una sola persona
  moral, no afecta v1, pero el modelo deja la puerta abierta a multi-
  propietario en el futuro.

## Métricas de éxito

- **Cero referencias al schema viejo** desde `app/`, `lib/`, `components/`,
  `scripts/`, `tests/` después de Sprint 1. Verificable con grep — gate del
  PR de demolición.
- **Cero objetos `dilesa.*` viejos** en la base de datos después de Sprint
  1. Verificable con `\dt dilesa.*`.
- **Lomas del Bosque modelado completo en el schema nuevo** sin contorsiones
  (Sprint 3). Si requiere más de 2 ALTERs al schema base para entrar, la
  abstracción está mal y se itera antes de Sprint 4.
- **Alta de un Activo jerárquico (plaza con N locales, o complejo duplex
  con N unidades hijas) en <2 minutos** con teclado en 1 mano (Sprint 4).
  Test del riesgo de sobre-modelado de la jerarquía padre/hijo. La
  captura del contrato de renta vivo no aplica aquí — es operación
  continua, fuera de alcance v1.
- **Los 4 anteproyectos vivos en Coda** representados en el schema nuevo
  con su modelo financiero calculado al cierre (incluido Lomas del Bosque,
  que hoy no se puede en Coda).

## Riesgos / preguntas abiertas

- [ ] **D1 — Sobre-modelar la jerarquía → UI lenta**. Si dar de alta un
      Activo jerárquico (plaza padre + N locales hijos, o complejo duplex + N unidades hijas) toma >2 minutos, la abstracción está mal
      aterrizada en UI. Métrica de diseño explícita en Sprint 4. La
      captura del contrato de renta vivo está fuera de alcance v1
      (operación continua), así que no es el caso de prueba.
- [ ] **D2 — Cómo se modela la "regla de prorrateo" de CapEx compartido**.
      v1: regla declarativa por proyecto madre (default `m² beneficiados`),
      cálculo derivado. Si en Lomas del Bosque sale algo más sofisticado
      (prorrateo por valor comercial, por densidad de uso), se itera. Cierra
      en Sprint 2 al diseñar el schema.
- [ ] **D3 — Definición operativa del binding Unidad ↔ Producto**. ¿En qué
      momento se "compromete" un binding y deja de ser reclasificable? ¿Al
      firmar contrato de apartado, al firmar venta, al escriturar?
      Operativamente para fraccionamiento, plaza en renta, plaza en venta y
      complejo duplex puede ser distinto. Decisión a cerrar antes de Sprint
      4 (UI de captura).
- [ ] **Plantillas no-fraccionamiento**. Las plazas y duplex de Lomas del
      Bosque son los primeros proyectos no-vivienda con datos reales. Se
      aprenderán durante la ejecución, no se diseñarán de antemano.

### Decisiones cerradas en la promoción

- **Los Encinos = DILESA** — Desarrollo Inmobiliario Los Encinos S.A. de C.V.
  es la misma persona moral; "DILESA" es solo nickname. No requiere extender
  `core.empresas` ni crear tabla de personas morales.
- **Corte limpio del schema viejo en Sprint 1** — los 4 módulos viejos
  (`Terrenos`, `Anteproyectos`, `Proyectos`, `Prototipos`) nunca tuvieron
  captura productiva, así que se borran al inicio en lugar de al final. Sin
  riesgo de pérdida de data ni de flujos rotos. Los 4 anteproyectos vivos
  se migran desde Coda directo al schema nuevo en Sprint 5.

## Decisiones registradas

(append-only, escrito por Claude Code al ejecutar)

- **2026-05-21 — Modo de ejecución: autónomo con checkpoints.** CC ejecuta
  y mergea cada sprint con CI verde de forma autónoma; pausa para OK
  verbal de Beto en los 4 momentos de riesgo: aplicar el DROP (S1), aplicar
  el schema nuevo (S2), cargar la data real de Lomas del Bosque (S3),
  migrar los 3 anteproyectos restantes desde Coda (S5). Sprint 4 (UI)
  corre sin interrupciones. Razón: balance velocidad/control — los sprints
  con DDL destructivo o data productiva tienen checkpoint humano; los de
  código puro no.
- **2026-05-21 — Sprint 1 incluye cleanup de `analytics.metric_dictionary`.**
  El reconocimiento previo al arranque encontró que además de
  `analytics.mv_dilesa_pipeline`, hay una fila en
  `analytics.metric_dictionary` (`dilesa_lote_dias_pipeline`) que apunta a
  esa MV. La migración `_dilesa_v1_drop.sql` borra esa fila junto con la
  MV. Fuera de eso, el reconocimiento confirmó cero dependencias
  cross-schema ocultas — el DROP CASCADE de `dilesa` es seguro.
- **2026-05-21 — El schema `dilesa` v1 no estaba vacío; se procedió con el
  DROP igual.** El manifiesto de row-counts previo al DROP encontró 87
  filas (26 terrenos, 12 prototipos, 11 anteproyectos, 8 proyectos, + refs
  y catálogos), todas cargadas en un batch el 2026-04-23 — el import
  apurado desde Coda, no captura productiva en BSOP. Beto confirmó
  proceder: Coda es la fuente viva y la data se re-migra desde ahí en S3 y
  S5. Snapshot CSV defensivo de las 87 filas archivado fuera del repo.
  Nota: el conteo real de anteproyectos (11) supera los 4 que el plan
  asumía — el alcance de re-migración de S3/S5 se confirma leyendo Coda.
- **2026-05-21 — `analytics.refresh_all()` también referenciaba
  `mv_dilesa_pipeline`.** La verificación contra el catálogo de Postgres
  durante el Sprint 1 encontró que la función `refresh_all()` tenía la MV
  hardcodeada en un array — hallazgo que el reconocimiento inicial no
  detectó. La migración la corrige (quita la MV del array) para no romper
  el refresh.
- **2026-05-21 — Drift de timestamps en 3 migraciones Waitry, reparado.**
  `supabase db push` se bloqueó: `schema_migrations` de prod tenía 3
  migraciones Waitry (9-may) con timestamp ~1 min distinto al del archivo
  local. Se alinearon los archivos locales renombrándolos a los timestamps
  de la DB (commit `chore`, contenido intacto, sin re-ejecución). Drift
  pre-existente ajeno a DILESA — desatascado de paso.
- **2026-05-21 — Los 11 satélites de activo se crean de una vez,
  diseñados con criterio de dominio.** El schema base iba a llevar
  satélites solo de `terreno` y `lote` (los del piloto), agregando los
  demás on-demand. Beto pidió meter los 11 de una vez: la importación de
  Coda traerá espectaculares, unipolares y casas además de
  terrenos/lotes, y fragmentar el schema en migraciones sucesivas no
  conviene. Además, **los satélites NO se basan en Coda** (que está
  deficiente) — se diseñan con campos de criterio de dominio inmobiliario;
  la importación llenará lo que traiga y los campos sin dato quedan NULL,
  a completar después.
- **2026-05-22 — `proyectos.clave_interna` usa `UNIQUE` con NULLs
  distintos, a diferencia de `activos.clave_interna`.** El primer intento
  de la migración de Fase 2 copió el constraint de `activos`
  (`UNIQUE NULLS NOT DISTINCT`) y falló al aplicarse: los 5 anteproyectos
  no tienen `clave_interna` (solo los proyectos `tipo=desarrollo` la
  tienen, ← "Abreviación" de Coda), y `NULLS NOT DISTINCT` trata varios
  NULL como duplicados. Se corrigió a `UNIQUE (empresa_id, clave_interna)`
  con la semántica default (NULLs distintos): la clave es opcional, varias
  filas sin clave son legítimas, y el constraint solo impide dos códigos
  no nulos iguales por empresa. **Pendiente flagueado:** `activos` tiene
  el mismo `NULLS NOT DISTINCT` — hoy no molesta (los 25 terrenos traen
  clave), pero la Fase 3 (lotes + casas, que no traen código corto)
  chocará con él. Se corrige al preparar la migración de Fase 3.
- **2026-05-22 — Inventario de Coda → solo `unidades`, sin crear
  `activos`.** Las 1,590 filas de la tabla Inventario (lotes/casas de 6
  fraccionamientos, la mayoría ya vendidas) se importaron a
  `dilesa.unidades` + 14 `productos`. **No se crearon filas en
  `dilesa.activos`**: el portafolio de activos es lo que DILESA tiene/
  gestiona (los 25 terrenos), no el historial de casas vendidas. La
  trazabilidad —qué se vendió, qué prototipo, ciclo de vida— vive completa
  en `unidades`; `unidades.activo_id` queda NULL, se llena después si una
  unidad se conserva como activo de portafolio. Beto consideró "activo
  desincorporado" pero se descartó: duplicaría cada unidad sin agregar
  trazabilidad. La escrituración (no la entrega) es la desincorporación.
  Detalle: mapeo §§ 4-5.

## Bitácora

(append-only, escrito por Claude Code al ejecutar)

- **2026-05-21 — Iniciativa promovida a `planned`.** Tras brainstorm
  (modelo Portafolio ↔ Proyectos con jerarquía padre/hijo, validado contra
  el caso Lomas del Bosque), review de codex y ultrareview (PRs #457 y
  #458, ya mergeados), y reconocimiento del inventario de demolición.
  Alcance v1 cerrado en 5 sprints. Próximo: Sprint 1 — Demolición.
- **2026-05-21 — Sprint 1 (Demolición) completado.** PR #482 mergeado.
  Migración `20260521201557_dilesa_v1_drop.sql` aplicada en prod:
  `DROP SCHEMA dilesa CASCADE` (31 tablas + 4 vistas + ~30 triggers — "drop
  cascades to 35 other objects") + recreación del schema vacío; DROP de
  `analytics.mv_dilesa_pipeline` + cleanup de `metric_dictionary` y del
  array de `refresh_all()`; borrado de los 4 slugs en `core.modulos`.
  Código: −8,716 LOC — 8 pages + 1 API route + 4 componentes + 9 scripts
  `migrate_dilesa_*` + `dilesa-migrate-shared` + `dilesa-constants`;
  launcher, nav y permisos limpios; `status-tokens.ts` podado a lo de
  juntas. `SCHEMA_REF.md` + `types/supabase.ts` regenerados (−3,538 LOC).
  Verificado en prod: schema vacío, cero objetos huérfanos. Iniciativa a
  `in_progress`. Próximo: Sprint 2 — ADRs + schema base v0.
- **2026-05-21 — Sprint 2 (ADRs + schema base v2) completado.** PRs #484
  (ADRs 009 taxonomía + 010 jerarquía) y #485 (schema base) mergeados.
  Migración `20260521215517_dilesa_v2_schema_base.sql` aplicada en prod:
  **22 tablas** — `activos` (master) + 11 satélites por tipo (terreno,
  lote, espectacular, unipolar, casa, departamento, local, plaza,
  edificio, nave, infraestructura), `proyectos`, `proyectos_plantillas`,
  `productos`, `unidades`, `proyecto_activos`, `proyecto_prorrateo`,
  `proyecto_tareas/hitos/documentos/responsables`. Todas con RLS, trigger
  updated_at, índices. Decisión de Beto durante el sprint: meter los 11
  satélites de una vez (no on-demand), diseñados con criterio de dominio
  inmobiliario en lugar de copiar el Coda deficiente — la importación
  llenará lo que traiga, los huecos se completan después. `SCHEMA_REF.md`
  - `types/supabase.ts` regenerados. Verificado en prod: 22 tablas.
    Próximo: Sprint 4 — UI del módulo portafolio (Sprint 3, carga del
    piloto Lomas del Bosque, se hace cuando estén los datos de Coda).
- **2026-05-22 — Sprint 4 (UI del módulo portafolio) completado.** PR #487
  mergeado. Migración `20260521225606` aplicada en prod: módulos
  `dilesa.portafolio` y `dilesa.proyectos` registrados en `core.modulos`
  con backfill de permisos (verificado: 2 roles c/u). UI: pages
  `/dilesa/portafolio` (lista de activos) y `/dilesa/proyectos` (lista de
  proyectos) con `DataTable`, filtros (búsqueda + tipo) y `RequireAccess`;
  sección "Inmobiliario" en el sidebar de DILESA. v0 es lista de lectura
  — el detalle rico (jerarquía, sub-proyectos, modelo financiero) y la
  captura/alta quedan como entregable posterior (dependen de D1 y D3).
  Nota de ejecución: el trabajo nocturno se interrumpió ~1h por una caída
  temporal del clasificador de Bash (infra) a mitad del Sprint 4; el
  código quedó guardado y se retomó sin pérdida. **Verificación visual en
  browser pendiente de Beto** — la UI auth-gated requiere login y CC no
  puede autenticar; el build de Vercel y el Supabase Preview pasaron.
  Próximo: Sprint 3 (carga del piloto Lomas del Bosque) + Sprint 5
  (migrar los 3 anteproyectos restantes), ambos al tener los datos de
  Coda; y la fase de captura/detalle de la UI tras cerrar D1 y D3.
- **2026-05-22 — Sprint 3 reencuadrado: importación desde Coda por
  fases.** El Sprint 3 del plan ("cargar el piloto Lomas del Bosque") se
  reencuadró por decisión de Beto a una importación completa del Coda
  DILESA (`ZNxWl_DI2D`) en 4 fases: terrenos → anteproyectos/proyectos →
  lotes/casas → ventas. El mapeo Coda → schema v2 vive en
  [dilesa-portafolio-mapeo-coda.md](dilesa-portafolio-mapeo-coda.md),
  validado por Beto.
  - **Fase 1 (PR #489)** — `scripts/import_dilesa_terrenos.ts` cargó 25
    terrenos en `dilesa.activos` (tipo `terreno`) + `activo_terreno`. La
    migración `20260522123710_dilesa_v2_ajustes_importacion.sql` extendió
    el satélite `activo_terreno` (+18 campos de adquisición/gestión),
    agregó el estado `descartado` a `activos` y +9 columnas de alcance/
    costos a `proyectos`.
  - **Fase 2 (este PR)** — `scripts/import_dilesa_proyectos.ts` cargó 5
    anteproyectos (tipo `anteproyecto`) + 8 proyectos (tipo `desarrollo`)
    en `dilesa.proyectos`, con 5 vínculos `proyecto_activos` (rol `input`)
    al terreno de origen y `proyecto_predecesor_id` poblado en los 2
    proyectos que vienen de un anteproyecto convertido. La migración
    `20260522131315_dilesa_proyectos_clave_interna.sql` agregó la columna
    `proyectos.clave_interna` (← "Abreviación" de Coda), que el mapeo
    preveía pero la migración de ajustes de Fase 1 omitió. Verificado en
    prod: 13 proyectos, claves y vínculos correctos.
    Próximo: Fase 3 (lotes + casas) y Fase 4 (ventas — requiere extender el
    schema con tablas de comercialización, inexistentes en v2).
  - **Fase 3 (este PR)** — `scripts/import_dilesa_inventario.ts` cargó las
    1,590 filas de la tabla Inventario de Coda en `dilesa.unidades` (cada
    lote/casa con su ciclo de vida) + 14 `dilesa.productos` (prototipos
    por proyecto). Verificado en prod: 1,590 unidades en 6 proyectos, 0
    sin proyecto, 218 sin prototipo (lotes comerciales/áreas verdes,
    esperado), 1,372 con casa construida. La migración
    `20260522191342_dilesa_unidades_inventario_ajustes.sql` extendió
    `unidades` (+8 columnas físicas), reemplazó el `CHECK` de
    `unidades.estado` por el ciclo real de 8 estados, y arregló
    `activos.clave_interna` (`NULLS NOT DISTINCT` → `UNIQUE` normal). No
    se crearon `activos` — ver Decisiones registradas.
    Próximo: Fase 4 (ventas — pipeline de 17 fases documentado en el
    mapeo § 6, requiere extender el schema con tablas de comercialización).
- **2026-05-22 — Sprint 4 (detalle de lectura) — drawer de detalle de
  proyecto.** Tras cargar las 1,590 unidades (Fase 3) no había forma de
  verlas en la UI: las listas de Sprint 4 eran planas, sin drill-down. Se
  agregó `components/dilesa/proyecto-detail-drawer.tsx`: click en una fila
  de `/dilesa/proyectos` abre un `DetailDrawer` con la ficha del proyecto
  (alcance + costos) y la tabla de sus `dilesa.unidades`, filtrable por
  estado y tipo de lote. Es el detalle de lectura que el Sprint 4 había
  diferido — no depende de D1/D3 (esos gatean la captura/alta, no la
  lectura). Pendiente aún: detalle de activos (mismo patrón) y el modelo
  financiero proyectado vs comprometido.
