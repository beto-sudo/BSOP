# Iniciativa — Cuadratura del sobreprecio y cheque a notaría (DILESA)

**Slug:** `dilesa-cuadratura-sobreprecio`
**Empresas:** DILESA
**Schemas afectados:** `dilesa.ventas` — **campos nuevos de desglose** (promoción de gastos de escrituración, sobreprecio para gastos / productos adicionales, aportación Dilesa, enganche aplicado a gastos) separados del actual `descuento_total` que hoy los mezcla; motor `lib/dilesa/cuadratura.ts` + UI `components/dilesa/cuadratura-panel.tsx` + armado de inputs en `app/dilesa/ventas/[id]/page.tsx` y la captura de fase 10 (`.../capturar/10-firmas-programadas/page.tsx`). Lectura de `tipos_credito` (apoyo Infonavit, costo_venta_adicional), `productos.valor_comercial_referencia`, `desglose_precio`, `erp.cxc_pagos`. Posible ADR del modelo financiero.
**Estado:** in_progress
**Próximo hito:** Sprint 1 — **diseñar** el modelo de datos desglosado (las 4 fuentes de cobertura de gastos) + el panel de cuadratura que las muestre, y **traer el diseño a Beto antes de tocar el motor**.
**Dueño:** Beto
**Creada:** 2026-06-17
**Última actualización:** 2026-06-17 (modelo de Coda validado contra el Excel maestro; iniciativa a in_progress; rediseño con campos desglosados arrancando)

