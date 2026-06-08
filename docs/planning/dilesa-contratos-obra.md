# Iniciativa — Contratos de obra (no-vivienda) DILESA

**Slug:** `dilesa-contratos-obra`
**Empresas:** DILESA
**Schemas afectados:** `dilesa` (generalizar `contratos_construccion` + tablas
nuevas de presupuesto de obra y estimaciones de monto), `erp` (`personas` como
proveedores/contratistas; futura emisión a CxP)
**Estado:** in_progress
**Próximo hito:** Sprint 1 schema en prod: `contratos_construccion` + tipo/anticipo/retención/IVA + `obra_presupuesto`/`obra_estimaciones` (266 contratos backfill a vivienda; ADR-038). IVA 8% frontera / 16% excepción. Próximo: parser de traspaso LDLE+LDS (RESUMEN + contratos + estimaciones). Fase 2 = emisión a CxP
**Dueño:** Beto
**Creada:** 2026-06-01
**Última actualización:** 2026-06-07 (Ciclo de obra end-to-end: Capa A (#617) +
Capa B (#631) + Sprint 3 Costeo (#639) + Sprint 4 captura (#644) + **puente CxP**
backend (#651, en prod) + UI "Emitir a CxP" (#654) + **Sprint 5 captura de
presupuesto**. **Sprint promovido 2026-06-06: Contratos → partidas + PDF de obra**
(ejecuta ADR-042 Fases 2-3 + PDF) — el monto de contrato no se ve por partida
(302/303 sin `partida_id`) + falta el PDF de obra de monto global; plan de 4 fases
documentado en Bitácora. **Fases 1-4 done** (#709 DB · #710 UI partida · #711 Costeo 3 capas +
backfill · #712 PDF de obra). **Sprint UI: edición de datos del contrato** desde el detalle
(sección "Editar datos del contrato", solo obra) para no depender de SQL. Aparte: reasignar los 8
contratos placeholder + 3 contratos de obra sin partida; capturar `objeto`/plazo de los contratos
de obra existentes.)

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

### 2026-06-02 — Puente Capa B → CxP (ADR-039 Fase 2)

El pago de obra ya engancha a Cuentas por Pagar. Implementa ADR-039.

- **Backend (en prod, #651):** `erp.facturas.obra_estimacion_id` (FK →
  `obra_estimaciones`, `ON DELETE SET NULL`) + índice único parcial (1 factura
  activa por estimación) + RPC `erp.cxp_factura_desde_estimacion(estimacion_id,
condiciones_pago_dias?)` que **reúsa** `cxp_factura_alta` (no modifica el RPC de
  CxP), valida `monto > 0` (neto a CxP) + no-duplicado, emite egreso `por_pagar` y
  liga el `obra_estimacion_id`. Smoke test (rollback) en prod OK.
- **UI (este PR):** en `<ObraContratoDetalle>`, columna **CxP** por estimación —
  botón **"Emitir a CxP"** (monto > 0, no emitida, con write) que llama el RPC, y
  badge del `estado_cxp` de la factura ligada (por pagar / parcial / pagada) con
  link a `/dilesa/cxp`.
- Ciclo completo: **capturar estimación → Emitir a CxP → programar/aprobar
  (Dirección)/pagar/conciliar** en el módulo CxP. Depende de que CxP esté en
  DILESA (ya, vía cxp #640).

### 2026-06-02 — Sprint 5 (captura de presupuesto de obra)

CRUD de la Capa A (`dilesa.obra_presupuesto`), que hasta ahora era solo-lectura
(el traspaso cargó 128 conceptos, sin forma de capturar/corregir hacia adelante).
Sin schema, sin migración: el sub-slug `dilesa.construccion.costeo` ya tiene write.

- **Form de captura** `components/dilesa/costeo-concepto-form.tsx` (alta + edición),
  calca el inline de `obra-contrato-detalle.tsx` (`useState` plano, sin drawer).
  Campos: proyecto (selector, requerido), concepto (requerido), etapa, presupuesto
  previo/actualizado, gasto real, proveedor (texto), fecha compromiso. Insert/update
  directo con RLS `dilesa`.
- **Tab Costeo** (`costeo-module.tsx`): botón "Nuevo concepto" + columna de acciones
  por renglón (`RowActions` → editar / eliminar con `ConfirmDialog`), ambos gated por
  `dilesa.construccion.costeo`.write. Soft-delete (`deleted_at`). El form se remonta
  por `key` al alternar entre conceptos. `CosteoRow` extendido con los campos crudos
  (`presupuestoPrevio`/`presupuestoActualizado`/`fechaCompromiso`/`orden`) para
  pre-llenar la edición; KPIs y `deriveKpis` intactos.
- **Decisiones Sprint 5:** `orden` autocalculado (max del proyecto + 1) en alta y
  preservado en edición — no se expone (reordenar es otra feature). IVA: v1 captura
  `gasto_real_total` c/IVA; el desglose subtotal/iva/tasa queda null (igual que el
  traspaso, ADR-038). Proveedor solo texto (la liga a `erp.personas` sigue diferida,
  D2). 5 checks verdes (1184 tests). **PR de UI → sin auto-merge** (Beto revisa el
  preview).

### 2026-06-03 — Fix selector de proyectos (Sprint 5, mismo PR #656)

Beto notó duplicados en el dropdown "Proyecto" del form de captura. Diagnóstico
(SELECT a `dilesa.proyectos`): **no eran duplicados de datos** sino pares
anteproyecto→desarrollo legítimos (Ampliación LDLE y Lomas de las Delicias ya
pasaron de anteproyecto `completado` a desarrollo `ejecutando`, ligados por
`proyecto_predecesor_id`).

**Criterio (decisión de Beto):** sí se presupuesta en fase de anteproyecto, así
que NO se ocultan los anteproyectos del dropdown — se **identifican**. Lógica del
selector:

- **Desarrollos** → se muestran (son los proyectos).
- **Anteproyectos NO convertidos** → se muestran con sufijo **`(anteproyecto)`**.
- **Anteproyectos YA convertidos** (su id aparece como `proyecto_predecesor_id`
  de algún desarrollo) → se **omiten**: cualquier presupuesto/gasto va sobre el
  desarrollo sucesor. Esto elimina el duplicado por nombre.

`proyectoMap` (resuelve nombres en la tabla de costeo) se deja con TODOS los
proyectos por robustez. Sin schema. Los anteproyectos convertidos **no se borran
de la DB** (son el registro del anteproyecto ganador, trazabilidad del flujo);
solo se ocultan del selector. Corregida la nota errónea de "duplicado a limpiar".

### 2026-06-03 — Helper compartido del selector + réplica a nuevo-obra (PR aparte)

A pedido de Beto, se replicó el patrón del selector a los demás forms de captura.
Para no duplicar la lógica se extrajo a **`lib/dilesa/proyectos-selector.ts`**
(`buildProyectoOptions` + `proyectoOptionLabel`, helper puro + test de 7 casos):

- **`costeo-module` / `costeo-concepto-form`** → ahora usan el helper (antes inline).
- **`/contratos/nuevo-obra`** (contrato de obra) → aplica el mismo patrón; antes
  listaba los proyectos crudos y mostraba el duplicado anteproyecto/desarrollo.

**Forms que NO lo necesitan** (verificado): `/contratos/nuevo` (vivienda) y
`/ventas/nueva` ya derivan su selector de las **unidades/lotes** elegibles
(`proyectosConUnidades`), así que un anteproyecto sin unidades nunca aparece —
no tienen el duplicado. Los **filtros** de proyecto en las vistas de lista
(contratos-module, ventas-module, etc.) sí muestran el duplicado, pero es de bajo
impacto (filtrar por el gemelo viejo da 0 filas); pendiente menor si Beto lo quiere.
Sin schema, sin migración.

## Handover — estado y próximos pasos (para la siguiente sesión)

**Hecho (en prod):** schema Sprint 1 (#615) + Capa A de costeo (`obra_presupuesto`,
128 renglones, #617) + **Capa B de contratos + estimaciones** (32 contratos, 275
estimaciones, #631) + **ADR-039** (#637) + **Sprint 3** tab Costeo (#639) +
**Sprint 4** captura de obra (#644) + **Puente CxP** backend (#651) + UI (#654) +
**Sprint 5** captura de presupuesto (este PR). Ciclo de obra **end-to-end**: crear
contrato → estimar → emitir a CxP → costear; y el presupuesto (Capa A) ya es
editable. Falta el módulo upstream: **cotizaciones**.

**Próximo trabajo — handoff para sesión nueva.**

_1. Captura de presupuesto (Sprint 5) — ✅ HECHO (este PR)._ `dilesa.obra_presupuesto`
ya tiene CRUD en el tab Costeo: form `costeo-concepto-form.tsx` (alta + edición) +
"Nuevo concepto" + acciones por renglón (editar / eliminar), gated por
`dilesa.construccion.costeo`.write. Sin schema, sin migración. Ver Bitácora
2026-06-02.

_2. Cotizaciones (iniciativa nueva — promover con Beto antes de construir)._ Hoy
no hay dónde capturar/comparar cotizaciones antes de adjudicar un contrato (el
`IB TRAYMAQ` del Excel —2 postores lado a lado— se saltó en el traspaso). Sketch:
tabla nueva `dilesa.obra_cotizaciones` (`proyecto_id`, frente/concepto, proveedor
[texto o `erp.personas`], `monto`, vigencia, `archivo_url`, `estado`
recibida/adjudicada/descartada, notas) + opcional `cotizacion_partidas` para
volumen×PU. Flujo: capturar N por frente → comparar (side-by-side) → **adjudicar →
genera contrato de obra** (pre-llena el form `/contratos/nuevo-obra`). UI: tab
nuevo "Cotizaciones" en `/dilesa/construccion` (sub-slug nuevo + migración de
módulo — regla de 4 lugares en `BSOP/CLAUDE.md`). Es **dominio nuevo, no un sprint
de esta iniciativa**: estresar (problema/métrica/riesgos) + crear su planning doc

- fila en `INITIATIVES.md` + ADR si el modelo lo amerita, antes de construir.

**Patrones a calcar:** `costeo-module.tsx` (tabla + KPIs + fetch cross-schema),
`obra-contrato-detalle.tsx` (captura inline + emitir-a-CxP),
`app/dilesa/construccion/contratos/nuevo-obra/page.tsx` (form de alta). **Gotcha
vivo:** serializar migración↔merge — aplicar DDL a prod antes de mergear rompe
`schema:check` en todos los PRs (ver [[reference_bsop_merge_flow_multisesion]]).
**PR en vuelo:** #654 (UI del puente CxP) — Beto lo revisa en preview y mergea.

**Decisiones ya cerradas (no re-preguntar):**

- Proyecto del Excel **LDLE = "Lomas de los Encinos"** (`42c64197-2358-4607-a21c-97556ceb3110`),
  **LDS = "Lomas del Sol"** (`a506b99f-1b6e-4024-a94a-59deaed48727`). empresa
  DILESA `f5942ed4-7a6b-4c39-af18-67b9fbf7f479`.
- IVA **8% frontera / 16% excepción**, desglose solo donde esté especificado
  (ver [[project_iva_frontera]] y ADR-038).
- Estimaciones de obra en tabla nueva `obra_estimaciones` (no en `dilesa.estimaciones`).
- Contratistas sin nombre → placeholder reasignable; SIMAS = contrato.

**Migraciones aplicadas a prod:** sub-slug Costeo `20260602030000` (Sprint 3) y
puente CxP `20260602200000` (`obra_estimacion_id` + RPC) — ambas verificadas.

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
- **Duplicado ELECTROGAZA** en `erp.personas` (2 filas; se usó la más antigua) —
  limpiar.
- ~~"duplicado" Ampliación Lomas de los Encinos en `dilesa.proyectos`~~ ✅
  **NO era duplicado** (verificado 2026-06-03): `cd7c9cae` es el **anteproyecto**
  (completado) y `26352cac` el **desarrollo** (ejecutando) ligado por
  `proyecto_predecesor_id` — par legítimo del flujo anteproyecto→desarrollo.
  Igual Lomas de las Delicias (`34920025` antep. / `dd4a4e44` desarrollo). NO
  borrar. El "duplicado visual" en el selector se resolvió ocultando solo los
  anteproyectos **ya convertidos** y etiquetando los no convertidos como
  `(anteproyecto)` (ver Bitácora 2026-06-03).
- ~~ADR-038 → índice §5 de `ARCHITECTURE.md`~~ ✅ hecho (037/038/039, #637).
- **2026-06-06** — **Sprint promovido: Contratos de obra → partidas + PDF** (ejecuta
  ADR-042 Fases 2-3 + PDF de obra). Gatillado por Beto al revisar el contrato real
  "Muro de contención (Maya)" de Lomas de las Delicias y notar 3 cosas: (a) el monto
  del contrato ($860k) aparece en el KPI **"Contratado"** del Costeo pero **NO dentro de
  ninguna partida**; (b) falta **generar el contrato de obra en PDF**; (c) el modelo no
  captura todo lo del contrato real. **Diagnóstico (verificado en prod):** 302/303
  contratos tienen `partida_id` NULL — la columna existe desde ADR-042 Fase 0 (sprint
  cotizaciones, #703) pero el alta de contrato (`nuevo-obra/page`) no la asigna ni tiene
  selector. El Costeo (`presupuesto_partidas` + KPI agregado de contratos por proyecto)
  suma el contrato pero no lo liga a una partida. El PDF existente (`lib/dilesa/pdf/
contrato-obra.tsx`) es para **vivienda** (lotes/prototipos/Anexo 3), no para obra de
  monto global como Maya (`tipo='obra_cabecera'`, objeto descriptivo "225m muro").
  **Plan — 4 fases (cada una su PR):**
  1. **DB** — agregar a `dilesa.contratos_construccion`: `objeto` (descripción del
     trabajo), `fecha_inicio`/`fecha_fin` (plazo), `fianza_pct`,
     `periodicidad_estimaciones_dias`. (`partida_id` ya existe.) Migración con OK de Beto.
  2. **UI alta/edición** — selector de partida (1:1, ADR-042, `buildPartidaIndex`) + los
     campos nuevos en `nuevo-obra/page` + edición. El `comprometido` fluye a
     `v_partida_control` por `partida_id` (ya cableado en Fase 0).
  3. **Costeo por partida + backfill** — mostrar el comprometido de contratos **por
     partida** en `costeo-module` (de `v_partida_control`), no solo el KPI agregado.
     **Backfill** de los 302 contratos (ligar cada uno a su partida — con Beto, asistido
     por proyecto/concepto).
  4. **PDF de obra** — PDF de contrato de obra de **monto global** (declaraciones +
     cláusulas + objeto + monto/anticipo/retención/fianza, sin lotes/prototipos),
     reusando el formato legal del contrato real. Exponerlo desde la adjudicación de RFQ
     (`cotizaciones-module`) + el módulo de contratos.
     **Decisiones a confirmar con Beto antes de ejecutar:** campos exactos del modelo
     (Fase 1); estrategia de backfill (asistido vs manual, Fase 3); si el PDF es plantilla
     genérica de obra o varía por tipo (Fase 4). **Estado:** plan documentado; pendiente
     arrancar Fase 1 (DB) con OK.
- **2026-06-06** — **Sprint Contratos→partidas+PDF · Fase 1 (DB campos) aplicada a prod.**
  Migración `20260606120000_contratos_construccion_campos_obra`: 5 columnas nullable en
  `dilesa.contratos_construccion` — `objeto` (descripción del trabajo), `fecha_inicio` /
  `fecha_fin` (plazo de ejecución), `fianza_pct` (fianza de cumplimiento) y
  `periodicidad_estimaciones_dias` — para capturar el contrato completo (formato legal real)
  y habilitar el PDF de obra (Fase 4). **Aditivo puro** (no afecta los 303 contratos;
  validada en dry-run: 5 columnas creadas). Aplicada vía MCP con OK de Beto; **historial
  registrado con el timestamp del archivo** (repair inmediato post-`apply_migration` para no
  acumular el drift que rompe el Supabase Preview — lección de [[reference_bsop_merge_flow_multisesion]]).
  SCHEMA_REF + types regenerados (5 columnas, sin drift). Próximo: Fase 2 (UI alta/edición de
  contrato con selector de partida + estos campos).
- **2026-06-06** — **Sprint Contratos→partidas+PDF · Fase 2 (UI alta + edición/ligado).** Dos
  cosas: (1) **Alta** (`nuevo-obra/page.tsx`): selector de **partida del presupuesto** (agrupado
  etapa›capítulo vía `buildPartidaIndex`, depende del proyecto; resetea al cambiar de proyecto)
  - sección "Alcance, plazo y garantía" con los 5 campos nuevos (`objeto`, `fecha_inicio`,
    `fecha_fin`, `fianza_pct`, `periodicidad_estimaciones_dias`); el insert los popula +
    `partida_id`. (2) **Edición/ligado** (`[id]/page.tsx`, detalle del contrato): sub-componente
    `<LigarPartida>` — selector de partida + Guardar (`UPDATE partida_id`) en una Section nueva,
    para **ligar los 302 contratos existentes** (incl. Maya) a su partida → la herramienta del
    backfill de Fase 3. Respeta `puedeEscribir` (write del sub-slug `dilesa.construccion.contratos`).
    El detalle era solo-lectura; ahora permite el ligado puntual. Una vez ligado, el `valor_total`
    del contrato cuenta como comprometido en esa partida vía `v_partida_control` (cableado en Fase
    0). 5 checks verdes (1305 tests). **Sin migración → preview-first.** Próximo: Fase 3 (Costeo
    muestra el comprometido **por partida** + backfill de los 302 con Beto) y Fase 4 (PDF de obra).

### 2026-06-06 — Sprint Contratos→partidas+PDF · Fase 3 (Costeo por partida + backfill) — PR #711

El Costeo de Construcción muestra el control de **3 capas por partida** (ADR-042) y los
contratos de obra históricos quedaron ligados a su partida.

- **UI** (`costeo-module.tsx`): query paralela a `erp.v_partida_control` + lookup Map por
  `partida_id`; cada renglón (y subtotal de capítulo/etapa) muestra **Comprometido** (Σ OC +
  contratos ligados) · **Ejercido** (recibido + facturas directas) · **Disponible** (presupuesto
  − comprometido; **rojo si negativo** = sobre-contratación). Sustituyen las columnas "% ejec" y
  "Proveedor"; KPIs de rollup intactos. 5 checks verdes (1306 tests). **UI visible →
  preview-first** (PR #711, sin auto-merge).
- **Diagnóstico que corrigió el handoff:** de los 302 contratos sin `partida_id`, **269 son
  vivienda** (NO van a partidas de obra por diseño ADR-042 — se costean por lote/prototipo). El
  backfill real eran **33 de obra** (22 urbanización + 10 cabecera + 1 tarea menor).
- **Backfill `20260606190000`** (DML idempotente, **aplicado a prod + registrado en historial**):
  liga **30** contratos por match keyword-del-frente + monto al centavo (valida proyecto). De los
  33: 29 por match automático + **Maya** ($860k muro de contención) ligado a la partida seed
  "Barda perimetral" de Lomas de las Delicias por decisión de Beto → disponible −$860k (alarma de
  contratado-sin-presupuesto, hasta capturar el cuadro de Delicias). **3 quedan sin ligar**
  (URBANIZACIÓN-C5 $617k, VANDALIZADAS-C4 $0, ESTRELLA-P3 $12k) — se ligan con `<LigarPartida>`
  cuando se decida el concepto.
- **Verificado en prod:** 31 obra ligados / 3 sin ligar / 269 vivienda sin ligar; SIMAS cuadra al
  centavo (disponible $0); Maya −$860k. **Nota:** electrificación/pavimentación LDLE muestran
  disponible negativo porque varios contratos del frente se agruparon en el concepto ancla (el
  hermano queda sin comprometido) — reasignable con `<LigarPartida>` si se quiere precisión.
- **Pendiente:** Fase 4 (PDF de contrato de obra de monto global).

### 2026-06-07 — Sprint Contratos→partidas+PDF · Fase 4 (PDF de obra de monto global) — PR #712

Los contratos de obra ya generan su contrato en PDF (antes solo vivienda podía). Cierra el sprint.

- **Template** `lib/dilesa/pdf/contrato-obra-global.tsx`: "Contrato de Servicios a Precios Unitarios
  y Tiempo Determinado" de monto global — declaraciones + 18 cláusulas + 2 testigos, fiel al contrato
  legal real (Maya). El `objeto` descriptivo reemplaza la tabla de lotes (cláusula PRIMERA); sin
  ANEXO 3. Reusa `HeaderBand`/`FooterBand`/`Folio`/`styles` + constantes del cliente DILESA. 1 página.
- **Endpoint** `[id]/pdf/route.tsx`: branch por `tipo` — vivienda usa lotes + ANEXO 3 (intacto),
  no-vivienda arma el template global. **Botón** "Descargar contrato (PDF)" en el detalle para ambos
  tipos (antes gateado a vivienda).
- **Revisión del contrato con Beto** (mismo PR): **fianza y anticipo CONDICIONALES** — si
  `fianza_pct`/`anticipo_pct` = 0, el contrato NO los exige (la garantía pasa al fondo de retención
  del 5%, que es lo que sí aplican con contratistas locales). Fix: la periodicidad ya no hardcodea
  "(catorce)". **Form de alta** (`nuevo-obra/page.tsx`): defaults anticipo/fianza 0 + retención 5;
  **objeto obligatorio** + dropdown de objetos de obra comunes (frentes DILESA) que pre-llena el campo.
- Render verificado (smoke caso Maya + caso local sin fianza/anticipo). Test source-level (18
  cláusulas, condicionales, sin lotes/anexo). **UI visible → preview-first** (PR #712).
- **Decisiones de Beto cerradas:** escritura 177 + Adalberto Santos como representante de obra
  (vigente); testigos Francisco Rivera + Nelcy Martínez (vigentes); REPSE/registro patronal siempre
  se exigen (el blanco del PDF es solo fallback). **Pendiente menor:** capturar el `objeto` de los
  contratos de obra existentes (Maya y demás) para que su PDF salga completo (hoy usan placeholder).

### 2026-06-07 — Sprint UI: edición de datos del contrato de obra — PR #714

Los contratos de obra (no-vivienda) ya se editan desde la UI; antes el detalle era read-only salvo
`<LigarPartida>` y los ~33 contratos históricos (objeto/plazo/fianza/periodicidad vacíos) había que
corregirlos por SQL para que su PDF de obra (Fase 4) saliera completo. Resuelve el **Pendiente
menor** que dejó abierto la Fase 4.

- **Sección "Editar datos del contrato"** (`[id]/page.tsx`, sub-componente `<EditarDatosContrato>`):
  solo para `tipo != 'vivienda'`, gated por **write** de `dilesa.construccion.contratos`. Calca
  `<LigarPartida>` (useState + UPDATE directo) y el form de alta. Edita `objeto` (dropdown
  `OBJETOS_COMUNES` + textarea), `fecha_inicio`/`fecha_fin`, `anticipo_pct`/`retencion_pct`/
  `fianza_pct`, `periodicidad_estimaciones_dias`, `valor_total` y `notas`.
- **Dirty-check** por snapshot normalizado (robusto al numeric-as-string de PostgREST); Guardar se
  deshabilita sin cambios o con `valor_total <= 0`. Tras guardar sube el patch al detalle
  (`onSaved`) → la ficha "Datos generales" y el saldo de `<ObraContratoDetalle>` se refrescan sin
  recargar.
- **Refactor:** `OBJETOS_COMUNES` extraído de `nuevo-obra/page.tsx` a `lib/dilesa/objetos-obra.ts`
  (`.ts` plano compartido por alta + edición; sin duplicar). Decisión de secuencia: se mergeó la
  Fase 4 (#712) **antes** de este sprint para reusar `OBJETOS_COMUNES` desde main sin choque en
  `[id]/page.tsx`.
- **Sin migración** (las 9 columnas ya existían desde Fase 1, #709). 5 checks verdes (1312 tests).
  **UI visible → preview-first** (#714, sin auto-merge).
