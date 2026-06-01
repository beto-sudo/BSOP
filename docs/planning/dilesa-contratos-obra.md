# Iniciativa — Contratos de obra (no-vivienda) DILESA

**Slug:** `dilesa-contratos-obra`
**Empresas:** DILESA
**Schemas afectados:** `dilesa` (generalizar `contratos_construccion` + tablas
nuevas de presupuesto de obra y estimaciones de monto), `erp` (`personas` como
proveedores/contratistas; futura emisión a CxP)
**Estado:** planned
**Dueño:** Beto
**Creada:** 2026-06-01
**Última actualización:** 2026-06-01 (promovida; exploración de los Excel de
LDLE y LDS hecha; modelo propuesto a validar antes de tocar schema)

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
