# Iniciativa — Arrendamiento de activos del portafolio

**Slug:** `arrendamiento`
**Empresas:** DILESA (v1 honesto — el activo rentable solo vive en `dilesa.activos`; multiempresa real es S6, alineado con `rollout-multiempresa`)
**Schemas afectados:** `erp` (entidad nueva `arrendamientos` master+satélite+líneas; serie de renta **por línea**; depósitos; puente `arrendamiento_cfdis`; catálogo `inpc_indices`; **CHECK aditivo de `cxc_cargos`/`cxc_pagos` + columnas fiscales + RPC NUEVA dedicada de pago — NO se toca la RPC de ventas**; lectura `personas`). `dilesa` (lectura de `activos`; **cara de espectacular → activo hijo**). `core` (RBAC + sub-slugs ADR-014/030). Storage `adjuntos`. Cron Vercel (solo tras dry-run con corte aprobado).
**Estado:** in_progress
**Próximo hito:** S1 **completo en prod** (S1a–e). Sigue **S2** (cobranza recurrente: cron mensual idempotente + recordatorios + flujo de depósito). Pendiente de Beto (lunes): factura real de espectacular (calibrar default fiscal) + lista de backfill (qué está rentado hoy).
**Dueño:** Beto
**Creada:** 2026-06-26
**Última actualización:** 2026-06-27

> **Antecedentes (todas cerradas):** [`dilesa-portafolio-activos`](dilesa-portafolio-activos.md), [`dilesa-portafolio-destinos`](dilesa-portafolio-destinos.md) (`portafolio_destinos.cuenta_renta`, diseñado para este módulo), [`dilesa-portafolio-expediente`](dilesa-portafolio-expediente.md). Cobranza sobre [`cxc`](cxc.md). Multiempresa con [`rollout-multiempresa`](rollout-multiempresa.md). Diferida a propósito en los dos cierres de portafolio. **Robustecida por dos críticas independientes:** 6 agentes adversarios + GPT-5.5 (codex) — ver `## Bitácora`.

## Problema

DILESA ya **renta activos hoy, sin control en el sistema**: espectaculares (negocio activo, 26 estructuras / ~52 caras), casas en portafolio como "demo" que en realidad **ya están rentadas** (~6 confirmadas + en trámite; en el sistema hay 23 Demo + 3 Arrendamiento, y cuáles están rentadas vive en la cabeza del operador), terrenos y locales. Contratos, cobranza, vencimientos y facturación viven en Excel / memoria / contabilidad a mano en el PAC. No hay contrato formal, cobranza recurrente, ocupación visible ni rentabilidad por activo.

## Hallazgo central (corrige el supuesto del rebote)

> **"Reusar `erp.cxc` sin tabla nueva" NO es gratis.** CxC aporta el **almacén** (cargo/pago/aplicación + saldo + aging + parser CFDI); la **originación y la cobranza activa hay que construirlas**. Verificado en código: `cxc_cargos` CHECK `origen_tipo IN ('venta_dilesa','manual','otro')` y `tipo_cargo` sin `renta`/`deposito` → un cargo de renta **no inserta**; `cxc_pago_registrar` **hardcodea** `'venta_dilesa'` (inserta + filtra el FIFO por él); `cxc_cargos` es **monto pelón** (sin IVA/tasa/retención/moneda); el **cron de recordatorios NO existe**; **cero INPC** en el repo; `aging/page.tsx` **no filtra `origen_tipo`** (bug latente).

**Principio rector (ambas críticas convergen):** **no se reabre la RPC viva de ventas** (940+ ventas). Se extiende `cxc` solo con ALTER aditivo (CHECKs + columnas) y se crea una **RPC de pago nueva y dedicada** `erp.arrendamiento_pago_registrar`.

## Modelo de datos (post-GPT)

