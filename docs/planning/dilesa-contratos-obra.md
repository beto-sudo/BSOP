# Iniciativa — Contratos de obra (no-vivienda) DILESA

**Slug:** `dilesa-contratos-obra`
**Empresas:** DILESA
**Schemas afectados:** `dilesa` (generalizar `contratos_construccion` + tablas
nuevas de presupuesto de obra y estimaciones de monto), `erp` (`personas` como
proveedores/contratistas; futura emisión a CxP)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-06-01
**Última actualización:** 2026-06-02 (Capa A (#617) + Capa B (#631) + ADR-039
(#637) + Sprint 3 tab Costeo (#639) en prod. **Sprint 4** (captura de contratos +
estimaciones de obra) en PR. Próximo: puente a CxP (pagos, ADR-039 Fase 2),
cotizaciones, captura de presupuesto; reasignar los 8 contratos placeholder.)

## Problema

El módulo de Construcción DILESA solo modela **construcción de vivienda**
(contrato ligado a lotes/prototipo, avance por plantilla de tareas del
prototipo, estimaciones por tareas terminadas). Pero buena parte del gasto de
obra del desarrollo **no es vivienda**:

- **Urbanización** (trazo, terracerías, drenaje, agua potable, cordón,
  pavimentación, electrificación, banqueta…).
- **Obras de cabecera / amenidades** (barda, caseta, portón, plaza, casa
  muestra, monolito, nomenclatura…).
- **Contratos pequeños / tareas sueltas** y trámites (laboratorio, proyectos,
  licencias, dictámenes).

Hoy esto se controla en **Excel por proyecto** (`Proyecto LDLE.xlsx`,
`Proyecto LDS.xlsx`), sin sistema, sin trazabilidad y sin rollup al costeo del
desarrollo. No hay forma de ver el CapEx real de urbanizar un fraccionamiento
junto al costo de las viviendas.

## Outcome esperado

1. Registrar **cualquier contrato de obra** (vivienda + no-vivienda) en BSOP,
   imputado a su proyecto, con su anticipo, retención, estimaciones y facturas.
2. **Costeo por proyecto**: presupuesto vs gasto real por concepto/etapa, que
   alimente el análisis financiero del desarrollo (CapEx total = viviendas +
   urbanización + cabecera).
3. **Traspasar toda la info** histórica de LDLE y LDS (proyectos activos, casi
   terminados) desde los Excel.
4. Dejar la puerta lista para que el **pago** se delegue a Cuentas por Pagar
   (CxP) cuando esa iniciativa aterrice (Fase 2).

## Hallazgos de los Excel (LDLE + LDS) — fuente del modelo

Ambos archivos tienen ~13–14 hojas: una **RESUMEN** maestra + una hoja por
frente de obra (ELECTRIFICACION, AGUA POTABLE DRENAJE, PAVIMENTACION, CORDON,
BARDA, CASETA, PORTON, PLAZA, MAQUINARIA…).

**RESUMEN** (presupuesto vs real, nivel proyecto):

- Columnas: Etapa · Concepto · (Fecha compromiso) · Presupuesto previo (c/IVA)
  · Presupuesto actualizado · por lote · Gasto Real (c/IVA) · ratio ·
  **Proveedor** · Factura(s) · Orden.
- Filas agrupadas por **Etapa** (Anteproyecto, Urbanización, …) con subtotales
  `TOTAL <ETAPA>`.
- El **proveedor** puede ser una empresa (Electrogaza, Estrella, HANKAT…), un
  ente (Municipio, CFE, SIMAS), una persona (Ing./Arq.) o **DILESA** (obra
  propia).
- ⚠️ Las posiciones de columna **difieren entre LDLE y LDS** (LDS trae "Fecha
  compromiso"; LDLE no) → el parser de traspaso debe mapear por encabezado, no
  por índice fijo.

**Hojas de detalle** (contrato + estimaciones, nivel frente):

- Bloque de cabecera: **Contrato · Anticipo (% variable: 30/50/60%) · Por
  estimar · Retención (% variable: 5/10%) · Importe a acumular · Total de
  estimaciones · Total Pagado (con %)**.
- Tabla de estimaciones: \*\*Fecha · Estimación (etiqueta libre: "Anticipo",
  "1", "2A", "3 y 4", "Finiquito", "1 adicional", "Anticipo 50% adicional") ·
  # Factura · Total · nota de pago\*\* ("pagada", "pag 13 oct"…).
- Una hoja puede contener **varios contratos** (1ª etapa / 2ª etapa, o
  Red Eléctrica vs Voz y Datos), cada uno con su propio anticipo/retención/
  estimaciones.

**Implicaciones de modelado** (≠ vivienda):

- Anticipo y retención **variables por contrato** (vivienda usa 5% fijo, sin
  anticipo).
- Estimaciones por **monto directo con etiqueta de texto libre** (vivienda usa
  estimaciones por tareas terminadas).
- El "objeto" no son lotes sino **conceptos/frentes de obra**.

## Modelo propuesto (a validar antes de tocar schema)

Dos capas:

**Capa A — Presupuesto de obra del proyecto** (replica RESUMEN). Tabla nueva
`dilesa.obra_presupuesto` (1 fila por concepto): `proyecto_id`, `etapa`,
`concepto`, `presupuesto_previo`, `presupuesto_actualizado`, `gasto_real`,
`proveedor_texto` (+ opcional `proveedor_persona_id`), `factura_ref`,
`fecha_compromiso`, `orden`. Da el costeo y la vista consolidada por proyecto.

**Capa B — Contratos de obra + estimaciones** (replica hojas de detalle):

- **Generalizar `dilesa.contratos_construccion`**: agregar `tipo`
  (`vivienda` | `urbanizacion` | `obra_cabecera` | `tarea_menor`),
  `anticipo_pct`, `retencion_pct`. Backfill de los existentes a `tipo='vivienda'`,
  `retencion_pct=5`, `anticipo_pct=0`. `proyecto_id` y `contratista_id` ya
  existen.
- **Estimaciones de monto** `dilesa.obra_estimaciones`: `contrato_id`,
  `etiqueta` (texto libre), `fecha`, `factura_ref`, `monto`, `nota_pago`,
  `es_anticipo`, `es_finiquito`. (Decisión abierta: tabla nueva vs generalizar
  `dilesa.estimaciones` con un `tipo` — ver Riesgos.)
- Objeto del contrato: vivienda → `contrato_lotes` (como hoy); no-vivienda →
  liga a un concepto de Capa A / alcance descrito (las "partidas" detalladas se
  evalúan en Sprint 2; los Excel no las desglosan a nivel volumen-PU salvo
  algunas hojas).

**Saldo simple v1** (sin CxP): `por_pagar = valor_total − Σ estimaciones`.
**Fase 2**: cada estimación emite un cargo a CxP (contra el proyecto) y CxP
lleva programación/aprobación/pago/conciliación.

## Alcance v1 — Sprints (propuesta)

- **Sprint 1 — Schema + costeo (Capa A):** migración `obra_presupuesto` +
  generalizar `contratos_construccion` (tipo/anticipo/retención) + backfill +
  regen SCHEMA_REF/types. Parser de traspaso del **RESUMEN** de LDLE y LDS
  (mapeo por encabezado, robusto a las diferencias de columnas). Vista de costeo
  por proyecto.
- **Sprint 2 — Contratos + estimaciones (Capa B):** `obra_estimaciones` +
  traspaso de las **hojas de detalle** (multi-contrato por hoja, etiquetas
  libres, anticipo/retención por contrato). Form de captura ramificado por
  tipo + detalle con saldo simple. PDF del contrato no-vivienda (reusa
  `lib/dilesa/pdf/contrato-obra.tsx` con objeto = conceptos en vez de lotes).
- **Sprint 3 — UI de costeo + rollup:** integrar el presupuesto-vs-real al
  análisis financiero del proyecto (CapEx total del desarrollo).

## Fuera de alcance v1

- **Conexión a CxP** (Fase 2 — `cxp` aún `planned`). v1 deja el saldo simple.
- Desglose de partidas a nivel volumen × PU para todos los frentes (solo donde
  el Excel ya lo trae).
- Conciliación bancaria de los pagos (depende de CxP + `conciliacion-bancaria`).

## Riesgos / decisiones abiertas

- **D1 — Estimaciones: tabla nueva vs generalizar `estimaciones`.** La de
  vivienda se liga a tareas terminadas; la de obra es monto libre. Propongo
  tabla separada `obra_estimaciones` para no contaminar el flujo de avance de
  vivienda. _Validar con Beto._
- **D2 — Proveedor como texto vs `erp.personas`.** El RESUMEN trae nombres
  libres (incluyendo entes como Municipio/CFE y "DILESA" obra propia). Propongo
  `proveedor_texto` + `proveedor_persona_id` opcional, y dar de alta como
  `erp.personas tipo=contratista/proveedor` los que sean contratistas formales.
- **D3 — IVA.** Los montos del Excel incluyen IVA ("incluye IVA"). Decidir si
  se guarda con IVA o se separa subtotal/IVA (relevante para CxP y CFDI). _Es
  decisión financiera — validar._
- **D4 — Fidelidad del traspaso.** Los Excel tienen fórmulas, celdas
  combinadas, `#DIV/0!`, etiquetas libres y layout que difiere entre LDLE y
  LDS. El parser será best-effort + reporte de lo no mapeado; Beto revisa antes
  de dar por buena la migración.
- **D5 — ADR pendiente.** "Modelo de contratos de obra (vivienda + no-vivienda)
  y frontera con CxP" amerita ADR formal — se escribe al cerrar el schema del
  Sprint 1.

## Decisiones registradas

(append-only)

### 2026-06-01 — Secuencia: registro primero, CxP después

Beto eligió construir ya el registro de contratos de obra (Fase 1) en vez de
esperar a CxP. Razón: hay dolor real (todo en Excel) y el registro del contrato

- su avance es del módulo de obra, no de CxP; el motor de pagos no se duplica
  porque v1 solo lleva saldo simple y el pago formal se delega a CxP en Fase 2.

## Bitácora

(append-only, escrito por Claude Code al ejecutar)

### 2026-06-01 — Sprint 1 (schema) aplicado a prod

**Decisiones cerradas con Beto** (D1–D5 del planning): IVA **8% frontera /
16% excepción**, desglose donde esté especificado (no se infiere tasa fija);
estimaciones de obra en **tabla nueva** `obra_estimaciones` (separada de
`dilesa.estimaciones` de vivienda, ADR-033); proveedor como `proveedor_texto`

- `proveedor_persona_id` opcional; traspaso **completo** (RESUMEN + contratos +
  estimaciones). Ver **ADR-038**.

**Migración** `20260601172336_dilesa_contratos_obra_generalizar.sql` (aplicada
vía MCP, version sincronizada con el archivo):

- `dilesa.contratos_construccion` + `tipo` (CHECK vivienda/urbanizacion/
  obra_cabecera/tarea_menor), `anticipo_pct`, `retencion_pct`, `valor_subtotal`,
  `valor_iva`, `iva_tasa`. Backfill: 266 contratos existentes → `vivienda`.
- `dilesa.obra_presupuesto` (presupuesto vs gasto real por concepto × etapa).
- `dilesa.obra_estimaciones` (estimaciones de monto, etiqueta libre).
- RLS/triggers/índices iguales al resto de `dilesa`. `NOTIFY pgrst`.

Verificado en prod: 6 columnas nuevas, 2 tablas, 266 backfill. `SCHEMA_REF` +
`types/supabase.ts` regenerados.

**Pendiente:** ADR → índice §5 de `ARCHITECTURE.md` (piggyback al cerrar
iniciativa). **Próximo sprint:** parser de traspaso LDLE+LDS (best-effort,
marca renglones sin tasa de IVA clara para revisión de Beto).

### 2026-06-01 — Traspaso Capa A (RESUMEN → obra_presupuesto) cargado a prod

Parser `scripts/import_dilesa_obra_presupuesto.py` (DRY_RUN + genera JSON; la
carga se hizo por `psql` con `SUPABASE_DB_URL`, transaccional con DELETE previo
idempotente). **128 renglones cargados y verificados en prod:**

- **Lomas del Sol** (`a506b99f-…`): 73 conceptos, 3 etapas, presup. actual.
  $12,186,209.13, gasto real $11,708,916.24, 26 proveedores.
- **Lomas de los Encinos** (`42c64197-…`): 55 conceptos, 3 etapas, presup.
  actual. $73,845,012.61, gasto real $61,002,480.36, 27 proveedores.

Bug detectado y corregido en DRY_RUN: el RESUMEN de LDLE trae un bloque
agregado "RESUMEN POR ETAPA" cuyo header es "ETAPA" (no la cadena literal que
sí trae LDS) → causaba doble conteo. La etapa se deriva de cada fila
`TOTAL <ETAPA>` (LDLE no la marca en la columna). IVA: 128 renglones con total
c/IVA, sin desglose (`gasto_real_subtotal/iva/iva_tasa` null) — el Excel no lo
especifica; se completa con facturas.

### 2026-06-01 — Traspaso Capa B (hojas de detalle → contratos + estimaciones) cargado a prod

Parser `scripts/import_dilesa_obra_contratos.py` (DRY_RUN por default genera el
JSON; `--emit-sql` genera SQL idempotente y transaccional; la carga se aplicó por
`psql` con `SUPABASE_DB_URL`). Detección de bloques **por ancla**
(`Contrato`/`Presupuesto` + `Anticipo`/`Por estimar`), robusta al **tiling
horizontal** (ESTRELLA = 4 contratos lado a lado) y al **apilado vertical**
(ELECTRIFICACION LDLE = 5 etapas/contratos apilados). **Cargado y verificado en
prod:**

- **32 contratos** (`tipo` urbanizacion/obra_cabecera/tarea_menor) +
  **275 estimaciones** (21 anticipos, 18 amortizaciones negativas/NC, 6
  finiquitos). Valor contratado **$47.95 M** (incl. SIMAS), pagado **$42.67 M**.
- **Reconciliación:** 29/31 bloques cuadran al **centavo** contra el "Total
  Pagado" del Excel (la captura de estimaciones reconcilia contra el pagado, no
  contra "Total de estimaciones" que excluye el anticipo). 2 no cuadran por
  inconsistencia del **propio Excel** (no del parser) y se cargaron con nota ⚠️:
  `BANQUETA`-Quintero LDS (0 estimaciones pero Total Pagado $29,285) y
  `ELECTRIFICACION` LDLE 3ª etapa add-on (anticipo pagado > contractual,
  dif $10,254).
- **6 personas nuevas** en `erp.personas` (ROMEO GONZALEZ, WILLYSONS
  CONSTRUCCIONES, MIGUEL ÁNGEL QUINTERO FUENTES, MAYRA M. PÉREZ ARENAS, ESTRELLA
  - 1 placeholder). Los demás contratistas (ELECTROGAZA, MATERIALES SAN RODRIGO,
    TUBOS Y CONEXIONES, TELECOMUNICACIONES DE COAHUILA, EMMA CAZARES, EMANUEL
    MORADO, SIMAS) ya existían y se matchearon por nombre.
- **SIMAS** modelado como contrato (decisión Beto): convenio de derechos de agua
  $5,492,640.90, 15 pagos programados como estimaciones (8 `pagada` = $2.93 M que
  cuadra con el Excel, 7 `programado` = $2.56 M).
- **8 contratos sin contratista nombrado** ("MANO DE OBRA" de BARDA/BARDA2/
  CASETA/BANQUETA-Santos/PAVIMENTACION LDS + ELECTRIFICACION LDS ×2) → ligados a
  **placeholder** `CONTRATISTA POR ASIGNAR — OBRA`, con el hint del Excel en
  `notas` para reasignar en la UI.
- **9 hojas saltadas** (no son contratos de obra): MAQUINARIA/MAQ1ERAETAPA/
  MAQ2DA3ERAETAPA (avance terracerías volumen×PU), IB TRAYMAQ (cotización),
  HANKAT (detalle de laboratorio tipo-RESUMEN), CASA MUESTRA/PLAZA/MUNICIPIO
  (listas de compra).

Trazabilidad: cada estimación guarda `source_ref` = `archivo/hoja/celda` exacta.

### 2026-06-01 — ADR-039 (puente Capa B → CxP) + Sprint 3 (UI de costeo)

- **ADR-039** (`docs/adr/039_puente_obra_cxp.md`): diseño de la frontera Fase 2.
  La estimación (no el contrato) cruza a CxP como factura de egreso (link nuevo
  `erp.facturas.obra_estimacion_id`); go-forward (el histórico ya pagado queda
  como registro); **neto a CxP** (estimación − amortización; anticipo = factura
  única). Reúsa el flujo `cxp_pago`. Índice §5 de `ARCHITECTURE.md` actualizado
  (037/038/039). Es diseño — la implementación es Fase 2 (cuando CxP llegue a
  DILESA).
- **Sprint 3 — tab "Costeo"** del hub Construcción (`/dilesa/construccion/costeo`,
  sub-slug `dilesa.construccion.costeo`): vista de CapEx del desarrollo —
  presupuesto vs gasto real por concepto/etapa (`obra_presupuesto`, Capa A, que
  no tenía UI) + KPIs de rollup con contratado/saldo de los contratos (Capa B).
  `components/dilesa/costeo-module.tsx` + page + wiring RBAC (ROUTE_TO_MODULE +
  EXPECTED_DB_MODULE_SLUGS) + migración `20260602030000` (sub-slug + backfill de
  permisos, data-only). Saldo de obra = `valor_total − Σ obra_estimaciones`.

### 2026-06-02 — Sprint 4 (captura de contratos + estimaciones de obra)

UI de captura para operar obra hacia adelante (no solo ver lo traspasado):

- **Nuevo contrato de obra** (`/contratos/nuevo-obra`, botón en el tab Contratos):
  form `useState` calcando el de vivienda **sin lotes** — contratista, proyecto,
  `tipo` (urbanización/cabecera/tarea_menor), fecha, valor, anticipo%/retención%,
  notas. Código auto `YYYY/n-DIE-{ABREV}-{URB|CAB|TAR}#n`. Insert directo →
  detalle.
- **Detalle ramificado por `tipo`**: los contratos no-vivienda muestran
  `<ObraContratoDetalle>` (estimaciones + saldo `valor − Σ` + anticipo/retención)
  en vez de la sección de lotes; el PDF lote-based se oculta para obra. Vivienda
  intacto.
- **Registrar estimación** (form inline en el detalle): etiqueta libre, fecha,
  factura, monto (negativo para amortizaciones), anticipo/finiquito, nota →
  insert a `obra_estimaciones`.
- Reúsa el sub-slug `dilesa.construccion.contratos` (write) — **sin migración**,
  no toca schema. 5 checks verdes (1184 tests).

## Handover — estado y próximos pasos (para la siguiente sesión)

**Hecho (en prod):** schema Sprint 1 (#615) + Capa A de costeo (`obra_presupuesto`,
128 renglones, #617) + **Capa B de contratos + estimaciones** (32 contratos, 275
estimaciones, #631) + **ADR-039** (puente CxP, #637) + **Sprint 3** tab Costeo
(#639) + **Sprint 4** captura de obra (contratos + estimaciones — este PR).
Ciclo de obra operable end-to-end (crear → estimar → costear); falta el puente a
CxP (pagos formales, ADR-039 Fase 2) y los módulos upstream (cotizaciones,
captura de presupuesto).

**Decisiones ya cerradas (no re-preguntar):**

- Proyecto del Excel **LDLE = "Lomas de los Encinos"** (`42c64197-2358-4607-a21c-97556ceb3110`),
  **LDS = "Lomas del Sol"** (`a506b99f-1b6e-4024-a94a-59deaed48727`). empresa
  DILESA `f5942ed4-7a6b-4c39-af18-67b9fbf7f479`.
- IVA **8% frontera / 16% excepción**, desglose solo donde esté especificado
  (ver [[project_iva_frontera]] y ADR-038).
- Estimaciones de obra en tabla nueva `obra_estimaciones` (no en `dilesa.estimaciones`).
- Contratistas sin nombre → placeholder reasignable; SIMAS = contrato.

**Pendiente de aplicar a prod:** la migración `20260602030000` (sub-slug
`dilesa.construccion.costeo` + backfill de permisos) — se aplica con OK de Beto;
hasta entonces el tab Costeo es admin-only. Es data-only (no cambia
SCHEMA_REF/types).

**Posible evolución de Sprint 3** (si Beto lo pide): drilldown por proyecto
(`/costeo/[proyecto_id]`) con el breakdown de conceptos/etapas + contratos con su
saldo; hoy v1 es la tabla de conceptos + KPIs de rollup.

**Pendientes menores (post-carga, para retomar):**

- **Reasignar los 8 contratos** con contratista `CONTRATISTA POR ASIGNAR — OBRA`
  al contratista real (el hint del Excel quedó en `notas` de cada contrato). Ojo
  con `BANQUETA`-Quintero LDS (¿= MIGUEL ÁNGEL QUINTERO FUENTES?) y confirmar si
  **MATERIALES SAN RODRIGO** es el contratista de pavimentación o solo proveedor
  de materiales.
- **Ligar `obra_presupuesto.contrato_id`** a su contrato por proveedor/concepto
  (diferido: el match por `proveedor_texto` es fuzzy y los contratistas con
  varios contratos —Electrogaza ×5, San Rodrigo ×4, Estrella ×4— necesitan
  desambiguar por concepto; hacerlo al construir la UI de rollup que lo consume).
- **Duplicado ELECTROGAZA** en `erp.personas` (2 filas; se usó la más antigua) y
  **duplicado** "Ampliación Lomas de los Encinos" en `dilesa.proyectos`
  (`cd7c9cae-…` y `26352cac-…`) — limpiar.
- ~~ADR-038 → índice §5 de `ARCHITECTURE.md`~~ ✅ hecho (037/038/039, #637).
