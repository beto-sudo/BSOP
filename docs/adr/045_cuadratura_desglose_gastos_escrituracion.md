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

## Spec de campos

| Concepto                                | Hogar de datos                                                             | Captura / Deriva                             | Estado hoy                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Precio base asignación                  | `ventas.precio_base` **(columna nueva)**, congelado al asignar             | capturado / snapshot                         | no existe; solo el genérico del prototipo (920k) en `desglose_precio.valor_comercial` ⚠️ |
| Incremento crédito (+6% FOVISSSTE/IMSS) | `ventas.incremento_credito` **(columna nueva)**, congelado                 | derivado al asignar (pct catálogo × base)    | no existe como columna                                                                   |
| Sobreprecio / productos adicionales     | `ventas.sobreprecio_adicionales` **(columna nueva)**                       | capturado al asignar                         | mezclado en `descuento` ⚠️                                                               |
| Precio de escrituración                 | `ventas.valor_escrituracion`                                               | derivado (base + incremento + sobreprecio)   | ✓ existe                                                                                 |
| Apoyo Infonavit                         | `tipos_credito.apoyo_infonavit_monto`                                      | derivado (catálogo: 30k Infonavit / 0 resto) | ✓                                                                                        |
| Promoción / bono de gastos              | `ventas.promocion_gastos_monto` **(columna nueva)** ← `dilesa.promociones` | derivado del catálogo + congelado            | hoy en `descuento_gastos_escrituracion`, mezclado ⚠️ → migrar                            |
| Descuento comercial al precio           | `ventas.descuento_total` (queda solo para esto)                            | capturado                                    | 0 en MAYRA                                                                               |
| Enganche aplicado a gastos              | `erp.cxc_pagos` (fuente cliente)                                           | capturado                                    | ✓ existe                                                                                 |
| Pagaré                                  | `ventas.monto_credito_directo`                                             | capturado (= faltante)                       | ✓ existe                                                                                 |
| Cheque a notaría                        | `ventas.monto_cheque_notaria`                                              | capturado (fase 11)                          | ✓ existe (= gastos − apoyo)                                                              |
| Snapshot del cálculo                    | `ventas.desglose_precio` (jsonb)                                           | snapshot al asignar (auditoría)              | ✓ existe — pasa a ser solo trazabilidad                                                  |

Constraint sugerido (trigger/app): `valor_escrituracion = precio_base + incremento_credito + sobreprecio_adicionales`. El **panel de cuadratura** muestra dos bloques — "Formación del precio de escrituración" (la cadena) y "Cobertura del presupuesto notarial" (las 4 fuentes etiquetadas por quién paga: cliente / crédito / DILESA) — más un resumen "quién financia los gastos" que separa el costo real de DILESA (solo la promoción) del pass-through del crédito.

## Migración de datos legacy

1. **Separar el `descuento` mezclado:** la promoción (`promocion_gastos_monto`) sale del catálogo `dilesa.promociones` por prototipo (15,000 estándar); el excedente que estaba en `descuento_*` → `sobreprecio_adicionales`. `descuento_total` queda solo con descuento comercial real (típicamente 0).
2. **Poblar las columnas nuevas** (`precio_base`, `incremento_credito`, `sobreprecio_adicionales`) en las legacy. El `precio_base` debe ser el **real al asignar**, no el genérico del prototipo — revisar cuántas legacy de Coda tienen el base desactualizado (deberían ser pocas; caso por caso con Beto).
3. **Sin tocar el saldo de las que ya cuadran** sin verificación adversarial contra las ~230 escrituradas.
4. **Caso MAYRA:** `precio_base` 899,000, `incremento_credito` 55,419, `sobreprecio_adicionales` 24,651, `promocion_gastos_monto` 15,000, `descuento_total` 0, pagaré 9,387, cheque 84,038. (El descuento **no** se sube a 39,651 — eso era el workaround del modelo viejo.)

## Alternativas consideradas

- **Todo en el jsonb `desglose_precio`** (sin columnas nuevas): descartado — el modelo financiero alimenta utilidad, cuadratura y reportes al Consejo; cavar en jsonb no es consultable ni type-safe ni admite constraints. El jsonb se conserva como snapshot de auditoría, no como fuente operativa.
- **Tabla de cuadratura dedicada** (`dilesa.venta_cuadratura`): sobre-ingeniería para v1 — los campos caben en `ventas` + `cxc_pagos` + catálogo de promociones. Reconsiderar si el modelo crece.
- **Mantener todo en `descuento`** (status quo): rechazado — es la causa de la utilidad subestimada.

## Consecuencias

- **Utilidad/participación DILESA correcta:** ingreso = precio interno (954,419 en MAYRA), del que solo resta la promoción (15,000) + costo + comisiones; el sobreprecio deja de castigarla.
- **El pagaré sale al monto real** (9,387 en MAYRA, no 34,038) porque el motor reconoce el sobreprecio como fuente.
- **Migración delicada:** separar promoción/sobreprecio/descuento en el histórico requiere criterio y OK de Beto caso por caso.
- **Toca superficies sensibles** (correo al Consejo, copiloto de cierre, nota de crédito, utilidad). Verificación adversarial contra las 230 escrituradas obligatoria antes de mergear el motor.
- El `valor_facturado` y la nota de crédito (modelo total + NC, confirmado por Beto) no cambian su lógica; sí se corrige el `valorRealVentaDilesa` que hoy sale negativo.
- **Captura nueva:** las nuevas asignaciones guardan todo el desglose congelado desde el inicio (cierra el gap que dejó MAYRA).
