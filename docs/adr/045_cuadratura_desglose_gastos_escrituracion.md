# ADR-045 — Cuadratura de gastos de escrituración: desglose de las 4 fuentes

- **Status**: Proposed
- **Date**: 2026-06-17
- **Authors**: Beto, Claude Code
- **Iniciativa**: [`dilesa-cuadratura-sobreprecio`](../planning/dilesa-cuadratura-sobreprecio.md)
- **Companion to**: modelo en memoria `reference_dilesa_sobreprecio_cheque_notaria`; motor `lib/dilesa/cuadratura.ts`

---

## Contexto

La cuadratura de una venta DILESA tiene que explicar cómo se paga el **presupuesto notarial** (gastos de escrituración). El modelo de Coda (validado contra el Excel maestro "Relación Gastos Escrituración y Participación Dilesa", hoja LDLE, 302 ventas, 2026-06-17) lo cubre con **cuatro fuentes**:

1. **Promoción DILESA** (el "bono", 15,000 estándar) — beneficio comercial que **le cuesta a DILESA**.
2. **Enganche del cliente** (depósitos).
3. **Sobreprecio / productos adicionales** — inflado en el precio; **lo paga el crédito** de la institución (no le cuesta a DILESA).
4. **Pagaré** — el residual que el cliente firma a pagar.

Identidad: `gastos = apoyo_infonavit + promoción + enganche + sobreprecio + pagaré`, y el **cheque a notaría = gastos − apoyo_infonavit** = promoción + enganche + sobreprecio + pagaré.

**El problema:** BSOP hoy mete la promoción **y** el sobreprecio juntos en `descuento_total` / `descuento_gastos_escrituracion`. Eso (a) cuadra el saldo pero (b) **subestima la utilidad/participación de DILESA** — parece que DILESA regaló todo el monto cuando solo aportó la promoción; el sobreprecio lo paga el cliente vía el crédito. Y el motor (`cuadratura.ts`) no contabiliza el sobreprecio como fuente de cobertura, así que proyecta pagarés mayores a los reales.

**Caso detonante (MAYRA, FOVISSSTE):**

```
Precio base asignación (Coda)   899,000
+ incremento FOVISSSTE (+6%)     55,419   → Precio interno DILESA 954,419
+ adicionales (productos)        24,651   → Precio de escrituración 979,070

Presupuesto notarial             84,038
  − promoción / bono             15,000   (costo DILESA)
  − enganche                     35,000   (cliente)
  − adicionales (sobreprecio)    24,651   (crédito)
  − pagaré                        9,387   (cliente)
  = cheque a notaría             84,038
```

Con el modelo viejo, para cuadrar había que inflar el "descuento" a 39,651 (15,000 + 24,651) — mezclando los dos conceptos. Con el modelo desglosado, el **descuento queda en 15,000** (solo la promoción) y el sobreprecio vive aparte.

**Lo que ya existe:** el jsonb `dilesa.ventas.desglose_precio` modela la cadena de precio cuando `componentes_detallados=true` (5 ventas nativas, origen `asignacion`): trae `valor_comercial`, `gastos_notariales_6pct`, `productos_adicionales`, `costo_credito_adicional`, `apoyo_infonavit`, `precio_venta_total`. Las 626 ventas legacy (`backfill_contrato`) solo tienen `valor_comercial` + `precio_venta_total` (sub-pobladas). El módulo `dilesa.promociones` ya tiene la promo por prototipo (`productos_aplicables`, `monto`); hoy: "Bono de hasta $15,000 en gastos de escrituración".

## Decisión

**D1 — Separar promoción, sobreprecio y descuento comercial.** Son tres conceptos distintos que hoy se mezclan: la **promoción** (bono, costo de DILESA), el **sobreprecio** (productos adicionales, lo paga el crédito) y el **descuento comercial** (rebaja real al precio, 0 en MAYRA). Cada uno con su campo propio; dejar de sumarlos en `descuento_total`.

**D2 — Las 4 fuentes, cada una con su hogar de datos** (ver spec). El motor suma las cuatro para cubrir el cheque; el pagaré es el faltante.