> Detonante operativo: la venta **MAYRA ALEJANDRA GOMEZ TERRAZAS** (FOVISSSTE Tradicional) se regresó de fase buscando "capturar un pagaré para cuadrar". El pagaré era una pista falsa al inicio (ver [PR #927](https://github.com/beto-sudo/BSOP/pull/927), chip fantasma) pero **resultó real** (9,387). El problema de fondo: la cuadratura mezcla en `descuento` cosas que son conceptualmente distintas (promoción vs sobreprecio), y eso descuadra la utilidad. Modelo en memoria `reference_dilesa_sobreprecio_cheque_notaria`.

## Problema

La cuadratura de gastos de escrituración tiene **cuatro fuentes de fondeo** que el modelo de BSOP NO separa: hoy las mete todas en `descuento_total`. Eso (a) hace cuadrar el saldo pero (b) **subestima la utilidad/participación de DILESA** (parece que regaló dinero que en realidad pagó el cliente vía el crédito), y (c) confunde al operador (caso MAYRA). El motor además distorsiona los derivados antes de escriturar (`chequeNotariaCalculado = min(gastosNetos, excedenteDisponible)` en [`cuadratura.ts:226`](../../lib/dilesa/cuadratura.ts) → `valorRealVentaDilesa` negativo, `montoNotaCredito` inflada).

## Modelo de Coda (validado con el Excel maestro "Relación Gastos Escrituración y Participación Dilesa", 2026-06-17)

Fórmulas reales de la hoja LDLE (columnas):

| Col | Concepto                                                       | Fórmula Coda                           |
| --- | -------------------------------------------------------------- | -------------------------------------- |
| M   | Saldo Cliente Dilesa                                           | `Precio − Crédito − Enganche`          |
| Q   | A pagar a Notaría                                              | `Gastos Esc. − Apoyo Infonavit`        |
| R   | Máxima Aportación Dilesa a Notaría (= **promoción** de gastos) | **15,000 fijo**                        |
| S   | Disponible Dilesa + enganche                                   | `−M + R`                               |
| L   | **Pagaré**                                                     | `Q − S` (el faltante)                  |
| T   | Cheque a notaría                                               | `= Q` (siempre cubre los gastos netos) |
| V   | Saldo cliente a notaría                                        | `Q − T = 0` ✓                          |

**Las 4 fuentes que cubren los gastos de escrituración** (ejemplo MAYRA, gastos 84,038):

| Fuente                              |      Monto | Naturaleza                                | Le cuesta a                |
| ----------------------------------- | ---------: | ----------------------------------------- | -------------------------- |
| Promoción DILESA (gastos esc.)      |     15,000 | Descuento comercial real                  | **DILESA** (baja utilidad) |
| Enganche / depósitos del cliente    |     35,000 | Pago del cliente                          | Cliente                    |
| Sobreprecio (productos adicionales) |     24,651 | Inflado en el precio → lo paga el crédito | Cliente (vía crédito)      |
| Pagaré del cliente                  |      9,387 | Deuda firmada a DILESA                    | Cliente                    |
| **Total = cheque a notaría**        | **84,038** |                                           |                            |

Regla (Beto): los **15,000 son la promoción estándar** de gastos de escrituración; cuando los gastos exceden promoción + enganche, el faltante se cubre **subiendo el precio con sobreprecio (productos adicionales)** para que lo pague el crédito de la institución, y el residual queda como **pagaré** del cliente. El apoyo Infonavit (30,000, solo créditos Infonavit) y el sobreprecio +6% (solo FOVISSSTE/IMSS) son **mutuamente excluyentes**.

**Mapeo Coda → BSOP (estado actual):**

- Coda `R` (promoción 15,000) **+** sobreprecio para gastos → hoy **ambos** caen en `descuento_total`/`descuento_gastos_escrituracion`. ⚠️ Hay que **separarlos**.
- Coda `L` (pagaré) → `monto_credito_directo`. ✓
- Coda `T` (cheque = gastos − apoyo) → `monto_cheque_notaria` (captura fase 11). ✓
- Coda `Q` apoyo → `tipos_credito.apoyo_infonavit_monto`. ✓

**Inconsistencias detectadas en el Excel de Coda:** la fórmula de `M` varía entre filas (a veces `−Enganche`, a veces `−Pagaré`, a veces ambos) — captura manual con errores. BSOP debe ser consistente.

## Outcome esperado

La cuadratura **desglosa completamente** las fuentes de cobertura de gastos (promoción, enganche, sobreprecio, apoyo, pagaré), de modo que: el saldo cuadra, **la utilidad/participación de DILESA sale correcta** (solo la promoción le cuesta, no el sobreprecio), y el operador identifica fácilmente "qué es de qué". Se acaban los derivados absurdos pre-escrituración.

## Alcance

**Sprint 1 — Diseño (sin código de motor):**

- Modelo de datos: campos nuevos en `dilesa.ventas` (o tabla de cuadratura) — `promocion_gastos_escrituracion`, `sobreprecio_gastos`, `aportacion_dilesa_gastos`, y la separación clara vs `descuento_total` (descuento comercial al precio, distinto de la promoción de gastos). Mapeo de migración desde lo legacy.
- Diseño del panel de cuadratura con el bloque "Cobertura de gastos de escrituración" mostrando las 4 fuentes.
- Fórmula del pagaré (faltante) y del cheque (= gastos − apoyo) alineadas con Coda.
- **Entregable: documento de diseño + ADR del modelo financiero, revisado por Beto antes de codear.**

**Sprint 2 — Motor + UI** (tras OK del diseño): implementar los campos, el motor desglosado y el panel; recálculo de utilidad/participación correcto.

**Sprint 3 — Migración de datos legacy:** repartir el `descuento_total` mezclado en promoción vs sobreprecio para las ventas existentes (con OK caso por caso; el "15,000 plano" es la promoción estándar).

**Sprint 4 — Cerrar MAYRA** con el modelo desglosado (en pausa hasta entonces, por decisión de Beto: no cerrarla con el descuento mezclado para que la utilidad salga bien).

## Riesgos

- **Tocar el saldo rompe ventas que hoy cuadran.** Cualquier cambio a `saldoCliente`/`cubierta` exige verificación adversarial contra las ~230 escrituradas antes de mergear.
- **Migración de datos legacy delicada:** separar promoción/sobreprecio en el histórico requiere criterio (el 15,000 es la promoción; el resto del descuento mezclado puede ser sobreprecio). OK de Beto caso por caso.
- **Modelo financiero sensible.** Afecta correo al Consejo, copiloto de cierre, nota de crédito, utilidad Dilesa. Nada al motor sin diseño aprobado por Beto.

## Métricas de éxito

- Las 4 fuentes de cobertura de gastos visibles y sumando al cheque a notaría en cada venta.
- Utilidad/participación de DILESA correcta (solo la promoción le cuesta, no el sobreprecio).
- 0 derivados absurdos pre-escrituración.
- Las ventas que hoy cuadran siguen cuadrando.

## Bitácora

- **2026-06-17** — Promovida. Detonante: venta MAYRA. Análisis multi-agente confirmó el modelo de sobreprecio/cheque. [PR #927](https://github.com/beto-sudo/BSOP/pull/927) (chip fantasma + rol del pagaré) mergeado. [PR #928](https://github.com/beto-sudo/BSOP/pull/928) (promoción de la iniciativa) mergeado. Memoria `reference_dilesa_sobreprecio_cheque_notaria`.
- **2026-06-17** — Beto pasó el **Excel maestro de cuadraturas de Coda** ("Relación Gastos Escrituración y Participación Dilesa"). Validadas las fórmulas (hoja LDLE, 302 ventas): el modelo gira en torno a los gastos de notaría, el cheque = gastos − apoyo, el pagaré = faltante. **Hallazgo clave:** el "descuento" de BSOP mezcla la **promoción** (15,000, costo de DILESA) con el **sobreprecio** (productos adicionales, lo paga el crédito) — hay que desglosarlos para que la utilidad salga bien. MAYRA: 84,038 gastos = promoción 15,000 + enganche 35,000 + sobreprecio 24,651 + pagaré 9,387.
- **2026-06-17** — Beto: **arrancar rediseño** (iniciativa a `in_progress`, diseño antes de código) y **no cerrar MAYRA** hasta tener los campos desglosados. El PR #929 (fix rápido de fase 10 que metía el sobreprecio en el descuento) se **cerró** y se pliega al rediseño con la fórmula desglosada correcta.

## Decisiones registradas

- **2026-06-17** — El "descuento" se **desglosa** en conceptos separados: promoción de gastos (costo de DILESA) vs sobreprecio/productos adicionales (lo paga el crédito) vs descuento comercial al precio. Es la raíz de la subestimación de utilidad.
- **2026-06-17** — **Diseño antes de código** para el motor (decisión de Beto): Sprint 1 entrega documento + ADR revisable; nada al motor de cuadratura sin su OK.
- **2026-06-17** — MAYRA **en pausa** hasta el rediseño (no cerrarla con el descuento mezclado, para que la utilidad/participación salga correcta desde el inicio).
