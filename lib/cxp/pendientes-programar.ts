/**
 * CxP · helper de programación — `pendientesDeProgramar`.
 *
 * Origen: hotfix 2026-06-11 (el saldo de `erp.facturas` solo refleja dinero
 * EJECUTADO; aquí se resta lo COMPROMETIDO vivo en pagos `programado`/`aprobado`
 * para no re-ofrecer lo ya programado y reventar la validación
 * anti-sobre-programación). Vivía en `components/cxp/cxp-programacion-module.tsx`
 * junto al módulo de programación en lote; el rediseño del flujo en 3 etapas
 * (Sprint 7, #1068/#1069) movió «programar» a la pantalla Facturas y dejó ese
 * componente sin renderizar. Se extrajo aquí —función pura, sin React— porque
 * sigue vivo en la bandeja «Te toca» (`components/gasto/te-toca-strip.tsx`).
 */

export type AplicacionViva = { factura_id: string; monto_aplicado: number | null };

/**
 * Resta del saldo lo comprometido en pagos vivos sin ejecutar y deja solo
 * las facturas con algo por programar. Los pagos `pagado` NO se suman aquí:
 * el trigger de saldo ya los descuenta de `monto_pagado` y contarlos dos
 * veces escondería facturas con saldo real.
 */
export function pendientesDeProgramar<T extends { id: string; saldo: number }>(
  facturas: T[],
  aplicacionesVivas: AplicacionViva[]
): Array<T & { comprometido: number; porProgramar: number }> {
  const comprometidoPorFactura = new Map<string, number>();
  for (const a of aplicacionesVivas) {
    comprometidoPorFactura.set(
      a.factura_id,
      (comprometidoPorFactura.get(a.factura_id) ?? 0) + Number(a.monto_aplicado ?? 0)
    );
  }
  return facturas
    .map((f) => {
      const comprometido = comprometidoPorFactura.get(f.id) ?? 0;
      const porProgramar = Math.round((f.saldo - comprometido) * 100) / 100;
      return { ...f, comprometido, porProgramar };
    })
    .filter((f) => f.porProgramar > 0);
}
