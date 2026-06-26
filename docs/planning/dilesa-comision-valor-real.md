# Iniciativa — Comisión DILESA sobre el valor real (base + panel explícito)

**Slug:** `dilesa-comision-valor-real`
**Empresas:** DILESA
**Schemas afectados:** `lib/dilesa/cuadratura.ts` (base de comisión unificada a Valor Real − sobreprecio; expone `precioAsignacion`), `components/dilesa/cuadratura-panel.tsx` (fórmulas inline + card "Resumen de precio" para legacy + etiqueta de redondeo). Backfill de `dilesa.ventas.comision_vendedor`/`comision_gerencia` en las ventas con valor real válido (script con el motor real + audit trail). [ADR-050](../adr/050_base_comision_valor_real.md).
**Estado:** in_progress
**Próximo hito:** decisión de Beto — cerrar la iniciativa (el overlay de objetivos/cuotas trimestrales es iniciativa futura separada)
**Dueño:** Beto
**Creada:** 2026-06-26
**Última actualización:** 2026-06-26 (Sprint 1 [#1053] + fix [#1057] mergeados; backfill aplicado a prod — 940 ventas + audit trail; pendiente: Beto decide el cierre)

> Detonante: revisando la cuadratura de JORGE LUIS LOPEZ (M12-L9-LDS) y EDUARDO SALAS (M4-L29-LDLE), Beto notó que el panel mostraba la comisión sobre el valor de **escrituración**, mientras Michelle/Ale la calculan sobre el **valor real**. En ventas con descuento (o escritura inflada para aforo) eso sobre-paga la comisión. Beto: _"el pago de la comisión correcta debe ser sobre el valor real… estos números en BSOP son de referencia solamente, así que debe quedar plasmado el número que debió o debe de ser, retroactivo y parejo"_.

## Problema

La base de comisión vivía en dos modelos distintos en `lib/dilesa/cuadratura.ts`:

- **Desglosado (ADR-045):** comisión sobre `Valor Real − sobreprecio para gastos` (correcto, base Michelle/Ale).
- **Legacy (Coda):** comisión sobre `Valor de Escrituración`.

En ventas con descuento real (Valor Real < Escrituración) el legacy **sobre-paga**: el caso extremo es una escritura inflada para maximizar el aforo del crédito (M12-L9: escritura 1,952,860 vs valor real 1,869,500 → comisión 19,528.60 en vez de 18,695). Además las columnas persistidas `comision_vendedor`/`comision_gerencia` estaban **inconsistentes** (unas sobre valor real, otras sobre escritura), por capturarse en momentos distintos.

El panel de cuadratura, además, es **menos explícito de lo necesario**: las fórmulas de cómo se obtiene cada derivado viven en una nota al pie en prosa, no junto a cada número, y el legacy ni siquiera muestra una card de precio.

## Outcome esperado

1. **Una sola base de comisión** = Valor Real Venta DILESA − sobreprecio para gastos, en ambos modelos. El número mostrado = el número correcto = el plasmado en la columna.
2. **Panel explícito**: cada derivado con su fórmula inline; el legacy con su card "Resumen de precio".
3. Las columnas persistidas reconciliadas con la fórmula correcta (retroactivo).

**Aclaración de alcance (Beto, 2026-06-26): esto es solo la _base_ de comisión.** El cálculo de la comisión PAGADA lleva encima un esquema de objetivos y cuotas trimestrales que se modela aparte, más adelante. Esta iniciativa NO toca ese overlay.

## Alcance

**Sprint 1 — Motor + panel + tests (código) ✅ listo, en PR.**

- Motor (`cuadratura.ts`): `baseComision = Valor Real − sobreprecio` siempre (quita el branch legacy que usaba escrituración); expone `precioAsignacion` para el panel. Test que blinda la regla (legacy comisiona sobre valor real).
- Panel (`cuadratura-panel.tsx`): `Fila` gana `formula` (subtítulo gris); fórmulas inline en el cierre (valor real, facturado, NC, descuento real) y comisiones; card "Resumen de precio" para legacy (lista → escriturado → valor real → bono); el residuo de sobreprecio < $1 se etiqueta "redondeo del enganche"; nota al pie aclara que la comisión es la base (overlay trimestral aparte).

**Sprint 2 — Backfill retroactivo de columnas (datos en prod, pendiente OK de Beto).**

- Script con el motor real (`calcularCuadratura` por venta, no SQL aproximado) que recalcula `comision_vendedor`/`comision_gerencia` en las **354 ventas con valor real válido** (de 358 que cambian), con registro en `core.audit_log`.
- **Excluidas (4, datos incompletos):** M12-L33-LDLE (anomalía conocida, escritura mal capturada), M9-L9-LV2, M15-L5-LDV, M9-L22-LV2 (terminadas sin pagos en CxC → valor real 0). Se dejan con su comisión actual (ya pagadas; Beto: _"esas 4 no importan"_).

**Fuera de alcance:** el overlay de objetivos/cuotas trimestrales (cálculo de comisión pagada real); las 4 ventas excluidas.

## Riesgos

- **Cambio financiero histórico.** El backfill mueve ~$911k de comisión-base agregada (vendedor −654k + gerencia −257k) en 358 ventas. Mitigado: BSOP es referencia (no paga), el script usa el motor real + audit trail, y corre con OK explícito de Beto sobre la lista exacta.
- **Valor real no confiable con datos incompletos.** 4 ventas dan valor real ≤ 0 → excluidas explícitamente (no backfillear a 0).
- **El motor lo consumen 3 ensambladores** (panel, header, F13): el cambio de base aplica parejo (es el mismo motor); verificado con los tests existentes.

## Métricas de éxito

- Comisión mostrada = comisión persistida = base correcta (valor real × tasa) en las 354.
- 0 divergencias legacy vs desglosado en la base de comisión.
- El panel muestra la fórmula de cada derivado inline (legacy y desglosado).

## Bitácora

- **2026-06-26** — Promovida. Detonante: M12-L9 (escritura inflada) y M4-L29 (desglosado) mostraban comisión sobre escritura; Michelle/Ale la quieren sobre valor real. Universo dimensionado en prod: 1,177 ventas, 358 cambian, ~$911k a la baja, 4 con datos incompletos. Fórmula validada contra los 2 casos conocidos (JL 18,695 sin cambio; Eduardo 9,200→9,050). **Sprint 1 (código) — [PR #1053](https://github.com/beto-sudo/BSOP/pull/1053) (sin auto-merge, UI visible):** motor unificado + `precioAsignacion` expuesto + panel explícito (fórmulas inline + card de precio legacy + etiqueta de redondeo) + test que blinda la regla. 6/6 checks de CI verdes local. **Mergeado.**
- **2026-06-26 (Sprint 1b — fix del valor real legacy, [PR #1057](https://github.com/beto-sudo/BSOP/pull/1057)):** el dry-run del backfill EXPUSO un bug preexistente del motor legacy — el valor real se calculaba con `depositosRecibidos` (suma de `cxc_pagos`), y en **~76 ventas migradas de Coda el crédito nunca se registró en `cxc_pagos`** (solo el enganche) → valor real ≈ enganche (M14-L4-LDV: 22,429 en vez de 2.26M; comisión 224 en vez de 22,652). El #1053 (comisión sobre valor real) lo volvió visible en el panel. **Fix:** unificar el valor real en AMBOS modelos a `crédito (detonación) + enganche cliente − cheque + pagaré` (usa el crédito de la VENTA, no `cxc_pagos`); idéntico al cálculo viejo cuando el crédito sí está en CxC (JL, ejemplo de Coda → 47 tests previos verdes + 1 nuevo). **Resultado:** dry-run con motor arreglado da **940 ventas que cambian, 0 con valor real ≤ 0** (antes 76 daban basura), delta-base ~$1.35M a la baja (la comisión sobre el valor real NETO del cheque es menor que sobre la escritura bruta — correcto, el cheque no es ingreso de DILESA). **Orden:** mergear #1057 (arregla el panel en prod) → correr el backfill. Script `scripts/backfill_dilesa_comision_valor_real.ts` incluido (DRY por default).
- **2026-06-26 (Sprint 2 — backfill aplicado a prod):** [#1057](https://github.com/beto-sudo/BSOP/pull/1057) mergeado (CI verde; el primer run falló solo por `INITIATIVES.md` sin regenerar tras editar el header). Backfill corrido con `DRY_RUN=0`: **940 ventas actualizadas** (`comision_vendedor`/`comision_gerencia` = base sobre el valor real), **940 entradas en `core.audit_log`** (antes/después por venta, acción `backfill_comision_valor_real`). Verificación en prod: Jorge Luis 18,695 (sin cambio), Eduardo 9,200→9,050, M14-L4 224→22,952.96, M8-L25 500→15,250 — todos razonables, 0 absurdos. **Iniciativa funcionalmente completa.** Único pendiente: el overlay de objetivos/cuotas trimestrales (cálculo de la comisión PAGADA), que es **iniciativa futura aparte**.

## Decisiones registradas

- **2026-06-26 — Base de comisión = Valor Real Venta DILESA − sobreprecio para gastos (ambos modelos).** Antes el legacy usaba escrituración. Razón: es la base operativa de Michelle/Ale; comisionar sobre la escritura sobre-paga cuando hay descuento o escritura inflada. Documentado en [ADR-050](../adr/050_base_comision_valor_real.md).
- **2026-06-26 — Retroactivo y parejo.** Beto: BSOP es referencia (no paga aún), así que se plasma el número correcto en todo el histórico. Backfill de las 354 con valor real válido.
- **2026-06-26 — La base NO es la comisión pagada.** Hay un overlay de objetivos/cuotas trimestrales que se modela aparte (futuro). El panel lo aclara.
- **2026-06-26 — 4 ventas excluidas del backfill** (valor real ≤ 0 por datos incompletos): se dejan con su comisión actual (ya pagadas).
