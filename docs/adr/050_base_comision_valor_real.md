# ADR-050 — Base de comisión DILESA = Valor Real Venta DILESA (no la escrituración)

- **Status**: Accepted
- **Date**: 2026-06-26 (aprobado por Beto: comisión sobre valor real, retroactivo y parejo)
- **Authors**: Beto, Claude Code
- **Companion to**: [ADR-045](./045_cuadratura_desglose_gastos_escrituracion.md) (desglose de la cuadratura; el modelo desglosado ya comisionaba sobre valor real − sobreprecio), [ADR-048](./048_cierre_financiero_dictaminacion.md)
- **Iniciativa**: `dilesa-comision-valor-real`

---

## Contexto

El motor de cuadratura (`lib/dilesa/cuadratura.ts`) calculaba la base de comisión de dos maneras según el modelo de la venta:

- **Desglosado (ADR-045):** `Valor Real Venta DILESA − sobreprecio para gastos` — la base operativa que validan Michelle (notas de crédito) y Ale (participación).
- **Legacy (réplica de Coda):** `Valor de Escrituración`.

Cuando el valor real es menor que la escrituración (hay descuento real: un bono, o una escritura inflada para maximizar el aforo del crédito), comisionar sobre la escritura **sobre-paga**. Casos detonantes (2026-06-26):

- **M12-L9-LDS** (JORGE LUIS, legacy, escritura inflada): escritura 1,952,860 vs valor real 1,869,500 → comisión legacy 19,528.60 cuando lo correcto es 18,695.
- **M4-L29-LDLE** (EDUARDO, desglosado): el motor ya daba 9,050 (valor real), pero la columna persistida traía 9,200 (escritura) — las columnas estaban inconsistentes entre sí.

Beto: BSOP es **referencia** hoy (no ejecuta el pago de comisiones), así que lo correcto es plasmar el número que debió/debe de ser, retroactivo y parejo.

## Decisión

### BC1 — La base de comisión es el Valor Real Venta DILESA − sobreprecio para gastos, en AMBOS modelos

```
base de comisión = Valor Real Venta DILESA − sobreprecio_gastos_escrituracion
Comisión vendedor = base × (1.5% Loma Verde / 1.0% resto)
Comisión gerencia = base × 0.5%
```

El **sobreprecio para gastos** (lo absorbe el crédito) NO comisiona; los **productos reales** del paquete (closets/upgrades) SÍ comisionan (no se restan de la base). Se elimina el branch legacy que usaba la escrituración.

### BC2 — Esto es solo la BASE, no la comisión pagada

La comisión que se PAGA al vendedor lleva encima un esquema de **objetivos y cuotas trimestrales** que se modela aparte (pendiente, fuera del alcance de esta iniciativa). El número de la cuadratura es el insumo base (porcentaje sobre el valor real), no el finiquito. El panel lo dice explícitamente para que nadie lo confunda con lo pagado.

### BC3 — Retroactivo: se reconcilia el histórico

Como BSOP es referencia (no paga), las columnas `dilesa.ventas.comision_vendedor`/`comision_gerencia` se recalculan sobre la base correcta para todo el histórico con valor real válido (backfill con el motor real `calcularCuadratura` + registro en `core.audit_log`). Las ventas con datos incompletos (valor real ≤ 0 — sin pagos migrados en CxC, o escritura mal capturada) se **excluyen** y se dejan con su comisión actual (ya pagadas).

## Consecuencias

- **~$911k de ajuste a la baja** en la comisión-base agregada (358 ventas; vendedor −654k + gerencia −257k), sin efecto en pagos reales (BSOP es referencia).
- El número mostrado en el panel = el número persistido = la base correcta. Se acaba la divergencia legacy/desglosado y panel/columna.
- Cuando se modele el overlay trimestral, partirá de una base consistente en todo el histórico.
- El panel de cuadratura se vuelve explícito (fórmulas inline en cada derivado + card "Resumen de precio" en el legacy), para que "de dónde sale cada número" sea legible sin salir de la pantalla.

## Alternativas consideradas

- **Solo hacia adelante (no retroactivo):** descartada — Beto quiere el histórico parejo, y como BSOP no paga comisiones, no hay finiquitos que reabrir.
- **Comisión sobre escrituración (status quo legacy):** descartada — sobre-paga en ventas con descuento o escritura inflada; no es la base de Michelle/Ale.
