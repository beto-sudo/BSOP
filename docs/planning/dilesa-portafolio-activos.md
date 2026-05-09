# Iniciativa — Portafolio de Activos DILESA

**Slug:** `dilesa-portafolio-activos`
**Empresas:** DILESA (Desarrollo Inmobiliario Los Encinos S.A. de C.V.)
**Schemas afectados:** `dilesa` (rediseño completo del schema, deprecación de
las tablas viejas), `core.empresas` (lectura)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-05-08
**Última actualización:** 2026-05-08 (corte limpio adelantado al Sprint 1:
los 4 módulos viejos nunca tuvieron captura productiva — fueron una
migración apurada de tablas desde Coda — así que se borran al inicio en
lugar de al final; D2 cerrada, quedan D1, D2, D3 abiertas para subir a
`planned`)

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
  ha, 156 unidades, 1 proyecto madre + 4 streams de valor / sub-proyectos)
  como prueba de fuego de la abstracción.
- **Schema viejo (`dilesa.terrenos`, `dilesa.anteproyectos`,
  `dilesa.proyectos`, `dilesa.prototipos` y derivadas) borrado en Sprint 1**
  (no al final) — greenfield para construir el modelo nuevo sin convivencia
  paralela. Posible porque nada se usó productivamente: los 4 anteproyectos
  vivos siguen en Coda, no en BSOP.
- **UI mergeada de los 4 módulos viejos eliminada en Sprint 1** junto con el
  schema. Los PRs viejos quedan como referencia en git, no se pierde
  historial. Los 4 anteproyectos vivos en Coda (Lomas del Bosque + Loma
  Escondida + Lomas de los Encinos + Lomas de las Delicias) se migran
  **directamente desde Coda al modelo nuevo** en Sprint 4 — no del schema
  intermedio.
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
| Áreas verdes (5) + canales (2) + vialidades | ~36,700     | 34.1%    | infraestructura          |
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
  - PR único de "demolición" — completamente reversible vía revert si Beto
    se arrepiente.
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
  - **Test del riesgo principal**: capturar un contrato de renta de un
    local de plaza tarda <2 minutos. Si chirría la UI, refactor antes de
    seguir.
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
- **Captura de un contrato de renta de un local de una plaza en <2 minutos**
  con teclado en 1 mano (Sprint 4). Test del riesgo de sobre-modelado.
- **Los 4 anteproyectos vivos en Coda** representados en el schema nuevo
  con su modelo financiero calculado al cierre (incluido Lomas del Bosque,
  que hoy no se puede en Coda).

## Riesgos / preguntas abiertas

- [ ] **D1 — Sobre-modelar la jerarquía → UI lenta**. Si capturar un contrato
      de renta de un local toma >2 minutos, la abstracción está mal aterrizada
      en UI. Métrica de diseño explícita en Sprint 4.
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

## Bitácora

(append-only, escrito por Claude Code al ejecutar)
