import { describe, it, expect } from 'vitest';
import { calcularCuadratura } from './cuadratura';

describe('calcularCuadratura', () => {
  // Ejemplo real de Beto (pantalla de Coda):
  //   Valor de Escrituración = 899,000
  //   Depósitos: 261,049.55 (Directo Cliente, con recibo de caja)
  //              636,328.45 (Pago Infonavit, sin recibo) — su crédito = mismo monto
  //   Valor Facturado = 1,160,049.55 · Valor Real Venta Dilesa = 884,000
  //   Monto Nota de Crédito = 276,049.55
  it('reproduce el ejemplo de Coda', () => {
    const c = calcularCuadratura({
      valorEscrituracion: 899000,
      montoCreditoTitular: 636328.45, // crédito Infonavit (= el Pago Infonavit)
      montoCreditoCotitular: 0,
      montoCreditoDirecto: 0,
      montoChequeNotaria: 13378, // 897,378 − 13,378 = 884,000
      gastosEscrituracion: null,
      precioAsignacion: 920000,
      depositos: [
        { monto: 261049.55, directoCliente: true, tieneRecibo: true },
        { monto: 636328.45, directoCliente: false, tieneRecibo: false },
      ],
      proyectoNombre: 'Lomas del Sol',
    });

    expect(c.depositosRecibidos).toBe(897378);
    expect(c.montoDisponible).toBe(897378); // 261,049.55 directo + 636,328.45 crédito
    expect(c.saldoCliente).toBe(1622); // 899,000 − 897,378
    expect(c.cubierta).toBe(false);
    expect(c.valorFacturado).toBe(1160049.55); // 899,000 + 261,049.55 (con recibo)
    expect(c.valorRealVentaDilesa).toBe(884000); // 897,378 − 13,378 + 0
    expect(c.montoNotaCredito).toBe(276049.55); // 1,160,049.55 − 884,000
    expect(c.descuentoReal).toBe(15000); // 899,000 − 884,000
    expect(c.comisionGerencia).toBe(4495); // 899,000 × 0.5%
    expect(c.comisionVendedor).toBe(8990); // 899,000 × 1.0% (no Loma Verde)
  });

  // Regresión (caso Ahumada, 2026-06-13): la disposición del crédito de
  // institución traía un recibo de caja importado de Coda. La fórmula NO debe
  // facturarlo — solo los depósitos del cliente con recibo suman al Valor
  // Facturado. Antes del fix, escrituración 940,000 mostraba 1,880,000.
  it('el respaldo no factura la disposición del crédito (recibo importado de Coda)', () => {
    const c = calcularCuadratura({
      valorEscrituracion: 940000,
      montoCreditoTitular: 940000,
      montoCreditoCotitular: 0,
      montoCreditoDirecto: 0,
      montoChequeNotaria: null,
      gastosEscrituracion: null,
      depositos: [{ monto: 940000, directoCliente: false, tieneRecibo: true }],
    });
    // El recibo es de institución (directoCliente=false) → no factura.
    expect(c.valorFacturado).toBe(940000); // 940,000 escrituración + 0
  });

  it('marca cubierta cuando el disponible cubre la escrituración', () => {
    const c = calcularCuadratura({
      valorEscrituracion: 500000,
      montoCreditoTitular: 400000,
      montoCreditoCotitular: 0,
      montoCreditoDirecto: 50000,
      montoChequeNotaria: null,
      gastosEscrituracion: null,
      depositos: [{ monto: 60000, directoCliente: true, tieneRecibo: true }],
    });
    // disponible = 60,000 + 400,000 + 50,000 = 510,000 ≥ 500,000
    expect(c.montoDisponible).toBe(510000);
    expect(c.saldoCliente).toBe(-10000);
    expect(c.cubierta).toBe(true);
  });

  it('aplica 1.5% de comisión de vendedor en Loma Verde', () => {
    const c = calcularCuadratura({
      valorEscrituracion: 1000000,
      montoCreditoTitular: null,
      montoCreditoCotitular: null,
      montoCreditoDirecto: null,
      montoChequeNotaria: null,
      gastosEscrituracion: null,
      depositos: [],
      proyectoNombre: 'Loma Verde 2',
    });
    expect(c.comisionVendedor).toBe(15000); // 1,000,000 × 1.5%
  });

  it('cheque a notaría = min(gastos − apoyo, disponible − escrituración + descuento)', () => {
    const c = calcularCuadratura({
      valorEscrituracion: 800000,
      montoCreditoTitular: 850000,
      montoCreditoCotitular: 0,
      montoCreditoDirecto: 0,
      montoChequeNotaria: null,
      gastosEscrituracion: 30000,
      apoyoInfonavit: 5000,
      descuentoOtorgadoTotal: 0,
      depositos: [],
    });
    // gastos − apoyo = 25,000 ; disponible − escrituración + desc = 850,000 − 800,000 = 50,000
    // min(25,000, 50,000) = 25,000
    expect(c.chequeNotariaCalculado).toBe(25000);
  });

  describe('posibleDobleConteo', () => {
    // Caso real 2026-06-12: la disposición del crédito Infonavit se capturó
    // como abono fuente='cliente', así que el mismo dinero entra dos veces
    // (depósito directo + crédito de la venta) y el disponible se infla.
    it('detecta la disposición etiquetada como depósito del cliente', () => {
      const c = calcularCuadratura({
        valorEscrituracion: 899000,
        montoCreditoTitular: 636328.45,
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 0,
        montoChequeNotaria: null,
        gastosEscrituracion: null,
        depositos: [
          { monto: 261049.55, directoCliente: true },
          // Disposición mal etiquetada: debió ser fuente='institucion'.
          { monto: 636328.45, directoCliente: true },
        ],
      });
      // disponible = 897,378 depósitos + 636,328.45 crédito = 1,533,706.45
      expect(c.montoDisponible).toBe(1533706.45);
      expect(c.posibleDobleConteo).toBe(true);
    });

    it('no marca la operación bien etiquetada (ejemplo de Coda)', () => {
      const c = calcularCuadratura({
        valorEscrituracion: 899000,
        montoCreditoTitular: 636328.45,
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 0,
        montoChequeNotaria: null,
        gastosEscrituracion: null,
        depositos: [
          { monto: 261049.55, directoCliente: true },
          { monto: 636328.45, directoCliente: false },
        ],
      });
      expect(c.posibleDobleConteo).toBe(false);
    });

    it('tolera el excedente legítimo de gastos de escrituración', () => {
      const c = calcularCuadratura({
        valorEscrituracion: 800000,
        montoCreditoTitular: 750000,
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 0,
        montoChequeNotaria: null,
        gastosEscrituracion: 30000,
        // depósitos cliente = 80,000 (50,000 enganche + 30,000 para gastos)
        depositos: [{ monto: 80000, directoCliente: true }],
      });
      // 80,000 + 750,000 − 800,000 − 30,000 = 0 ≤ 5% de 800,000
      expect(c.posibleDobleConteo).toBe(false);
    });

    it('no marca ventas sin crédito de institución (contado / crédito directo)', () => {
      const c = calcularCuadratura({
        valorEscrituracion: 500000,
        montoCreditoTitular: 0,
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 0,
        montoChequeNotaria: null,
        gastosEscrituracion: null,
        depositos: [{ monto: 600000, directoCliente: true }],
      });
      expect(c.posibleDobleConteo).toBe(false);
    });
  });
});