- **`erp.arrendamientos`** (master): empresa, **4 roles de persona separados** — `arrendatario`, `pagador` (a quién le cobras → `cxc.persona_id`), `receptor_fiscal` (RFC del CFDI: anunciante o agencia), `arrendador/emisor` (DILESA PM hoy; campo listo para PF/subarriendo) — folio, plazo (`plazo`|`campaña`), día de corte, `tipo_renovacion` (manual|automatica|tacita_reconduccion), `penalizacion_terminacion_meses` (**default 2**), fiador/aval, `moneda` (**MXN-only v1, gate**), estado.
- **`erp.arrendamiento_lineas`** (espacios, 1 contrato : N): `activo_id`, `tipo_operacion_fiscal` (**arrendamiento_inmueble | espacio_publicitario | servicio_publicidad**), `renta_subtotal`, fiscal **enriquecido** (`iva_tasa_pct` + `iva_fundamento` + `lugar_expedicion` + `iva_validado_por`; default **sugerido por uso, no hardcoded** — habitacional exento, casa amueblada/hospedaje pierde exención), `sujeto_retencion` calculable, vigencia propia, anti-doble-booking.
- **`erp.arrendamiento_renta_periodos`** (serie temporal append-only, **por línea** `linea_id`): vigencia, monto, INPC base/aplicado, %; el cron lee el periodo vigente, el incremento **inserta** un periodo nuevo, **nunca re-tarifa** cargos pasados.
- **`erp.arrendamiento_depositos`** (pasivo, flujo propio): `deposito_naturaleza` (**garantia_reembolsable | anticipo_renta | mixto** — define tratamiento fiscal), `aplicable_a_renta_desde`, `cfdi_requerido_en_recepcion`; **default 1 mes**; entra como `movimiento_bancario` **sin** `cxc_pagos`; "aplicado a renta" SÍ dispara CFDI de ingreso. Backfill: depósitos ya recibidos como `retenido` (patrón LIQ-HIST).
- **`erp.arrendamiento_cfdis`** (puente NUEVO): liga cargo/periodo a CFDI con `tipo` (**factura_ingreso | rep_pago | nota_credito**) → `erp.facturas`/adjunto. Separa "renta facturada vs cobrada" (no meter todo en `cxc_pagos.uuid_sat`).
- **`erp.inpc_indices`** (catálogo, INPC nacional): `inpc_base_mes`, `inpc_aplicacion_mes`, `fecha_publicacion`, `capturado_por`, `aprobado_por`, estado `pendiente_indice`. El cron **no incrementa** si falta índice o aviso previo. (Captura manual asistida v1; API INEGI aparte.)
- **Incremento (congelado por contrato):** al aniversario `incremento% = (INPC_aniv / INPC_base_12m − 1) + pct_adicional`, default **2%** editable; sin tope; campañas cortas no incrementan.
- **Cara de espectacular** → **activo hijo** (`tipo='cara'`, `activo_padre_id`); `caras_detalle` queda metadata física; campos de renta/anunciante del satélite → derivados read-only.
- **Cobranza**: `cxc_*` extendido (origen_tipo `'arrendamiento'`, tipo_cargo `'renta'/'deposito'/'penalizacion'`, periodo `yyyymm` + UNIQUE parcial idempotente, **aplicación dirigida al periodo** no FIFO). **RPC de pago dedicada**. RLS **set-membership**. Anti-doble-booking = **EXCLUDE con daterange a nivel línea** (no solo en la RPC). Mora diferida a v2.
- **PLD/efectivo**: renta y depósitos en efectivo → banderas de acumulado por persona/mes + KYC (el repo ya tiene piezas); no diferir si hay casas/locales en efectivo.
- **Ocupación**: derivada de contratos vigentes (vista), nunca columna.
- **Naming**: `erp.activos` (fijos contables) y `erp.contratos` (legacy ventas) ya existen → master = `erp.arrendamientos`, con comentario.

## Alcance / Sprints (v1 reducido — recomendación de GPT)

