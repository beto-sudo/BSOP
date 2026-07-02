import { describe, expect, it } from 'vitest';
import { prorratearLineas, ventaCobrada } from './venta-cobrada';

describe('ventaCobrada', () => {
  it('usa total_discount cuando existe (total con descuento = lo cobrado)', () => {
    expect(ventaCobrada({ total_amount: 330, total_discount: 273.9 })).toBe(273.9);
  });

  it('sin descuento: total_discount == total_amount', () => {
    expect(ventaCobrada({ total_amount: 200, total_discount: 200 })).toBe(200);
  });

  it('fallback a total_amount cuando total_discount = 0 (glitch sync abril 2026)', () => {
    expect(ventaCobrada({ total_amount: 250, total_discount: 0 })).toBe(250);
  });

  it('cortesía real: total_amount = 0 → cobrado 0', () => {
    expect(ventaCobrada({ total_amount: 0, total_discount: 0 })).toBe(0);
  });

  it('tolera nulls (vistas tipan todo nullable)', () => {
    expect(ventaCobrada({ total_amount: null, total_discount: null })).toBe(0);
    expect(ventaCobrada({ total_amount: 150 })).toBe(150);
  });
});

describe('prorratearLineas', () => {
  const cobrado = (pares: Array<[string, number]>) => new Map(pares);

  it('pedido sin desfase queda intacto (factor 1, misma referencia)', () => {
    const lineas = [
      { order_id: 'A', total_price: 100 },
      { order_id: 'A', total_price: 50 },
    ];
    const res = prorratearLineas(lineas, cobrado([['A', 150]]));
    expect(res[0]).toBe(lineas[0]);
    expect(res[1]).toBe(lineas[1]);
  });

  it('descuento solo en cabecera: escala las líneas hacia abajo', () => {
    // Caso real #17797316: líneas $590 a precio de lista... inverso: líneas
    // en lista $690 y cobrado $590.
    const lineas = [
      { order_id: 'A', total_price: 460 },
      { order_id: 'A', total_price: 230 },
    ];
    const res = prorratearLineas(lineas, cobrado([['A', 621]])); // 10% desc
    expect(res[0].total_price).toBeCloseTo(414);
    expect(res[1].total_price).toBeCloseTo(207);
    expect(res[0].total_price! + res[1].total_price!).toBeCloseTo(621);
  });

  it('líneas incompletas: escala hacia arriba hasta lo cobrado', () => {
    // Caso real #17799150: "Torneo con cena" 1×$500, cobrado $1,000.
    const lineas = [{ order_id: 'A', total_price: 500 }];
    const res = prorratearLineas(lineas, cobrado([['A', 1000]]));
    expect(res[0].total_price).toBe(1000);
  });

  it('varios pedidos: cada uno con su factor, sin cruzarse', () => {
    const lineas = [
      { order_id: 'A', total_price: 100 },
      { order_id: 'B', total_price: 100 },
    ];
    const res = prorratearLineas(
      lineas,
      cobrado([
        ['A', 50],
        ['B', 200],
      ])
    );
    expect(res[0].total_price).toBe(50);
    expect(res[1].total_price).toBe(200);
  });

  it('líneas que suman 0 quedan intactas (sin base para prorratear)', () => {
    const lineas = [{ order_id: 'A', total_price: 0 }];
    const res = prorratearLineas(lineas, cobrado([['A', 100]]));
    expect(res[0].total_price).toBe(0);
  });

  it('pedido ausente del mapa queda intacto', () => {
    const lineas = [{ order_id: 'X', total_price: 80 }];
    const res = prorratearLineas(lineas, cobrado([]));
    expect(res[0].total_price).toBe(80);
  });

  it('total_price null cuenta como 0 y no rompe el reparto del resto', () => {
    const lineas = [
      { order_id: 'A', total_price: null },
      { order_id: 'A', total_price: 100 },
    ];
    const res = prorratearLineas(lineas, cobrado([['A', 120]]));
    expect(res[0].total_price).toBe(0);
    expect(res[1].total_price).toBeCloseTo(120);
  });

  it('preserva los campos extra de la línea (categoría, producto…)', () => {
    const lineas = [
      { order_id: 'A', total_price: 100, product_name: 'Powerade', categoria_id: 'c1' },
    ];
    const res = prorratearLineas(lineas, cobrado([['A', 90]]));
    expect(res[0]).toMatchObject({ product_name: 'Powerade', categoria_id: 'c1' });
    expect(res[0].total_price).toBeCloseTo(90);
  });
});
