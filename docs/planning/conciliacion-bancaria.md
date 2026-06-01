# Iniciativa — Conciliación bancaria

**Slug:** `conciliacion-bancaria`
**Empresas:** todas
**Schemas afectados:** `erp` (`movimientos_bancarios`, `conciliaciones`, `cuentas_bancarias`)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-06-01
**Última actualización:** 2026-06-01 (esbozada como hermana de `cxc`/`cxp`; bloqueada hasta que ambas emitan movimientos bancarios)

## Problema

Todo el dinero que entra (CxC), sale (CxP), los gastos y las
transferencias terminan en una cuenta bancaria. Pero hoy **no hay forma
de casar el estado de cuenta real del banco contra lo que el sistema
cree que pasó**:

- `erp.movimientos_bancarios` tiene un flag `conciliado`, pero nadie lo
  usa sistemáticamente.
- `erp.conciliaciones` existe pero **solo casa `movimiento ↔ gasto`**
  (legacy, sesgada).
- El mundo de cortes de caja POS (`erp.cortes_caja`, `movimientos_caja`,
  vouchers) concilia **caja**, no el **banco**.

Dolor concreto: **depósitos no identificados** (entró dinero al banco y
no se sabe de quién — exactamente lo que el módulo Coda de DILESA no
resuelve), pagos duplicados, y descuadres mes a mes que se cierran a
mano contra el estado de cuenta.

## Outcome esperado (tentativo)

- **Importar el estado de cuenta** del banco (CSV / layout / API).
- **Casar cada línea** contra un movimiento del sistema (`cxc_pago`,
  `cxp_pago`, `gasto`, `transferencia`) usando la referencia polimórfica
  de `movimientos_bancarios` (ADR-037 D4) + reglas de auto-match
  (monto + fecha + referencia).
- **Marcar `conciliado=true`** y dejar trazabilidad.
- **Bandeja de no-identificados**: dinero del banco sin movimiento en el
  sistema → alta asistida (ej. un abono de CxC que no se capturó).
- **Reporte de descuadre** por cuenta y periodo.

## Tercer vértice del triángulo de tesorería

```
   CxC (ingresos)  ──┐
                     ├──►  erp.movimientos_bancarios  ──►  Conciliación bancaria
   CxP (egresos)   ──┘     (referencia polimórfica)        (vs estado de cuenta)
```

Esta iniciativa **se construye encima** de lo que CxC y CxP generan. No
puede arrancar hasta que ambas emitan movimientos bancarios con
referencia polimórfica (ADR-037 D4). Por eso queda `proposed`.

## Decisiones pendientes (cerrar al promover a `planned`)

- [ ] **Formato de importación**: ¿CSV manual por banco? ¿layout
      bancario estándar? ¿API (Belvo / banco directo)? Probable arrancar
      CSV por banco.
- [ ] **Reglas de auto-match**: tolerancia de monto, ventana de fechas,
      match por referencia. Qué se auto-concilia vs qué requiere revisión.
- [ ] **Manejo de no-identificados**: ¿crear un cargo/abono provisional?
      ¿bandeja de pendientes? ¿alta asistida?
- [ ] **Generalizar `erp.conciliaciones`**: hoy `movimiento ↔ gasto`;
      pasar a polimórfica para casar un movimiento contra cualquier
      `cxc_pago` / `cxp_pago` / `gasto` / `transferencia`, con
      `monto_aplicado` para parciales N:M.
- [ ] **Relación con cortes de caja**: ¿la conciliación bancaria
      consume el resultado de los cortes POS o es independiente?
- [ ] **Scope de cuentas y golden empresa**.

## Dependencia dura

Arranca cuando **CxC y CxP ya emitan movimientos bancarios**. Plomería
ya existente parcial: `erp.cuentas_bancarias`, `erp.movimientos_bancarios`
(con `conciliado`), `erp.conciliaciones` (a generalizar).

## Bitácora

_(vacía — proposed)_
