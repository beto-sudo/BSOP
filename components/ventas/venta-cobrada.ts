/**
 * Venta cobrada — la cifra canónica de los reportes de /rdb/ventas.
 *
 * Semántica Waitry (verificada contra prod 2026-07-02):
 *   - `total_amount`   = total a precio de lista (pre-descuento).
 *   - `total_discount` = total CON descuento aplicado — pese al nombre, es el
 *     monto realmente cobrado al cliente, no el monto descontado.
 *
 * Los 4 tabs del módulo reportan la venta cobrada para que cuadren entre sí:
 * el tab Pedidos suma `ventaCobrada()` y los tabs Por producto / Por categoría /
 * Comparativo prorratean las líneas de cada pedido a esa misma cifra.
 */

export type PedidoCobrable = {
  total_amount: number | null;
  total_discount?: number | null;
};

/**
 * Total realmente cobrado de un pedido.
 *
 * Fallback a `total_amount` cuando `total_discount = 0`: 17 pedidos del
 * 2026-04-06/07 traen `total_discount = 0` con `total_amount > 0` por un
 * glitch del sync temprano — todos con pago completo registrado en
 * `waitry_pagos`, ninguno es cortesía. Las cortesías reales llegan con
 * `total_amount = 0`, así que el fallback no las infla.
 */
export function ventaCobrada(pedido: PedidoCobrable): number {
  const td = Number(pedido.total_discount ?? 0);
  if (td > 0) return td;
  return Number(pedido.total_amount ?? 0);
}

export type LineaProrrateable = {
  order_id: string;
  total_price: number | null;
};

/**
 * Reparte la venta cobrada de cada pedido entre sus líneas, proporcional al
 * `total_price` original de cada una. Garantiza que la suma de líneas de un
 * pedido == su venta cobrada, cubriendo los dos desfases conocidos de Waitry:
 *
 *   1. Descuento solo en cabecera (líneas a precio de lista) → escala < 1.
 *   2. Líneas incompletas (el cliente pagó más de lo que suman las líneas
 *      registradas, p.ej. cantidad mal capturada en el POS) → escala > 1.
 *
 * Si las líneas de un pedido suman 0 (o el pedido no está en el mapa), las
 * líneas quedan intactas — no hay base para prorratear. Hoy esos pedidos
 * tienen venta cobrada $0, así que no descuadran los totales.
 */
export function prorratearLineas<T extends LineaProrrateable>(
  lineas: T[],
  cobradoPorPedido: Map<string, number>
): T[] {
  const sumaPorPedido = new Map<string, number>();
  for (const ln of lineas) {
    sumaPorPedido.set(
      ln.order_id,
      (sumaPorPedido.get(ln.order_id) ?? 0) + Number(ln.total_price ?? 0)
    );
  }

  return lineas.map((ln) => {
    const cobrado = cobradoPorPedido.get(ln.order_id);
    const suma = sumaPorPedido.get(ln.order_id) ?? 0;
    if (cobrado == null || suma <= 0) return ln;
    const factor = cobrado / suma;
    if (factor === 1) return ln;
    return { ...ln, total_price: Number(ln.total_price ?? 0) * factor };
  });
}