**D3 — Columnas nuevas para el desglose operativo + `desglose_precio` jsonb como snapshot de auditoría** (decisión Beto 2026-06-17). Los componentes que el motor, la utilidad/participación y los reportes consultan van como **columnas** en `dilesa.ventas` (consultables, type-safe, con constraints): `precio_base`, `incremento_credito`, `sobreprecio_adicionales`, `promocion_gastos_monto`. El jsonb `desglose_precio` se conserva como el **snapshot completo del cálculo al asignar** (auditoría: zcu, esquina, metros excedentes, etc.). Todo se **congela al momento de asignar** — MAYRA se asignó en base 899,000 aunque el prototipo hoy esté en 920,000; el dato bueno es el de la asignación.

**D4 — Fórmulas del motor (objetivo):**

```
gastos_netos        = gastos_escrituracion − apoyo_infonavit
cheque_notaria      = gastos_netos                         (lo que se gira)
pagaré (faltante)   = gastos_netos − promoción − enganche_aplicado − sobreprecio_adicionales
cubierta            = promoción + enganche + sobreprecio + pagaré ≈ gastos_netos
```

**D5 — Diseño antes de código.** Este ADR se aprueba antes de tocar el motor (regla dura de Beto: nada financiero sin su OK).

**D6 — La promoción de gastos viene del módulo `dilesa.promociones`** (decisión Beto 2026-06-17), no hardcodeada ni mezclada en `descuento`. Aplica por prototipo (`promociones.productos_aplicables`), vigente al asignar; el `monto` se **congela** en `ventas.promocion_gastos_monto` (vinculado por `promocion_id`, que ya existe). Puede variar por prototipo/temporada según el catálogo.

**D7 — El motor distingue por presencia del desglose (fallback).** Si la venta tiene las columnas nuevas pobladas (es nueva o se está operando) → usa el **modelo desglosado**. Si están en `null` (ventas ya cerradas / legacy) → usa el **modelo viejo** (`descuento_total`) tal cual. Garantiza que **ninguna venta histórica cambia su cuadratura**; el rediseño solo aplica de aquí en adelante. No hay backfill masivo (ver Alcance).

**D8 — El enganche se aplica PRIMERO al precio; solo el excedente fondea los gastos** (corrección 2026-06-22, detonada por la venta **M3-L9 Juan Antonio**, Infonavit Tradicional). El "enganche aplicado a gastos" de D4 se define como:

```
enganche_aplicado = max(0, enganche − max(0, valor_escrituracion − crédito_institución))
```

Razón: en **FOVISSSTE/IMSS** el +6% infla escrituración y crédito juntos, el crédito cubre el precio (saldo ≤ 0) y todo el enganche va a gastos — el supuesto de MAYRA. Pero en **Infonavit con crédito < precio**, el enganche del cliente cubre el **saldo del precio**, NO los gastos; restarlo de los gastos era un **doble conteo** (el mismo enganche cubría el precio en la card "Cobertura del precio" Y los gastos en la card "Cobertura del presupuesto notarial"), dejando un saldo de cobertura negativo absurdo (M3-L9: −124,782). El motor expone `coberturaGastos.engancheCliente` (= aplicado a gastos) y `engancheAlPrecio` (= consumido por el precio, para la nota del panel). Verificado contra prod: las FOVISSSTE **no cambian**; 12 ventas Infonavit (activas + 1 terminada) pasan de saldo de cobertura negativo a 0; ninguna venta cuadrada se descuadra.

> **Nota (corrección posterior, 2026-06-22):** el "**descuento por sobreprecio** fantasma" que mostraba M3-L9 (17,953) **NO** lo causaba este doble conteo — venía de los **gastos inflados** heredados de Coda (62,161 vs 42,569.42 del Anexo B). Con los gastos correctos, el descuento real baja a 13,361 < 15,000 = todo bono, sobreprecio 0. El **modelo de descuento sigue siendo el validado por Michelle/Ale: `descuento real = Escritura − Valor Real`, partido en promoción (bono ≤ 15,000) + sobreprecio (el exceso)**. Un análisis intermedio propuso medir el descuento como "solo el faltante del peculio"; se **descartó** tras verificarlo contra las NC detonadas de Michelle (daba 0 de descuento, off por $13k–$18k). D8 se queda solo con el principio del enganche-al-precio (corrige la card de cobertura); no toca la definición del descuento.

