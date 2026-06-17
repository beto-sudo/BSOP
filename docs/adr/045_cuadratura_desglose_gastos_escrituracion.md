# ADR-045 — Cuadratura de gastos de escrituración: desglose de las 4 fuentes

- **Status**: Proposed
- **Date**: 2026-06-17
- **Authors**: Beto, Claude Code
- **Iniciativa**: [`dilesa-cuadratura-sobreprecio`](../planning/dilesa-cuadratura-sobreprecio.md)
- **Companion to**: modelo en memoria `reference_dilesa_sobreprecio_cheque_notaria`; motor `lib/dilesa/cuadratura.ts`

---

## Contexto

La cuadratura de una venta DILESA tiene que explicar cómo se paga el **presupuesto notarial** (gastos de escrituración). El modelo de Coda (validado contra el Excel maestro "Relación Gastos Escrituración y Participación Dilesa", hoja LDLE, 302 ventas, 2026-06-17) lo cubre con **cuatro fuentes**:

1. **Promoción DILESA** (el "bono", 15,000 estándar) — descuento comercial que **le cuesta a DILESA**.
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

**Lo que ya existe y ayuda:** el jsonb `dilesa.ventas.desglose_precio` ya modela la cadena de precio cuando `componentes_detallados=true` (5 ventas nativas, origen `asignacion`): trae `valor_comercial`, `gastos_notariales_6pct`, `productos_adicionales`, `costo_credito_adicional`, `apoyo_infonavit`, `precio_venta_total`, etc. Las 626 ventas legacy (`backfill_contrato`) solo tienen `valor_comercial` + `precio_venta_total` (sub-pobladas).

## Decisión

**D1 — Separar promoción de sobreprecio.** El `descuento_*` representa **solo descuentos comerciales** (incluida la promoción de gastos / bono). El **sobreprecio (productos adicionales) NO es descuento**: vive en el precio (`desglose_precio.productos_adicionales`) y lo paga el crédito. Dejar de sumarlos juntos.

**D2 — Las 4 fuentes, cada una con su hogar de datos** (ver spec). El motor de cuadratura suma las cuatro para cubrir el cheque; el pagaré es el faltante.

**D3 — La cadena de precio vive en `desglose_precio` jsonb** (enriquecerlo/poblarlo para legacy), no en columnas nuevas sueltas. Reconciliar el `valor_comercial` genérico del prototipo (920,000 para MAYRA) con el **precio base real** de la venta (899,000).

**D4 — Fórmulas del motor (objetivo):**

```
gastos_netos        = gastos_escrituracion − apoyo_infonavit
cheque_notaria      = gastos_netos                         (lo que se gira)
pagaré (faltante)   = gastos_netos − promoción − enganche_aplicado − sobreprecio_adicionales
cubierta            = promoción + enganche + sobreprecio + pagaré ≈ gastos_netos
```

**D5 — Diseño antes de código.** Este ADR se aprueba antes de tocar el motor (regla dura de Beto: nada financiero sin su OK).

## Spec de campos

| Concepto                                | Hogar de datos                                                            | Captura / Deriva                             | Estado hoy                                                            |
| --------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| Precio base asignación                  | `desglose_precio.valor_comercial` (reconciliar con base real de la venta) | capturado (asignación)                       | legacy trae el genérico del prototipo (920k), no el base real (899k)  |
| Incremento crédito (+6% FOVISSSTE/IMSS) | `desglose_precio.gastos_notariales_6pct`                                  | derivado (pct catálogo × base)               | poblado solo en nativas                                               |
| Sobreprecio / productos adicionales     | `desglose_precio.productos_adicionales`                                   | capturado                                    | 0 / no poblado en legacy ⚠️                                           |
| Precio de escrituración                 | `ventas.valor_escrituracion` (= `desglose_precio.precio_venta_total`)     | derivado (suma de la cadena)                 | ✓ existe                                                              |
| Apoyo Infonavit                         | `tipos_credito.apoyo_infonavit_monto`                                     | derivado (catálogo: 30k Infonavit / 0 resto) | ✓                                                                     |
| Promoción / bono de gastos              | `ventas.descuento_gastos_escrituracion`                                   | capturado                                    | hoy mezcla promoción + sobreprecio ⚠️ → debe ser solo promoción (15k) |
| Enganche aplicado a gastos              | `erp.cxc_pagos` (fuente cliente)                                          | capturado                                    | ✓ existe                                                              |
| Pagaré                                  | `ventas.monto_credito_directo`                                            | capturado (= faltante)                       | ✓ existe                                                              |
| Cheque a notaría                        | `ventas.monto_cheque_notaria`                                             | capturado (fase 11)                          | ✓ existe (= gastos − apoyo)                                           |

El **panel de cuadratura** muestra dos bloques: "Formación del precio de escrituración" (la cadena) y "Cobertura del presupuesto notarial" (las 4 fuentes, cada una etiquetada por quién la paga: cliente / crédito / DILESA), más un resumen "quién financia los gastos" que separa el costo real de DILESA (solo la promoción) del pass-through del crédito.

## Migración de datos legacy

1. **`descuento_gastos_escrituracion` = solo la promoción.** Para las ventas donde se mezcló (descuento > promoción estándar), separar: promoción = 15,000 (el bono estándar; confirmar caso por caso), el excedente → `productos_adicionales`.
2. **Poblar `desglose_precio` detallado** en las 626 legacy: `productos_adicionales = valor_escrituracion − precio_interno` (donde se conozca el precio interno) y `valor_comercial` = base real (no el genérico del prototipo).
3. **Sin tocar el saldo de las que ya cuadran** sin verificación adversarial contra las ~230 escrituradas.
4. Caso MAYRA: descuento se queda en **15,000** (la promoción, ya correcta — **no** subirlo a 39,651 como se había planteado con el modelo viejo); poblar `productos_adicionales = 24,651`; capturar pagaré 9,387 y cheque 84,038.

## Alternativas consideradas

- **Columnas nuevas sueltas** (`precio_base`, `incremento_credito`, …) en `ventas`: descartado — la cadena de precio ya tiene contenedor (`desglose_precio` jsonb) y `fn_calcular_precio_venta` ya produce esos componentes. Enriquecer el jsonb evita columnas redundantes.
- **Tabla de cuadratura dedicada** (`dilesa.venta_cuadratura`): sobre-ingeniería para v1 — los campos caben en `ventas` + `desglose_precio` + `cxc_pagos`. Reconsiderar si el modelo crece.
- **Mantener todo en `descuento`** (status quo): rechazado — es la causa de la utilidad subestimada.

## Consecuencias

- **Utilidad/participación DILESA correcta:** ingreso = precio interno (954,419 en MAYRA), del que solo resta la promoción (15,000) + costo + comisiones; el sobreprecio deja de castigarla.
- **El pagaré sale al monto real** (9,387 en MAYRA, no 34,038) porque el motor reconoce el sobreprecio como fuente.
- **Migración delicada:** separar promoción/sobreprecio en el histórico requiere criterio y OK de Beto caso por caso.
- **Toca superficies sensibles** (correo al Consejo, copiloto de cierre, nota de crédito, utilidad). Verificación adversarial contra las 230 escrituradas obligatoria antes de mergear el motor.
- El `valor_facturado` y la nota de crédito (modelo total + NC, confirmado por Beto) no cambian su lógica; sí se corrige el `valorRealVentaDilesa` que hoy sale negativo.