| #   | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Estado  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 0   | **Decisiones + ADR fiscal/legal corto** (matriz uso × operación fiscal × IVA × retención × CFDI esperado × depósito). ✅ 15 decisiones cerradas (S0 + GPT); ADR al inicio de S1.                                                                                                                                                                                                                                                                                                                  | done    |
| 1   | **Schema + alta, sin bisturí a ventas.** Tablas (arrendamiento/líneas/periodos-por-línea/depósitos/puente CFDI); cara→activo hijo; **CHECKs aditivos de cxc + columnas fiscales**; **filtros `origen_tipo` en TODA superficie de cobranza (incluido el fix del aging)**; RPC nueva de alta + RPC de pago dirigido; EXCLUDE anti-doble-booking; RBAC + sub-slugs; vista **Libre/Rentado/Por vencer/Vencido**. **No tocar ventas salvo filtros + pruebas de no-regresión** (snapshots de las 940+). | ✅ prod |
| 2   | **Captura de lo que ya se renta + XML.** Backfill manual de contratos vivos; generación **manual/idempotente** del primer periodo; upload/parse XML (factura_ingreso + REP); depósito + flujo. **Cron SOLO después de dry-run con `cutover_date` + `arranque=limpio\|con_vencidos` aprobados.**                                                                                                                                                                                                   | pending |
| 3   | **Incrementos INPC** (fuera de v1). Tabla + fórmula congelada + aviso al aniversario.                                                                                                                                                                                                                                                                                                                                                                                                             | pending |
| 4   | **Locales / terrenos / casas rentadas** + `regimen_iva` exento habitacional + recategorización Demo→Arrendamiento (efecto del alta, audit + aviso al Consejo).                                                                                                                                                                                                                                                                                                                                    | pending |
| 5   | **Ocupación rica + rentabilidad por activo** (renta vs CxP del activo vs costo de adquisición).                                                                                                                                                                                                                                                                                                                                                                                                   | pending |
| 6   | **Multiempresa real** + titularidad de las 10 canchas RDB (las renta RDB; hoy bajo `empresa_id=DILESA`).                                                                                                                                                                                                                                                                                                                                                                                          | pending |

> v1 = S1+S2: controlar lo que ya se renta **sin meterle bisturí a la cobranza de ventas**. INPC y cron automático llegan después.

## Decisiones registradas

- **2026-06-26 — 8 ejes + 12 decisiones de S0 con Beto** (entidad nueva, cobranza sobre cxc, referenciar XML CONTPAQi, depósito pasivo, INPC nacional+2% al aniversario, espectaculares ambos modos, módulo propio, DILESA-only v1, cara=activo hijo, IVA por uso, penalización 2m, depósito 1m, USD-gate, mora diferida, canchas RDB fuera).
- **2026-06-26 — Correcciones de las críticas:** cxc no es gratis (ALTER aditivo + **RPC nueva, no reabrir la de ventas**); IVA modelado rico (`iva_tasa_pct`+fundamento+validación, default sugerido); retención por **arrendador/emisor** no por activo; **serie de renta por línea**; **puente `arrendamiento_cfdis`** (factura vs REP); **`tipo_operacion_fiscal`** (espectacular puede ser servicio de publicidad, no arrendamiento de inmueble); depósito con **naturaleza fiscal**; **INPC fuera de v1**; aging fix en **S1**; **cron solo tras dry-run**.

- **2026-06-26 — 3 decisiones de la crítica GPT cerradas:** (1) **Espectaculares = ambos modos soportados** vía `tipo_operacion_fiscal`; el default (arrendamiento de inmueble vs servicio de publicidad) se calibra con una factura real de CONTPAQi + el contador — no bloquea S1. (2) **Cobro por transferencia** (sin efectivo) → PLD-efectivo diferido (se deja `forma_pago`, sin banderas en v1). (3) **Depósito = garantía reembolsable** por default (`deposito_naturaleza` soporta anticipo/mixto).