**D9 — Separar el "sobreprecio para gastos" de los "productos adicionales reales"** (decisión Beto 2026-06-23, migración `20260623155819`). D1 trataba "sobreprecio / productos adicionales" como un solo concepto, guardado todo en `dilesa.ventas.productos_adicionales`. Ese campo revolvía dos cosas distintas:

- **Sobreprecio para gastos de escrituración** — se sube el precio para que el **crédito** absorba los gastos que el cliente no alcanza (cuando el monto del crédito supera el valor de venta). Lo paga el crédito, **NO comisiona**, fondea los gastos. Es el "sobreprecio" del modelo Michelle/Ale.
- **Productos adicionales reales** — closets, upgrades, mejoras del paquete. Venta real de DILESA, **SÍ comisionan**.

Hasta hoy todo lo capturado en `productos_adicionales` era sobreprecio (no había productos reales: "si acaso se vendió algo adicional antes, en un solo renglón lo revolvíamos" — Beto). Se agregó la columna **`dilesa.ventas.sobreprecio_gastos_escrituracion`** y se **movió todo el valor histórico** ahí (backfill de las **56** ventas con monto: 22 activas + 6 desasignadas + 28 terminadas; suma 6,320,874), dejando `productos_adicionales = 0` en todo el histórico. El backfill **NO cambia ninguna cuadratura ni comisión** (el motor trata el sobreprecio igual esté en un campo o en el otro); solo re-etiqueta y libera `productos_adicionales` para que signifique exclusivamente productos reales de aquí en adelante.

**Impacto en el motor:** el sobreprecio para gastos (`sobreprecioGastos`) fondea gastos y **se resta de la base de comisión** (no comisiona); los productos reales (`productosAdicionales`) NO se restan → comisionan a la misma tasa que el resto (1% / 1.5% Loma Verde). La cadena de precio (`formacionPrecio`) muestra ambos renglones por separado. `fn_calcular_precio_venta` recibe ambos parámetros y los suma al precio. Ninguno es marcador del desglose (D7 intacto: solo `promocionGastos`/`precioBase` lo activan).

**Pendiente (PRs siguientes):** la captura en la Solicitud de Asignación (el vendedor teclea el monto del crédito y, si sobra sobre el valor de venta, captura el sobreprecio — campo **en blanco** por defecto, con guía "hasta $X" del margen del crédito; nunca auto-llenado) + el ajuste en la dictaminación (fase 8, con los gastos reales del Anexo B y el crédito exacto).

## Spec de campos

| Concepto                                 | Hogar de datos                                                             | Captura / Deriva                             | Estado hoy                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Precio base asignación                   | `ventas.precio_base` **(columna nueva)**, congelado al asignar             | capturado / snapshot                         | no existe; solo el genérico del prototipo (920k) en `desglose_precio.valor_comercial` ⚠️ |
| Incremento crédito (+6% FOVISSSTE/IMSS)  | `ventas.incremento_credito` **(columna nueva)**, congelado                 | derivado al asignar (pct catálogo × base)    | no existe como columna                                                                   |
| Sobreprecio para gastos de escrituración | `ventas.sobreprecio_gastos_escrituracion` **(columna, 20260623)**          | capturado al asignar (vendedor)              | separado de productos (D9); NO comisiona ✓                                               |
| Productos adicionales reales (closets)   | `ventas.productos_adicionales`                                             | capturado al asignar (vendedor)              | SÍ comisiona; 0 en histórico tras backfill ✓                                             |
| Precio de escrituración                  | `ventas.valor_escrituracion`                                               | derivado (base + incremento + sobreprecio)   | ✓ existe                                                                                 |
| Apoyo Infonavit                          | `tipos_credito.apoyo_infonavit_monto`                                      | derivado (catálogo: 30k Infonavit / 0 resto) | ✓                                                                                        |
| Promoción / bono de gastos               | `ventas.promocion_gastos_monto` **(columna nueva)** ← `dilesa.promociones` | derivado del catálogo + congelado            | hoy en `descuento_gastos_escrituracion`, mezclado ⚠️ → migrar                            |
| Descuento comercial al precio            | `ventas.descuento_total` (queda solo para esto)                            | capturado                                    | 0 en MAYRA                                                                               |
| Enganche aplicado a gastos               | `erp.cxc_pagos` (fuente cliente)                                           | capturado                                    | ✓ existe                                                                                 |
| Pagaré                                   | `ventas.monto_credito_directo`                                             | capturado (= faltante)                       | ✓ existe                                                                                 |
| Cheque a notaría                         | `ventas.monto_cheque_notaria`                                              | capturado (fase 11)                          | ✓ existe (= gastos − apoyo)                                                              |
| Snapshot del cálculo                     | `ventas.desglose_precio` (jsonb)                                           | snapshot al asignar (auditoría)              | ✓ existe — pasa a ser solo trazabilidad                                                  |

