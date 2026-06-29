# Iniciativa — Descuento perdonado fantasma en el motor de cuadratura (DILESA)

**Slug:** `dilesa-descuento-perdonado-motor`
**Empresas:** DILESA
**Schemas afectados:** `lib/dilesa/cuadratura.ts` (en el modelo desglosado ADR-045, `descuentoAplicado` pasa a usar la promoción REALMENTE consumida `aportacionPromocion` + sobreprecio capturado, en vez del TOPE del bono `promocionGastos`). Sin migración ni cambio de schema de DB. Consumidores indirectos: `app/api/dilesa/ventas/[id]/revision-pld/route.ts` (calcula `descuentoPerdonado = descuentoAplicado − chequePagado`) y la revisión PLD de la Fase 13.
**Estado:** in_progress
**Próximo hito:** Beto revisa y mergea [#1132](https://github.com/beto-sudo/BSOP/pull/1132) (financiero, sin auto-merge). Después: revisar con Michelle los 4 outliers de sobreprecio que el fix no resuelve.
**Dueño:** Beto
**Creada:** 2026-06-29
**Última actualización:** 2026-06-29 (Sprint 1 en PR [#1132]: fix del motor + tests + script de análisis; 6 checks CI verdes localmente)

> Detonante: revisando la venta de **ARACELY MARTINEZ VASQUEZ** (M10-L32-LDLE) en la
> revisión PLD de la Fase 13, Beto vio el warning _"Σ liquidaciones = valor pactado −
> descuento — … con el descuento perdonado de $1,620.00 se esperaban $938,380.00 …"_
> y no encontraba ese descuento por ningún lado. Beto: _"creo que algo no está bien"_.
> El diagnóstico confirmó su instinto: es un bug del motor, no de la captura.

## Problema

En la revisión PLD (Fase 13) el check `Σ liquidaciones = valor pactado − descuento`
compara las liquidaciones del aviso contra `valor pactado − descuentoPerdonado`,
donde `descuentoPerdonado = descuentoAplicado − chequePagado`
([revision-pld/route.ts:360](../../app/api/dilesa/ventas/[id]/revision-pld/route.ts)).

En el **modelo desglosado** (ADR-045), `descuentoAplicado` se calculaba como
`promocionGastos + sobreprecioGastos`, donde `promocionGastos`
(`dilesa.ventas.promocion_gastos_monto`) es el **TOPE del bono** del catálogo
(se guarda al asignar tomando `promocion.monto`), **no** el bono realmente
consumido. Cuando el bono no se consume completo, la diferencia (tope − usado)
se cuela como **"descuento perdonado" fantasma** y dispara el warning.

Caso Aracely (M10-L32):

- Tope del bono `promocion_gastos_monto` = 15,000; sobreprecio = 20,000 → `descuentoAplicado` = **35,000**.
- Bono realmente consumido (`aportacionPromocion`, que el motor YA calcula para la card) = 13,380.
- Cheque a notaría girado = 33,380.
- `descuentoPerdonado` = 35,000 − 33,380 = **1,620** ← exactamente el bono NO usado (15,000 − 13,380).
- El motor ya conocía el número correcto (13,380); simplemente `descuentoAplicado` no lo reusaba.

## Outcome esperado

`descuentoAplicado` (desglose) refleja la promoción **consumida**, no el tope del
bono. El "descuento perdonado" fantasma desaparece y el warning PLD solo aparece
cuando hay un descuadre real. El campo `promocion_gastos_monto` se conserva como
**tope autorizado** (correcto y útil); lo consumido se deriva del motor — no se
edita dato por dato.

## Alcance

**Sprint 1 — Fix del motor + tests (código).**

- `cuadratura.ts`: en el modelo desglosado, `descuentoAplicado = aportacionPromocion + sobreprecioGastos`
  (la promo topada a lo consumido vía `partirDescuento`, + el sobreprecio capturado, hecho escriturado).
  Requiere reordenar: el bloque de cobertura de gastos (que produce `aportacionPromocion`)
  se calcula ANTES de `descuentoAplicado`. El modelo legacy (sin desglose) queda intacto.
- Test que blinda la regla: bono parcialmente consumido → `descuentoAplicado` = promo consumida +
  sobreprecio, perdón = 0; sin regresión en los casos existentes.

**Fuera de alcance v1 (requiere Michelle):** 4 ventas (M11-L7, M3-L16, M8-L10,
M11-L14) siguen con perdón > 0 tras el fix por **sobreprecio grande** (precio
inflado para que el crédito absorba gastos altos, con cheque a notaría chico).
Eso es una pregunta de modelo del sobreprecio, distinta del bug del bono. Se
revisa por separado.

## Impacto medido (motor real sobre las 109 ventas con desglose)

- 68 ventas cambian `descuentoAplicado`; **0 suben** (el fix nunca infla — `aportacionPromocion ≤ tope`).
- 45 ventas: perdón fantasma → **$0**. 22 ventas: perdón baja.
- Σ perdón fantasma eliminado: **−$799K**.
- Subconjunto PLD (fase ≥ 12, donde corre la revisión): ~10 ventas a perdón 0, incluida Aracely (1,620 → 0).
- Script de análisis (read-only, no escribe): `scripts/analyze_dilesa_descuento_perdonado.ts`.

## Riesgos

- `descuentoAplicado` también alimenta `excedenteDisponible` y `saldoCliente` (legacy).
  En modelo desglosado el display usa `operacionCubierta`/`saldoOperacion` (no `saldoCliente`),
  así que el blast radius queda contenido. **No** afecta la comisión
  (`baseComision = valorRealVentaDilesa − sobreprecioGastos`, no depende de `descuentoAplicado`).
- Financiero: aunque no hay migración, cambia números de la operación → **OK de Beto antes de mergear** (no auto-merge).

## Bitácora

- 2026-06-29 — Promoción + diagnóstico + análisis de impacto con el motor real. Script
  `scripts/analyze_dilesa_descuento_perdonado.ts`.
- 2026-06-29 — Sprint 1 en PR [#1132](https://github.com/beto-sudo/BSOP/pull/1132): fix
  Opción A en `cuadratura.ts` (reorden + `descuentoAplicado = aportacionPromocion +
sobreprecioGastos`) + tests (M3-L9 real + Aracely M10-L32 sintético) + script. 6 checks
  CI verdes localmente. Sin auto-merge (financiero) — espera revisión y merge de Beto.

## Decisiones registradas

- 2026-06-29 — **Opción A (quirúrgica) sobre la alternativa amplia.** El fix usa
  `aportacionPromocion + sobreprecioGastos` (promo consumida + sobreprecio
  capturado), no `aportacionPromocion + sobreprecioCobertura` (que se enredaba con
  el estado de captura de gastos por fase y movía saldos en ambas direcciones —
  ej. M9-L18 subía 0→101K). Opción A es monótona (nunca infla) y robusta al estado
  de captura. Razón: el sobreprecio capturado es un hecho escriturado; solo el bono
  debe toparse a lo consumido. Extiende el modelo de [ADR-045].
- 2026-06-29 — **No se edita `promocion_gastos_monto`.** El campo es el tope
  autorizado (correcto); lo consumido se deriva en el motor. Un parche por-venta
  perdería el tope y habría que rehacerlo ante cualquier cambio de insumos.