## Pendientes de Beto (no bloquean S1)

- **Backfill (D11):** lista real de qué está rentado HOY (con quién, desde cuándo, a cuánto). **Bloquea el cron de S2**, no el schema de S1.
- **Operador (D12):** ¿el cobro de renta lo lleva quien cobra ventas o alguien distinto? (default: bandeja separada por `origen_tipo`).

## Riesgos verificados

- **No reabrir `cxc_pago_registrar`** (RPC viva, 940+ ventas) → RPC nueva dedicada + pruebas de no-regresión con snapshots.
- Cron no idempotente + DST Matamoros → UNIQUE por periodo + `relojMatamoros` + dry-run con corte.
- FIFO ciego misaplica renta → aplicación dirigida al periodo.
- RLS `fn_has_empresa` por fila da timeout (8s) → tablas nuevas con set-membership; barrer `cxc_*`.
- Depósito: LIVA puede tratarlo como cobrado si cubre contraprestación → `deposito_naturaleza` decide si se factura.
- Backfill sin fuente (renta_mensual del satélite es scoring) → captura manual, no migración.
- Recategorizar Demo→Arrendamiento mueve el inventario del correo al Consejo → avisar antes.
- Régimen habitacional (Código Civil Coahuila) tiene normas irrenunciables → plantilla validada por abogado.

## Bitácora

- **2026-06-26** — Promovida (doc + `INITIATIVES.md`); rebote de alcance con Beto.
- **2026-06-26** — **Crítica adversaria multi-ángulo** (6 agentes + síntesis): 65 hallazgos (29 altos). 5 pilares verificados en código por CC. Corregido el supuesto "cxc gratis", IVA por uso, cara→activo hijo, serie por periodos, integridad/idempotencia, v1 DILESA-only.
- **2026-06-26 — 12 decisiones de S0 con Beto.**
- **2026-06-26 — Crítica GPT-5.5 (codex, reasoning high, leyó repo + DOF/LIVA/LISR).** Validó la dirección ("decisiones sanas"). Deltas integrados: RPC nueva (no reabrir ventas), puente `arrendamiento_cfdis` (factura vs REP), `tipo_operacion_fiscal` (espectacular=publicidad), serie de renta por línea, depósito con naturaleza fiscal, 4 roles de persona, IVA con fundamento/validación, INPC fuera de v1, aging fix a S1, cron solo tras dry-run, PLD/efectivo.
- **2026-06-26 — 3 decisiones GPT cerradas + iniciativa a `planned`.** Espectaculares ambos modos (default fiscal a calibrar con factura real), cobro por transferencia (PLD-efectivo diferido), depósito garantía reembolsable. Lista para arrancar S1.
- **2026-06-27 — S1 COMPLETO en prod** (mismo día): [#1104](https://github.com/beto-sudo/BSOP/pull/1104) S1a schema base + cara→activo hijo · [#1105](https://github.com/beto-sudo/BSOP/pull/1105) S1b cxc originador de renta + RPC de pago dedicada + fix aging · [#1106](https://github.com/beto-sudo/BSOP/pull/1106) S1c RPC de alta atómica · [#1112](https://github.com/beto-sudo/BSOP/pull/1112) S1d RBAC + módulo/página · [#1113](https://github.com/beto-sudo/BSOP/pull/1113) S1e form de alta. Módulo `/dilesa/arrendamiento` operable de punta a punta (vacío hasta el backfill). Las 3 migraciones financieras (S1a/b/c) con OK verbal de Beto + label `finanzas-ok`. **Aprendizaje:** hay un **5º lugar RBAC** (`lib/permissions-deps.ts`) no listado en los 4 del CLAUDE.md — toda página con `RequireAccess` necesita su entrada. Incidente de `db-push` out-of-order de otra sesión (#1103) verificado y ya resuelto (no propio).