Constraint sugerido (trigger/app): `valor_escrituracion = precio_base + incremento_credito + sobreprecio_adicionales`. El **panel de cuadratura** muestra dos bloques — "Formación del precio de escrituración" (la cadena) y "Cobertura del presupuesto notarial" (las 4 fuentes etiquetadas por quién paga: cliente / crédito / DILESA) — más un resumen "quién financia los gastos" que separa el costo real de DILESA (solo la promoción) del pass-through del crédito.

## Alcance del poblado (acotado — decisión Beto 2026-06-17)

**NO hay backfill masivo.** Las ventas **ya cerradas** (escrituradas fase ≥ 11, terminadas, desasignadas) **se quedan como están** — ya cuadraron en su momento; reescribir su desglose retroactivamente no aporta y sí arriesga. El desglose nuevo se pobla solo donde aporta:

1. **Nuevas asignaciones** — el flujo de asignación guarda las 4 columnas desde el inicio (código en el server action de asignación + `fn_calcular_precio_venta`; no es migración de datos). Es lo importante a futuro.
2. **Las ~70 ventas activas en proceso** (estado `activa`, fase < 11) — se pueblan conforme se operan / escrituran, empezando por las que están por firmar. No es un barrido automático: se asiste caso por caso (la promoción sale del catálogo por prototipo; el `precio_base` real al asignar puede diferir del genérico — son pocas).
3. **Caso MAYRA:** `precio_base` 899,000, `incremento_credito` 55,419, `sobreprecio_adicionales` 24,651, `promocion_gastos_monto` 15,000, `descuento_total` 0, pagaré 9,387, cheque 84,038. (El descuento **no** se sube a 39,651 — eso era el workaround del modelo viejo.)

Las cerradas y legacy quedan con las columnas nuevas en `null` — el motor las maneja con fallback (D7).

## Alternativas consideradas

- **Todo en el jsonb `desglose_precio`** (sin columnas nuevas): descartado — el modelo financiero alimenta utilidad, cuadratura y reportes al Consejo; cavar en jsonb no es consultable ni type-safe ni admite constraints. El jsonb se conserva como snapshot de auditoría, no como fuente operativa.
- **Tabla de cuadratura dedicada** (`dilesa.venta_cuadratura`): sobre-ingeniería para v1 — los campos caben en `ventas` + `cxc_pagos` + catálogo de promociones. Reconsiderar si el modelo crece.
- **Mantener todo en `descuento`** (status quo): rechazado — es la causa de la utilidad subestimada.

## Consecuencias

- **Utilidad/participación DILESA correcta:** ingreso = precio interno (954,419 en MAYRA), del que solo resta la promoción (15,000) + costo + comisiones; el sobreprecio deja de castigarla.
- **El pagaré sale al monto real** (9,387 en MAYRA, no 34,038) porque el motor reconoce el sobreprecio como fuente.
- **Sin riesgo al histórico:** las ventas cerradas/legacy no se tocan (columnas en `null` → fallback al modelo viejo). No hay backfill masivo. El alcance es ~70 activas en proceso + nuevas asignaciones.
- **Verificación obligatoria del fallback** antes de mergear el motor: confirmar contra una muestra de las ~230 escrituradas que su cuadratura sigue **idéntica** (el fallback no debe alterar ni un peso de lo cerrado).
- El `valor_facturado` y la nota de crédito (modelo total + NC, confirmado por Beto) no cambian su lógica; sí se corrige el `valorRealVentaDilesa` que hoy sale negativo.
- **Captura nueva:** las nuevas asignaciones guardan todo el desglose congelado desde el inicio (cierra el gap que dejó MAYRA).
