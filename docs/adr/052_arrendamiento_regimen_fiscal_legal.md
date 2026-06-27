# ADR-052 — Tipos de contrato de arrendamiento y su régimen fiscal/legal

- **Status**: Accepted
- **Date**: 2026-06-27
- **Authors**: Beto, Claude Code
- **Iniciativa**: [`arrendamiento`](../planning/arrendamiento.md)
- **Se monta sobre**: [`cxc`](../planning/cxc.md) (subledger) · [ADR-037](037_subledger_gemelo_cxc_cxp.md) (referencia polimórfica)

---

## Contexto

El módulo de arrendamiento cobra renta de activos **heterogéneos** del portafolio (espectaculares, locales, plazas, naves, terrenos, casas). Su tratamiento **fiscal y legal no es uniforme**, y modelarlo con un solo default (p. ej. "IVA 8% frontera") produce CFDIs incorrectos y riesgo de discrepancia con el SAT. Dos críticas independientes (6 agentes + GPT-5.5) convergieron en que el régimen debe **derivarse del uso/operación, capturarse por línea y ser validable**, no hardcodearse.

Restricciones del entorno (heredadas, no se reabren aquí):

- **BSOP no timbra.** CONTPAQi emite el CFDI; BSOP **referencia** el XML (decisión de `cxc`).
- **DILESA es PM arrendadora.** Opera en frontera norte (estímulo IVA 8%).
- La cobranza vive en `erp.cxc_*`; el arrendamiento es **otro originador** (`origen_tipo='arrendamiento'`).

## Decisión

### D1 — El régimen se captura por línea, default sugerido por tipo de activo

Cada `erp.arrendamiento_lineas` declara `tipo_operacion_fiscal` y `regimen_iva`. El default es **sugerido** (editable, con `iva_validado_por` + validación contra el XML cargado), **nunca hardcodeado**:

| Activo                     | `tipo_operacion_fiscal` (default)                               | `regimen_iva` (default) | Retención (DILESA PM arrendador) | Nota                                                                                                                       |
| -------------------------- | --------------------------------------------------------------- | ----------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Casa (habitación, PF o PM) | `arrendamiento_inmueble`                                        | `exento`                | —                                | LIVA 20-II. El **uso** define la exención, no si el inquilino es PF/PM                                                     |
| Casa amueblada / hospedaje | `arrendamiento_inmueble`                                        | `tasa_8`                | —                                | Pierde la exención habitacional                                                                                            |
| Local / plaza              | `arrendamiento_inmueble`                                        | `tasa_8`                | —                                | Comercial                                                                                                                  |
| Nave / bodega              | `arrendamiento_inmueble`                                        | `tasa_8`                | —                                | Comercial                                                                                                                  |
| Terreno                    | `arrendamiento_inmueble`                                        | `tasa_8`                | —                                | Terreno agrícola/ganadero puede ser exento → validar por caso                                                              |
| Espectacular (cara)        | **pendiente** (`espacio_publicitario` vs `servicio_publicidad`) | `tasa_8`                | —                                | **No es arrendamiento de inmueble**; clave SAT de publicidad. Default se calibra con una factura real de CONTPAQi (ver D6) |

### D2 — Retención por arrendador/emisor, no por activo

La retención (ISR 10% + IVA 2/3 partes, LISR 116 / LIVA 1-A) aplica cuando una **PM paga renta a un arrendador PF**. DILESA (PM) como arrendadora **no sufre retención** de sus inquilinos. El modelo guarda `arrendador/emisor` y un `sujeto_retencion` calculable, con **default 0** para DILESA; queda listo para el caso de **terreno de tercero PF / subarriendo** (espectaculares con `dueno_terreno` ≠ DILESA) sin reabrir el schema.

### D3 — Depósito en garantía: pasivo, no ingreso (default reembolsable)

`deposito_naturaleza` ∈ {`garantia_reembolsable` (default), `anticipo_renta`, `mixto`}. La garantía reembolsable **no se factura al recibirse** (no es acumulable); entra como `movimiento_bancario` sin pasar por `cxc_pagos`. Al **aplicarse a renta** sí se vuelve ingreso y dispara CFDI. (LIVA puede tratar como cobrado un depósito que cubre contraprestación → por eso la naturaleza es un campo, no un supuesto.)

### D4 — Facturación por referencia (BSOP no timbra)

Puente `erp.arrendamiento_cfdis` con `tipo` ∈ {`factura_ingreso`, `rep_pago`, `nota_credito`} → liga cada CFDI (timbrado por CONTPAQi, subido como XML) al cargo/periodo. Separa "rentado-facturado" de "rentado-cobrado"; no se mezcla todo en `cxc_pagos.uuid_sat`.

### D5 — Incremento INPC nacional + % al aniversario, congelado por periodo

Renta como **serie de periodos** (`erp.arrendamiento_renta_periodos`, append-only por línea). Al aniversario: `incremento% = (INPC_aniv / INPC_base_12m − 1) + pct_adicional` (default **2%**, editable; sin tope). El `INPC_base` se snapshotea al firmar; un cargo ya emitido **nunca se re-tarifa**. Campañas cortas (< 1 año) no incrementan.

### D6 — Lo pendiente (no bloquea el schema)

El **default fiscal del espectacular** (arrendamiento de inmueble vs servicio de publicidad) se confirma con una **factura real de CONTPAQi** + el contador (Beto la trae). El schema ya soporta ambos vía `tipo_operacion_fiscal`, así que esto solo ajusta el default y la validación, no la estructura.

## Consecuencias

- **+** Un CFDI fiscalmente correcto por tipo de activo desde el día 1; el caso habitacional exento no se "descubre" tarde.
- **+** El schema no se casa con una interpretación fiscal: todo es editable + validable, con audit (`iva_validado_por`).
- **+** Retención y depósito quedan listos para los casos borde (subarriendo, anticipo) sin migración futura.
- **−** Más campos que capturar/validar por línea; se mitiga con defaults sugeridos por tipo de activo.
- **Legal:** el contrato **habitacional** (Código Civil de Coahuila) tiene normas irrenunciables (plazo, tope de pena, depósito) → la plantilla de cláusulas habitacional la valida el abogado de Beto antes de generar PDFs (fuera de S1).
